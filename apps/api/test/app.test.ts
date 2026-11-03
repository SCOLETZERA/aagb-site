import { describe, expect, it } from 'vitest'
import { BODY_LIMIT_BYTES } from '../src/app.js'
import { ORIGIN, makeApp } from './helpers.js'

const app = await makeApp({}, (a) => {
  a.get('/api/test/boom', async () => {
    throw new Error('detalhe interno do banco: SELECT * FROM User')
  })
})

describe('proteções gerais', () => {
  it('responde ao health check com cabeçalhos de segurança', async () => {
    const res = await app.inject('/api/health')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-security-policy']).toContain("default-src 'none'")
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['strict-transport-security']).toBeDefined()
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('CORS só libera as origens configuradas', async () => {
    const ok = await app.inject({ url: '/api/news', headers: { origin: ORIGIN } })
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN)
    expect(ok.headers['access-control-allow-credentials']).toBe('true')
    const evil = await app.inject({ url: '/api/news', headers: { origin: 'https://site-malicioso.example' } })
    expect(evil.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('rota inexistente devolve 404 em português', async () => {
    const res = await app.inject('/api/nada-aqui')
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ message: 'Recurso não encontrado.' })
  })

  it('erro interno não vaza detalhes', async () => {
    const res = await app.inject('/api/test/boom')
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ message: 'Erro interno. Tente novamente mais tarde.' })
    expect(res.body).not.toContain('SELECT')
  })

  it('recusa JSON malformado, texto puro e corpo grande demais', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/orders', headers: { 'content-type': 'application/json' }, payload: '{"x":' })
    expect(bad.statusCode).toBe(400)
    expect(bad.json()).toEqual({ message: 'Dados inválidos.' })

    const text = await app.inject({ method: 'POST', url: '/api/orders', headers: { 'content-type': 'text/plain' }, payload: 'oi' })
    expect(text.statusCode).toBe(415)

    const huge = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { order: { name: 'a'.repeat(BODY_LIMIT_BYTES), phone: '', delivery: 'retirada', address: '' }, lines: [] },
    })
    expect(huge.statusCode).toBe(413)
    expect(huge.json().message).toBe('Os dados enviados são grandes demais.')
  })
})
