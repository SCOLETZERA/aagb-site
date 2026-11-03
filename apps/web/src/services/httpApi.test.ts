import { ApiError } from './api'
import { createHttpApi } from './httpApi'

function fakeFetch(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

describe('httpApi', () => {
  it('chama a rota certa e devolve o JSON', async () => {
    const fetchImpl = fakeFetch(200, [{ id: 'mel-500g' }])
    const api = createHttpApi('https://api.exemplo.org/', fetchImpl)
    expect(await api.listProducts()).toEqual([{ id: 'mel-500g' }])
    expect(fetchImpl).toHaveBeenCalledWith('https://api.exemplo.org/api/products', expect.objectContaining({ credentials: 'omit' }))
  })

  it('detalhe inexistente vira null', async () => {
    const api = createHttpApi('https://api.exemplo.org', fakeFetch(404, { message: 'Notícia não encontrada.' }))
    expect(await api.getNews('nao-existe')).toBeNull()
  })

  it('erro do servidor vira ApiError com a mensagem e o status', async () => {
    const api = createHttpApi('https://api.exemplo.org', fakeFetch(409, { message: 'Só temos 3 de "Mel" no momento.' }))
    const error = await api.submitOrder({ name: 'Ana', phone: '88999990000', delivery: 'retirada', address: '' }, [
      { productId: 'mel-1kg', quantity: 5 },
    ]).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ message: 'Só temos 3 de "Mel" no momento.', status: 409 })
  })

  it('envia só produto e quantidade no pedido', async () => {
    const fetchImpl = fakeFetch(201, { protocol: 'PD-ABCDEFGH' })
    const api = createHttpApi('https://api.exemplo.org', fetchImpl)
    const lines = [{ productId: 'mel-1kg', quantity: 1, priceCents: 1 }]
    await api.submitOrder({ name: 'Ana', phone: '88999990000', delivery: 'retirada', address: '' }, lines)
    const body = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body))
    expect(body.lines).toEqual([{ productId: 'mel-1kg', quantity: 1 }])
  })

  it('falha de rede vira mensagem amigável', async () => {
    const api = createHttpApi('https://api.exemplo.org', vi.fn<typeof fetch>(async () => Promise.reject(new TypeError('Failed to fetch'))))
    await expect(api.listNews()).rejects.toThrow('Não foi possível falar com o servidor.')
  })

  it('completa o endereço dos documentos', async () => {
    const api = createHttpApi('https://api.exemplo.org', fakeFetch(200, [{ id: 'd1', url: '/api/documents/d1/file' }]))
    expect((await api.listDocuments())[0]!.url).toBe('https://api.exemplo.org/api/documents/d1/file')
  })
})
