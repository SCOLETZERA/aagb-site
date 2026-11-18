import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { PrismaClient, User } from '@prisma/client'
import bcrypt from 'bcrypt'
import { AppError } from '../lib/errors.js'
import { REFRESH_TTL_SECONDS } from '../plugins/auth.js'

/** Falhas seguidas antes do primeiro bloqueio. */
export const MAX_FAILED_LOGINS = 5
const MAX_LOCK_MINUTES = 60

/** Mesma resposta para usuário inexistente, senha errada, conta inativa ou bloqueada. */
export const INVALID_LOGIN = 'E-mail ou senha incorretos.'

export const WRONG_PASSWORD = 'Senha incorreta.'
export const LOCKED = 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** Minutos de bloqueio após `failed` falhas: 1, 2, 4, 8… até 60. */
export function lockMinutes(failed: number): number {
  if (failed < MAX_FAILED_LOGINS) return 0
  return Math.min(2 ** (failed - MAX_FAILED_LOGINS), MAX_LOCK_MINUTES)
}

export function createAuthService(prisma: PrismaClient, bcryptCost: number) {
  // Hash de comparação para quando o usuário não existe: o tempo de resposta fica igual.
  const dummyHash = bcrypt.hashSync(randomBytes(16).toString('hex'), bcryptCost)

  async function newSession(userId: string, familyId: string = randomUUID()) {
    const refreshToken = randomBytes(32).toString('base64url')
    await prisma.session.create({
      data: {
        userId,
        familyId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
      },
    })
    return { refreshToken, familyId }
  }

  /** Conta uma senha errada. Incremento atômico: tentativas em paralelo não podem "perder" falhas e escapar do bloqueio. */
  async function registerFailure(userId: string, now: Date) {
    const { failedLogins } = await prisma.user.update({
      where: { id: userId },
      data: { failedLogins: { increment: 1 } },
    })
    const minutes = lockMinutes(failedLogins)
    if (minutes) {
      await prisma.user.update({ where: { id: userId }, data: { lockedUntil: new Date(now.getTime() + minutes * 60_000) } })
    }
  }

  return {
    hashPassword: (password: string) => bcrypt.hash(password, bcryptCost),

    async login(email: string, password: string, now = new Date()): Promise<{ user: User; refreshToken: string; familyId: string }> {
      const user = await prisma.user.findUnique({ where: { email } })
      const matches = await bcrypt.compare(password, user?.passwordHash ?? dummyHash)
      if (!user || !user.active) throw new AppError(401, INVALID_LOGIN)

      if (user.lockedUntil && user.lockedUntil > now) throw new AppError(401, INVALID_LOGIN)

      if (!matches) {
        await registerFailure(user.id, now)
        throw new AppError(401, INVALID_LOGIN)
      }

      await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } })
      return { user, ...(await newSession(user.id)) }
    },

    /**
     * Troca o refresh token por um novo (rotação). Um token já usado indica roubo:
     * a família inteira de sessões daquele login é revogada.
     */
    async refresh(token: string, now = new Date()): Promise<{ user: User; refreshToken: string; familyId: string }> {
      const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } })
      if (!session) throw new AppError(401, 'Sua sessão expirou. Entre de novo.')

      const revoke = await prisma.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now },
      })
      if (revoke.count === 0) {
        await prisma.session.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: now } })
        throw new AppError(401, 'Sua sessão expirou. Entre de novo.')
      }
      if (session.expiresAt <= now || !session.user.active) throw new AppError(401, 'Sua sessão expirou. Entre de novo.')

      return { user: session.user, ...(await newSession(session.userId, session.familyId)) }
    },

    /**
     * Confirma a senha de quem já está logado e marca a família de sessões como confirmada agora.
     * Senha errada conta para o mesmo bloqueio do login, para que uma sessão roubada não sirva para
     * adivinhar a senha. Responde 403 (e não 401) para o painel não tentar renovar a sessão.
     */
    async confirmPassword(userId: string, familyId: string, password: string, now = new Date()) {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
      if (user.lockedUntil && user.lockedUntil > now) throw new AppError(403, LOCKED)
      if (!(await bcrypt.compare(password, user.passwordHash))) {
        await registerFailure(user.id, now)
        throw new AppError(403, WRONG_PASSWORD)
      }
      await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } })
      // Grava em todas as linhas da família, inclusive as já trocadas: se uma renovação estiver
      // acontecendo agora, a confirmação não se perde. Quem consulta lê a mais recente da família.
      await prisma.session.updateMany({ where: { userId, familyId }, data: { confirmedAt: now } })
    },

    async logout(token: string | undefined, now = new Date()) {
      if (!token) return
      const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } })
      if (session) {
        await prisma.session.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: now } })
      }
    },

    /** Encerra todas as sessões do usuário (troca de senha, desativação). */
    revokeAll: (userId: string, now = new Date()) =>
      prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
  }
}

export type AuthService = ReturnType<typeof createAuthService>
