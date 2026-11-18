import { describe, expect, it } from 'vitest'
import { ORIGIN, makeApp } from './helpers.js'

/** Rotas do painel que funcionam sem login. Qualquer outra precisa responder 401. */
const PUBLIC_ADMIN_ROUTES = new Set(['/api/admin/auth/login', '/api/admin/auth/refresh', '/api/admin/auth/logout'])

const routes: { method: string; url: string }[] = []
const app = await makeApp({}, undefined, {
  onRoute: (route) => {
    if (!route.url.startsWith('/api/admin')) return
    for (const method of [route.method].flat()) if (method !== 'HEAD') routes.push({ method, url: route.url })
  },
})

describe('rotas do painel', () => {
  it('toda rota do painel exige login', async () => {
    // Garante que a lista não veio vazia (o teste passaria sem testar nada).
    expect(routes.length).toBeGreaterThan(40)
    const open: string[] = []
    for (const { method, url } of routes) {
      if (PUBLIC_ADMIN_ROUTES.has(url)) continue
      const res = await app.inject({
        method: method as 'GET',
        url: url.replace(/:id/g, 'cm0000000000000000000000'),
        headers: { origin: ORIGIN },
        ...(method === 'GET' ? {} : { payload: {} }),
      })
      if (res.statusCode !== 401) open.push(`${method} ${url} -> ${res.statusCode}`)
    }
    expect(open).toEqual([])
  })
})
