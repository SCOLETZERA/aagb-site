import { describe, expect, it } from 'vitest'
import { CONFIRMATION_TTL_MS, REFRESH_COOKIE } from '../src/plugins/auth.js'
import { MAX_FAILED_LOGINS } from '../src/services/auth.js'
import { ORIGIN, PASSWORD, cookieHeader, loggedIn, login, makeApp } from './helpers.js'

const app = await makeApp()

type Who = { cookie: string; user: { id: string; email: string } }
const confirmAs = (who: { cookie: string }, password = PASSWORD, payload: object = { password }) =>
  app.inject({ method: 'POST', url: '/api/admin/auth/confirm', headers: { cookie: who.cookie, origin: ORIGIN }, payload })
const activeSessions = (userId: string) => app.prisma.session.findMany({ where: { userId, revokedAt: null } })
const me = (cookie: string) => app.inject({ url: '/api/admin/auth/me', headers: { cookie } })

/** Segundo login da mesma pessoa: outra família de sessões. */
async function secondLogin(who: Who) {
  const res = await login(app, who.user.email)
  return { user: who.user, cookie: cookieHeader(res) }
}

describe('confirmação de senha', () => {
  it('senha certa grava a confirmação na sessão e na auditoria', async () => {
    const who = await loggedIn(app)
    const res = await confirmAs(who)
    expect(res.statusCode).toBe(204)
    const [session] = await activeSessions(who.user.id)
    expect(session!.confirmedAt).toBeInstanceOf(Date)
    const audit = await app.prisma.auditLog.findMany({ where: { userId: who.user.id, action: 'auth.confirm' } })
    expect(audit).toHaveLength(1)
    expect(audit[0]!.target).toBe(`user:${who.user.id}`)
  })

  it('senha errada responde 403, conta como falha e não derruba a sessão', async () => {
    const who = await loggedIn(app)
    const res = await confirmAs(who, 'senha-errada-qualquer')
    expect(res.statusCode).toBe(403)
    expect(res.json().message).toBe('Senha incorreta.')
    expect((await app.prisma.user.findUniqueOrThrow({ where: { id: who.user.id } })).failedLogins).toBe(1)
    expect((await me(who.cookie)).statusCode).toBe(200)
    const [session] = await activeSessions(who.user.id)
    expect(session!.confirmedAt).toBeNull()
  })

  it('tentativas erradas e bloqueadas ficam na auditoria, sem a senha digitada', async () => {
    const who = await loggedIn(app)
    for (let i = 0; i < MAX_FAILED_LOGINS + 1; i++) await confirmAs(who, 'senha-errada-qualquer')
    const audit = await app.prisma.auditLog.findMany({ where: { userId: who.user.id, action: 'auth.confirm-failed' } })
    expect(audit).toHaveLength(MAX_FAILED_LOGINS + 1)
    expect(audit.every((a) => a.target === `user:${who.user.id}`)).toBe(true)
    expect(JSON.stringify(audit)).not.toContain('senha-errada-qualquer')
  })

  it('cinco senhas erradas bloqueiam a conta, inclusive o login', async () => {
    const who = await loggedIn(app)
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) await confirmAs(who, 'senha-errada-qualquer')
    expect((await app.prisma.user.findUniqueOrThrow({ where: { id: who.user.id } })).lockedUntil).not.toBeNull()
    const blocked = await confirmAs(who)
    expect(blocked.statusCode).toBe(403)
    expect(blocked.json().message).toBe('Muitas tentativas. Aguarde alguns minutos e tente de novo.')
    expect((await login(app, who.user.email)).statusCode).toBe(401)
  })

  it('exige login e senha no corpo', async () => {
    const anon = await app.inject({ method: 'POST', url: '/api/admin/auth/confirm', headers: { origin: ORIGIN }, payload: { password: PASSWORD } })
    expect(anon.statusCode).toBe(401)
    const who = await loggedIn(app)
    expect((await confirmAs(who, PASSWORD, {})).statusCode).toBe(400)
  })

  it('a confirmação continua valendo depois da renovação do token', async () => {
    const who = await loggedIn(app)
    const target = await loggedIn(app)
    await confirmAs(who)
    const rt = who.cookie.split('; ').find((c) => c.startsWith(`${REFRESH_COOKIE}=`))!
    const res = await app.inject({ method: 'POST', url: '/api/admin/auth/refresh', headers: { cookie: rt, origin: ORIGIN } })
    expect(res.statusCode).toBe(200)
    const renewed = cookieHeader(res)
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${target.user.id}`,
      headers: { cookie: renewed, origin: ORIGIN },
      payload: { name: 'Nome Trocado' },
    })
    expect(patch.statusCode).toBe(200)
  })

  it('confirmar no meio da renovação do token não perde a confirmação', async () => {
    // Simula a corrida: a renovação já revogou a linha antiga e ainda não criou a nova quando a
    // confirmação chega. A linha nova nasce sem confirmação; mesmo assim, a família está confirmada.
    const who = await loggedIn(app)
    const target = await loggedIn(app)
    const [old] = await activeSessions(who.user.id)
    await app.prisma.session.update({ where: { id: old!.id }, data: { revokedAt: new Date() } })
    await app.authService.confirmPassword(who.user.id, old!.familyId, PASSWORD)
    await app.prisma.session.create({
      data: { userId: who.user.id, familyId: old!.familyId, tokenHash: `corrida-${old!.id}`, expiresAt: old!.expiresAt },
    })
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${target.user.id}`,
      headers: { cookie: who.cookie, origin: ORIGIN },
      payload: { name: 'Nome Trocado' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('a confirmação não vale para outro login da mesma pessoa', async () => {
    const first = await loggedIn(app)
    const second = await secondLogin(first)
    await confirmAs(first)
    const sessions = await activeSessions(first.user.id)
    expect(sessions).toHaveLength(2)
    expect(sessions.filter((s) => s.confirmedAt !== null)).toHaveLength(1)
    expect((await me(second.cookie)).statusCode).toBe(200)
  })
})

describe('ações sobre contas exigem senha confirmada há pouco', () => {
  type Method = 'POST' | 'PATCH' | 'PUT'
  const as = (who: { cookie: string }, method: Method, url: string, payload: object) =>
    app.inject({ method, url, headers: { cookie: who.cookie, origin: ORIGIN }, payload })
  const setConfirmedAt = (userId: string, confirmedAt: Date) =>
    app.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { confirmedAt } })
  const expectConfirmRequired = (res: { statusCode: number; json(): unknown }) => {
    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({ message: 'Confirme sua senha para continuar.', code: 'confirm_password' })
  }

  it('sem confirmação, criar, alterar e trocar senha são recusados e nada muda', async () => {
    const who = await loggedIn(app)
    const target = await loggedIn(app)
    const before = await app.prisma.user.findUniqueOrThrow({ where: { id: target.user.id } })

    expectConfirmRequired(await as(who, 'POST', '/api/admin/users', { email: 'sem-confirmar@aagb.test', name: 'Sem Confirmar', password: 'senha-bem-comprida' }))
    expectConfirmRequired(await as(who, 'PATCH', `/api/admin/users/${target.user.id}`, { name: 'Nome Trocado' }))
    expectConfirmRequired(await as(who, 'PUT', `/api/admin/users/${target.user.id}/password`, { password: 'outra-senha-bem-forte' }))

    expect(await app.prisma.user.findUnique({ where: { email: 'sem-confirmar@aagb.test' } })).toBeNull()
    const after = await app.prisma.user.findUniqueOrThrow({ where: { id: target.user.id } })
    expect(after.name).toBe(before.name)
    expect(after.passwordHash).toBe(before.passwordHash)
    expect((await app.inject({ url: '/api/admin/users', headers: { cookie: who.cookie } })).statusCode).toBe(200)
  })

  it('com confirmação, as três ações funcionam', async () => {
    const who = await loggedIn(app)
    const target = await loggedIn(app)
    await confirmAs(who)
    expect((await as(who, 'POST', '/api/admin/users', { email: 'confirmada@aagb.test', name: 'Conta Confirmada', password: 'senha-bem-comprida' })).statusCode).toBe(201)
    expect((await as(who, 'PATCH', `/api/admin/users/${target.user.id}`, { name: 'Nome Trocado' })).statusCode).toBe(200)
    expect((await as(who, 'PUT', `/api/admin/users/${target.user.id}/password`, { password: 'outra-senha-bem-forte' })).statusCode).toBe(204)
  })

  it('a confirmação vence depois de 5 minutos', async () => {
    const who = await loggedIn(app)
    const target = await loggedIn(app)
    await setConfirmedAt(who.user.id, new Date(Date.now() - CONFIRMATION_TTL_MS - 1000))
    expectConfirmRequired(await as(who, 'PATCH', `/api/admin/users/${target.user.id}`, { name: 'Nome Trocado' }))
    await setConfirmedAt(who.user.id, new Date(Date.now() - 4 * 60_000))
    expect((await as(who, 'PATCH', `/api/admin/users/${target.user.id}`, { name: 'Nome Trocado' })).statusCode).toBe(200)
  })

  it('a confirmação de um login não libera outro login da mesma pessoa', async () => {
    const first = await loggedIn(app)
    const second = await secondLogin(first)
    const target = await loggedIn(app)
    await confirmAs(first)
    expectConfirmRequired(await as(second, 'PATCH', `/api/admin/users/${target.user.id}`, { name: 'Nome Trocado' }))
    expect((await as(first, 'PATCH', `/api/admin/users/${target.user.id}`, { name: 'Nome Trocado' })).statusCode).toBe(200)
  })
})
