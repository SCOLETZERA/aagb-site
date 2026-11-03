import { ApiError } from '@/services/api'
import { errorFrom } from '@/services/httpApi'

export interface AdminClient {
  /** `path` relativo a `/api` (ex.: `/admin/orders`). Corpo objeto vira JSON; `FormData` vai como multipart. */
  request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>
}

const NO_REFRESH = new Set(['/admin/auth/login', '/admin/auth/refresh', '/admin/auth/logout'])

/**
 * Cliente das rotas do painel. A sessão vive em cookies HttpOnly (o JavaScript não vê os tokens):
 * por isso `credentials: 'include'`. Quando o access token (15 min) expira, renova uma vez e repete.
 *
 * A renovação é compartilhada: se várias requisições recebem 401 juntas, só uma chama o refresh.
 * Duas renovações com o mesmo token seriam vistas pelo servidor como roubo e derrubariam a sessão.
 */
export function createAdminClient(
  baseUrl: string,
  onSessionLost: () => void,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): AdminClient {
  const base = baseUrl.replace(/\/+$/, '')
  let refreshing: Promise<boolean> | null = null

  async function send(path: string, init: { method?: string; body?: unknown } = {}) {
    const isForm = init.body instanceof FormData
    try {
      return await fetchImpl(`${base}/api${path}`, {
        method: init.method ?? 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(init.body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
      })
    } catch {
      throw new ApiError('Não foi possível falar com o servidor. Confira sua internet e tente de novo.', 0)
    }
  }

  function refresh(): Promise<boolean> {
    refreshing ??= send('/admin/auth/refresh', { method: 'POST' })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshing = null
      })
    return refreshing
  }

  return {
    async request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
      let res = await send(path, init)
      if (res.status === 401 && !NO_REFRESH.has(path)) {
        if (await refresh()) res = await send(path, init)
        if (res.status === 401) onSessionLost()
      }
      if (!res.ok) throw await errorFrom(res)
      return (res.status === 204 ? undefined : await res.json()) as T
    },
  }
}
