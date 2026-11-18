import { createHmac, randomUUID } from 'node:crypto'
import path from 'node:path'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, inject } from 'vitest'
import { buildApp, type BuildOptions } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { DB_SCHEMA, TEMPLATE_DB, TMP_DIR } from './paths.js'

export const ORIGIN = 'http://localhost:5173'
export const JWT_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres'
export const PASSWORD = 'senha-forte-de-teste'

/**
 * Cria um banco novo para o arquivo de teste, copiado do banco-modelo (já migrado e com dados de exemplo).
 * Vários arquivos rodam em paralelo; se o modelo estiver ocupado por outra cópia, tenta de novo.
 */
export async function createTestDatabase(): Promise<{ url: string; drop(): Promise<void> }> {
  const server = inject('pgServerUrl')
  const name = `teste_${randomUUID().replaceAll('-', '')}`
  const admin = new PrismaClient({ datasourceUrl: `${server}/postgres` })
  for (let attempt = 1; ; attempt++) {
    try {
      await admin.$executeRawUnsafe(`CREATE DATABASE ${name} TEMPLATE ${TEMPLATE_DB}`)
      break
    } catch (error) {
      if (attempt >= 50 || !String(error).includes('is being accessed by other users')) throw error
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  return {
    url: `${server}/${name}?schema=${DB_SCHEMA}`,
    async drop() {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
      await admin.$disconnect()
    },
  }
}

/** App com banco próprio (cópia do modelo já populado). Fechado e apagado automaticamente no fim do arquivo. */
export async function makeApp(env: Record<string, string> = {}, before?: (app: FastifyInstance) => void, options: BuildOptions = {}) {
  const id = randomUUID()
  const db = await createTestDatabase()
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: db.url,
    JWT_SECRET,
    CORS_ORIGINS: ORIGIN,
    COOKIE_SECURE: 'false',
    LOG_LEVEL: 'silent',
    BCRYPT_COST: '4',
    FORM_RATE_LIMIT_PER_MINUTE: '1000',
    LOGIN_RATE_LIMIT_PER_MINUTE: '1000',
    GLOBAL_RATE_LIMIT_PER_MINUTE: '100000',
    UPLOAD_DIR: path.join(TMP_DIR, `uploads-${id}`),
    ...env,
  })
  const app = await buildApp(config, options)
  before?.(app)
  await app.ready()
  afterAll(async () => {
    await app.close()
    await db.drop()
  })
  return app
}

export async function createUser(app: FastifyInstance, email = `pessoa-${randomUUID()}@aagb.test`) {
  return app.prisma.user.create({
    data: { email, name: 'Pessoa de teste', role: 'admin', passwordHash: await app.authService.hashPassword(PASSWORD) },
  })
}

/** Junta os Set-Cookie da resposta num cabeçalho Cookie. */
export function cookieHeader(res: LightMyRequestResponse): string {
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}

export async function login(app: FastifyInstance, email: string, password = PASSWORD) {
  return app.inject({ method: 'POST', url: '/api/admin/auth/login', headers: { origin: ORIGIN }, payload: { email, password } })
}

/** Usuário logado: devolve o cabeçalho Cookie pronto. */
export async function loggedIn(app: FastifyInstance) {
  const user = await createUser(app)
  const res = await login(app, user.email)
  if (res.statusCode !== 200) throw new Error(`login falhou: ${res.body}`)
  return { user, cookie: cookieHeader(res) }
}

/** JWT HS256 montado à mão, para testar token expirado, adulterado ou com outro algoritmo. */
export function rawJwt(payload: object, secret = JWT_SECRET, header: object = { alg: 'HS256', typ: 'JWT' }) {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const data = `${enc(header)}.${enc(payload)}`
  return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`
}

/** Confirma a senha na sessão de `who` (ações sobre contas exigem confirmação recente). */
export async function confirm(app: FastifyInstance, who: { cookie: string }, password = PASSWORD) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/auth/confirm',
    headers: { cookie: who.cookie, origin: ORIGIN },
    payload: { password },
  })
  if (res.statusCode !== 204) throw new Error(`confirmação falhou: ${res.statusCode} ${res.body}`)
}
