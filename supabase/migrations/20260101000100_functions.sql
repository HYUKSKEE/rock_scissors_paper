-- =====================================================================
-- 2) RPC (security definer). 모든 쓰기는 여기서만 일어난다.
--    에러는 `raise exception '<CODE>'` 로 던지고 프론트에서 코드별 메시지로 바꾼다.
--    CODES: AUTH_REQUIRED, INVALID_INPUT, GAME_NOT_FOUND, GAME_CLOSED, NICKNAME_TAKEN,
--           NOT_JOINED, ALREADY_FINISHED, INVALID_TOKEN
-- =====================================================================

-- 순위 계산 (유일한 순위 기준). 승률(wins / rounds) 내림차순 → joined_at 오름차순.
-- 한 게임 안에서 rounds 는 동일하므로 wins 비교 = 승률 비교. R판을 끝낸(finished) 사람만 포함.
create or replace function public.rank_players(p_game_id uuid)
returns table (rank int, player_id uuid, uid uuid, nickname text, wins int, played int, joined_at timestamptz)
language sql stable
set search_path = public
as $$
  select (row_number() over (order by (p.wins::numeric / g.rounds_per_player) desc, p.joined_at asc, p.id asc))::int,
         p.id, p.uid, p.nickname, p.wins, p.played, p.joined_at
  from public.players p
  join public.games g on g.id = p.game_id
  where p.game_id = p_game_id and p.finished
$$;

create or replace function public.hash_token(p_token text)
returns text language sql immutable
set search_path = public, extensions
as $$ select encode(extensions.digest(p_token, 'sha256'), 'hex') $$;

-- ------------------------------------------------------------ create_game
create or replace function public.create_game(p_title text, p_winner_count int, p_rounds int default 5)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_uid   uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_id    uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(v_title) not between 1 and 50
     or p_winner_count not between 1 and 10
     or p_rounds not between 3 and 10 then
    raise exception 'INVALID_INPUT';
  end if;

  insert into public.games (title, winner_count, rounds_per_player, admin_token_hash, creator_uid)
  values (v_title, p_winner_count, p_rounds, public.hash_token(v_token), v_uid)
  returning id into v_id;

  return jsonb_build_object('game_id', v_id, 'admin_token', v_token);
end $$;

-- ------------------------------------------------------------ verify_admin
create or replace function public.verify_admin(p_game_id uuid, p_admin_token text)
returns boolean
language sql stable security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.games g
    where g.id = p_game_id
      and p_admin_token is not null
      and g.admin_token_hash = public.hash_token(p_admin_token)
  )
$$;

-- --------------------------------------------------------- set_prize_paths
-- 업로드한 이미지 경로를 기록한다. p_paths 예: {"1": "<game>/1.png", "2": "<game>/2.jpg"}
-- 경로는 반드시 '<game_id>/<rank>.<jpg|png|webp>' 형식이어야 한다. (토큰 필요)
create or replace function public.set_prize_paths(p_game_id uuid, p_admin_token text, p_paths jsonb)
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_game public.games;
  k text; v text;
begin
  if not public.verify_admin(p_game_id, p_admin_token) then raise exception 'INVALID_TOKEN'; end if;
  select * into v_game from public.games where id = p_game_id;
  if v_game.status <> 'open' then raise exception 'GAME_CLOSED'; end if;

  for k, v in select key, value from jsonb_each_text(p_paths) loop
    if k !~ '^\d+$' or k::int not between 1 and v_game.winner_count
       or v !~ ('^' || p_game_id::text || '/' || k || '\.(jpg|png|webp)$') then
      raise exception 'INVALID_INPUT';
    end if;
    insert into public.prizes (game_id, rank, path) values (p_game_id, k::int, v)
    on conflict (game_id, rank) do update set path = excluded.path;
  end loop;
end $$;

-- --------------------------------------------------------------- join_game
-- 이미 참가한 uid 가 다시 부르면 기존 player 를 그대로 돌려준다(닉네임 변경 불가).
create or replace function public.join_game(p_game_id uuid, p_nickname text)
returns public.players
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_nick text := btrim(coalesce(p_nickname, ''));
  v_game public.games;
  v_p    public.players;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_game from public.games where id = p_game_id;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if v_game.status <> 'open' then raise exception 'GAME_CLOSED'; end if;
  if char_length(v_nick) not between 1 and 12 then raise exception 'INVALID_INPUT'; end if;

  select * into v_p from public.players where game_id = p_game_id and uid = v_uid;
  if found then return v_p; end if;

  begin
    insert into public.players (game_id, uid, nickname) values (p_game_id, v_uid, v_nick)
    returning * into v_p;
  exception when unique_violation then
    -- (game_id, uid) 동시 호출이면 기존 행 반환, 닉네임 충돌이면 에러
    select * into v_p from public.players where game_id = p_game_id and uid = v_uid;
    if found then return v_p; end if;
    raise exception 'NICKNAME_TAKEN';
  end;
  return v_p;
end $$;

-- -------------------------------------------------------------- play_round
-- choice: 'rock' | 'scissors' | 'paper'. 컴퓨터의 선택과 승패 판정은 전부 여기서 한다.
-- 비기면 rounds 에는 기록하지만 played/wins 에는 반영하지 않는다(= 판수 미포함).
create or replace function public.play_round(p_game_id uuid, p_choice text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_game   public.games;
  v_p      public.players;
  v_choices text[] := array['rock', 'scissors', 'paper'];
  v_cpu    text;
  v_result text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_choice is null or not (p_choice = any (v_choices)) then raise exception 'INVALID_INPUT'; end if;

  select * into v_game from public.games where id = p_game_id;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if v_game.status <> 'open' then raise exception 'GAME_CLOSED'; end if;

  -- 같은 플레이어의 동시 요청을 직렬화 (R판 초과 방지)
  select * into v_p from public.players where game_id = p_game_id and uid = v_uid for update;
  if not found then raise exception 'NOT_JOINED'; end if;
  if v_p.finished or v_p.played >= v_game.rounds_per_player then raise exception 'ALREADY_FINISHED'; end if;

  v_cpu := v_choices[1 + floor(random() * 3)::int];
  v_result := case
    when p_choice = v_cpu then 'draw'
    when (p_choice = 'rock' and v_cpu = 'scissors')
      or (p_choice = 'scissors' and v_cpu = 'paper')
      or (p_choice = 'paper' and v_cpu = 'rock') then 'win'
    else 'lose'
  end;

  insert into public.rounds (player_id, user_choice, cpu_choice, result)
  values (v_p.id, p_choice, v_cpu, v_result);

  if v_result <> 'draw' then
    update public.players
       set played   = played + 1,
           wins     = wins + (v_result = 'win')::int,
           finished = (played + 1 >= v_game.rounds_per_player)
     where id = v_p.id
    returning * into v_p;
  end if;

  return jsonb_build_object(
    'cpu_choice', v_cpu, 'result', v_result,
    'wins', v_p.wins, 'played', v_p.played, 'finished', v_p.finished);
end $$;

-- -------------------------------------------------------------- close_game
-- 생성자만 호출 가능. 상위 N명을 winners 에 저장하고 status='closed'. 여러 번 호출해도 안전(멱등).
create or replace function public.close_game(p_game_id uuid, p_admin_token text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_game public.games;
begin
  if not public.verify_admin(p_game_id, p_admin_token) then raise exception 'INVALID_TOKEN'; end if;

  select * into v_game from public.games where id = p_game_id for update;

  if v_game.status = 'open' then
    insert into public.winners (game_id, rank, player_id, uid, nickname, prize_path)
    select p_game_id, r.rank, r.player_id, r.uid, r.nickname, pz.path
    from public.rank_players(p_game_id) r
    left join public.prizes pz on pz.game_id = p_game_id and pz.rank = r.rank
    where r.rank <= v_game.winner_count;

    update public.games set status = 'closed', closed_at = now() where id = p_game_id;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('rank', w.rank, 'nickname', w.nickname) order by w.rank)
    from public.winners w where w.game_id = p_game_id
  ), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------------ 권한
-- 기본 PUBLIC 실행권한을 걷어내고 로그인(익명 포함) 사용자에게만 연다.
revoke all on function
  public.create_game(text, int, int), public.verify_admin(uuid, text),
  public.set_prize_paths(uuid, text, jsonb), public.join_game(uuid, text),
  public.play_round(uuid, text), public.close_game(uuid, text),
  public.rank_players(uuid), public.hash_token(text)
  from public, anon, authenticated;

grant execute on function
  public.create_game(text, int, int), public.verify_admin(uuid, text),
  public.set_prize_paths(uuid, text, jsonb), public.join_game(uuid, text),
  public.play_round(uuid, text), public.close_game(uuid, text)
  to authenticated;
