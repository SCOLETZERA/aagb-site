import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { PrismaClient } from '@prisma/client'
import EmbeddedPostgres from 'embedded-postgres'
import type { TestProject } from 'vitest/node'
import { seedSampleData } from '../prisma/seed-data.js'
import { DB_SCHEMA, PG_DIR, TEMPLATE_DB, TMP_DIR } from './paths.js'

declare module 'vitest' {
  interface ProvidedContext {
    /** Endereço do Postgres dos testes, sem o nome do banco (ex.: postgresql://postgres:senha@127.0.0.1:5555). */
    pgServerUrl: string
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })
}

/**
 * Sobe um Postgres de verdade (o mesmo motor do Supabase) só para os testes, cria o banco-modelo
 * com as migrações e os dados de exemplo, e passa o endereço para os arquivos de teste.
 */
export default async function setup(project: TestProject) {
  rmSync(TMP_DIR, { recursive: true, force: true })
  mkdirSync(TMP_DIR, { recursive: true })

  const port = await freePort()
  const password = 'senha-dos-testes'
  const pg = new EmbeddedPostgres({ databaseDir: PG_DIR, user: 'postgres', password, port, persistent: false, onLog: () => {} })
  await pg.initialise()
  await pg.start()
  const server = `postgresql://postgres:${password}@127.0.0.1:${port}`

  // Imita o pior caso do Supabase: papéis públicos com acesso padrão a todo esquema e tabela novos.
  // A migração precisa tirar esse acesso (ver supabase.test.ts).
  const admin = new PrismaClient({ datasourceUrl: `${server}/postgres` })
  await admin.$executeRawUnsafe('CREATE ROLE anon NOLOGIN')
  await admin.$executeRawUnsafe('CREATE ROLE authenticated NOLOGIN')
  await admin.$executeRawUnsafe(`CREATE DATABASE ${TEMPLATE_DB}`)
  await admin.$disconnect()
  // Permissões padrão valem por banco: são gravadas no banco-modelo, antes da migração.
  const template = new PrismaClient({ datasourceUrl: `${server}/${TEMPLATE_DB}` })
  await template.$executeRawUnsafe('ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT USAGE ON SCHEMAS TO anon, authenticated')
  await template.$executeRawUnsafe('ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON TABLES TO anon, authenticated')
  await template.$disconnect()

  const url = `${server}/${TEMPLATE_DB}?schema=${DB_SCHEMA}`
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js')
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: 'pipe',
  })
  const prisma = new PrismaClient({ datasourceUrl: url })
  await seedSampleData(prisma)
  await prisma.$disconnect()

  project.provide('pgServerUrl', server)

  return async () => {
    await pg.stop()
    rmSync(TMP_DIR, { recursive: true, force: true })
  }
}
