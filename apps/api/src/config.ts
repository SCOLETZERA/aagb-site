import { z } from 'zod'

/**
 * Regras do endereço do banco em produção (Supabase):
 * - esquema próprio, porque o "public" pode ficar exposto pela Data API com a chave pública;
 * - sslmode=require exato: o Prisma 6 trata verify-ca, verify-full e variações de maiúsculas como
 *   "prefer", que aceita conexão sem criptografia;
 * - sem parâmetros repetidos: o Prisma usa o último valor, e um segundo sslmode=disable passaria.
 */
export function productionDatabaseUrlProblems(url: string): string[] {
  if (!URL.canParse(url)) return ['Endereço do banco inválido.']
  const params = new URL(url).searchParams
  const problems: string[] = []
  for (const name of ['schema', 'sslmode', 'pgbouncer']) {
    if (params.getAll(name).length > 1) problems.push(`Parâmetro ${name} repetido no endereço do banco.`)
  }
  const schema = params.get('schema')
  if (!schema || schema === 'public') problems.push('Em produção use um esquema próprio: acrescente schema=aagb ao endereço.')
  if (params.get('sslmode') !== 'require') {
    problems.push('Em produção a conexão com o banco precisa ser criptografada: use sslmode=require no endereço.')
  }
  return problems
}

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3333),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z
      .string('DATABASE_URL é obrigatória.')
      .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL precisa ser um endereço de Postgres (postgresql://...).'),
    // Usada só pelas migrações (Prisma CLI); conferida aqui para ter as mesmas regras em produção.
    DIRECT_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'DIRECT_URL precisa ser um endereço de Postgres (postgresql://...).')
      .optional(),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter pelo menos 32 caracteres.'),
    CORS_ORIGINS: z
      .string()
      // Lista de URLs separadas por vírgula. "*" é recusado por não ser URL.
      .min(1, 'CORS_ORIGINS é obrigatória (ex.: https://aagb.org.br).')
      .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
      .pipe(z.array(z.url({ protocol: /^https?$/ })).min(1)),
    COOKIE_SECURE: bool.default(true),
    // false, ou o número de proxies à frente da API (ex.: 1). "true" confiaria em qualquer X-Forwarded-For,
    // e qualquer pessoa poderia trocar de IP a cada requisição para fugir do limite.
    TRUST_PROXY: z
      .string()
      .regex(/^(false|0|[1-9])$/, 'Use false ou o número de proxies à frente da API (ex.: 1).')
      .transform((v) => (v === 'false' || v === '0' ? false : Number(v)))
      .default(false),
    UPLOAD_DIR: z.string().default('./uploads'),
    PERSONAL_DATA_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(365),
    FORM_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(5),
    LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(10),
    GLOBAL_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(120),
    BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'test' && env.BCRYPT_COST < 12) {
      ctx.addIssue({ code: 'custom', path: ['BCRYPT_COST'], message: 'Use custo 12 ou mais fora dos testes.' })
    }
    if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) {
      ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'Em produção os cookies precisam ser Secure.' })
    }
    if (env.NODE_ENV === 'production') {
      for (const key of ['DATABASE_URL', 'DIRECT_URL'] as const) {
        const value = env[key]
        if (value) for (const message of productionDatabaseUrlProblems(value)) ctx.addIssue({ code: 'custom', path: [key], message })
      }
    }
  })

export type Config = z.infer<typeof envSchema>

/** Lê e valida as variáveis de ambiente. Falha na inicialização, com mensagem clara, se algo estiver errado. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = envSchema.safeParse(env)
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.') || 'env'}: ${i.message}`)
    throw new Error(`Configuração inválida:\n${lines.join('\n')}`)
  }
  // Origens sem barra final, para comparar com o cabeçalho Origin.
  return { ...result.data, CORS_ORIGINS: result.data.CORS_ORIGINS.map((o) => new URL(o).origin) }
}
