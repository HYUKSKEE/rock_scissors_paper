import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join as pjoin } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * 실제 Postgres(PGlite)에 supabase/migrations 를 그대로 적용해서 DB 규칙을 검증한다.
 * Supabase 가 제공하는 auth.uid(), 역할(anon/authenticated), storage 스키마, realtime publication 은 최소한으로 흉내낸다.
 */
const STUBS = `
  drop extension if exists pgcrypto cascade;
  create schema if not exists extensions;
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public bool, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
  grant usage on schema storage to anon, authenticated;
  grant select, insert, update on storage.objects to authenticated;
  create publication supabase_realtime;
  grant usage on schema public to anon, authenticated;
  grant usage on schema extensions to anon, authenticated;
`

let db: PGlite
const U = (n: number) => `00000000-0000-0000-0000-00000000000${n}`
const [CREATOR, A, B, C, D] = [U(1), U(2), U(3), U(4), U(5)]

/** uid 로 로그인한 authenticated 사용자처럼 쿼리 실행 */
async function as<T = any>(uid: string, sql: string, params: any[] = []): Promise<T[]> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`)
  try {
    return (await db.query<T>(sql, params)).rows
  } finally {
    await db.exec('reset role;')
  }
}
async function asErr(uid: string, sql: string, params: any[] = []): Promise<string> {
  try {
    await as(uid, sql, params)
  } catch (e: any) {
    return String(e.message)
  }
  throw new Error('expected error but succeeded: ' + sql)
}

async function newGame(opts: { winners?: number; rounds?: number } = {}) {
  const [r] = await as(CREATOR, 'select public.create_game($1,$2,$3) as r', ['테스트 게임', opts.winners ?? 2, opts.rounds ?? 5])
  return r.r as { game_id: string; admin_token: string }
}
async function join(game: string, uid: string, nick: string) {
  const [r] = await as(uid, 'select * from public.join_game($1::uuid,$2::text)', [game, nick])
  return r
}
/** 테스트 전용: 슈퍼유저로 전적을 직접 세팅 (cpu 선택이 랜덤이라 승수를 고정하기 위함) */
async function setRecord(player: string, wins: number, finished: boolean, joinedAt?: string) {
  await db.query(
    `update public.players set wins=$2, played=$3, finished=$4, joined_at=coalesce($5::timestamptz, joined_at) where id=$1`,
    [player, wins, finished ? 5 : wins, finished, joinedAt ?? null],
  )
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(STUBS)
  const dir = pjoin(__dirname, '..', 'supabase', 'migrations')
  for (const f of readdirSync(dir).filter((f: string) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(pjoin(dir, f), 'utf8'))
  }
}, 60_000)

describe('RLS / 권한', () => {
  it('클라이언트의 직접 INSERT/UPDATE/DELETE 는 막힌다', async () => {
    const g = await newGame()
    const p = await join(g.game_id, A, 'a')
    expect(await asErr(A, `update public.players set wins = 99 where id = '${p.id}'`)).toMatch(/permission denied/)
    expect(await asErr(A, `delete from public.players where id = '${p.id}'`)).toMatch(/permission denied/)
    expect(await asErr(A, `insert into public.players (game_id, uid, nickname) values ('${g.game_id}','${B}','x')`)).toMatch(/permission denied/)
    expect(await asErr(A, `insert into public.rounds (player_id,user_choice,cpu_choice,result) values ('${p.id}','rock','rock','win')`)).toMatch(/permission denied/)
    expect(await asErr(A, `insert into public.winners (game_id,rank,player_id,uid,nickname) values ('${g.game_id}',1,'${p.id}','${A}','a')`)).toMatch(/permission denied/)
    expect(await asErr(A, `update public.games_public set title='x'`)).toMatch(/permission denied/)
  })

  it('games 테이블은 직접 못 읽고, 뷰에는 admin_token_hash 가 없다', async () => {
    const g = await newGame()
    expect(await asErr(A, 'select * from public.games')).toMatch(/permission denied/)
    const [row] = await as(A, 'select * from public.games_public where id=$1', [g.game_id])
    expect(row.title).toBe('테스트 게임')
    expect(Object.keys(row)).not.toContain('admin_token_hash')
    expect(Object.keys(row)).not.toContain('creator_uid')
  })

  it('admin_token 은 해시로만 저장된다', async () => {
    const g = await newGame()
    const { rows } = await db.query<any>('select admin_token_hash from public.games where id=$1', [g.game_id])
    expect(rows[0].admin_token_hash).not.toBe(g.admin_token)
    expect(rows[0].admin_token_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('로그인하지 않은 사용자는 RPC 를 호출할 수 없다', async () => {
    await db.exec('set role anon;')
    await expect(db.query(`select public.create_game('x',1,5)`)).rejects.toThrow(/permission denied/)
    await db.exec('reset role;')
  })
})

describe('create_game / join_game', () => {
  it('입력 검증', async () => {
    expect(await asErr(CREATOR, `select public.create_game('',1,5)`)).toMatch(/INVALID_INPUT/)
    expect(await asErr(CREATOR, `select public.create_game('x',0,5)`)).toMatch(/INVALID_INPUT/)
    expect(await asErr(CREATOR, `select public.create_game('x',11,5)`)).toMatch(/INVALID_INPUT/)
    expect(await asErr(CREATOR, `select public.create_game('x',1,2)`)).toMatch(/INVALID_INPUT/)
    expect(await asErr(CREATOR, `select public.create_game('x',1,11)`)).toMatch(/INVALID_INPUT/)
  })

  it('닉네임 1~12자, 한 uid 는 한 번만 참가(재호출은 기존 player), 닉네임 중복 불가', async () => {
    const g = await newGame()
    expect(await asErr(A, 'select * from public.join_game($1::uuid,$2::text)', [g.game_id, '   '])).toMatch(/INVALID_INPUT/)
    expect(await asErr(A, 'select * from public.join_game($1::uuid,$2::text)', [g.game_id, '열두글자를넘는닉네임입니다'])).toMatch(/INVALID_INPUT/)
    const p1 = await join(g.game_id, A, '철수')
    const p2 = await join(g.game_id, A, '다른이름')
    expect(p2.id).toBe(p1.id)
    expect(p2.nickname).toBe('철수')
    expect(await asErr(B, 'select * from public.join_game($1::uuid,$2::text)', [g.game_id, '철수'])).toMatch(/NICKNAME_TAKEN/)
    const { rows } = await db.query<any>('select count(*)::int c from public.players where game_id=$1', [g.game_id])
    expect(rows[0].c).toBe(1)
  })
})

describe('play_round: 서버 판정 / 판수 초과 방지', () => {
  it('참가하지 않으면 플레이할 수 없다', async () => {
    const g = await newGame()
    expect(await asErr(A, 'select public.play_round($1,$2)', [g.game_id, 'rock'])).toMatch(/NOT_JOINED/)
  })

  it('잘못된 선택은 거부', async () => {
    const g = await newGame()
    await join(g.game_id, A, 'a')
    expect(await asErr(A, 'select public.play_round($1,$2)', [g.game_id, 'lizard'])).toMatch(/INVALID_INPUT/)
  })

  it('판정이 규칙과 일치하고, 비김은 판수에 포함되지 않으며, R판에서 정확히 끝난다', async () => {
    const R = 5
    const g = await newGame({ rounds: R })
    await join(g.game_id, A, 'a')
    const beats: Record<string, string> = { rock: 'scissors', scissors: 'paper', paper: 'rock' }
    let last: any
    let calls = 0
    while (!last?.finished) {
      const [{ r }] = await as(A, 'select public.play_round($1,$2) as r', [g.game_id, 'rock'])
      calls++
      const expected = r.cpu_choice === 'rock' ? 'draw' : beats['rock'] === r.cpu_choice ? 'win' : 'lose'
      expect(r.result).toBe(expected)
      last = r
      expect(calls).toBeLessThan(200)
    }
    expect(last.played).toBe(R)
    const { rows: rounds } = await db.query<any>(
      `select result from public.rounds r join public.players p on p.id=r.player_id where p.game_id=$1`, [g.game_id])
    expect(rounds.length).toBe(calls)
    expect(rounds.filter((x) => x.result !== 'draw').length).toBe(R)
    expect(rounds.filter((x) => x.result === 'win').length).toBe(last.wins)
  })

  it('R판을 다 끝낸 뒤에는 더 플레이할 수 없다 (판수 초과 방지)', async () => {
    const g = await newGame({ rounds: 3 })
    const p = await join(g.game_id, A, 'a')
    await setRecord(p.id, 2, false)
    await db.query('update public.players set played=2 where id=$1', [p.id])
    // 마지막 한 판은 허용(비기면 반복)
    let r: any
    do { [{ r }] = await as(A, 'select public.play_round($1,$2) as r', [g.game_id, 'paper']) } while (r.result === 'draw')
    expect(r.played).toBe(3)
    expect(r.finished).toBe(true)
    expect(await asErr(A, 'select public.play_round($1,$2)', [g.game_id, 'paper'])).toMatch(/ALREADY_FINISHED/)
    const { rows } = await db.query<any>('select played, wins from public.players where id=$1', [p.id])
    expect(rows[0].played).toBe(3)
    expect(rows[0].wins).toBeLessThanOrEqual(3)
  })

  it('동시에 여러 번 호출해도 R판을 넘지 않는다', async () => {
    const g = await newGame({ rounds: 3 })
    const p = await join(g.game_id, A, 'a')
    const attempts = Array.from({ length: 40 }, () =>
      as(A, 'select public.play_round($1,$2) as r', [g.game_id, 'rock']).catch(() => null))
    await Promise.all(attempts)
    const { rows } = await db.query<any>('select played, finished from public.players where id=$1', [p.id])
    expect(rows[0].played).toBeLessThanOrEqual(3)
  })
})

describe('close_game: 순위 정렬과 당첨자 선정', () => {
  it('승률 내림차순, 동률이면 먼저 참여한 사람 우선, 미완료자는 제외하고 상위 N명을 확정', async () => {
    const g = await newGame({ winners: 3, rounds: 5 })
    const p = {
      a: await join(g.game_id, A, 'A-3승-늦음'),
      b: await join(g.game_id, B, 'B-5승'),
      c: await join(g.game_id, C, 'C-3승-빠름'),
      d: await join(g.game_id, D, 'D-미완료'),
      e: await join(g.game_id, U(6), 'E-1승'),
    }
    await setRecord(p.a.id, 3, true, '2026-01-01T10:00:10Z')
    await setRecord(p.b.id, 5, true, '2026-01-01T10:00:20Z')
    await setRecord(p.c.id, 3, true, '2026-01-01T10:00:05Z')
    await setRecord(p.d.id, 5, false, '2026-01-01T10:00:00Z') // 5승이지만 아직 R판 미완료 → 제외
    await setRecord(p.e.id, 1, true, '2026-01-01T10:00:01Z')

    const [{ r }] = await as(CREATOR, 'select public.close_game($1,$2) as r', [g.game_id, g.admin_token])
    expect(r).toEqual([
      { rank: 1, nickname: 'B-5승' },
      { rank: 2, nickname: 'C-3승-빠름' },
      { rank: 3, nickname: 'A-3승-늦음' },
    ])
    const [game] = await as(A, 'select status, closed_at from public.games_public where id=$1', [g.game_id])
    expect(game.status).toBe('closed')
    expect(game.closed_at).not.toBeNull()
  })

  it('완료자가 N명보다 적으면 있는 만큼만 당첨', async () => {
    const g = await newGame({ winners: 5 })
    const p = await join(g.game_id, A, 'a')
    await setRecord(p.id, 2, true)
    const [{ r }] = await as(CREATOR, 'select public.close_game($1,$2) as r', [g.game_id, g.admin_token])
    expect(r).toHaveLength(1)
  })

  it('잘못된 토큰은 거부, 같은 토큰으로 여러 번 호출해도 결과가 같다(멱등)', async () => {
    const g = await newGame({ winners: 1 })
    const p = await join(g.game_id, A, 'a')
    await setRecord(p.id, 4, true)
    expect(await asErr(A, 'select public.close_game($1,$2)', [g.game_id, 'wrong'])).toMatch(/INVALID_TOKEN/)
    expect(await as(A, 'select public.verify_admin($1,$2) as ok', [g.game_id, 'wrong'])).toEqual([{ ok: false }])
    expect(await as(CREATOR, 'select public.verify_admin($1,$2) as ok', [g.game_id, g.admin_token])).toEqual([{ ok: true }])

    // 다른 기기(다른 uid)에서도 토큰만 있으면 종료 가능
    const [{ r: r1 }] = await as(U(9), 'select public.close_game($1,$2) as r', [g.game_id, g.admin_token])
    // 종료 이후 순위가 바뀌어도 확정된 결과는 그대로
    await setRecord(p.id, 0, true)
    const [{ r: r2 }] = await as(CREATOR, 'select public.close_game($1,$2) as r', [g.game_id, g.admin_token])
    expect(r2).toEqual(r1)
    const { rows } = await db.query<any>('select count(*)::int c from public.winners where game_id=$1', [g.game_id])
    expect(rows[0].c).toBe(1)
  })

  it('종료 후에는 참여와 플레이가 불가능하다', async () => {
    const g = await newGame({ winners: 1 })
    const p = await join(g.game_id, A, 'a')
    await as(CREATOR, 'select public.close_game($1,$2)', [g.game_id, g.admin_token])
    expect(await asErr(B, 'select * from public.join_game($1::uuid,$2::text)', [g.game_id, 'late'])).toMatch(/GAME_CLOSED/)
    expect(await asErr(A, 'select public.play_round($1,$2)', [g.game_id, 'rock'])).toMatch(/GAME_CLOSED/)
    expect(p.id).toBeTruthy()
  })
})

describe('기프티콘 이미지 권한', () => {
  const key = (g: string, rank: number, ext = 'png') => `${g}/${rank}.${ext}`

  it('업로드는 생성자만, 올바른 경로만', async () => {
    const g = await newGame({ winners: 2 })
    const ins = (uid: string, name: string) =>
      as(uid, `insert into storage.objects (bucket_id, name, owner) values ('prizes', $1, auth.uid())`, [name])
    await ins(CREATOR, key(g.game_id, 1))
    await ins(CREATOR, key(g.game_id, 2, 'webp'))
    expect(await asErr(A, `insert into storage.objects (bucket_id,name) values ('prizes',$1)`, [key(g.game_id, 1)])).toMatch(/row-level security/)
    expect(await asErr(CREATOR, `insert into storage.objects (bucket_id,name) values ('prizes',$1)`, [key(g.game_id, 3)])).toMatch(/row-level security/)
    expect(await asErr(CREATOR, `insert into storage.objects (bucket_id,name) values ('prizes',$1)`, [`${g.game_id}/1.gif`])).toMatch(/row-level security/)
    expect(await asErr(CREATOR, `insert into storage.objects (bucket_id,name) values ('prizes',$1)`, ['nope/abc'])).toMatch(/row-level security/)
  })

  it('이미지는 해당 순위 당첨자 본인만 읽을 수 있다', async () => {
    const g = await newGame({ winners: 2 })
    for (const rank of [1, 2]) {
      await db.query(`insert into storage.objects (bucket_id,name) values ('prizes',$1)`, [key(g.game_id, rank)])
    }
    await as(CREATOR, 'select public.set_prize_paths($1,$2,$3::jsonb)', [
      g.game_id, g.admin_token, JSON.stringify({ 1: key(g.game_id, 1), 2: key(g.game_id, 2) })])
    expect(await asErr(A, 'select public.set_prize_paths($1,$2,$3::jsonb)', [g.game_id, 'bad', '{}'])).toMatch(/INVALID_TOKEN/)
    expect(await asErr(CREATOR, 'select public.set_prize_paths($1,$2,$3::jsonb)', [
      g.game_id, g.admin_token, JSON.stringify({ 1: 'other/1.png' })])).toMatch(/INVALID_INPUT/)

    const pa = await join(g.game_id, A, 'first')
    const pb = await join(g.game_id, B, 'second')
    const pc = await join(g.game_id, C, 'loser')
    await setRecord(pa.id, 5, true)
    await setRecord(pb.id, 4, true)
    await setRecord(pc.id, 1, true)

    const readable = async (uid: string) =>
      (await as<any>(uid, `select name from storage.objects where bucket_id='prizes' and name like $1 order by name`, [g.game_id + '/%'])).map((r) => r.name)
    expect(await readable(A)).toEqual([])   // 종료 전에는 아무도 못 봄

    await as(CREATOR, 'select public.close_game($1,$2)', [g.game_id, g.admin_token])
    expect(await readable(A)).toEqual([key(g.game_id, 1)])
    expect(await readable(B)).toEqual([key(g.game_id, 2)])
    expect(await readable(C)).toEqual([])
    expect(await readable(CREATOR)).toEqual([])
  })
})
