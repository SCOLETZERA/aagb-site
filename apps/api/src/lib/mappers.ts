import type {
  Article,
  Donation,
  DocumentCategory,
  IconName,
  Need,
  Partner,
  Product,
  ProductCategory,
  Project,
  ProjectStatus,
  ServiceOffer,
  TransparencyDocument,
} from '@aagb/shared'
import type * as Db from '@prisma/client'

/** Converte linhas do banco nos formatos de `@aagb/shared`. Os textos fixos já foram validados na escrita. */

const list = (json: string): string[] => JSON.parse(json) as string[]

export const toArticle = (a: Db.Article): Article => ({
  id: a.id,
  title: a.title,
  publishedAt: a.publishedAt,
  summary: a.summary,
  body: list(a.body),
  icon: a.icon as IconName,
  ...(a.image ? { image: a.image } : {}),
  ...(a.imageAlt ? { imageAlt: a.imageAlt } : {}),
})

export const toProject = (p: Db.Project): Project => ({
  id: p.id,
  title: p.title,
  status: p.status as ProjectStatus,
  summary: p.summary,
  body: list(p.body),
  icon: p.icon as IconName,
})

export const toPartner = (p: Db.Partner): Partner => ({
  id: p.id,
  name: p.name,
  kind: p.kind,
  summary: p.summary,
  body: list(p.body),
  icon: p.icon as IconName,
})

export const toProduct = (p: Db.Product): Product => ({
  id: p.id,
  name: p.name,
  category: p.category as ProductCategory,
  priceCents: p.priceCents,
  unit: p.unit,
  producer: p.producer,
  description: p.description,
  stock: p.stock,
  icon: p.icon as IconName,
})

export const toService = (s: Db.ServiceOffer): ServiceOffer => ({
  id: s.id,
  name: s.name,
  priceLabel: s.priceLabel,
  leadTime: s.leadTime,
  audience: s.audience,
  description: s.description,
  icon: s.icon as IconName,
})

export const toNeed = (n: Db.Need): Need => ({
  id: n.id,
  name: n.name,
  unit: n.unit,
  goal: n.goal,
  received: n.received,
  icon: n.icon as IconName,
})

export const toDonation = (d: Db.Donation): Donation => ({
  id: d.id,
  receivedAt: d.receivedAt,
  donor: d.donor,
  item: d.item,
  quantity: d.quantity,
  category: d.category,
  usage: d.usage,
})

export const toDocument = (d: Db.TransparencyDocument): TransparencyDocument => ({
  id: d.id,
  title: d.title,
  category: d.category as DocumentCategory,
  publishedAt: d.publishedAt,
  url: `/api/documents/${encodeURIComponent(d.id)}/file`,
})
