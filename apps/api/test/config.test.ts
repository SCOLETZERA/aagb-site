import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

const valid = {
  DATABASE_URL: 'postgresql://postgres:senha@localhost:5433/aagb?schema=aagb',
  JWT_SECRET: 'x'.repeat(32),
  CORS_ORIGINS: 'https://aagb.org.br, http://localhost:5173/',
}

describe('configuração', () => {
  it('aceita um ambiente válido e normaliza as origens', () => {
    const config = loadConfig(valid)
    expect(config.CORS_ORIGINS).toEqual(['https://aagb.org.br', 'http://localhost:5173'])
    expect(config.COOKIE_SECURE).toBe(true)
    expect(config.BCRYPT_COST).toBe(12)
  })

  it('recusa segredo curto, origem "*" e falta do banco', () => {
    expect(() => loadConfig({ ...valid, JWT_SECRET: 'curto' })).toThrow(/JWT_SECRET/)
    expect(() => loadConfig({ ...valid, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/)
    expect(() => loadConfig({ ...valid, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/)
  })

  it('TRUST_PROXY aceita o número de proxies, nunca "true"', () => {
    expect(loadConfig({ ...valid, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1)
    expect(loadConfig(valid).TRUST_PROXY).toBe(false)
    expect(() => loadConfig({ ...valid, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/)
  })

  it('exige cookies Secure em produção e bcrypt forte fora dos testes', () => {
    expect(() => loadConfig({ ...valid, NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/)
    expect(() => loadConfig({ ...valid, BCRYPT_COST: '8' })).toThrow(/BCRYPT_COST/)
  })

  it('exige endereço de Postgres', () => {
    expect(() => loadConfig({ ...valid, DATABASE_URL: 'file:./dev.db' })).toThrow(/DATABASE_URL/)
    expect(() => loadConfig({ ...valid, NODE_ENV: 'production', DATABASE_URL: 'não é endereço' })).toThrow(/DATABASE_URL/)
    expect(loadConfig({ ...valid, DATABASE_URL: 'postgres://u:p@localhost:5432/db' }).DATABASE_URL).toMatch(/^postgres:/)
  })

  it('em produção exige esquema próprio (fora de public) e conexão criptografada', () => {
    const prod = { ...valid, NODE_ENV: 'production' }
    const supabase = 'postgresql://postgres.abc:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'
    expect(loadConfig({ ...prod, DATABASE_URL: `${supabase}?pgbouncer=true&schema=aagb&sslmode=require` }).NODE_ENV).toBe('production')
    expect(() => loadConfig({ ...prod, DATABASE_URL: `${supabase}?pgbouncer=true&sslmode=require` })).toThrow(/schema/)
    expect(() => loadConfig({ ...prod, DATABASE_URL: `${supabase}?pgbouncer=true&schema=public&sslmode=require` })).toThrow(/schema/)
    expect(() => loadConfig({ ...prod, DATABASE_URL: `${supabase}?pgbouncer=true&schema=aagb` })).toThrow(/sslmode/)
    expect(() => loadConfig({ ...prod, DATABASE_URL: `${supabase}?pgbouncer=true&schema=aagb&sslmode=disable` })).toThrow(/sslmode/)
  })
})
