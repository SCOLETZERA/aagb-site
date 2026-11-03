import { ApiError } from '@/services/api'
import { createAdminClient } from './adminClient'

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('adminClient', () => {
  it('envia cookies e JSON', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json(200, { ok: true }))
    const client = createAdminClient('http://api.test', () => undefined, fetchImpl)
    await client.request('/admin/orders/x', { method: 'PATCH', body: { status: 'concluido' } })
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('http://api.test/api/admin/orders/x')
    expect(init).toMatchObject({ method: 'PATCH', credentials: 'include', body: '{"status":"concluido"}' })
    expect((init!.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('com 401 renova a sessão uma vez e repete', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(401, { message: 'expirou' }))
      .mockResolvedValueOnce(json(200, { user: {} }))
      .mockResolvedValueOnce(json(200, [1, 2]))
    const client = createAdminClient('http://api.test', () => undefined, fetchImpl)
    expect(await client.request('/admin/orders')).toEqual([1, 2])
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'http://api.test/api/admin/orders',
      'http://api.test/api/admin/auth/refresh',
      'http://api.test/api/admin/orders',
    ])
  })

  it('várias requisições com 401 ao mesmo tempo disparam um único refresh', async () => {
    let expired = true
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        await new Promise((r) => setTimeout(r, 10))
        expired = false
        return json(200, {})
      }
      return expired ? json(401, { message: 'expirou' }) : json(200, [])
    })
    const client = createAdminClient('http://api.test', () => undefined, fetchImpl)
    await Promise.all([client.request('/admin/orders'), client.request('/admin/service-requests'), client.request('/admin/audit')])
    expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(1)
  })

  it('se o refresh falha, avisa que a sessão acabou e repassa o erro', async () => {
    const onSessionLost = vi.fn()
    const fetchImpl = vi.fn<typeof fetch>(async () => json(401, { message: 'Sua sessão expirou. Entre de novo.' }))
    const client = createAdminClient('http://api.test', onSessionLost, fetchImpl)
    await expect(client.request('/admin/orders')).rejects.toMatchObject({ status: 401 })
    expect(onSessionLost).toHaveBeenCalledOnce()
  })

  it('erro de validação traz o erro de cada campo', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json(400, { message: 'Campo obrigatório.', fields: { title: 'Campo obrigatório.' } }))
    const client = createAdminClient('http://api.test', () => undefined, fetchImpl)
    const error = await client.request('/admin/content/news', { method: 'POST', body: {} }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).fields).toEqual({ title: 'Campo obrigatório.' })
  })

  it('upload vai como multipart, sem Content-Type manual', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json(201, {}))
    const client = createAdminClient('http://api.test', () => undefined, fetchImpl)
    const form = new FormData()
    form.append('title', 'Ata')
    await client.request('/admin/documents', { method: 'POST', body: form })
    const init = fetchImpl.mock.calls[0]![1]!
    expect(init.body).toBe(form)
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })
})
