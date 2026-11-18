import { beforeAll, describe, expect, it } from 'vitest'
import { anonymizeExpired, purgeOldSessions, REMOVED } from '../src/services/retention.js'
import { ORIGIN, confirm, loggedIn, makeApp } from './helpers.js'

const app = await makeApp()
const admin = await loggedIn(app)

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
const as = (who: { cookie: string }) => (method: Method, url: string, payload?: object) =>
  app.inject({ method, url, headers: { cookie: who.cookie, origin: ORIGIN }, ...(payload ? { payload } : {}) })
const asAdmin = as(admin)

async function placeOrder(productId = 'mel-500g', quantity = 2) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/orders',
    payload: { order: { name: 'Maria das Dores', phone: '88999990000', delivery: 'entrega', address: 'Sítio Bálsamos, 12' }, lines: [{ productId, quantity }] },
  })
  return app.prisma.order.findUniqueOrThrow({ where: { protocol: res.json().protocol } })
}
const stockOf = async (id: string) => (await app.prisma.product.findUniqueOrThrow({ where: { id } })).stock
const auditActions = async () => (await app.prisma.auditLog.findMany()).map((a) => a.action)

describe('caixa de entrada', () => {
  it('lista pedidos novos e muda o status, com auditoria', async () => {
    const order = await placeOrder()
    const list = await asAdmin('GET', '/api/admin/orders?status=novo')
    expect(list.statusCode).toBe(200)
    expect(list.headers['cache-control']).toBe('no-store')
    expect(list.json().map((o: { id: string }) => o.id)).toContain(order.id)

    const res = await asAdmin('PATCH', `/api/admin/orders/${order.id}`, { status: 'em-andamento' })
    expect(res.json().status).toBe('em-andamento')
    expect(await auditActions()).toContain('order.status.em-andamento')
    expect((await asAdmin('PATCH', `/api/admin/orders/${order.id}`, { status: 'pago' })).statusCode).toBe(400)
    expect((await asAdmin('GET', '/api/admin/orders?status=qualquer')).statusCode).toBe(400)
  })

  it('concluir baixa o estoque, reabrir devolve e cancelado é final', async () => {
    const setStatus = (id: string, status: string) => asAdmin('PATCH', `/api/admin/orders/${id}`, { status })
    const before = await stockOf('mel-500g')
    const order = await placeOrder('mel-500g', 3)
    expect(await stockOf('mel-500g')).toBe(before)

    expect((await setStatus(order.id, 'concluido')).statusCode).toBe(200)
    expect(await stockOf('mel-500g')).toBe(before - 3)
    expect((await setStatus(order.id, 'concluido')).statusCode).toBe(200)
    expect(await stockOf('mel-500g')).toBe(before - 3)

    expect((await setStatus(order.id, 'em-andamento')).statusCode).toBe(200)
    expect(await stockOf('mel-500g')).toBe(before)

    expect((await setStatus(order.id, 'cancelado')).statusCode).toBe(200)
    expect(await stockOf('mel-500g')).toBe(before)
    expect((await setStatus(order.id, 'novo')).statusCode).toBe(409)
  })

  it('dois pedidos pelo último item: só o primeiro conclui, o segundo explica o que falta', async () => {
    await app.prisma.product.update({ where: { id: 'milho-5kg' }, data: { stock: 1 } })
    const first = await placeOrder('milho-5kg', 1)
    const second = await placeOrder('milho-5kg', 1)
    expect((await asAdmin('PATCH', `/api/admin/orders/${first.id}`, { status: 'concluido' })).statusCode).toBe(200)
    const blocked = await asAdmin('PATCH', `/api/admin/orders/${second.id}`, { status: 'concluido' })
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().message).toBe('Não dá para concluir: só há 0 de "Milho em grão 5 kg" em estoque e o pedido pede 1.')
    expect(await stockOf('milho-5kg')).toBe(0)
    expect((await app.prisma.order.findUniqueOrThrow({ where: { id: second.id } })).status).toBe('novo')
  })

  it('anonimiza um pedido a pedido do titular', async () => {
    const order = await placeOrder()
    const res = await asAdmin('POST', `/api/admin/orders/${order.id}/anonymize`)
    expect(res.json()).toMatchObject({ name: REMOVED, phone: '', address: '', totalCents: order.totalCents })
    expect(res.json().anonymizedAt).toBeTruthy()
    expect((await asAdmin('POST', '/api/admin/orders/nao-existe/anonymize')).statusCode).toBe(404)
  })

  it('a retenção apaga dados pessoais só do que passou do prazo', async () => {
    const old = await placeOrder()
    const recent = await placeOrder()
    await app.prisma.order.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 400 * 86_400_000) } })
    const result = await anonymizeExpired(app.prisma, 365)
    expect(result.orders).toBeGreaterThanOrEqual(1)
    expect((await app.prisma.order.findUniqueOrThrow({ where: { id: old.id } })).phone).toBe('')
    expect((await app.prisma.order.findUniqueOrThrow({ where: { id: recent.id } })).phone).toBe('88999990000')
  })
})

describe('ofertas de doação e solicitações de serviço chegam ao painel', () => {
  it('uma oferta feita no site aparece como nova, entra no resumo e muda de status', async () => {
    const sent = await app.inject({
      method: 'POST',
      url: '/api/donation-offers',
      payload: { itemId: 'sementes', name: 'Ana Paula', contact: 'ana@exemplo.org', quantity: '10 kg', handover: 'levar' },
    })
    expect(sent.statusCode).toBe(201)

    const list = await asAdmin('GET', '/api/admin/donation-offers?status=novo')
    const offer = list.json().find((o: { protocol: string }) => o.protocol === sent.json().protocol)
    expect(offer).toMatchObject({ name: 'Ana Paula', status: 'novo' })

    const summary = (await asAdmin('GET', '/api/admin/reports/summary')).json()
    expect(summary.donationOffers.find((d: { status: string }) => d.status === 'novo').count).toBeGreaterThan(0)

    const done = await asAdmin('PATCH', `/api/admin/donation-offers/${offer.id}`, { status: 'concluido' })
    expect(done.json().status).toBe('concluido')
    expect(await auditActions()).toContain('donation-offer.status.concluido')
  })

  it('uma solicitação de serviço feita no site aparece como nova', async () => {
    const sent = await app.inject({
      method: 'POST',
      url: '/api/service-requests',
      payload: { serviceId: 'assistencia-tecnica', name: 'João Batista', phone: '88999990000', locality: 'Bálsamos', desiredDate: '', details: '' },
    })
    expect(sent.statusCode).toBe(201)
    const list = await asAdmin('GET', '/api/admin/service-requests?status=novo')
    expect(list.json().map((r: { protocol: string }) => r.protocol)).toContain(sent.json().protocol)
  })
})

describe('limpeza de sessões', () => {
  it('apaga só sessões vencidas ou revogadas há mais de 30 dias', async () => {
    const { user } = await loggedIn(app)
    const old = new Date(Date.now() - 40 * 86_400_000)
    await app.prisma.session.create({ data: { userId: user.id, familyId: 'velha', tokenHash: 'h-velha', expiresAt: old } })
    await app.prisma.session.create({
      data: { userId: user.id, familyId: 'revogada', tokenHash: 'h-revogada', expiresAt: new Date(Date.now() + 86_400_000), revokedAt: old },
    })
    expect(await purgeOldSessions(app.prisma)).toBe(2)
    expect(await app.prisma.session.count({ where: { userId: user.id } })).toBe(1)
  })
})

describe('conteúdo', () => {
  const news = {
    id: 'reuniao-de-novembro',
    title: 'Reunião de novembro',
    publishedAt: '2026-11-03',
    summary: 'Pauta da reunião mensal.',
    body: ['Primeiro parágrafo.'],
    icon: 'news',
  }

  it('cria, edita e apaga notícias, e o público vê o resultado', async () => {
    expect((await asAdmin('POST', '/api/admin/content/news', news)).statusCode).toBe(201)
    expect((await asAdmin('POST', '/api/admin/content/news', news)).statusCode).toBe(409)
    expect((await app.inject('/api/news/reuniao-de-novembro')).json().body).toEqual(['Primeiro parágrafo.'])

    const { id: _id, ...fields } = news
    void _id
    const updated = await asAdmin('PUT', '/api/admin/content/news/reuniao-de-novembro', { ...fields, title: 'Novo título' })
    expect(updated.json().title).toBe('Novo título')

    expect((await asAdmin('DELETE', '/api/admin/content/news/reuniao-de-novembro')).statusCode).toBe(204)
    expect((await app.inject('/api/news/reuniao-de-novembro')).statusCode).toBe(404)
    expect((await asAdmin('DELETE', '/api/admin/content/news/reuniao-de-novembro')).statusCode).toBe(404)
    expect(await auditActions()).toEqual(expect.arrayContaining(['news.create', 'news.update', 'news.delete']))
  })

  it('recusa ícone desconhecido, id fora do padrão e imagem perigosa', async () => {
    const bad = [
      { ...news, id: 'icone-ruim', icon: 'skull' },
      { ...news, id: 'Com Espaço' },
      { ...news, id: 'img-js', image: 'javascript:alert(1)' },
      { ...news, id: 'img-http', image: 'http://exemplo.org/x.jpg' },
      { ...news, id: 'img-outro-site', image: '//exemplo.org/x.jpg' },
      { ...news, id: 'data-ruim', publishedAt: '03/11/2026' },
    ]
    for (const payload of bad) expect((await asAdmin('POST', '/api/admin/content/news', payload)).statusCode).toBe(400)
  })

  it('produto excluído fica inativo e some da vitrine', async () => {
    expect((await asAdmin('DELETE', '/api/admin/content/products/coentro-e-cebolinha')).statusCode).toBe(204)
    expect((await app.inject('/api/products/coentro-e-cebolinha')).statusCode).toBe(404)
    const inAdmin = (await asAdmin('GET', '/api/admin/content/products')).json()
    expect(inAdmin.find((p: { id: string }) => p.id === 'coentro-e-cebolinha').active).toBe(false)
  })
})

describe('documentos', () => {
  const boundary = '----aagb'
  function multipart(fields: Record<string, string>, file: Buffer, filename = 'relatorio.pdf') {
    const parts = Object.entries(fields).map(
      ([k, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
    )
    return Buffer.concat([
      Buffer.from(parts.join('')),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
  }
  const upload = (body: Buffer) =>
    app.inject({
      method: 'POST',
      url: '/api/admin/documents',
      headers: { cookie: admin.cookie, origin: ORIGIN, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })
  const fields = { title: 'Prestação de contas 2025: "anual"', category: 'prestacao-de-contas', publishedAt: '2026-03-01' }
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')

  it('aceita PDF e serve como anexo com o tipo certo', async () => {
    const res = await upload(multipart(fields, pdf, '../../etc/passwd.pdf'))
    expect(res.statusCode).toBe(201)
    const doc = res.json()
    expect(doc).toMatchObject({ title: fields.title, category: 'prestacao-de-contas', publishedAt: '2026-03-01' })

    const file = await app.inject(doc.url)
    expect(file.statusCode).toBe(200)
    expect(file.headers['content-type']).toBe('application/pdf')
    expect(file.headers['content-disposition']).toMatch(/^attachment; filename="Prestacao de contas 2025 anual.pdf"/)
    expect(file.headers['x-content-type-options']).toBe('nosniff')
    expect(file.rawPayload.equals(pdf)).toBe(true)

    const stored = await app.prisma.transparencyDocument.findUniqueOrThrow({ where: { id: doc.id } })
    expect(stored.storedName).toMatch(/^[0-9a-f-]{36}\.pdf$/)
    expect((await app.inject('/api/documents')).json()).toHaveLength(1)

    expect((await asAdmin('DELETE', `/api/admin/documents/${doc.id}`)).statusCode).toBe(204)
    expect((await app.inject(doc.url)).statusCode).toBe(404)
  })

  it('recusa arquivo que não é PDF, mesmo com extensão .pdf', async () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>')
    const res = await upload(multipart(fields, html))
    expect(res.statusCode).toBe(415)
    expect(res.json().message).toBe('O arquivo precisa ser um PDF.')
  })

  it('recusa arquivo grande demais, campos inválidos e envio sem login', async () => {
    const big = Buffer.concat([pdf, Buffer.alloc(10 * 1024 * 1024 + 1)])
    expect((await upload(multipart(fields, big))).statusCode).toBe(413)
    expect((await upload(multipart({ ...fields, category: 'outra' }, pdf))).statusCode).toBe(400)
    const anon = await app.inject({
      method: 'POST',
      url: '/api/admin/documents',
      headers: { origin: ORIGIN, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: multipart(fields, pdf),
    })
    expect(anon.statusCode).toBe(401)
  })
})

describe('contas e relatórios', () => {
  // Ações sobre contas exigem senha confirmada há pouco (ver confirm.test.ts).
  beforeAll(() => confirm(app, admin))

  it('cria contas; e-mail repetido e senha curta são recusados', async () => {
    const payload = { email: 'Nova.Pessoa@AAGB.test', name: 'Nova Pessoa', password: 'senha-bem-comprida' }
    const created = await asAdmin('POST', '/api/admin/users', payload)
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ email: 'nova.pessoa@aagb.test', active: true })
    expect(created.body).not.toContain('passwordHash')
    expect(created.json()).not.toHaveProperty('role')
    expect((await asAdmin('POST', '/api/admin/users', payload)).statusCode).toBe(409)
    expect((await asAdmin('POST', '/api/admin/users', { ...payload, email: 'x@aagb.test', password: 'curta' })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/api/admin/users', headers: { origin: ORIGIN }, payload: { ...payload, email: 'y@aagb.test' } })).statusCode).toBe(401)
  })

  it('ninguém desativa a própria conta', async () => {
    const res = await asAdmin('PATCH', `/api/admin/users/${admin.user.id}`, { active: false })
    expect(res.statusCode).toBe(409)
  })

  it('redefinir a senha encerra as sessões da pessoa', async () => {
    const target = await loggedIn(app)
    const res = await asAdmin('PUT', `/api/admin/users/${target.user.id}/password`, { password: 'outra-senha-bem-forte' })
    expect(res.statusCode).toBe(204)
    expect((await app.inject({ url: '/api/admin/auth/me', headers: { cookie: target.cookie } })).statusCode).toBe(401)
  })

  it('auditoria não guarda dados pessoais', async () => {
    const res = await asAdmin('GET', '/api/admin/audit')
    expect(res.statusCode).toBe(200)
    expect(res.json().length).toBeGreaterThan(0)
    expect(res.body).not.toContain('Maria das Dores')
    expect(res.body).not.toContain('88999990000')
  })

  it('resumo mostra contagens e vendas sem dados pessoais', async () => {
    const res = await asAdmin('GET', '/api/admin/reports/summary')
    expect(res.statusCode).toBe(200)
    const summary = res.json()
    expect(summary.orders.length).toBeGreaterThan(0)
    expect(summary.sales.find((s: { productId: string }) => s.productId === 'mel-500g').quantity).toBeGreaterThan(0)
    expect(res.body).not.toContain('Maria das Dores')
  })
})
