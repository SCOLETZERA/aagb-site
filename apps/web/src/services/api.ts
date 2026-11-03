import type {
  Article,
  Donation,
  Need,
  Partner,
  Product,
  Project,
  Receipt,
  ServiceOffer,
  TransparencyDocument,
} from '@/domain/types'
import type { DonationOfferForm, OrderForm, ServiceRequestForm } from '@/schemas/forms'

export interface OrderLine {
  productId: string
  quantity: number
}

/**
 * Contrato entre o front-end e o back-end.
 *
 * Hoje é implementado por `mockApi` (dados em memória). Quando a API Fastify existir,
 * basta criar `httpApi` com esta mesma interface e trocá-la em `services/index.ts`:
 * nenhuma página precisa mudar.
 */
export interface Api {
  listNews(): Promise<Article[]>
  getNews(id: string): Promise<Article | null>
  listProjects(): Promise<Project[]>
  getProject(id: string): Promise<Project | null>
  listPartners(): Promise<Partner[]>
  getPartner(id: string): Promise<Partner | null>
  listProducts(): Promise<Product[]>
  getProduct(id: string): Promise<Product | null>
  listServices(): Promise<ServiceOffer[]>
  listNeeds(): Promise<Need[]>
  listDonations(): Promise<Donation[]>
  listDocuments(): Promise<TransparencyDocument[]>
  submitOrder(order: OrderForm, lines: OrderLine[]): Promise<Receipt>
  requestService(request: ServiceRequestForm): Promise<Receipt>
  offerDonation(offer: DonationOfferForm): Promise<Receipt>
}

export class ApiError extends Error {
  readonly status: number
  /** Erro de cada campo, quando o servidor recusa os dados (status 400). */
  readonly fields: Record<string, string>
  constructor(message: string, status = 500, fields: Record<string, string> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields
  }
}
