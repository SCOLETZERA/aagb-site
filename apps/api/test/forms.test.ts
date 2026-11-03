import { describe, expect, it } from 'vitest'
import { makeApp } from './helpers.js'

const app = await makeApp()
const customer = { name: 'Maria das Dores', phone: '(88) 99999-0000', delivery: 'retirada', address: '' }

const order = (lines: unknown, extra: object = {}) =>
  app.inject({ method: 'POST', url: '/api/orders', payload: { order: { ...customer, ...extra }, lines } })
const stockOf = async (id: string) => (await app.prisma.product.findUniqueOrThrow({ where: { id } })).stock

describe('pedido', () => {
  it('cria o pedido com preço do banco, sem baixar o estoque, e devolve protocolo', async () => {
    const before = await stockOf('alface-crespa')
    const res = await order([{ productId: 'alface-crespa', quantity: 2, priceCents: 1 }], { totalCents: 1 })
    expect(res.statusCode).toBe(201)
    const { protocol } = res.json()
    expect(protocol).toMatch(/^PD-[2-9A-HJ-NP-Z]{8}$/)

    const saved = await app.prisma.order.findUniqueOrThrow({ where: { protocol }, include: { lines: true } })
    expect(saved.totalCents).toBe(600)
    expect(saved.lines[0]).toMatchObject({ unitPriceCents: 300, quantity: 2, productName: 'Alface crespa' })
    // A baixa só acontece quando a diretoria conclui o pedido.
    expect(await stockOf('alface-crespa')).toBe(before)
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

  it('pedidos falsos não esgotam a vitrine: o estoque só muda ao concluir', async () => {
    await app.prisma.product.update({ where: { id: 'queijo-coalho' }, data: { stock: 1 } })
    const results = await Promise.all(Array.from({ length: 5 }, () => order([{ productId: 'queijo-coalho', quantity: 1 }])))
    expect(results.every((r) => r.statusCode === 201)).toBe(true)
    expect(await stockOf('queijo-coalho')).toBe(1)
    // Pedir mais do que existe agora continua recusado.
    expect((await order([{ productId: 'queijo-coalho', quantity: 2 }])).statusCode).toBe(409)
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

  it('recusa identificador gigante e data fora do formato do navegador', async () => {
    const send = (payload: object) => app.inject({ method: 'POST', url: '/api/service-requests', payload: { ...service, ...payload } })
    expect((await send({ serviceId: 'x'.repeat(5000) })).statusCode).toBe(400)
    expect((await send({ desiredDate: 'Tue, 03 Nov 2026 10:00:00 GMT' })).statusCode).toBe(400)
    expect((await send({ desiredDate: '2026-11-20' })).statusCode).toBe(201)
  })

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

  it('sem proxy configurado, trocar o X-Forwarded-For não foge do limite', async () => {
    const offer = { itemId: 'outro', name: 'Ana Paula', contact: 'ana@exemplo.org', quantity: '1', handover: 'levar' }
    const send = (app: Awaited<ReturnType<typeof makeApp>>, ip: string) =>
      app.inject({ method: 'POST', url: '/api/donation-offers', headers: { 'x-forwarded-for': ip }, payload: offer })

    const direct = await makeApp({ FORM_RATE_LIMIT_PER_MINUTE: '1' })
    expect((await send(direct, '10.0.0.1')).statusCode).toBe(201)
    expect((await send(direct, '10.0.0.2')).statusCode).toBe(429)

    const behindProxy = await makeApp({ FORM_RATE_LIMIT_PER_MINUTE: '1', TRUST_PROXY: '1' })
    expect((await send(behindProxy, '10.0.0.1')).statusCode).toBe(201)
    expect((await send(behindProxy, '10.0.0.2')).statusCode).toBe(201)
    expect((await send(behindProxy, '10.0.0.2')).statusCode).toBe(429)
  })
})
