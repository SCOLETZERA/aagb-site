import type { TransparencyDocument } from '@/domain/types'
import { ApiError, type Api } from './api'

/** Converte a resposta de erro da API (`{ message, fields? }`) em `ApiError`. */
export async function errorFrom(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as { message?: unknown; fields?: unknown } | null
  const message = typeof body?.message === 'string' ? body.message : 'Algo deu errado. Tente novamente.'
  const fields = body?.fields && typeof body.fields === 'object' ? (body.fields as Record<string, string>) : {}
  return new ApiError(message, res.status, fields)
}

/**
 * Implementação de `Api` que conversa com o back-end (`apps/api`).
 * As rotas públicas não usam cookies: `credentials: 'omit'`.
 */
export function createHttpApi(baseUrl: string, fetchImpl: typeof fetch = (...args) => fetch(...args)): Api {
  const base = baseUrl.replace(/\/+$/, '')

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response
    try {
      res = await fetchImpl(`${base}/api${path}`, {
        credentials: 'omit',
        ...init,
        headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
      })
    } catch {
      throw new ApiError('Não foi possível falar com o servidor. Confira sua internet e tente de novo.', 0)
    }
    if (!res.ok) throw await errorFrom(res)
    return (await res.json()) as T
  }

  /** Para os detalhes: 404 vira `null`, como no mock. */
  async function find<T>(path: string): Promise<T | null> {
    try {
      return await request<T>(path)
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null
      throw error
    }
  }

  const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) })
  const id = encodeURIComponent

  return {
    listNews: () => request('/news'),
    getNews: (newsId) => find(`/news/${id(newsId)}`),
    listProjects: () => request('/projects'),
    getProject: (projectId) => find(`/projects/${id(projectId)}`),
    listPartners: () => request('/partners'),
    getPartner: (partnerId) => find(`/partners/${id(partnerId)}`),
    listProducts: () => request('/products'),
    getProduct: (productId) => find(`/products/${id(productId)}`),
    listServices: () => request('/services'),
    listNeeds: () => request('/needs'),
    listDonations: () => request('/donations'),
    // O servidor devolve o caminho do arquivo; o link precisa do endereço completo da API.
    listDocuments: async () =>
      (await request<TransparencyDocument[]>('/documents')).map((doc) => ({ ...doc, url: `${base}${doc.url}` })),
    submitOrder: (order, lines) =>
      post('/orders', { order, lines: lines.map(({ productId, quantity }) => ({ productId, quantity })) }),
    requestService: (serviceRequest) => post('/service-requests', serviceRequest),
    offerDonation: (offer) => post('/donation-offers', offer),
  }
}
