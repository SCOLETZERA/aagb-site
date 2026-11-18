/**
 * Trava para comandos que apagam ou reescrevem o banco (db:reset, db:seed, db:migrate:dev).
 * Só deixa rodar quando DATABASE_URL e DIRECT_URL apontam para um Postgres local, para que um .env
 * com o endereço do Supabase nunca apague nem encha de dados de exemplo o banco de produção.
 *
 * Uso (no package.json): tsx scripts/local-only.ts "comando 1" "comando 2" ...
 */
import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Problemas que impedem rodar um comando destrutivo; lista vazia quando o banco é local. */
export function localDatabaseProblems(env: Record<string, string | undefined>): string[] {
  if (env.NODE_ENV === 'production') return ['NODE_ENV=production: este comando é só para o banco local.']
  const problems: string[] = []
  if (!env.DATABASE_URL) problems.push('DATABASE_URL não está definida.')
  for (const key of ['DATABASE_URL', 'DIRECT_URL'] as const) {
    const value = env[key]
    if (!value) continue
    if (!URL.canParse(value)) problems.push(`${key} não é um endereço válido.`)
    else if (!LOCAL_HOSTS.has(new URL(value).hostname)) {
      problems.push(`${key} aponta para ${new URL(value).hostname}, que não é o banco local.`)
    }
  }
  return problems
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = localDatabaseProblems(process.env)
  if (problems.length) {
    console.error('Comando recusado: ele apaga ou reescreve o banco e só roda no Postgres local.')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }
  for (const command of process.argv.slice(2)) {
    const { status } = spawnSync(command, { stdio: 'inherit', shell: true })
    if (status !== 0) process.exit(status ?? 1)
  }
}
