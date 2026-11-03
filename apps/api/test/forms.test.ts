import type { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { createOrder } from '../src/services/orders.js'
import { makeApp } from './helpers.js'

const app = await makeApp()
const customer = { name: 'Maria das Dores', phone: '(88) 99999-0000', delivery: 'retirada', address: '' }

const order = (lines: unknown, extra: object = {}) =>
  app.inject({ method: 'POST', url: '/api/orders', payload: { order: { ...customer, ...extra }, lines } })
const stockOf = async (id: string) => (await app.prisma.product.findUniqueOrThrow({ where: { id } })).stock

describe('pedido', () => {
  it('cria o pedido com preço do banco, baixa o estoque e devolve protocolo', async () => {
    const before = await stockOf('alface-crespa')
    const res = await order([{ productId: 'alface-crespa', quantity: 2, priceCents: 1 }], { totalCents: 1 })
    expect(res.statusCode).toBe(201)
    const { protocol } = res.json()
    expect(protocol).toMatch(/^PD-[2-9A-HJ-NP-Z]{8}$/)

    const saved = await app.prisma.order.findUniqueOrThrow({ where: { protocol }, include: { lines: true } })
    expect(saved.totalCents).toBe(600)
    expect(saved.lines[0]).toMatchObject({ unitPriceCents: 300, quantity: 2, productName: 'Alface crespa' })
    expect(await stockOf('alface-crespa')).toBe(before - 2)
  })

  it('só guarda o endereço quando é entrega', async () => {
    const res = await order([{ productId: 'alface-crespa', quantity: 1 }], { address: 'Rua das Flores, 10' })
    const saved = await app.prisma.order.findUniqueOrThrow({ where: { protocol: res.json().protocol } })
    expect(saved.address).toBe('')
  })

  it('soma linhas repetidas antes de checar o estoque', async () => {
    const stock = await stockOf('feijao-de-corda')
    const half = Math.ceil(stock / 2) + 1
    const res = await order([
      { productId: 'feijao-de-corda', quantity: half },
      { productId: 'feijao-de-corda', quantity: half },
    ])
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toBe(`Só temos ${stock} de "Feijão de corda 1 kg" no momento.`)
    expect(await stockOf('feijao-de-corda')).toBe(stock)
  })

  it('pedidos simultâneos não vendem o mesmo item duas vezes', async () => {
    await app.prisma.product.update({ where: { id: 'queijo-coalho' }, data: { stock: 1 } })
    const results = await Promise.all(
      Array.from({ length: 5 }, () => order([{ productId: 'queijo-coalho', quantity: 1 }])),
    )
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1)
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(4)
    expect(await stockOf('queijo-coalho')).toBe(0)
  })

  it('a baixa condicional barra a venda mesmo se a leitura do estoque estiver desatualizada', async () => {
    // No SQLite as transações já rodam em fila, então o teste acima passaria mesmo sem a proteção.
    // Aqui a leitura mente (estoque 999), como pode acontecer entre transações no Postgres.
    await app.prisma.product.update({ where: { id: 'milho-5kg' }, data: { stock: 1 } })
    const stale = app.prisma.$extends({
      query: { product: { findMany: async ({ args, query }) => (await query(args)).map((p) => ({ ...p, stock: 999 })) } },
    }) as unknown as PrismaClient
    await expect(createOrder(stale, { ...customer, delivery: 'retirada' }, [{ productId: 'milho-5kg', quantity: 2 }])).rejects.toMatchObject({
      status: 409,
    })
    expect(await stockOf('milho-5kg')).toBe(1)
  })

  it('produto inexistente ou inativo dá 422', async () => {
    expect((await order([{ productId: 'nao-existe', quantity: 1 }])).statusCode).toBe(422)
    await app.prisma.product.update({ where: { id: 'mudas-de-hortalicas' }, data: { active: false } })
    expect((await order([{ productId: 'mudas-de-hortalicas', quantity: 1 }])).statusCode).toBe(422)
  })

  it('valida com os schemas compartilhados e devolve o erro de cada campo', async () => {
    const res = await order([{ productId: 'alface-crespa', quantity: 1 }], { name: 'A', phone: '123', delivery: 'entrega' })
    expect(res.statusCode).toBe(400)
    expect(res.json().fields).toMatchObject({
      'order.name': 'Informe seu nome completo.',
      'order.phone': 'Informe um telefone com DDD, por exemplo (88) 99999-0000.',
      'order.address': 'Informe o endereço para a entrega.',
    })
  })

  it('recusa tipos errados, carrinho vazio e quantidades absurdas', async () => {
    expect((await order([])).json().message).toBe('Seu carrinho está vazio.')
    expect((await order([{ productId: 'alface-crespa', quantity: '2' }])).statusCode).toBe(400)
    expect((await order([{ productId: 'alface-crespa', quantity: 1.5 }])).statusCode).toBe(400)
    expect((await order([{ productId: 'alface-crespa', quantity: -1 }])).statusCode).toBe(400)
    expect((await order([{ productId: 'alface-crespa', quantity: 1e9 }])).statusCode).toBe(400)
    const many = Array.from({ length: 51 }, () => ({ productId: 'alface-crespa', quantity: 1 }))
    expect((await order(many)).statusCode).toBe(400)
  })
})

describe('solicitação de serviço e oferta de doação', () => {
  const service = { serviceId: 'assistencia-tecnica', name: 'João Batista', phone: '88999990000', locality: 'Bálsamos', desiredDate: '', details: '' }
  const donation = { itemId: 'sementes', name: 'Ana Paula', contact: 'ana@exemplo.org', quantity: '10 kg', handover: 'levar' }

  it('cria a solicitação de serviço com o nome do serviço', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/service-requests', payload: service })
    expect(res.statusCode).toBe(201)
    const saved = await app.prisma.serviceRequest.findUniqueOrThrow({ where: { protocol: res.json().protocol } })
    expect(saved.serviceName).toBe('Assistência técnica')
    const missing = await app.inject({ method: 'POST', url: '/api/service-requests', payload: { ...service, serviceId: 'nao-existe' } })
    expect(missing.statusCode).toBe(422)
  })

  it('aceita necessidade cadastrada, "outro" e "dinheiro", e recusa o resto', async () => {
    for (const itemId of ['sementes', 'outro', 'dinheiro']) {
      const res = await app.inject({ method: 'POST', url: '/api/donation-offers', payload: { ...donation, itemId } })
      expect(res.statusCode).toBe(201)
      expect(res.json().protocol).toMatch(/^DO-/)
    }
    for (const itemId of ['nao-existe', 'constructor', '__proto__']) {
      const res = await app.inject({ method: 'POST', url: '/api/donation-offers', payload: { ...donation, itemId } })
      expect(res.statusCode).toBe(422)
    }
  })
})

describe('limite de envios', () => {
  it('bloqueia o IP depois do limite por minuto', async () => {
    const limited = await makeApp({ FORM_RATE_LIMIT_PER_MINUTE: '2' })
    const send = () =>
      limited.inject({ method: 'POST', url: '/api/donation-offers', payload: { itemId: 'outro', name: 'Ana Paula', contact: 'ana@exemplo.org', quantity: '1', handover: 'levar' } })
    expect((await send()).statusCode).toBe(201)
    expect((await send()).statusCode).toBe(201)
    const blocked = await send()
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json().message).toBe('Muitas tentativas. Aguarde um pouco e tente de novo.')
  })
})
