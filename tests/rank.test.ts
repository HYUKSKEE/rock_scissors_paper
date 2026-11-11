import { describe, expect, it } from 'vitest'
import { inProgress, rankPlayers, winRate, type RankablePlayer } from '../src/lib/rank'

const p = (id: string, wins: number, joined: string, finished = true): RankablePlayer => ({
  id, nickname: id, wins, played: finished ? 5 : wins, finished, joined_at: joined,
})

describe('rankPlayers', () => {
  it('승률 내림차순으로 정렬한다', () => {
    const r = rankPlayers([p('a', 2, '2026-01-01T00:00:01Z'), p('b', 5, '2026-01-01T00:00:02Z'), p('c', 3, '2026-01-01T00:00:03Z')], 5)
    expect(r.map((x) => [x.id, x.rank])).toEqual([['b', 1], ['c', 2], ['a', 3]])
  })

  it('동률이면 먼저 참여한 사람이 앞선다', () => {
    const r = rankPlayers([p('late', 3, '2026-01-01T00:00:09Z'), p('early', 3, '2026-01-01T00:00:01Z'), p('mid', 3, '2026-01-01T00:00:05Z')], 5)
    expect(r.map((x) => x.id)).toEqual(['early', 'mid', 'late'])
  })

  it('R판을 끝내지 않은 사람은 순위에서 제외한다', () => {
    const list = [p('done', 1, '2026-01-01T00:00:09Z'), p('running', 4, '2026-01-01T00:00:01Z', false)]
    expect(rankPlayers(list, 5).map((x) => x.id)).toEqual(['done'])
    expect(inProgress(list).map((x) => x.id)).toEqual(['running'])
  })

  it('입력 배열을 변경하지 않는다', () => {
    const list = [p('a', 1, '2026-01-01T00:00:01Z'), p('b', 4, '2026-01-01T00:00:02Z')]
    rankPlayers(list, 5)
    expect(list.map((x) => x.id)).toEqual(['a', 'b'])
  })
})

describe('winRate', () => {
  it('wins / rounds', () => {
    expect(winRate(3, 5)).toBeCloseTo(0.6)
    expect(winRate(0, 0)).toBe(0)
  })
})
