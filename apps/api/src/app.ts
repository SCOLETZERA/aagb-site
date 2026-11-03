import { PrismaClient } from '@prisma/client'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Config } from './config.js'
import { errorHandler, notFoundHandler } from './lib/errors.js'
import { registerAuth } from './plugins/auth.js'
import { registerSecurity } from './plugins/security.js'
import { adminRoutes } from './routes/admin/index.js'
import { documentFileRoutes } from './routes/documents.js'
import { formRoutes } from './routes/forms.js'
import { publicRoutes } from './routes/public.js'
import { createAuthService, type AuthService } from './services/auth.js'
import { createDocumentStore, type DocumentStore } from './services/documents.js'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
    config: Config
    authService: AuthService
    documents: DocumentStore
  }
}

/** Limite do corpo JSON. Os formulários mais longos ficam bem abaixo disso. */
export const BODY_LIMIT_BYTES = 64 * 1024

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: BODY_LIMIT_BYTES,
    trustProxy: config.TRUST_PROXY,
    // Nada de IP, cabeçalhos, query string ou corpo nos logs: podem conter dados pessoais.
    logger: {
      level: config.LOG_LEVEL,
      serializers: {
        req: (req) => ({ method: req.method, path: req.url.split('?')[0] }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    },
  })

  const prisma = new PrismaClient({ datasourceUrl: config.DATABASE_URL })
  app.decorate('prisma', prisma)
  app.decorate('config', config)
  app.decorate('authService', createAuthService(prisma, config.BCRYPT_COST))
  app.decorate('documents', createDocumentStore(config.UPLOAD_DIR))
  app.addHook('onClose', async () => prisma.$disconnect())

  app.setErrorHandler(errorHandler)
  app.setNotFoundHandler(notFoundHandler)

  await registerSecurity(app, config)
  await registerAuth(app, config)

  app.get('/api/health', async () => ({ ok: true }))
  await app.register(publicRoutes, { prefix: '/api' })
  await app.register(formRoutes, { prefix: '/api' })
  await app.register(documentFileRoutes, { prefix: '/api' })
  await app.register(adminRoutes, { prefix: '/api/admin' })

  return app
}
