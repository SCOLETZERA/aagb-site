import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Config } from '../config.js'
import { AppError } from '../lib/errors.js'

export interface AdminUser {
  id: string
  email: string
  name: string
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    /** `fam`: família de sessões do login. Logout e troca de senha a revogam na hora. */
    payload: { sub: string; fam: string }
    user: { sub: string; fam: string }
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Usuário do painel, preenchido por `requireAdmin`. */
    admin?: AdminUser
    /** Sessão atual do painel, preenchida por `requireAdmin`. */
    adminSession?: { familyId: string }
  }
}

export const ACCESS_COOKIE = 'aagb_at'
export const REFRESH_COOKIE = 'aagb_rt'
export const ACCESS_TTL_SECONDS = 15 * 60
export const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60
/** O refresh token só é enviado às rotas de autenticação. */
export const REFRESH_PATH = '/api/admin/auth'

export async function registerAuth(app: FastifyInstance, config: Config) {
  await app.register(cookie)
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    cookie: { cookieName: ACCESS_COOKIE, signed: false },
    sign: { algorithm: 'HS256', expiresIn: ACCESS_TTL_SECONDS },
    verify: { algorithms: ['HS256'] },
  })
}

/** Cookies HttpOnly e SameSite=Strict: o JavaScript da página não lê os tokens. */
export function setAuthCookies(reply: FastifyReply, config: Config, accessToken: string, refreshToken: string) {
  const base = { httpOnly: true, secure: config.COOKIE_SECURE, sameSite: 'strict' as const }
  reply.setCookie(ACCESS_COOKIE, accessToken, { ...base, path: '/api/admin', maxAge: ACCESS_TTL_SECONDS })
  reply.setCookie(REFRESH_COOKIE, refreshToken, { ...base, path: REFRESH_PATH, maxAge: REFRESH_TTL_SECONDS })
}

export function clearAuthCookies(reply: FastifyReply, config: Config) {
  const base = { httpOnly: true, secure: config.COOKIE_SECURE, sameSite: 'strict' as const }
  reply.clearCookie(ACCESS_COOKIE, { ...base, path: '/api/admin' })
  reply.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_PATH })
}

/**
 * Exige login. Toda conta ativa do painel é administradora. Usuário e sessão são relidos do banco
 * a cada requisição, então desativar alguém ou sair vale na hora, sem esperar o token expirar.
 */
export function requireAdmin() {
  return async function (this: FastifyInstance, request: FastifyRequest) {
    try {
      await request.jwtVerify({ onlyCookie: true })
    } catch {
      throw new AppError(401, 'Sua sessão expirou. Entre de novo.')
    }
    const { sub, fam } = request.user
    const [user, session] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: sub } }),
      this.prisma.session.findFirst({ where: { userId: sub, familyId: fam, revokedAt: null, expiresAt: { gt: new Date() } } }),
    ])
    if (!user || !user.active || !session) throw new AppError(401, 'Sua sessão expirou. Entre de novo.')
    request.admin = { id: user.id, email: user.email, name: user.name }
    request.adminSession = { familyId: session.familyId }
  }
}

/** Por quanto tempo a senha confirmada libera as ações sobre contas. */
export const CONFIRMATION_TTL_MS = 5 * 60_000

/**
 * Exige que a senha tenha sido confirmada nesta família de sessões há no máximo 5 minutos.
 * Assim, uma sessão roubada sozinha não basta para criar contas ou trocar senhas. Usar depois de `requireAdmin`.
 */
export function requireRecentConfirmation(now: () => Date = () => new Date()) {
  return async function (this: FastifyInstance, request: FastifyRequest) {
    // A confirmação vale para a família de sessões do login, não para uma linha: a renovação troca a linha.
    const latest = await this.prisma.session.findFirst({
      where: { userId: adminOf(request).id, familyId: adminSessionOf(request).familyId, confirmedAt: { not: null } },
      orderBy: { confirmedAt: 'desc' },
      select: { confirmedAt: true },
    })
    const confirmedAt = latest?.confirmedAt
    if (!confirmedAt || now().getTime() - confirmedAt.getTime() > CONFIRMATION_TTL_MS) {
      throw new AppError(403, 'Confirme sua senha para continuar.', 'confirm_password')
    }
  }
}

/** Para uso nos handlers depois de `requireAdmin`. */
export function adminSessionOf(request: FastifyRequest) {
  if (!request.adminSession) throw new AppError(401, 'Faça login para continuar.')
  return request.adminSession
}

/** Para uso nos handlers depois de `requireAdmin`. */
export function adminOf(request: FastifyRequest): AdminUser {
  if (!request.admin) throw new AppError(401, 'Faça login para continuar.')
  return request.admin
}
