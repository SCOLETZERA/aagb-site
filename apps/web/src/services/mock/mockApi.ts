import { ApiError, type Api, type OrderLine } from '../api'
import * as data from './data'

const LATENCY_MS = 180

const delay = <T>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), LATENCY_MS))

const find = <T extends { id: string }>(list: T[], id: string) => list.find((item) => item.id === id) ?? null

const protocol = (prefix: string) => `${prefix}-${1000 + Math.floor(Math.random() * 9000)}`

function checkStock(lines: OrderLine[]) {
  for (const line of lines) {
    const product = find(data.products, line.productId)
    if (!product) throw new ApiError('Um dos produtos do pedido não existe mais.', 422)
    if (line.quantity > product.stock) {
      throw new ApiError(`Só temos ${product.stock} de "${product.name}" no momento.`, 409)
    }
  }
}

export const mockApi: Api = {
  listNews: () => delay([...data.articles].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))),
  getNews: (id) => delay(find(data.articles, id)),
  listProjects: () => delay(data.projects),
  getProject: (id) => delay(find(data.projects, id)),
  listPartners: () => delay(data.partners),
  getPartner: (id) => delay(find(data.partners, id)),
  listProducts: () => delay(data.products),
  getProduct: (id) => delay(find(data.products, id)),
  listServices: () => delay(data.services),
  listNeeds: () => delay(data.needs),
  listDonations: () => delay(data.donations),

  async submitOrder(_order, lines) {
    checkStock(lines)
    return delay({ protocol: protocol('PD') })
  },
  requestService: () => delay({ protocol: protocol('SV') }),
  offerDonation: () => delay({ protocol: protocol('DO') }),
}
