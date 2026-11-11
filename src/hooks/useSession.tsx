import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { ensureSession } from '../lib/supabase'
import { toAppError, type AppError } from '../lib/errors'

interface SessionState {
  uid: string | null
  loading: boolean
  error: AppError | null
  retry: () => void
}
const Ctx = createContext<SessionState>({ uid: null, loading: true, error: null, retry: () => {} })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<AppError | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    ensureSession()
      .then((id) => alive && setUid(id))
      .catch((e) => alive && setError(toAppError(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [tick])

  const retry = useCallback(() => setTick((t) => t + 1), [])
  return <Ctx.Provider value={{ uid, loading, error, retry }}>{children}</Ctx.Provider>
}

export const useSession = () => useContext(Ctx)
