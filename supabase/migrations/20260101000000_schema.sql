-- =====================================================================
-- 1) 스키마: 테이블 / 뷰 / RLS / 권한
--    원칙: 클라이언트(anon, authenticated)는 SELECT만 가능하고,
--          모든 쓰기는 security definer RPC(20260101000100_functions.sql)로만 한다.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- games
create table public.games (
  id                uuid primary key default gen_random_uuid(),
  title             text not null check (char_length(title) between 1 and 50),
  winner_count      int  not null check (winner_count between 1 and 10),
  rounds_per_player int  not null default 5 check (rounds_per_player between 3 and 10),
  status            text not null default 'open' check (status in ('open', 'closed')),
  admin_token_hash  text not null,
  creator_uid       uuid not null,            -- 이미지 업로드 권한 확인용 (create_game 호출자)
  created_at        timestamptz not null default now(),
  closed_at         timestamptz
);

-- ------------------------------------------------------------- players
create table public.players (
  id        uuid primary key default gen_random_uuid(),
  game_id   uuid not null references public.games(id) on delete cascade,
  uid       uuid not null,
  nickname  text not null check (char_length(nickname) between 1 and 12),
  joined_at timestamptz not null default now(),
  wins      int  not null default 0 check (wins >= 0),
  played    int  not null default 0 check (played >= 0),   -- 비김 제외, 확정된 판수
  finished  boolean not null default false,
  unique (game_id, uid)
);
create unique index players_game_nickname_uniq on public.players (game_id, lower(nickname));
create index players_game_rank_idx on public.players (game_id, finished, wins desc, joined_at asc);

-- -------------------------------------------------------------- rounds
create table public.rounds (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players(id) on delete cascade,
  user_choice text not null check (user_choice in ('rock', 'scissors', 'paper')),
  cpu_choice  text not null check (cpu_choice  in ('rock', 'scissors', 'paper')),
  result      text not null check (result in ('win', 'lose', 'draw')),
  created_at  timestamptz not null default now()
);
create index rounds_player_idx on public.rounds (player_id, created_at);

-- ------------------------------------------------------------- prizes
-- 생성자가 업로드한 기프티콘 경로. close_game 때 winners.prize_path 로 복사된다.
-- 클라이언트 직접 접근 불가 (RPC 전용).
create table public.prizes (
  game_id uuid not null references public.games(id) on delete cascade,
  rank    int  not null check (rank between 1 and 10),
  path    text not null,
  primary key (game_id, rank)
);

-- ------------------------------------------------------------- winners
create table public.winners (
  game_id    uuid not null references public.games(id) on delete cascade,
  rank       int  not null check (rank >= 1),
  player_id  uuid not null references public.players(id) on delete cascade,
  uid        uuid not null,
  nickname   text not null,
  prize_path text,
  primary key (game_id, rank),
  unique (game_id, player_id)
);

-- ---------------------------------------------------------------- 뷰
-- admin_token_hash / creator_uid 를 숨긴 공개용 뷰 (뷰 소유자 권한으로 games 를 읽는다)
create view public.games_public as
  select id, title, winner_count, rounds_per_player, status, created_at, closed_at,
         (select count(*) from public.players p where p.game_id = games.id)::int as player_count
  from public.games;

-- ---------------------------------------------------------------- RLS
alter table public.games   enable row level security;
alter table public.players enable row level security;
alter table public.rounds  enable row level security;
alter table public.prizes  enable row level security;
alter table public.winners enable row level security;
-- (게임 본 테이블/prizes 에는 SELECT 정책도 없다 → 클라이언트 접근 불가)

create policy players_public_read on public.players for select using (true);
create policy winners_public_read on public.winners for select using (true);
create policy rounds_own_read on public.rounds for select
  using (exists (select 1 from public.players p where p.id = rounds.player_id and p.uid = auth.uid()));

-- ---------------------------------------------------------------- 권한
-- Supabase 는 기본적으로 public 테이블에 anon/authenticated 전권한을 주므로 명시적으로 회수한다.
revoke all on public.games, public.players, public.rounds, public.prizes, public.winners
  from anon, authenticated;
grant select on public.players, public.winners, public.rounds to anon, authenticated;
grant select on public.games_public to anon, authenticated;

-- ------------------------------------------------------------ Realtime
alter publication supabase_realtime add table public.players;
