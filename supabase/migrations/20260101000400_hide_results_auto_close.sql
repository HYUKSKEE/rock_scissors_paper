-- =====================================================================
-- 5) 종료 전에는 결과(순위·다른 사람의 전적)를 숨기고, 자동 종료를 추가한다.
--    · players SELECT: 종료 전에는 "내 행"만, 종료 후에는 모두 공개
--    · 생성자(관리 링크)는 admin_players() RPC 로 전체 현황을 본다
--    · games.max_players(선택): 그 인원이 모두 입장하고 전원이 R판을 끝내면 자동 종료
-- =====================================================================

alter table public.games add column max_players int check (max_players between 1 and 100);

-- 뷰에 max_players 추가 (기존 컬럼 순서는 유지)
create or replace view public.games_public as
  select id, title, winner_count, rounds_per_player, status, created_at, closed_at,
         (select count(*) from public.players p where p.game_id = games.id)::int as player_count,
         max_players
  from public.games;

-- ----------------------------------------------------- players 공개 범위
create or replace function public.game_is_closed(p_game_id uuid)
returns boolean language sql stable security definer
set search_path = public
as $$ select exists (select 1 from public.games g where g.id = p_game_id and g.status = 'closed') $$;
revoke all on function public.game_is_closed(uuid) from public;
grant execute on function public.game_is_closed(uuid) to anon, authenticated;

drop policy players_public_read on public.players;
create policy players_visible on public.players for select
  using (uid = auth.uid() or public.game_is_closed(game_id));

-- ------------------------------------------------- 생성자 전용 현황 조회
create or replace function public.admin_players(p_game_id uuid, p_admin_token text)
returns setof public.players
language plpgsql stable security definer
set search_path = public, extensions
as $$
begin
  if not public.verify_admin(p_game_id, p_admin_token) then raise exception 'INVALID_TOKEN'; end if;
  return query select * from public.players where game_id = p_game_id;
end $$;
revoke all on function public.admin_players(uuid, text) from public, anon;
grant execute on function public.admin_players(uuid, text) to authenticated;

-- ------------------------------------------------------------ create_game
drop function public.create_game(text, int, int);
create or replace function public.create_game(
  p_title text, p_winner_count int, p_rounds int default 5, p_max_players int default null)
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
     or p_rounds not between 3 and 10
     or (p_max_players is not null and p_max_players not between 1 and 100) then
    raise exception 'INVALID_INPUT';
  end if;

  insert into public.games (title, winner_count, rounds_per_player, max_players, admin_token_hash, creator_uid)
  values (v_title, p_winner_count, p_rounds, p_max_players, public.hash_token(v_token), v_uid)
  returning id into v_id;

  return jsonb_build_object('game_id', v_id, 'admin_token', v_token);
end $$;
revoke all on function public.create_game(text, int, int, int) from public, anon;
grant execute on function public.create_game(text, int, int, int) to authenticated;

-- ------------------------------------------------------------ finalize_game
-- 순위 계산 → 상위 N명 winners 저장 → closed. 클라이언트는 직접 호출 불가(내부용).
create or replace function public.finalize_game(p_game_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_game public.games;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;

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
revoke all on function public.finalize_game(uuid) from public, anon, authenticated;

create or replace function public.close_game(p_game_id uuid, p_admin_token text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if not public.verify_admin(p_game_id, p_admin_token) then raise exception 'INVALID_TOKEN'; end if;
  return public.finalize_game(p_game_id);
end $$;

-- --------------------------------------------------------------- join_game
-- 게임 행을 잠가 정원 초과 입장을 막는다. (이미 참가한 uid 의 재호출은 항상 기존 player 반환)
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
  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if v_game.status <> 'open' then raise exception 'GAME_CLOSED'; end if;
  if char_length(v_nick) not between 1 and 12 then raise exception 'INVALID_INPUT'; end if;

  select * into v_p from public.players where game_id = p_game_id and uid = v_uid;
  if found then return v_p; end if;

  if v_game.max_players is not null
     and (select count(*) from public.players where game_id = p_game_id) >= v_game.max_players then
    raise exception 'GAME_FULL';
  end if;

  begin
    insert into public.players (game_id, uid, nickname) values (p_game_id, v_uid, v_nick)
    returning * into v_p;
  exception when unique_violation then
    select * into v_p from public.players where game_id = p_game_id and uid = v_uid;
    if found then return v_p; end if;
    raise exception 'NICKNAME_TAKEN';
  end;
  return v_p;
end $$;

-- -------------------------------------------------------------- play_round
-- + 최대 인원이 모두 입장했고 전원이 R판을 끝냈으면 이 호출에서 게임을 자동 종료한다.
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
  v_closed boolean := false;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_choice is null or not (p_choice = any (v_choices)) then raise exception 'INVALID_INPUT'; end if;

  select * into v_game from public.games where id = p_game_id;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if v_game.status <> 'open' then raise exception 'GAME_CLOSED'; end if;

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

    if v_p.finished and v_game.max_players is not null
       and (select count(*) from public.players where game_id = p_game_id) >= v_game.max_players
       and not exists (select 1 from public.players where game_id = p_game_id and not finished) then
      perform public.finalize_game(p_game_id);
      v_closed := true;
    end if;
  end if;

  return jsonb_build_object(
    'cpu_choice', v_cpu, 'result', v_result,
    'wins', v_p.wins, 'played', v_p.played, 'finished', v_p.finished,
    'game_closed', v_closed);
end $$;
