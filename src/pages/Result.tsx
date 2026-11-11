import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Layout, Card, Title } from '../components/Layout'
import { LinkButton } from '../components/Button'
import { Empty, ErrorView, Loading, NotFound, ConfigMissing } from '../components/States'
import { useGame } from '../hooks/useGame'
import { useSession } from '../hooks/useSession'
import { fetchWinners, getPrizeUrl, type Winner } from '../lib/api'
import { fireConfetti } from '../lib/confetti'
import { toAppError, type AppError } from '../lib/errors'
import { isConfigured } from '../lib/supabase'

const MEDAL = ['🥇', '🥈', '🥉']

function PrizeImage({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!path) return
    let alive = true
    getPrizeUrl(path).then((u) => alive && setUrl(u)).catch((e) => alive && setErr(toAppError(e).message))
    return () => { alive = false }
  }, [path])
  if (!path) return <p className="m-0 text-gold">기프티콘 이미지가 등록되지 않았어요. 주최자에게 문의해주세요.</p>
  if (err) return <p role="alert" className="m-0 text-bad">{err}</p>
  if (!url) return <Loading label="기프티콘 불러오는 중…" />
  return (
    <div className="grid gap-3">
      <img src={url} alt="내 기프티콘" className="w-full rounded-2xl bg-white object-contain" />
      <a href={url} download className="btn-candy no-underline" data-variant="royal" data-block="true">이미지 저장 / 열기</a>
      <p className="m-0 text-xs text-ice/50">이 이미지는 당첨자 본인에게만 보여요. 링크는 10분 뒤 만료돼요.</p>
    </div>
  )
}

export default function Result() {
  const { id = '' } = useParams()
  const { uid, loading: sessionLoading } = useSession()
  const { game, loading, error, notFound, reload } = useGame(id, 5000)
  const [winners, setWinners] = useState<Winner[] | null>(null)
  const [wErr, setWErr] = useState<AppError | null>(null)
  const fired = useRef(false)

  const closed = game?.status === 'closed'
  useEffect(() => {
    if (!closed) return
    let alive = true
    fetchWinners(id).then((w) => alive && setWinners(w)).catch((e) => alive && setWErr(toAppError(e)))
    return () => { alive = false }
  }, [closed, id])

  const mine = winners?.find((w) => w.uid === uid)
  useEffect(() => {
    if (winners && !fired.current) {
      fired.current = true
      fireConfetti(Boolean(mine))
    }
  }, [winners, mine])

  if (!isConfigured) return <Layout><ConfigMissing /></Layout>
  if (loading || sessionLoading) return <Layout><Loading label="결과 불러오는 중…" /></Layout>
  if (error) return <Layout><ErrorView error={error} onRetry={reload} /></Layout>
  if (notFound || !game) return <Layout><NotFound /></Layout>

  if (!closed) {
    return (
      <Layout>
        <Card className="text-center">
          <div className="mb-2 animate-bounce-soft text-6xl">⏳</div>
          <h2 className="m-0 mb-2 text-2xl text-white">아직 진행 중이에요</h2>
          <p className="m-0 mb-5 text-ice/75">「{game.title}」은(는) 아직 종료되지 않았어요.<br />종료되면 이 화면에 자동으로 결과가 나와요.</p>
          <LinkButton to={`/g/${game.id}`} block>게임하러 가기</LinkButton>
        </Card>
      </Layout>
    )
  }

  if (wErr) return <Layout><ErrorView error={wErr} onRetry={() => { setWErr(null); fetchWinners(id).then(setWinners).catch((e) => setWErr(toAppError(e))) }} /></Layout>
  if (!winners) return <Layout><Loading label="당첨자 발표 준비 중…" /></Layout>

  return (
    <Layout>
      <Title sub="당첨자 발표">🎊 {game.title}</Title>

      {mine ? (
        <Card className="mb-6 text-center">
          <div className="mb-1 animate-pop text-6xl">{MEDAL[mine.rank - 1] ?? '🎁'}</div>
          <h2 className="m-0 mb-1 text-3xl text-white">축하해요, {mine.nickname}님!</h2>
          <p className="m-0 mb-4 text-lg text-sky">{mine.rank}등 당첨 🎉</p>
          <PrizeImage path={mine.prize_path} />
        </Card>
      ) : (
        <Card className="mb-6 text-center">
          <div className="mb-2 text-6xl">🥲</div>
          <h2 className="m-0 mb-1 text-2xl text-white">아쉽지만 다음 기회에!</h2>
          <p className="m-0 text-ice/75">다음엔 꼭 당첨되길 응원할게요.</p>
        </Card>
      )}

      <Card>
        <h2 className="m-0 mb-3 text-xl text-white">🏆 당첨자</h2>
        {winners.length === 0 ? (
          <Empty emoji="🫥">모든 판을 끝낸 참가자가 없어서 당첨자가 없어요.</Empty>
        ) : (
          <ol className="m-0 grid list-none gap-2 p-0">
            {winners.map((w, i) => (
              <li
                key={w.rank}
                style={{ animationDelay: `${i * 120}ms` }}
                className={`flex animate-pop items-center gap-3 rounded-2xl px-4 py-3 ${w.uid === uid ? 'bg-royal/40 ring-2 ring-sky' : 'bg-navy/70'}`}
              >
                <span className="w-9 text-center text-2xl">{MEDAL[w.rank - 1] ?? w.rank}</span>
                <span className="min-w-0 flex-1 truncate text-lg text-white">{w.nickname}{w.uid === uid && <span className="ml-1 text-sm text-sky">(나)</span>}</span>
                <span className="text-sm text-ice/70">{w.rank}등</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </Layout>
  )
}
