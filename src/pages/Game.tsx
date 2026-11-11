import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Layout, Card, Title } from '../components/Layout'
import { Button, LinkButton } from '../components/Button'
import { HandStage } from '../components/Hand3D'
import { ErrorView, Loading, NotFound, ConfigMissing } from '../components/States'
import { useGame, usePlayers } from '../hooks/useGame'
import { useSession } from '../hooks/useSession'
import { joinGame, playRound, type Player, type RoundOutcome } from '../lib/api'
import { fireConfetti } from '../lib/confetti'
import { toAppError } from '../lib/errors'
import { winRate } from '../lib/rank'
import { CHOICES, CHOICE_EMOJI, CHOICE_LABEL, RESULT_LABEL, type Choice } from '../lib/rps'
import { isConfigured } from '../lib/supabase'

const SHAKE_MS = 950
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Phase = 'pick' | 'shaking' | 'reveal'

function JoinForm({ gameId, onJoined }: { gameId: string; onJoined: (p: Player) => void }) {
  const [nick, setNick] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit() {
    setBusy(true)
    setError(null)
    try {
      onJoined(await joinGame(gameId, nick.trim()))
    } catch (e) {
      setError(toAppError(e).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (nick.trim() && !busy) submit()
        }}
      >
        <label htmlFor="nick" className="text-lg text-white">닉네임을 알려주세요</label>
        <input id="nick" className="input-jelly" value={nick} maxLength={12} autoComplete="off" placeholder="1~12자" onChange={(e) => setNick(e.target.value)} />
        {error && <p role="alert" className="m-0 text-bad">{error}</p>}
        <Button type="submit" block disabled={!nick.trim() || busy}>{busy ? '입장하는 중…' : '🎮 시작하기'}</Button>
        <p className="m-0 text-center text-sm text-ice/60">한 번 정하면 바꿀 수 없어요. 한 기기(브라우저)당 한 번만 참여할 수 있어요.</p>
      </form>
    </Card>
  )
}

function PlayArea({ gameId, rounds, me, closed, onRecord }: { gameId: string; rounds: number; me: Player; closed: boolean; onRecord: (o: RoundOutcome) => void }) {
  const [phase, setPhase] = useState<Phase>('pick')
  const [mine, setMine] = useState<Choice>('rock')
  const [cpu, setCpu] = useState<Choice>('rock')
  const [outcome, setOutcome] = useState<RoundOutcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [record, setRecord] = useState({ wins: me.wins, played: me.played, finished: me.finished })

  // 실시간으로 갱신된 서버 전적이 로컬보다 앞서 있으면 따라간다.
  useEffect(() => {
    setRecord((r) => (me.played > r.played ? { wins: me.wins, played: me.played, finished: me.finished } : r))
  }, [me.wins, me.played, me.finished])

  async function pick(choice: Choice) {
    setError(null)
    setMine(choice)
    setCpu('rock')
    setPhase('shaking')
    try {
      const [res] = await Promise.all([playRound(gameId, choice), wait(SHAKE_MS)])
      setCpu(res.cpu_choice)
      setOutcome(res)
      setRecord({ wins: res.wins, played: res.played, finished: res.finished })
      setPhase('reveal')
      onRecord(res)
      if (res.result === 'win') fireConfetti(false)
    } catch (e) {
      setError(toAppError(e).message)
      setPhase('pick')
    }
  }

  const losses = record.played - record.wins
  const shaking = phase === 'shaking'
  const showHands = phase === 'pick' ? ['rock', 'rock'] : phase === 'shaking' ? ['rock', 'rock'] : [mine, cpu]

  return (
    <div className="grid gap-5">
      <Card className="text-center">
        <div className="mb-1 flex items-center justify-between text-sm text-ice/70">
          <span>{me.nickname}</span>
          <span>{record.played}/{rounds}판 · {record.wins}승 {losses}패</span>
        </div>
        <div className="mb-1 flex justify-center gap-1.5" aria-label={`${rounds}판 중 ${record.played}판 진행`}>
          {Array.from({ length: rounds }, (_, i) => (
            <span
              key={i}
              className={`size-3.5 rounded-full ${i < record.wins ? 'bg-good' : i < record.played ? 'bg-bad' : 'bg-navy'}`}
            />
          ))}
        </div>

        {!record.finished || phase === 'reveal' ? (
          <>
            <HandStage
              height={190}
              items={[
                { choice: showHands[0] as Choice, tone: 'player', x: -1.6, scale: 0.66, shaking },
                { choice: showHands[1] as Choice, tone: 'cpu', x: 1.6, scale: 0.66, shaking, mirror: true },
              ]}
            />
            <div className="mb-2 flex justify-around text-sm text-ice/70">
              <span>나</span>
              <span>컴퓨터</span>
            </div>
          </>
        ) : null}

        <div aria-live="polite" className="min-h-14">
          {phase === 'shaking' && <p className="m-0 animate-bounce-soft text-3xl text-white">가위… 바위… 보!</p>}
          {phase === 'reveal' && outcome && (
            <p
              key={record.played + outcome.result + outcome.cpu_choice}
              className={`m-0 animate-pop text-4xl ${outcome.result === 'win' ? 'text-good' : outcome.result === 'lose' ? 'text-bad' : 'text-gold'}`}
            >
              {RESULT_LABEL[outcome.result]}
            </p>
          )}
          {phase === 'pick' && !record.finished && <p className="m-0 text-xl text-white">{record.played === 0 ? '무엇을 낼까요?' : '다음 판! 무엇을 낼까요?'}</p>}
        </div>

        {error && <p role="alert" className="mb-3 text-bad">{error}</p>}

        {record.finished ? (
          phase !== 'shaking' && (
            <div className="mt-2 grid gap-1">
              <p className="m-0 text-2xl text-white">🎉 모든 판을 끝냈어요!</p>
              <p className="m-0 text-ice/80">최종 {record.wins}승 {losses}패 · 승률 {Math.round(winRate(record.wins, rounds) * 100)}%</p>
              {closed ? (
                <div className="mt-4">
                  <LinkButton to={`/g/${gameId}/result`} block>🎊 결과 보기</LinkButton>
                </div>
              ) : (
                <p className="mt-3 mb-0 rounded-2xl bg-navy/70 p-3 text-sm text-ice/80">
                  순위와 당첨 결과는 <b>게임이 끝나면</b> 발표돼요.<br />이 화면에서 기다리면 자동으로 알려드려요.
                </p>
              )}
            </div>
          )
        ) : phase === 'reveal' ? (
          <Button block onClick={() => setPhase('pick')}>{outcome?.result === 'draw' ? '다시 하기' : '다음 판 ▶'}</Button>
        ) : (
          <div className="mt-2 grid grid-cols-3 gap-3">
            {CHOICES.map((c) => (
              <Button key={c} variant="royal" disabled={phase !== 'pick'} onClick={() => pick(c)} className="!flex-col !gap-0 !px-0 !py-2 !h-24" aria-label={CHOICE_LABEL[c]}>
                <span className="text-4xl leading-none">{CHOICE_EMOJI[c]}</span>
                <span className="text-base">{CHOICE_LABEL[c]}</span>
              </Button>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

export default function GamePage() {
  const { id } = useParams()
  const { uid, loading: sessionLoading } = useSession()
  const { game, loading, error, notFound, reload, refresh } = useGame(id)
  const { players, reload: reloadPlayers } = usePlayers(id, Boolean(game))
  const [joined, setJoined] = useState<Player | null>(null)
  const [lastOutcome, setLastOutcome] = useState<RoundOutcome | null>(null)
  // 마지막 판 연출을 보는 동안에는 게임이 끝나도 결과 페이지로 자동 이동하지 않는다.
  const [holdRedirect, setHoldRedirect] = useState(false)

  const me = useMemo(() => players.find((p) => p.uid === uid) ?? joined, [players, uid, joined])
  const prevFinished = useRef(false)

  useEffect(() => {
    if (lastOutcome?.finished && !prevFinished.current) {
      prevFinished.current = true
      reloadPlayers()
      refresh()
    }
  }, [lastOutcome, reloadPlayers, refresh])

  if (!isConfigured) return <Layout><ConfigMissing /></Layout>
  if (loading || sessionLoading) return <Layout><Loading label="게임 불러오는 중…" /></Layout>
  if (error) return <Layout><ErrorView error={error} onRetry={reload} /></Layout>
  if (notFound || !game) return <Layout><NotFound /></Layout>
  if (game.status === 'closed' && !holdRedirect) return <Navigate to={`/g/${game.id}/result`} replace />

  const rounds = game.rounds_per_player

  return (
    <Layout>
      <Title sub={`${rounds}판 · 상위 ${game.winner_count}명 당첨 · 참가 ${game.player_count}${game.max_players ? `/${game.max_players}` : ''}명`}>{game.title}</Title>

      <div className="grid gap-6">
        {!me && game.max_players && game.player_count >= game.max_players ? (
          <Card className="text-center">
            <div className="mb-2 text-5xl">🈵</div>
            <p className="m-0 text-xl text-white">참가 인원이 가득 찼어요</p>
            <p className="m-0 mt-1 text-ice/70">아쉽지만 이번 게임은 참여할 수 없어요.</p>
          </Card>
        ) : !me ? (
          <JoinForm gameId={game.id} onJoined={(p) => { setJoined(p); reloadPlayers() }} />
        ) : (
          <PlayArea
            gameId={game.id}
            rounds={rounds}
            me={me}
            closed={game.status === 'closed' || Boolean(lastOutcome?.game_closed)}
            onRecord={(o) => {
              setLastOutcome(o)
              if (o.finished) setHoldRedirect(true)
            }}
          />
        )}

        {me && <LinkButton to={`/g/${game.id}/result`} variant="ghost" block>결과 페이지 (종료 후 공개)</LinkButton>}
      </div>
    </Layout>
  )
}
