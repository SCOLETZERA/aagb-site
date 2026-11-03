import * as sample from '@aagb/shared/sample-data'
import { describe, expect, it } from 'vitest'
import { makeApp } from './helpers.js'

const app = await makeApp()
const get = async (url: string) => {
  const res = await app.inject(url)
  return { status: res.statusCode, body: res.json() }
}

describe('rotas públicas', () => {
  it('devolve as listas no mesmo formato e ordem dos dados de exemplo', async () => {
    expect((await get('/api/projects')).body).toEqual(sample.projects)
    expect((await get('/api/partners')).body).toEqual(sample.partners)
    expect((await get('/api/products')).body).toEqual(sample.products)
    expect((await get('/api/services')).body).toEqual(sample.services)
    expect((await get('/api/needs')).body).toEqual(sample.needs)
    expect((await get('/api/donations')).body).toEqual(sample.donations)
    expect((await get('/api/documents')).body).toEqual([])
  })

  it('lista notícias da mais nova para a mais antiga', async () => {
    const { body } = await get('/api/news')
    const expected = [...sample.articles].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    expect(body).toEqual(expected)
  })

  it('busca por id e devolve 404 em português', async () => {
    expect((await get('/api/news/doacao-de-sementes')).body).toEqual(sample.articles[1])
    expect((await get('/api/products/mel-500g')).body.priceCents).toBe(1800)
    const missing = await get('/api/projects/nao-existe')
    expect(missing).toEqual({ status: 404, body: { message: 'Projeto não encontrado.' } })
  })

  it('esconde produtos inativos', async () => {
    await app.prisma.product.update({ where: { id: 'mel-1kg' }, data: { active: false } })
    expect((await get('/api/products')).body.map((p: { id: string }) => p.id)).not.toContain('mel-1kg')
    expect((await get('/api/products/mel-1kg')).status).toBe(404)
  })
})
