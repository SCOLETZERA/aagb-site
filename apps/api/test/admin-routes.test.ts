import { describe, expect, it } from 'vitest'
import { ORIGIN, loggedIn, makeApp } from './helpers.js'

/** Rotas do painel que funcionam sem login. Qualquer outra precisa responder 401. */
const PUBLIC_ADMIN_ROUTES = new Set(['/api/admin/auth/login', '/api/admin/auth/refresh', '/api/admin/auth/logout'])

/**
 * Inventário das rotas fora do painel, abertas ao público. Uma rota nova fora de `/api/admin`
 * só entra aqui depois de alguém conferir que ela pode mesmo ficar sem login.
 */
const PUBLIC_ROUTES = new Set([
  'OPTIONS *', // pré-voo do CORS
  'GET /api/health',
  // Leitura do conteúdo do site.
  'GET /api/news',
  'GET /api/news/:id',
  'GET /api/projects',
  'GET /api/projects/:id',
  'GET /api/partners',
  'GET /api/partners/:id',
  'GET /api/products',
  'GET /api/products/:id',
  'GET /api/services',
  'GET /api/needs',
  'GET /api/donations',
  'GET /api/documents',
  'GET /api/documents/:id/file',
  // Formulários públicos (validados e com limite por IP).
  'POST /api/orders',
  'POST /api/service-requests',
  'POST /api/donation-offers',
])

const routes: { method: string; url: string }[] = []
const app = await makeApp({}, undefined, {
  onRoute: (route) => {
    for (const method of [route.method].flat()) if (method !== 'HEAD') routes.push({ method, url: route.url })
  },
})
const adminRoutes = routes.filter((r) => r.url.startsWith('/api/admin'))
const sample = (url: string) => url.replace(/:\w+/g, 'cm0000000000000000000000').replace(/\*/g, 'x')

describe('rotas do painel', () => {
  it('toda rota do painel exige login', async () => {
    // Garante que a lista não veio vazia (o teste passaria sem testar nada).
    expect(adminRoutes.length).toBeGreaterThan(40)
    const open: string[] = []
    for (const { method, url } of adminRoutes) {
      if (PUBLIC_ADMIN_ROUTES.has(url)) continue
      const res = await app.inject({
        method: method as 'GET',
        url: sample(url),
        headers: { origin: ORIGIN },
        ...(method === 'GET' ? {} : { payload: {} }),
      })
      if (res.statusCode !== 401) open.push(`${method} ${url} -> ${res.statusCode}`)
    }
    expect(open).toEqual([])
  })

  it('rotas fora do painel são só as públicas conhecidas', () => {
    const outside = routes.filter((r) => !r.url.startsWith('/api/admin')).map((r) => `${r.method} ${r.url}`)
    expect(outside.filter((r) => !PUBLIC_ROUTES.has(r)).sort()).toEqual([])
    expect([...PUBLIC_ROUTES].filter((r) => !outside.includes(r))).toEqual([])
  })

  it('toda escrita em contas exige senha confirmada', async () => {
    const who = await loggedIn(app)
    const writes = adminRoutes.filter((r) => r.url.startsWith('/api/admin/users') && r.method !== 'GET')
    expect(writes.length).toBeGreaterThanOrEqual(3)
    const unguarded: string[] = []
    for (const { method, url } of writes) {
      const res = await app.inject({ method: method as 'POST', url: sample(url), headers: { cookie: who.cookie, origin: ORIGIN }, payload: {} })
      if (res.statusCode !== 403 || res.json().code !== 'confirm_password') unguarded.push(`${method} ${url} -> ${res.statusCode}`)
    }
    expect(unguarded).toEqual([])
  })
})
