import { useEffect, useMemo, useState } from 'react'
import { Layout, Card, Title } from '../components/Layout'
import { Button, LinkButton } from '../components/Button'
import { CopyField } from '../components/CopyField'
import { ConfigMissing } from '../components/States'
import { useSession } from '../hooks/useSession'
import { createGame, setPrizePaths, uploadPrize, PRIZE_MAX_BYTES, PRIZE_TYPES } from '../lib/api'
import { absolute, adminPath, saveAdminToken } from '../lib/adminStore'
import { toAppError } from '../lib/errors'
import { isConfigured } from '../lib/supabase'

function Stepper({ label, value, min, max, onChange, unit }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; unit: string }) {
  return (
    <div className="grid gap-2">
      <span className="text-ice">{label}</span>
      <div className="flex items-center justify-between gap-3">
        <Button size="sm" variant="ghost" aria-label={`${label} 줄이기`} disabled={value <= min} onClick={() => onChange(value - 1)}>−</Button>
        <span className="text-2xl text-white" aria-live="polite">{value}{unit}</span>
        <Button size="sm" variant="ghost" aria-label={`${label} 늘리기`} disabled={value >= max} onClick={() => onChange(value + 1)}>＋</Button>
      </div>
    </div>
  )
}

function validateFile(f: File): string | null {
  if (!PRIZE_TYPES[f.type]) return 'jpg, png, webp만 가능해요'
  if (f.size > PRIZE_MAX_BYTES) return '5MB 이하만 가능해요'
  return null
}

function PrizeSlot({ rank, file, onPick }: { rank: number; file: File | null; onPick: (f: File | null) => void }) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="grid gap-1">
      <label className="relative grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-sky/40 bg-night text-center text-sm text-ice/70 focus-within:ring-4 focus-within:ring-sky/30">
        {url ? <img src={url} alt={`${rank}등 기프티콘 미리보기`} className="size-full object-cover" /> : <span className="px-1">📷<br />이미지 선택</span>}
        <span className="absolute left-1.5 top-1.5 rounded-full bg-gold px-2 text-sm text-ink">{rank}등</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={`${rank}등 기프티콘 이미지`}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            e.target.value = ''
            if (!f) return
            const v = validateFile(f)
            setErr(v)
            if (!v) onPick(f)
          }}
        />
      </label>
      {err && <p className="m-0 text-xs text-bad">{err}</p>}
    </div>
  )
}

interface Created { gameId: string; token: string }

export default function Create() {
  const { loading: sessionLoading, error: sessionError, retry } = useSession()
  const [title, setTitle] = useState('')
  const [winners, setWinners] = useState(3)
  const [rounds, setRounds] = useState(5)
  const [files, setFiles] = useState<(File | null)[]>(Array(10).fill(null))
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Created | null>(null)
  const [uploaded, setUploaded] = useState(false)

  const missing = files.slice(0, winners).some((f) => !f)
  const canSubmit = title.trim().length > 0 && !missing && !busy

  async function uploadAll(c: Created) {
    setError(null)
    try {
      const paths: Record<number, string> = {}
      for (let i = 0; i < winners; i++) {
        setBusy(`이미지 올리는 중… (${i + 1}/${winners})`)
        paths[i + 1] = await uploadPrize(c.gameId, i + 1, files[i]!)
      }
      setBusy('마무리하는 중…')
      await setPrizePaths(c.gameId, c.token, paths)
      setUploaded(true)
    } catch (e) {
      setError(toAppError(e).message)
    } finally {
      setBusy(null)
    }
  }

  async function submit() {
    setError(null)
    setBusy('게임 만드는 중…')
    try {
      const r = await createGame(title.trim(), winners, rounds)
      const c = { gameId: r.game_id, token: r.admin_token }
      saveAdminToken(c.gameId, c.token, title.trim())
      setCreated(c)
      await uploadAll(c)
    } catch (e) {
      setError(toAppError(e).message)
      setBusy(null)
    }
  }

  if (created) {
    const share = absolute(`/g/${created.gameId}`)
    const admin = absolute(adminPath(created.gameId, created.token))
    return (
      <Layout>
        <Title sub={uploaded ? '아래 링크를 친구들에게 공유하세요' : undefined}>{uploaded ? '게임이 만들어졌어요! 🎉' : '거의 다 됐어요'}</Title>
        {!uploaded && (
          <Card className="mb-5 text-center">
            {busy ? (
              <p className="m-0 text-ice" role="status">{busy}</p>
            ) : (
              <>
                <p className="m-0 mb-3 text-bad">{error ?? '이미지 업로드에 실패했어요.'}</p>
                <p className="m-0 mb-4 text-sm text-ice/70">게임은 이미 만들어졌어요. 다시 시도하면 이어서 올려요. (참가자 링크는 업로드가 끝난 뒤에 공유하세요)</p>
                <Button onClick={() => uploadAll(created)} block>이미지 다시 올리기</Button>
              </>
            )}
          </Card>
        )}
        <div className="grid gap-5">
          <Card>
            <CopyField label="👥 참가자 공유 링크" value={share} hint="카톡 등으로 보내세요. 누구나 이 링크로 참여할 수 있어요." />
          </Card>
          <Card>
            <CopyField label="🔑 관리 링크 (나만 보관!)" value={admin} />
            <p className="mt-3 mb-0 rounded-2xl bg-gold/15 p-3 text-sm text-gold">
              ⚠️ 이 링크를 잃어버리면 게임을 종료할 수 없어요. 다른 사람에게 공유하지 말고, 메모해 두세요. 이 기기에는 자동으로 저장돼 있어요.
            </p>
          </Card>
          <LinkButton to={adminPath(created.gameId, created.token)} variant="royal" block>관리 페이지로 가기</LinkButton>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <Title sub="기프티콘은 당첨 순위대로 1등 → 이미지1, 2등 → 이미지2 …">게임 만들기</Title>
      <ConfigMissing />
      {sessionError && (
        <Card className="mb-4 text-center">
          <p className="m-0 mb-3 text-bad">서버에 연결하지 못했어요. 무료 서버가 쉬고 있을 수 있어요.</p>
          <Button onClick={retry} size="sm">다시 연결</Button>
        </Card>
      )}
      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmit) submit()
        }}
      >
        <Card className="grid gap-5">
          <div className="grid gap-2">
            <label htmlFor="title" className="text-ice">게임 제목</label>
            <input id="title" className="input-jelly" value={title} maxLength={50} placeholder="예) 우리 팀 점심 내기" onChange={(e) => setTitle(e.target.value)} />
          </div>
          <Stepper label="당첨 인원" value={winners} min={1} max={10} unit="명" onChange={setWinners} />
          <Stepper label="1인당 판수 (비기면 제외)" value={rounds} min={3} max={10} unit="판" onChange={setRounds} />
        </Card>

        <Card>
          <h2 className="m-0 mb-1 text-lg text-white">기프티콘 이미지 {winners}장</h2>
          <p className="m-0 mb-4 text-sm text-ice/60">jpg · png · webp, 5MB 이하. 당첨자 본인에게만 보여요.</p>
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: winners }, (_, i) => (
              <PrizeSlot key={i} rank={i + 1} file={files[i]} onPick={(f) => setFiles((fs) => fs.map((x, j) => (j === i ? f : x)))} />
            ))}
          </div>
        </Card>

        {error && <p role="alert" className="m-0 text-center text-bad">{error}</p>}
        <Button type="submit" block disabled={!canSubmit || sessionLoading || !isConfigured}>
          {busy ?? (missing ? `이미지 ${winners}장을 모두 골라주세요` : '🎮 게임 만들기')}
        </Button>
      </form>
    </Layout>
  )
}
