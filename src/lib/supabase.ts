import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anonKey && !url.includes('YOUR-PROJECT'))

// 환경변수가 없어도 앱이 죽지 않도록 더미 값으로 만들고, 화면에서 설정 안내를 보여준다.
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true },
})

let sessionPromise: Promise<string> | null = null

/** 익명 로그인 보장. 이미 세션이 있으면 재사용하고 uid 를 돌려준다. */
export function ensureSession(): Promise<string> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) return data.session.user.id
      const { data: res, error } = await supabase.auth.signInAnonymously()
      if (error || !res.user) throw error ?? new Error('anonymous sign-in failed')
      return res.user.id
    })().catch((e) => {
      sessionPromise = null // 실패하면 다음에 다시 시도
      throw e
    })
  }
  return sessionPromise
}
