import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

const valid = {
  DATABASE_URL: 'file:./dev.db',
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

  it('exige cookies Secure em produção e bcrypt forte fora dos testes', () => {
    expect(() => loadConfig({ ...valid, NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/)
    expect(() => loadConfig({ ...valid, BCRYPT_COST: '8' })).toThrow(/BCRYPT_COST/)
  })
})
