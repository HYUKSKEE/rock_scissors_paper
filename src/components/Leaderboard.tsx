import { useMemo } from 'react'
import type { Player } from '../lib/api'
import { inProgress, rankPlayers, winRate } from '../lib/rank'
import { Empty } from './States'

const MEDAL = ['🥇', '🥈', '🥉']

export function Leaderboard({
  players,
  rounds,
  winnerCount,
  meUid,
  max = 50,
}: {
  players: Player[]
  rounds: number
  winnerCount: number
  meUid?: string | null
  max?: number
}) {
  const ranked = useMemo(() => rankPlayers(players, rounds), [players, rounds])
  const waiting = useMemo(() => inProgress(players), [players])

  if (players.length === 0) return <Empty emoji="🫧">아직 참가자가 없어요. 첫 번째 도전자가 되어보세요!</Empty>

  return (
    <div className="grid gap-2">
      {ranked.length === 0 && <Empty emoji="⏳">아직 모든 판을 끝낸 사람이 없어요.</Empty>}
      <ol className="m-0 grid list-none gap-2 p-0">
        {ranked.slice(0, max).map((p) => {
          const inPrize = p.rank <= winnerCount
          return (
            <li
              key={p.id}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
                p.uid === meUid ? 'bg-royal/40 ring-2 ring-sky' : inPrize ? 'bg-navy/70' : 'bg-night'
              }`}
            >
              <span className="w-9 shrink-0 text-center text-xl">{MEDAL[p.rank - 1] ?? p.rank}</span>
              <span className="min-w-0 flex-1 truncate text-white">
                {p.nickname}
                {p.uid === meUid && <span className="ml-1 text-sm text-sky">(나)</span>}
              </span>
              <span className="shrink-0 text-sm text-ice/80">
                {p.wins}승 · {Math.round(winRate(p.wins, rounds) * 100)}%
              </span>
              {inPrize && <span className="shrink-0 rounded-full bg-gold/90 px-2 py-0.5 text-xs text-ink">당첨권</span>}
            </li>
          )
        })}
      </ol>
      {waiting.length > 0 && (
        <details className="mt-1 text-ice/70">
          <summary className="cursor-pointer select-none py-1">진행 중 {waiting.length}명</summary>
          <ul className="m-0 grid list-none gap-1 p-0 pt-1 text-sm">
            {waiting.map((p) => (
              <li key={p.id} className="flex justify-between rounded-xl bg-night px-3 py-1.5">
                <span className="truncate">{p.nickname}{p.uid === meUid && ' (나)'}</span>
                <span>{p.played}/{rounds}판</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
