/** Formatos devolvidos pelas rotas do painel (`/api/admin`). Datas completas vêm em ISO 8601. */

export interface AdminUser {
  id: string
  email: string
  name: string
}

export const INBOX_STATUSES = ['novo', 'em-andamento', 'concluido', 'cancelado'] as const
export type InboxStatus = (typeof INBOX_STATUSES)[number]

export const STATUS_LABEL: Record<InboxStatus, string> = {
  novo: 'Novo',
  'em-andamento': 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

interface InboxBase {
  id: string
  protocol: string
  status: InboxStatus
  name: string
  createdAt: string
  /** Preenchido quando os dados pessoais foram apagados (LGPD). */
  anonymizedAt: string | null
}

export interface OrderLineRow {
  id: string
  productId: string
  productName: string
  unitPriceCents: number
  quantity: number
}

export interface OrderRow extends InboxBase {
  phone: string
  delivery: 'retirada' | 'entrega'
  address: string
  totalCents: number
  lines: OrderLineRow[]
}

export interface ServiceRequestRow extends InboxBase {
  serviceName: string
  phone: string
  locality: string
  desiredDate: string
  details: string
}

export interface DonationOfferRow extends InboxBase {
  itemName: string
  contact: string
  quantity: string
  handover: 'levar' | 'buscar'
}

export interface Account extends AdminUser {
  active: boolean
  createdAt: string
}

export interface AuditEntry {
  id: string
  action: string
  target: string
  createdAt: string
  user: { id: string; name: string } | null
}

export interface Summary {
  orders: { status: InboxStatus; count: number; totalCents: number }[]
  serviceRequests: { status: InboxStatus; count: number }[]
  donationOffers: { status: InboxStatus; count: number }[]
  sales: { productId: string; productName: string; quantity: number }[]
}
