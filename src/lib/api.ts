import { ensureSession, supabase } from './supabase'
import { toAppError, AppError } from './errors'
import type { Choice, RoundResult } from './rps'
import type { RankablePlayer } from './rank'

export interface Game {
  id: string
  title: string
  winner_count: number
  rounds_per_player: number
  status: 'open' | 'closed'
  created_at: string
  closed_at: string | null
  player_count: number
  max_players: number | null
}
export interface Player extends RankablePlayer {
  game_id: string
  uid: string
}
export interface Winner {
  game_id: string
  rank: number
  player_id: string
  uid: string
  nickname: string
  prize_path: string | null
}
export interface RoundOutcome {
  cpu_choice: Choice
  result: RoundResult
  wins: number
  played: number
  finished: boolean
  /** 이 판으로 게임이 자동 종료됐는지 (최대 인원 전원 완주) */
  game_closed: boolean
}

async function wrap<T>(fn: () => PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  try {
    const { data, error } = await fn()
    if (error) throw error
    return data as T
  } catch (e) {
    throw toAppError(e)
  }
}

export async function createGame(title: string, winnerCount: number, rounds: number, maxPlayers: number | null) {
  await ensureSession()
  return wrap(() =>
    supabase.rpc('create_game', { p_title: title, p_winner_count: winnerCount, p_rounds: rounds, p_max_players: maxPlayers }),
  ) as Promise<{ game_id: string; admin_token: string }>
}

export async function verifyAdmin(gameId: string, token: string): Promise<boolean> {
  await ensureSession()
  return wrap(() => supabase.rpc('verify_admin', { p_game_id: gameId, p_admin_token: token }))
}

export async function setPrizePaths(gameId: string, token: string, paths: Record<number, string>) {
  await ensureSession()
  await wrap(() => supabase.rpc('set_prize_paths', { p_game_id: gameId, p_admin_token: token, p_paths: paths }))
}

export async function joinGame(gameId: string, nickname: string): Promise<Player> {
  await ensureSession()
  return wrap(() => supabase.rpc('join_game', { p_game_id: gameId, p_nickname: nickname })) as Promise<Player>
}

export async function playRound(gameId: string, choice: Choice): Promise<RoundOutcome> {
  await ensureSession()
  return wrap(() => supabase.rpc('play_round', { p_game_id: gameId, p_choice: choice })) as Promise<RoundOutcome>
}

export async function closeGame(gameId: string, token: string) {
  await ensureSession()
  return wrap(() => supabase.rpc('close_game', { p_game_id: gameId, p_admin_token: token })) as Promise<
    { rank: number; nickname: string }[]
  >
}

export async function fetchGame(gameId: string): Promise<Game | null> {
  await ensureSession()
  // uuid 형식이 아니면 PostgREST 가 400 을 내므로 미리 걸러낸다.
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) return null
  return wrap(() => supabase.from('games_public').select('*').eq('id', gameId).maybeSingle()) as Promise<Game | null>
}

export async function fetchPlayers(gameId: string): Promise<Player[]> {
  await ensureSession()
  return wrap(() => supabase.from('players').select('*').eq('game_id', gameId)) as Promise<Player[]>
}

/** 생성자 전용: 종료 전에도 전체 참가자 현황을 본다 (참가자에게는 종료 전까지 순위가 공개되지 않는다). */
export async function fetchAdminPlayers(gameId: string, token: string): Promise<Player[]> {
  await ensureSession()
  return wrap(() => supabase.rpc('admin_players', { p_game_id: gameId, p_admin_token: token })) as Promise<Player[]>
}

export async function fetchWinners(gameId: string): Promise<Winner[]> {
  await ensureSession()
  return wrap(() =>
    supabase.from('winners').select('*').eq('game_id', gameId).order('rank'),
  ) as Promise<Winner[]>
}

/** 당첨자 본인만 서명 URL 을 받을 수 있다(스토리지 RLS). */
export async function getPrizeUrl(path: string): Promise<string> {
  await ensureSession()
  const { data, error } = await supabase.storage.from('prizes').createSignedUrl(path, 60 * 10)
  if (error || !data) throw new AppError('PRIZE_UNAVAILABLE', '기프티콘 이미지를 불러오지 못했어요.')
  return data.signedUrl
}

export const PRIZE_MAX_BYTES = 5 * 1024 * 1024
export const PRIZE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export async function uploadPrize(gameId: string, rank: number, file: File): Promise<string> {
  const ext = PRIZE_TYPES[file.type]
  if (!ext) throw new AppError('INVALID_FILE', 'jpg, png, webp 이미지만 올릴 수 있어요.')
  if (file.size > PRIZE_MAX_BYTES) throw new AppError('INVALID_FILE', '이미지는 5MB 이하만 올릴 수 있어요.')
  const path = `${gameId}/${rank}.${ext}`
  await ensureSession()
  const { error } = await supabase.storage.from('prizes').upload(path, file, { contentType: file.type, upsert: true })
  if (error) throw toAppError(error)
  return path
}
