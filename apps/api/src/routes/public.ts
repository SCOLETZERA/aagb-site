import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { notFound } from '../lib/errors.js'
import {
  toArticle,
  toDocument,
  toDonation,
  toNeed,
  toPartner,
  toProduct,
  toProject,
  toService,
} from '../lib/mappers.js'

export const idParams = z.object({ id: z.string().min(1).max(100) })

/** Conteúdo público, só leitura. */
export async function publicRoutes(app: FastifyInstance) {
  const db = app.prisma

  app.get('/news', async () => (await db.article.findMany({ orderBy: { publishedAt: 'desc' } })).map(toArticle))
  app.get('/news/:id', async (req) => {
    const row = await db.article.findUnique({ where: idParams.parse(req.params) })
    if (!row) throw notFound('Notícia não encontrada.')
    return toArticle(row)
  })

  app.get('/projects', async () => (await db.project.findMany({ orderBy: { createdAt: 'asc' } })).map(toProject))
  app.get('/projects/:id', async (req) => {
    const row = await db.project.findUnique({ where: idParams.parse(req.params) })
    if (!row) throw notFound('Projeto não encontrado.')
    return toProject(row)
  })

  app.get('/partners', async () => (await db.partner.findMany({ orderBy: { createdAt: 'asc' } })).map(toPartner))
  app.get('/partners/:id', async (req) => {
    const row = await db.partner.findUnique({ where: idParams.parse(req.params) })
    if (!row) throw notFound('Parceiro não encontrado.')
    return toPartner(row)
  })

  app.get('/products', async () =>
    (await db.product.findMany({ where: { active: true }, orderBy: { createdAt: 'asc' } })).map(toProduct),
  )
  app.get('/products/:id', async (req) => {
    const row = await db.product.findFirst({ where: { ...idParams.parse(req.params), active: true } })
    if (!row) throw notFound('Produto não encontrado.')
    return toProduct(row)
  })

  app.get('/services', async () => (await db.serviceOffer.findMany({ orderBy: { createdAt: 'asc' } })).map(toService))
  app.get('/needs', async () => (await db.need.findMany({ orderBy: { createdAt: 'asc' } })).map(toNeed))
  app.get('/donations', async () =>
    (await db.donation.findMany({ orderBy: { receivedAt: 'desc' } })).map(toDonation),
  )
  app.get('/documents', async () =>
    (await db.transparencyDocument.findMany({ orderBy: { publishedAt: 'desc' } })).map(toDocument),
  )
}
