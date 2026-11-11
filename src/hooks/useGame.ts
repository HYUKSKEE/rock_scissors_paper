import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchGame, fetchPlayers, type Game, type Player } from '../lib/api'
import { toAppError, type AppError } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { useSession } from './useSession'

/** 게임 정보를 불러오고, 열려 있는 동안 주기적으로 상태(종료 여부)를 갱신한다. */
export function useGame(gameId: string | undefined, pollMs = 8000) {
  const { uid, error: sessionError, retry: retrySession } = useSession()
  const [game, setGame] = useState<Game | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<AppError | null>(null)
  const [notFound, setNotFound] = useState(false)
  const status = useRef<string>('')
  status.current = game?.status ?? ''

  const load = useCallback(
    async (silent = false) => {
      if (!gameId) return
      if (!silent) setLoading(true)
      try {
        const g = await fetchGame(gameId)
        setGame(g)
        setNotFound(!g)
        setError(null)
      } catch (e) {
        if (!silent) setError(toAppError(e))
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [gameId],
  )

  useEffect(() => {
    if (sessionError) {
      setError(sessionError)
      setLoading(false)
      return
    }
    if (!uid) return
    load()
  }, [uid, sessionError, load])

  useEffect(() => {
    if (!uid) return
    const t = setInterval(() => {
      if (status.current !== 'closed') load(true)
    }, pollMs)
    return () => clearInterval(t)
  }, [uid, load, pollMs])

  return {
    game,
    loading: loading && !error,
    error,
    notFound,
    reload: () => (sessionError ? retrySession() : load()),
    refresh: () => load(true),
  }
}

/** 참가자 목록 + Realtime 구독(변경 즉시 반영) + 안전망용 주기적 재조회. */
export function usePlayers(gameId: string | undefined, enabled = true) {
  const { uid } = useSession()
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<AppError | null>(null)

  const load = useCallback(async () => {
    if (!gameId) return
    try {
      setPlayers(await fetchPlayers(gameId))
      setError(null)
    } catch (e) {
      setError(toAppError(e))
    } finally {
      setLoading(false)
    }
  }, [gameId])

  useEffect(() => {
    if (!gameId || !uid || !enabled) return
    load()
    const channel = supabase
      .channel(`players:${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as Partial<Player>).id
          setPlayers((ps) => ps.filter((p) => p.id !== id))
        } else {
          const row = payload.new as Player
          setPlayers((ps) => (ps.some((p) => p.id === row.id) ? ps.map((p) => (p.id === row.id ? row : p)) : [...ps, row]))
        }
      })
      .subscribe()
    const t = setInterval(load, 20000)
    return () => {
      clearInterval(t)
      supabase.removeChannel(channel)
    }
  }, [gameId, uid, enabled, load])

  return { players, loading, error, reload: load }
}
