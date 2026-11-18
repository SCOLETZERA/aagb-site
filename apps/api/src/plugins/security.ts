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

  // O Postgres não aceita o caractere nulo (U+0000) em texto: recusa antes de chegar ao banco,
  // em vez de virar erro 500.
  app.addHook('preValidation', async (request) => {
    if (hasNulChar(request.body)) throw new AppError(400, 'Os dados enviados têm caracteres inválidos.')
  })

  // Usa o padrão da rota já resolvida, não a URL crua: "/api/%61dmin/…" chega à mesma rota
  // que "/api/admin/…" e não pode escapar da checagem.
  app.addHook('onRequest', async (request) => {
    const route = request.routeOptions.url ?? ''
    if (!UNSAFE_METHODS.has(request.method) || !route.startsWith('/api/admin/')) return
    const origin = request.headers.origin
    if (!origin || !config.CORS_ORIGINS.includes(origin)) {
      throw new AppError(403, 'Origem da requisição não permitida.')
    }
  })
}

const NUL = String.fromCharCode(0)

/** Procura o caractere nulo em qualquer texto do corpo (objetos e listas aninhados). */
function hasNulChar(value: unknown): boolean {
  if (typeof value === 'string') return value.includes(NUL)
  if (Array.isArray(value)) return value.some(hasNulChar)
  if (value && typeof value === 'object') return Object.entries(value).some(([k, v]) => k.includes(NUL) || hasNulChar(v))
  return false
}
