export interface RankablePlayer {
  id: string
  nickname: string
  wins: number
  played: number
  finished: boolean
  joined_at: string
}

/** 승률 = wins / 게임의 판수(R). R판을 끝내지 않았다면 아직 확정 승률이 아니므로 현재 전적 기준으로만 표시한다. */
export function winRate(wins: number, rounds: number): number {
  return rounds > 0 ? wins / rounds : 0
}

/**
 * 순위 규칙 (DB 의 rank_players() 와 동일해야 한다):
 *  1) R판을 끝낸 사람만 순위에 들어간다
 *  2) 승률 내림차순  3) 동률이면 joined_at 오름차순(먼저 참여한 사람 우선)
 */
export function rankPlayers<T extends RankablePlayer>(players: T[], rounds: number): (T & { rank: number })[] {
  return players
    .filter((p) => p.finished)
    .sort(
      (a, b) =>
        winRate(b.wins, rounds) - winRate(a.wins, rounds) ||
        new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime() ||
        a.id.localeCompare(b.id),
    )
    .map((p, i) => ({ ...p, rank: i + 1 }))
}

/** 아직 R판을 끝내지 못한 참가자 (진행 중) */
export function inProgress<T extends RankablePlayer>(players: T[]): T[] {
  return players
    .filter((p) => !p.finished)
    .sort((a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime())
}
