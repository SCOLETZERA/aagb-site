/**
 * Postgres local para desenvolvimento, sem instalar nada: `npm run db:local -w apps/api`.
 * Os dados ficam em apps/api/.pgdata (fora do Git). Deixe rodando e, em outro terminal,
 * rode `npm run db:migrate -w apps/api` e `npm run db:seed -w apps/api` na primeira vez.
 * Porta e senha vêm de LOCAL_PG_PORT e LOCAL_PG_PASSWORD (padrão 5433 e aagb-local),
 * e precisam bater com DATABASE_URL e DIRECT_URL no .env.
 */
import 'dotenv/config'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import EmbeddedPostgres from 'embedded-postgres'

const databaseDir = fileURLToPath(new URL('../.pgdata', import.meta.url))
const port = Number(process.env.LOCAL_PG_PORT ?? 5433)
const password = process.env.LOCAL_PG_PASSWORD ?? 'aagb-local'

const pg = new EmbeddedPostgres({ databaseDir, user: 'postgres', password, port, persistent: true, onLog: () => {} })
if (!existsSync(databaseDir)) await pg.initialise()
await pg.start()

const client = pg.getPgClient()
await client.connect()
const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = 'aagb'")
if (!rowCount) await client.query('CREATE DATABASE aagb')
await client.end()

console.log(`Postgres local rodando em 127.0.0.1:${port} (banco "aagb"). Ctrl+C para parar.`)

let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await pg.stop()
  process.exit(0)
}
process.on('SIGINT', () => void stop())
process.on('SIGTERM', () => void stop())
