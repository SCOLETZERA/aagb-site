import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { PrismaClient } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'
import { createTestDatabase } from './helpers.js'

// O Postgres dos testes imita o pior caso do Supabase: os papéis públicos (anon, authenticated)
// recebem por padrão acesso a todo esquema e tabela novos (ver global-setup.ts).
const db = await createTestDatabase()
const prisma = new PrismaClient({ datasourceUrl: db.url })
afterAll(async () => {
  await prisma.$disconnect()
  await db.drop()
})

/** Roda uma consulta como o papel público `role` e devolve a mensagem de erro (ou null se deu certo). */
async function asRole(role: 'anon' | 'authenticated', sql: string): Promise<string | null> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`)
      await tx.$queryRawUnsafe(sql)
    })
    return null
  } catch (error) {
    return String(error)
  }
}

describe('proteção para o Supabase', () => {
  it('os papéis públicos não leem nem alteram as tabelas', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      expect(await asRole(role, 'SELECT "passwordHash" FROM aagb."User"')).toMatch(/permission denied/)
      expect(await asRole(role, 'SELECT * FROM aagb."Order"')).toMatch(/permission denied/)
      expect(await asRole(role, `DELETE FROM aagb."Article"`)).toMatch(/permission denied/)
    }
  })

  it('tabela criada depois, por outra migração, também fica fechada', async () => {
    await prisma.$executeRawUnsafe('CREATE TABLE aagb."TabelaNova" (id text PRIMARY KEY)')
    expect(await asRole('anon', 'SELECT * FROM aagb."TabelaNova"')).toMatch(/permission denied/)
  })

  it('todas as tabelas da aplicação têm RLS ligado', async () => {
    const rows = await prisma.$queryRawUnsafe<{ tablename: string; rowsecurity: boolean }[]>(
      `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'aagb' AND tablename NOT IN ('_prisma_migrations', 'TabelaNova')`,
    )
    expect(rows.length).toBe(15)
    expect(rows.filter((r) => !r.rowsecurity).map((r) => r.tablename)).toEqual([])
  })

  it('a API, dona das tabelas, continua lendo normalmente', async () => {
    expect(await prisma.product.count()).toBeGreaterThan(0)
  })

  it('a migração se recusa a criar as tabelas no esquema public', async () => {
    const other = await createTestDatabase()
    const url = other.url.replace('schema=aagb', 'schema=public')
    const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js')
    let output = ''
    try {
      execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url }, stdio: 'pipe' })
    } catch (error) {
      output = String((error as { stdout?: Buffer }).stdout ?? '') + String((error as { stderr?: Buffer }).stderr ?? '')
    }
    await other.drop()
    expect(output).toMatch(/Use um esquema próprio/)
  })
})
