import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import type { FastifyInstance } from 'fastify'
import type { Config } from '../config.js'
import { AppError } from '../lib/errors.js'

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Cabeçalhos, CORS, limite de requisições e proteção contra CSRF.
 *
 * CSRF: a área administrativa usa cookies, então toda requisição que muda estado em /api/admin
 * precisa vir de uma origem da lista. Além disso só aceitamos corpo JSON (ou multipart nas rotas
 * de upload), que um formulário de outro site não consegue enviar sem passar pelo CORS.
 */
export async function registerSecurity(app: FastifyInstance, config: Config) {
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
  })

  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type'],
    maxAge: 600,
  })

  await app.register(rateLimit, {
    global: true,
    max: config.GLOBAL_RATE_LIMIT_PER_MINUTE,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      statusCode: 429,
      message: 'Muitas tentativas. Aguarde um pouco e tente de novo.',
    }),
  })

  // Sem corpo em texto puro: só JSON (registrado por padrão) e multipart (onde for registrado).
  app.removeContentTypeParser('text/plain')

  app.addHook('onRequest', async (request) => {
    if (!UNSAFE_METHODS.has(request.method) || !request.url.startsWith('/api/admin/')) return
    const origin = request.headers.origin
    if (!origin || !config.CORS_ORIGINS.includes(origin)) {
      throw new AppError(403, 'Origem da requisição não permitida.')
    }
  })
}
