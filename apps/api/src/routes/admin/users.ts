import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError, notFound } from '../../lib/errors.js'
import { adminOf, requireAdmin } from '../../plugins/auth.js'
import { audit } from '../../services/audit.js'
import { idParams } from '../public.js'

/** Mínimo de 12 caracteres; até 72 bytes, o limite que o bcrypt de fato considera. */
export const passwordSchema = z
  .string()
  .min(12, 'A senha precisa ter pelo menos 12 caracteres.')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'A senha pode ter no máximo 72 bytes.')

const email = z.email('E-mail inválido.').trim().toLowerCase().max(254)
const name = z.string().trim().min(3, 'Informe o nome.').max(120)

const createBody = z.object({ email, name, password: passwordSchema })
const updateBody = z
  .object({ name: name.optional(), active: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, 'Nada para alterar.')
const passwordBody = z.object({ password: passwordSchema })

const select = { id: true, email: true, name: true, active: true, createdAt: true } as const

/** Contas do painel. */
export async function userRoutes(app: FastifyInstance) {
  const db = app.prisma
  app.addHook('preHandler', requireAdmin())

  app.get('/users', async () => db.user.findMany({ select, orderBy: { createdAt: 'asc' } }))

  app.post('/users', async (req, reply) => {
    const input = createBody.parse(req.body)
    try {
      const user = await db.user.create({
        data: { email: input.email, name: input.name, role: 'admin', passwordHash: await app.authService.hashPassword(input.password) },
        select,
      })
      await audit(db, adminOf(req).id, 'users.create', `user:${user.id}`)
      return reply.status(201).send(user)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'Já existe uma conta com esse e-mail.')
      }
      throw error
    }
  })

  app.patch('/users/:id', async (req) => {
    const { id } = idParams.parse(req.params)
    const input = updateBody.parse(req.body)
    const me = adminOf(req)
    // Evita que o painel fique sem ninguém capaz de administrar.
    if (id === me.id && input.active === false) {
      throw new AppError(409, 'Você não pode desativar a própria conta.')
    }
    const exists = await db.user.findUnique({ where: { id } })
    if (!exists) throw notFound('Usuário não encontrado.')
    const user = await db.user.update({ where: { id }, data: input, select })
    if (input.active === false) await app.authService.revokeAll(id)
    await audit(db, me.id, 'users.update', `user:${id}`)
    return user
  })

  /** Redefine a senha e encerra todas as sessões do usuário. */
  app.put('/users/:id/password', async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const { password } = passwordBody.parse(req.body)
    const exists = await db.user.findUnique({ where: { id } })
    if (!exists) throw notFound('Usuário não encontrado.')
    await db.user.update({
      where: { id },
      data: { passwordHash: await app.authService.hashPassword(password), failedLogins: 0, lockedUntil: null },
    })
    await app.authService.revokeAll(id)
    await audit(db, adminOf(req).id, 'users.password-reset', `user:${id}`)
    return reply.status(204).send()
  })
}
