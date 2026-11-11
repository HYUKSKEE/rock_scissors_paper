import { useCallback, useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { Layout, Card, Title } from '../components/Layout'
import { Button, LinkButton } from '../components/Button'
import { CopyField } from '../components/CopyField'
import { Leaderboard } from '../components/Leaderboard'
import { Modal } from '../components/Modal'
import { ErrorView, Loading, NotFound, ConfigMissing } from '../components/States'
import { useAdminPlayers, useGame } from '../hooks/useGame'
import { useSession } from '../hooks/useSession'
import { absolute, adminPath, getAdminToken, saveAdminToken } from '../lib/adminStore'
import { closeGame, verifyAdmin } from '../lib/api'
import { toAppError, type AppError } from '../lib/errors'
import { isConfigured } from '../lib/supabase'

type Auth = { state: 'checking' } | { state: 'ok'; token: string } | { state: 'none' } | { state: 'bad' } | { state: 'error'; error: AppError }

export default function Admin() {
  const { id = '' } = useParams()
  const { hash } = useLocation()
  const { uid, loading: sessionLoading } = useSession()
  const { game, loading, error, notFound, reload, refresh } = useGame(id)
  const [auth, setAuth] = useState<Auth>({ state: 'checking' })
  const players = useAdminPlayers(id, auth.state === 'ok' ? auth.token : null)
  const [confirm, setConfirm] = useState(false)
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)
  const [winners, setWinners] = useState<{ rank: number; nickname: string }[] | null>(null)

  // 토큰: URL 해시(#token=...) 우선, 없으면 이 기기에 저장된 것
  const check = useCallback(async () => {
    if (!uid) return
    const fromHash = new URLSearchParams(hash.replace(/^#/, '')).get('token')
    const token = fromHash || getAdminToken(id)
    if (!token) return setAuth({ state: 'none' })
    setAuth({ state: 'checking' })
    try {
      if (await verifyAdmin(id, token)) {
        saveAdminToken(id, token)
        setAuth({ state: 'ok', token })
      } else setAuth({ state: 'bad' })
    } catch (e) {
      setAuth({ state: 'error', error: toAppError(e) })
    }
  }, [uid, hash, id])

  useEffect(() => { check() }, [check])

  // 홈 화면의 "내가 만든 게임" 목록에 제목을 표시하기 위해 저장
  const title = game?.title
  useEffect(() => {
    if (auth.state === 'ok' && title) saveAdminToken(id, auth.token, title)
  }, [auth, id, title])

  async function doClose() {
    if (auth.state !== 'ok') return
    setClosing(true)
    setCloseError(null)
    try {
      setWinners(await closeGame(id, auth.token))
      setConfirm(false)
      refresh()
    } catch (e) {
      setCloseError(toAppError(e).message)
    } finally {
      setClosing(false)
    }
  }

  if (!isConfigured) return <Layout><ConfigMissing /></Layout>
  if (loading || sessionLoading || auth.state === 'checking') return <Layout><Loading label="확인하는 중…" /></Layout>
  if (error) return <Layout><ErrorView error={error} onRetry={reload} /></Layout>
  if (auth.state === 'error') return <Layout><ErrorView error={auth.error} onRetry={check} /></Layout>
  if (notFound || !game) return <Layout><NotFound /></Layout>
  if (auth.state !== 'ok') {
    return (
      <Layout>
        <Card className="text-center">
          <div className="mb-2 text-5xl">🔒</div>
          <h2 className="m-0 mb-2 text-xl text-white">{auth.state === 'bad' ? '관리 권한을 확인하지 못했어요' : '관리 링크가 필요해요'}</h2>
          <p className="m-0 mb-5 text-ice/75">게임을 만들 때 받은 <b>관리 링크</b>(…/admin#token=…)로 접속해주세요.</p>
          <LinkButton to="/">처음으로</LinkButton>
        </Card>
      </Layout>
    )
  }

  const closed = game.status === 'closed'
  const finished = players.filter((p) => p.finished).length
  const shareUrl = absolute(`/g/${game.id}`)
  const resultUrl = absolute(`/g/${game.id}/result`)

  return (
    <Layout>
      <Title sub={closed ? '종료된 게임이에요' : '관리자 페이지'}>{game.title}</Title>
      <div className="grid gap-6">
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            [game.max_players ? `참가자 (최대 ${game.max_players})` : '참가자', players.length],
            ['완주', finished],
            ['당첨', game.winner_count],
          ].map(([l, v]) => (
            <Card key={l} className="!p-3">
              <p className="m-0 text-3xl text-white">{v}</p>
              <p className="m-0 text-sm text-ice/70">{l}</p>
            </Card>
          ))}
        </div>

        <Card>
          <CopyField label="👥 참가자 공유 링크" value={shareUrl} />
        </Card>

        {closed ? (
          <Card className="grid gap-4 text-center">
            <p className="m-0 text-2xl text-white">🏁 게임이 종료됐어요</p>
            {winners && (
              <ol className="m-0 list-none p-0 text-left">
                {winners.map((w) => (
                  <li key={w.rank} className="py-1 text-lg text-white">{w.rank}등 · {w.nickname}</li>
                ))}
              </ol>
            )}
            <CopyField label="결과 링크" value={resultUrl} />
            <LinkButton to={`/g/${game.id}/result`} variant="royal" block>결과 보기</LinkButton>
          </Card>
        ) : (
          <div className="grid gap-2">
            <Button variant="danger" block onClick={() => setConfirm(true)}>🏁 게임 종료하기</Button>
            <p className="m-0 text-center text-sm text-ice/60">
              {game.max_players
                ? `${game.max_players}명이 모두 입장해 전원이 끝내면 자동으로 종료돼요.`
                : '직접 종료하기 전까지 계속 참가를 받아요.'}{' '}
              참가자에게는 종료 전까지 순위가 보이지 않아요.
            </p>
          </div>
        )}

        <Card>
          <h2 className="m-0 mb-1 text-xl text-white">🏅 실시간 순위</h2>
          <p className="m-0 mb-3 text-sm text-gold">🔒 관리자만 볼 수 있어요. 참가자에게는 종료 후 공개돼요.</p>
          <Leaderboard players={players} rounds={game.rounds_per_player} winnerCount={game.winner_count} />
        </Card>

        <Card>
          <CopyField label="🔑 관리 링크" value={absolute(adminPath(game.id, auth.token))} />
          <p className="mt-3 mb-0 text-sm text-gold">이 링크를 잃어버리면 게임을 종료할 수 없어요. 다른 기기에서도 이 링크로 관리할 수 있어요.</p>
        </Card>
      </div>

      <Modal open={confirm} onClose={() => !closing && setConfirm(false)} label="게임 종료 확인">
        <h2 className="m-0 mb-2 text-2xl text-white">게임을 종료할까요?</h2>
        <p className="m-0 mb-1 text-ice/80">현재 순위 기준으로 상위 <b className="text-sky">{Math.min(game.winner_count, finished)}명</b>이 당첨자로 확정돼요.</p>
        <p className="m-0 mb-4 text-sm text-ice/60">아직 모든 판을 끝내지 못한 {players.length - finished}명은 순위에서 제외되고, 종료 후에는 되돌릴 수 없어요.</p>
        {closeError && <p role="alert" className="mb-3 text-bad">{closeError}</p>}
        <div className="grid gap-3">
          <Button variant="danger" block disabled={closing} onClick={doClose}>{closing ? '종료하는 중…' : '네, 종료할게요'}</Button>
          <Button variant="ghost" block disabled={closing} onClick={() => setConfirm(false)}>취소</Button>
        </div>
      </Modal>
    </Layout>
  )
}
