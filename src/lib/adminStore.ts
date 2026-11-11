const KEY = 'rps:admin-links'

type Store = Record<string, { token: string; title?: string; savedAt: number }>

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}

/** 관리 링크의 토큰을 이 기기에 보관한다(다른 기기에선 관리 링크 자체가 필요). */
export function saveAdminToken(gameId: string, token: string, title?: string) {
  try {
    const s = read()
    s[gameId] = { token, title, savedAt: Date.now() }
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* 시크릿 모드 등 */
  }
}

export function getAdminToken(gameId: string): string | null {
  return read()[gameId]?.token ?? null
}

export function listAdminGames() {
  return Object.entries(read())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.savedAt - a.savedAt)
}

export const adminPath = (id: string, token?: string) => `/g/${id}/admin${token ? `#token=${token}` : ''}`
export const absolute = (path: string) => `${window.location.origin}${path}`
