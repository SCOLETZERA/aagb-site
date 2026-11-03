import type { DocumentCategory, IconName, ProductCategory, ProjectStatus } from './catalog.js'

/** Tipos de domínio. A API devolve exatamente estes formatos e o front os consome. */

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
