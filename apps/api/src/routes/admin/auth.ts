import type { User } from '@prisma/client'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { AppError } from '../../lib/errors.js'
import { REFRESH_COOKIE, adminOf, clearAuthCookies, requireRole, setAuthCookies } from '../../plugins/auth.js'
import { audit } from '../../services/audit.js'

const loginBody = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().max(200),
})

const publicUser = (u: Pick<User, 'id' | 'email' | 'name' | 'role'>) => ({ id: u.id, email: u.email, name: u.name, role: u.role })

/** Login, renovação e saída do painel. */
export async function adminAuthRoutes(app: FastifyInstance) {
  const { authService, config, prisma } = app

  async function issue(reply: FastifyReply, user: User, refreshToken: string, familyId: string) {
    const accessToken = await reply.jwtSign({ sub: user.id, fam: familyId })
    setAuthCookies(reply, config, accessToken, refreshToken)
    return { user: publicUser(user) }
  }

  app.post(
    '/login',
    { config: { rateLimit: { max: config.LOGIN_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const parsed = loginBody.safeParse(req.body)
      if (!parsed.success) throw new AppError(401, 'E-mail ou senha incorretos.')
      const { user, refreshToken, familyId } = await authService.login(parsed.data.email, parsed.data.password)
      await audit(prisma, user.id, 'auth.login', `user:${user.id}`)
      return issue(reply, user, refreshToken, familyId)
    },
  )

  app.post(
    '/refresh',
    { config: { rateLimit: { max: config.LOGIN_RATE_LIMIT_PER_MINUTE * 3, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const token = req.cookies[REFRESH_COOKIE]
      if (!token) throw new AppError(401, 'Sua sessão expirou. Entre de novo.')
      try {
        const { user, refreshToken, familyId } = await authService.refresh(token)
        return await issue(reply, user, refreshToken, familyId)
      } catch (error) {
        clearAuthCookies(reply, config)
        throw error
      }
    },
  )

  app.post('/logout', async (req, reply) => {
    await authService.logout(req.cookies[REFRESH_COOKIE])
    clearAuthCookies(reply, config)
    return reply.status(204).send()
  })

  app.get('/me', { preHandler: requireRole('admin', 'diretoria') }, async (req) => ({ user: publicUser(adminOf(req)) }))
}
