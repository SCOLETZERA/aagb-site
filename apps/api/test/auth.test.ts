import { describe, expect, it } from 'vitest'
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../src/plugins/auth.js'
import { INVALID_LOGIN, MAX_FAILED_LOGINS, lockMinutes } from '../src/services/auth.js'
import { ORIGIN, PASSWORD, cookieHeader, createUser, loggedIn, login, makeApp, rawJwt } from './helpers.js'

const app = await makeApp()
const me = (cookie: string) => app.inject({ url: '/api/admin/auth/me', headers: { cookie } })
const refresh = (cookie: string) =>
  app.inject({ method: 'POST', url: '/api/admin/auth/refresh', headers: { cookie, origin: ORIGIN } })
const only = (cookie: string, name: string) =>
  cookie
    .split('; ')
    .filter((c) => c.startsWith(`${name}=`))
    .join('; ')
const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

describe('login', () => {
  it('define cookies HttpOnly e SameSite=Strict e não devolve tokens no corpo', async () => {
    const user = await createUser(app, 'diretoria')
    const res = await login(app, user.email.toUpperCase())
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ user: { id: user.id, email: user.email, name: user.name, role: 'diretoria' } })
    const access = res.cookies.find((c) => c.name === ACCESS_COOKIE)!
    const refreshCookie = res.cookies.find((c) => c.name === REFRESH_COOKIE)!
    expect(access).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/admin' })
    expect(refreshCookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/admin/auth' })
    expect(res.body).not.toContain(access.value)
    expect((await me(cookieHeader(res))).json().user.id).toBe(user.id)
  })

  it('não revela se o e-mail existe', async () => {
    const user = await createUser(app, 'diretoria')
    const wrong = await login(app, user.email, 'senha-errada-qualquer')
    const unknown = await login(app, 'ninguem@aagb.test', 'senha-errada-qualquer')
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: 1 },
    })
    for (const res of [wrong, unknown, malformed]) {
      expect(res.statusCode).toBe(401)
      expect(res.json()).toEqual({ message: INVALID_LOGIN })
    }
  })

  it('bloqueia a conta depois de 5 falhas seguidas, mesmo com a senha certa', async () => {
    const user = await createUser(app, 'diretoria')
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) await login(app, user.email, 'senha-errada-qualquer')
    const locked = await login(app, user.email, PASSWORD)
    expect(locked.statusCode).toBe(401)
    expect(locked.json().message).toBe(INVALID_LOGIN)
    const saved = await app.prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(saved.lockedUntil!.getTime()).toBeGreaterThan(Date.now())

    // Passado o bloqueio, a senha certa volta a funcionar e zera o contador.
    await app.prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() - 1000) } })
    expect((await login(app, user.email)).statusCode).toBe(200)
    expect((await app.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).failedLogins).toBe(0)
  })

  it('o bloqueio cresce até 60 minutos', () => {
    expect([4, 5, 6, 7, 11, 20].map(lockMinutes)).toEqual([0, 1, 2, 4, 60, 60])
  })

  it('conta inativa não entra', async () => {
    const user = await createUser(app, 'admin')
    await app.prisma.user.update({ where: { id: user.id }, data: { active: false } })
    expect((await login(app, user.email)).statusCode).toBe(401)
  })
})

describe('tokens', () => {
  it('recusa token adulterado, expirado, de outro segredo ou sem algoritmo', async () => {
    const { user, cookie } = await loggedIn(app, 'admin')
    const access = only(cookie, ACCESS_COOKIE).split('=')[1]!
    const [header, , signature] = access.split('.')
    const { familyId: fam } = await app.prisma.session.findFirstOrThrow({ where: { userId: user.id } })
    const now = Math.floor(Date.now() / 1000)

    const tokens = [
      `${header}.${b64({ sub: 'outro', fam, iat: now })}.${signature}`,
      rawJwt({ sub: user.id, fam, iat: now - 3600, exp: now - 60 }),
      rawJwt({ sub: user.id, fam, iat: now, exp: now + 600 }, 'outro-segredo-com-mais-de-32-caracteres!!'),
      `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: user.id, fam, iat: now })}.`,
    ]
    for (const token of tokens) {
      const res = await me(`${ACCESS_COOKIE}=${token}`)
      expect(res.statusCode).toBe(401)
      expect(res.json().message).toBe('Sua sessão expirou. Entre de novo.')
    }
    // Controle: o mesmo usuário com token válido entra.
    const valid = rawJwt({ sub: user.id, fam, iat: now, exp: now + 600 })
    expect((await me(`${ACCESS_COOKIE}=${valid}`)).statusCode).toBe(200)
  })

  it('token no cabeçalho Authorization é ignorado: só cookie vale', async () => {
    const { cookie } = await loggedIn(app, 'admin')
    const token = only(cookie, ACCESS_COOKIE).split('=')[1]
    const res = await app.inject({ url: '/api/admin/auth/me', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(401)
  })

  it('refresh troca os tokens', async () => {
    const { cookie } = await loggedIn(app, 'diretoria')
    const first = await refresh(only(cookie, REFRESH_COOKIE))
    expect(first.statusCode).toBe(200)
    const next = cookieHeader(first)
    expect(only(next, REFRESH_COOKIE)).not.toBe(only(cookie, REFRESH_COOKIE))
    expect((await me(next)).statusCode).toBe(200)
  })

  it('reuso de refresh token revoga a família inteira, inclusive o access token novo', async () => {
    const { cookie } = await loggedIn(app, 'diretoria')
    const stolen = only(cookie, REFRESH_COOKIE)
    const legit = cookieHeader(await refresh(stolen))
    expect((await me(legit)).statusCode).toBe(200)

    expect((await refresh(stolen)).statusCode).toBe(401)
    expect((await me(legit)).statusCode).toBe(401)
    expect((await refresh(only(legit, REFRESH_COOKIE))).statusCode).toBe(401)
  })

  it('logout revoga a sessão na hora', async () => {
    const { cookie } = await loggedIn(app, 'admin')
    const out = await app.inject({ method: 'POST', url: '/api/admin/auth/logout', headers: { cookie, origin: ORIGIN } })
    expect(out.statusCode).toBe(204)
    expect((await me(cookie)).statusCode).toBe(401)
    expect((await refresh(only(cookie, REFRESH_COOKIE))).statusCode).toBe(401)
  })
})

describe('CSRF e papéis', () => {
  it('rota que muda estado exige Origin permitido e JSON', async () => {
    const { cookie } = await loggedIn(app, 'admin')
    const payload = { status: 'concluido' }
    const url = '/api/admin/orders/x'
    const noOrigin = await app.inject({ method: 'PATCH', url, headers: { cookie }, payload })
    const evil = await app.inject({ method: 'PATCH', url, headers: { cookie, origin: 'https://evil.example' }, payload })
    expect(noOrigin.statusCode).toBe(403)
    expect(evil.statusCode).toBe(403)
    expect(evil.json().message).toBe('Origem da requisição não permitida.')

    const form = await app.inject({
      method: 'PATCH',
      url,
      headers: { cookie, origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'status=concluido',
    })
    expect(form.statusCode).toBe(415)
  })

  it('diretoria não acessa contas nem auditoria; sem login dá 401', async () => {
    const { cookie } = await loggedIn(app, 'diretoria')
    expect((await app.inject({ url: '/api/admin/users', headers: { cookie } })).statusCode).toBe(403)
    expect((await app.inject({ url: '/api/admin/audit', headers: { cookie } })).statusCode).toBe(403)
    expect((await app.inject({ url: '/api/admin/orders', headers: { cookie } })).statusCode).toBe(200)
    expect((await app.inject({ url: '/api/admin/orders' })).statusCode).toBe(401)
  })

  it('rebaixar ou desativar vale na hora, sem esperar o token expirar', async () => {
    const admin = await loggedIn(app, 'admin')
    const other = await loggedIn(app, 'admin')
    const patch = (payload: object) =>
      app.inject({
        method: 'PATCH',
        url: `/api/admin/users/${other.user.id}`,
        headers: { cookie: admin.cookie, origin: ORIGIN },
        payload,
      })
    expect((await app.inject({ url: '/api/admin/users', headers: { cookie: other.cookie } })).statusCode).toBe(200)
    expect((await patch({ role: 'diretoria' })).statusCode).toBe(200)
    expect((await app.inject({ url: '/api/admin/users', headers: { cookie: other.cookie } })).statusCode).toBe(403)
    expect((await patch({ active: false })).statusCode).toBe(200)
    expect((await me(other.cookie)).statusCode).toBe(401)
  })

  it('limita tentativas de login por IP', async () => {
    const limited = await makeApp({ LOGIN_RATE_LIMIT_PER_MINUTE: '3' })
    const codes: number[] = []
    for (let i = 0; i < 4; i++) codes.push((await login(limited, 'ninguem@aagb.test', 'x')).statusCode)
    expect(codes).toEqual([401, 401, 401, 429])
  })

  it('URL codificada não escapa da checagem de origem', async () => {
    const { cookie } = await loggedIn(app, 'admin')
    for (const url of ['/api/%61dmin/orders/x', '/api/adm%69n/orders/x']) {
      const res = await app.inject({ method: 'PATCH', url, headers: { cookie }, payload: { status: 'concluido' } })
      expect(res.statusCode).toBe(403)
    }
  })

  it('tentativas erradas em paralelo são todas contadas e bloqueiam a conta', async () => {
    const user = await createUser(app, 'diretoria')
    await Promise.all(Array.from({ length: 8 }, () => login(app, user.email, 'senha-errada-qualquer')))
    const saved = await app.prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(saved.failedLogins).toBe(8)
    expect(saved.lockedUntil!.getTime()).toBeGreaterThan(Date.now())
    expect((await login(app, user.email)).statusCode).toBe(401)
  })
})
