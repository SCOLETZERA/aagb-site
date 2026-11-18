import { describe, expect, it } from 'vitest'
import { REFRESH_COOKIE } from '../src/plugins/auth.js'
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
    await confirmAs(who)
    const [before] = await activeSessions(who.user.id)
    expect(before!.confirmedAt).toBeInstanceOf(Date)
    const rt = who.cookie.split('; ').find((c) => c.startsWith(`${REFRESH_COOKIE}=`))!
    const res = await app.inject({ method: 'POST', url: '/api/admin/auth/refresh', headers: { cookie: rt, origin: ORIGIN } })
    expect(res.statusCode).toBe(200)
    const [after] = await activeSessions(who.user.id)
    expect(after!.id).not.toBe(before!.id)
    expect(after!.confirmedAt).toEqual(before!.confirmedAt)
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
