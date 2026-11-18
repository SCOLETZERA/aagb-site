import { describe, expect, it } from 'vitest'
import { localDatabaseProblems } from '../scripts/local-only.js'

const local = 'postgresql://postgres:aagb-local@127.0.0.1:5433/aagb?schema=aagb'
const supabase = 'postgresql://postgres.abc:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?schema=aagb'

describe('comandos que apagam ou reescrevem o banco só rodam no banco local', () => {
  it('aceita localhost, 127.0.0.1 e ::1', () => {
    expect(localDatabaseProblems({ DATABASE_URL: local, DIRECT_URL: local })).toEqual([])
    expect(localDatabaseProblems({ DATABASE_URL: local.replace('127.0.0.1', 'localhost') })).toEqual([])
    expect(localDatabaseProblems({ DATABASE_URL: local.replace('127.0.0.1', '[::1]') })).toEqual([])
  })

  it('recusa o Supabase em DATABASE_URL ou DIRECT_URL', () => {
    expect(localDatabaseProblems({ DATABASE_URL: supabase })).toHaveLength(1)
    expect(localDatabaseProblems({ DATABASE_URL: local, DIRECT_URL: supabase })).toHaveLength(1)
  })

  it('recusa endereço ausente ou inválido e NODE_ENV=production', () => {
    expect(localDatabaseProblems({})).toHaveLength(1)
    expect(localDatabaseProblems({ DATABASE_URL: 'não é endereço' })).toHaveLength(1)
    expect(localDatabaseProblems({ DATABASE_URL: local, NODE_ENV: 'production' })).toHaveLength(1)
  })
})
