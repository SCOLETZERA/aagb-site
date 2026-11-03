import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { PrismaClient } from '@prisma/client'
import { seedSampleData } from '../prisma/seed-data.js'
import { TEMPLATE_DB, TMP_DIR } from './paths.js'

/** Cria uma vez o banco-modelo (esquema + dados de exemplo); cada arquivo de teste usa uma cópia. */
export default async function setup() {
  rmSync(TMP_DIR, { recursive: true, force: true })
  mkdirSync(TMP_DIR, { recursive: true })
  const url = `file:${TEMPLATE_DB}`
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js')
  execFileSync(process.execPath, [prismaCli, 'db', 'push', '--skip-generate'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  })
  const prisma = new PrismaClient({ datasourceUrl: url })
  await seedSampleData(prisma)
  await prisma.$disconnect()
  return () => rmSync(TMP_DIR, { recursive: true, force: true })
}
