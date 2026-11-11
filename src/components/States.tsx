import { isConfigured } from '../lib/supabase'
import { isNetworkError, type AppError } from '../lib/errors'
import { Button, LinkButton } from './Button'
import { Card } from './Layout'

export function Loading({ label = '불러오는 중…' }: { label?: string }) {
  return (
    <div role="status" className="grid place-items-center gap-4 py-20 text-ice/80">
      <div className="size-14 animate-spin rounded-full border-[6px] border-navy border-t-sky" />
      <p className="m-0">{label}</p>
    </div>
  )
}

export function ErrorView({ error, onRetry }: { error: AppError | Error; onRetry?: () => void }) {
  const network = isNetworkError(error) || (error as AppError).code === 'NETWORK'
  return (
    <Card className="text-center">
      <div className="mb-2 text-6xl">{network ? '😴' : '🥲'}</div>
      <h2 className="m-0 mb-2 text-2xl text-white">{network ? '서버가 잠시 쉬고 있어요' : '앗, 문제가 생겼어요'}</h2>
      <p className="m-0 mb-5 text-ice/75">
        {network ? (
          <>
            연결에 실패했어요. 무료 서버는 한동안 사용이 없으면 일시정지될 수 있어요.
            <br />
            게임 만든 분께 알려주시거나, 잠시 후 다시 시도해주세요.
          </>
        ) : (
          error.message
        )}
      </p>
      <div className="flex flex-col gap-3">
        {onRetry && <Button onClick={onRetry}>다시 시도</Button>}
        <LinkButton to="/" variant="ghost">처음으로</LinkButton>
      </div>
    </Card>
  )
}

export function Empty({ emoji = '🫧', children }: { emoji?: string; children: React.ReactNode }) {
  return (
    <div className="grid place-items-center gap-2 py-8 text-center text-ice/60">
      <div className="text-4xl">{emoji}</div>
      <p className="m-0">{children}</p>
    </div>
  )
}

export function NotFound({ message = '게임을 찾을 수 없어요. 링크를 다시 확인해주세요.' }: { message?: string }) {
  return (
    <Card className="text-center">
      <div className="mb-2 text-6xl">🔍</div>
      <p className="m-0 mb-5 text-lg text-white">{message}</p>
      <LinkButton to="/">처음으로</LinkButton>
    </Card>
  )
}

/** .env 가 없을 때 개발자에게 보여주는 안내 */
export function ConfigMissing() {
  if (isConfigured) return null
  return (
    <div className="mx-auto mt-6 max-w-md px-4">
      <Card className="text-center">
        <div className="mb-2 text-5xl">🔧</div>
        <h2 className="m-0 mb-2 text-xl text-white">Supabase 설정이 필요해요</h2>
        <p className="m-0 text-ice/75">
          <code>.env</code> 파일에 <code>VITE_SUPABASE_URL</code> 과 <code>VITE_SUPABASE_ANON_KEY</code> 를 넣고
          개발 서버를 다시 시작해주세요. (README 참고)
        </p>
      </Card>
    </div>
  )
}
