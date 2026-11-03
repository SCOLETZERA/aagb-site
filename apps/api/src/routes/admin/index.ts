import type { FastifyInstance } from 'fastify'
import { adminAuthRoutes } from './auth.js'
import { contentRoutes } from './content.js'
import { adminDocumentRoutes } from './documents.js'
import { inboxRoutes } from './inbox.js'
import { reportRoutes } from './reports.js'
import { userRoutes } from './users.js'

/** Área administrativa. Cada grupo declara os papéis que aceita. */
export async function adminRoutes(app: FastifyInstance) {
  // Respostas do painel têm dados pessoais: nunca guardar em cache.
  app.addHook('onSend', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store')
  })
  await app.register(adminAuthRoutes, { prefix: '/auth' })
  await app.register(inboxRoutes)
  await app.register(contentRoutes, { prefix: '/content' })
  await app.register(adminDocumentRoutes)
  await app.register(userRoutes)
  await app.register(reportRoutes)
}
