import type { IconName } from '@/components/ui/icon-paths'

/** Tipos de domínio. O back-end (Fastify + Prisma) deve devolver exatamente estes formatos. */

export type Id = string

export interface Article {
  id: Id
  title: string
  /** Data ISO 8601 (AAAA-MM-DD). */
  publishedAt: string
  summary: string
  body: string[]
  icon: IconName
  /** Caminho ou URL da imagem de capa. */
  image?: string
  imageAlt?: string
}

export type ProjectStatus = 'em-andamento' | 'planejado' | 'concluido'

export interface Project {
  id: Id
  title: string
  status: ProjectStatus
  summary: string
  body: string[]
  icon: IconName
}

export interface Partner {
  id: Id
  name: string
  kind: string
  summary: string
  body: string[]
  icon: IconName
}

export const PRODUCT_CATEGORIES = ['Mel', 'Hortaliças', 'Grãos', 'Laticínios', 'Mudas'] as const
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]

export interface Product {
  id: Id
  name: string
  category: ProductCategory
  /** Preço em centavos, para evitar erro de ponto flutuante. */
  priceCents: number
  unit: string
  producer: string
  description: string
  stock: number
  icon: IconName
}

export interface ServiceOffer {
  id: Id
  name: string
  priceLabel: string
  leadTime: string
  audience: string
  description: string
  icon: IconName
}

export interface Need {
  id: Id
  name: string
  unit: string
  goal: number
  received: number
  icon: IconName
}

export interface Donation {
  id: Id
  receivedAt: string
  donor: string
  item: string
  quantity: string
  category: string
  usage: string
}

export const DOCUMENT_CATEGORIES = [
  { id: 'prestacao-de-contas', label: 'Prestação de contas', hint: 'Relatórios financeiros e de atividades da diretoria.' },
  { id: 'convenio', label: 'Convênios e parcerias', hint: 'Convênios públicos e parcerias com órgãos de governo.' },
  { id: 'edital', label: 'Editais', hint: 'Editais e chamadas públicas, como as do PAA e do PNAE.' },
  { id: 'ata', label: 'Atas e estatuto', hint: 'Atas de assembleia e documentos de formação da associação.' },
] as const
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]['id']

export interface TransparencyDocument {
  id: Id
  title: string
  category: DocumentCategory
  publishedAt: string
  /** Endereço do arquivo (PDF) para download. */
  url: string
}

export interface Receipt {
  /** Número de protocolo mostrado ao usuário (ex.: PD-1234). */
  protocol: string
}
