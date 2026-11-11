/** 서버(RPC)가 던지는 에러 코드 → 친절한 한국어 메시지 */
const MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: '로그인 정보를 확인하지 못했어요. 새로고침 해주세요.',
  INVALID_INPUT: '입력값을 다시 확인해주세요.',
  GAME_NOT_FOUND: '존재하지 않는 게임이에요. 링크를 다시 확인해주세요.',
  GAME_CLOSED: '이미 종료된 게임이에요.',
  GAME_FULL: '참가 인원이 가득 찼어요.',
  NICKNAME_TAKEN: '이미 사용 중인 닉네임이에요. 다른 닉네임을 써주세요.',
  NOT_JOINED: '먼저 닉네임을 입력하고 참가해주세요.',
  ALREADY_FINISHED: '모든 판을 끝냈어요!',
  INVALID_TOKEN: '관리 권한이 없어요. 관리 링크를 다시 확인해주세요.',
}

export class AppError extends Error {
  code: string
  constructor(code: string, message?: string) {
    super(message ?? MESSAGES[code] ?? '알 수 없는 오류가 발생했어요.')
    this.code = code
  }
}

export function isNetworkError(e: unknown): boolean {
  const msg = String((e as any)?.message ?? e ?? '').toLowerCase()
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('fetch failed') ||
    (e as any)?.status === 0 ||
    (e as any)?.status === 502 ||
    (e as any)?.status === 503 ||
    (e as any)?.status === 540
  )
}

/** Supabase/PostgREST 에러를 AppError 로 변환 */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e
  if (isNetworkError(e)) return new AppError('NETWORK', '서버에 연결하지 못했어요.')
  const msg = String((e as any)?.message ?? '')
  const code = Object.keys(MESSAGES).find((c) => msg.includes(c))
  if (code) return new AppError(code)
  return new AppError('UNKNOWN', msg || undefined)
}
