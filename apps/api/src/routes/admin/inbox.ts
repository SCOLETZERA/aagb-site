import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError, notFound } from '../../lib/errors.js'
import { adminOf, requireRole } from '../../plugins/auth.js'
import { audit } from '../../services/audit.js'
import { ANONYMIZED } from '../../services/retention.js'
import { idParams } from '../public.js'

export const INBOX_STATUSES = ['novo', 'em-andamento', 'concluido', 'cancelado'] as const

const PAGE_SIZE = 50

const listQuery = z.object({
  status: z.enum(INBOX_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
})
const statusBody = z.object({ status: z.enum(INBOX_STATUSES, 'Status inválido.') })

/**
 * Caixa de entrada do painel: pedidos, solicitações de serviço e ofertas de doação.
 * É onde a diretoria vê o que chegou (status "novo").
 */
export async function inboxRoutes(app: FastifyInstance) {
  const db = app.prisma
  app.addHook('preHandler', requireRole('admin', 'diretoria'))

  const page = (query: unknown) => {
    const { status, page } = listQuery.parse(query)
    return { where: status ? { status } : {}, orderBy: { createdAt: 'desc' as const }, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }
  }

  // ---------- Pedidos ----------

  app.get('/orders', async (req) => db.order.findMany({ ...page(req.query), include: { lines: true } }))

  /** Cancelar devolve os itens ao estoque. Um pedido cancelado não volta a ficar ativo. */
  app.patch('/orders/:id', async (req) => {
    const { id } = idParams.parse(req.params)
    const { status } = statusBody.parse(req.body)
    const updated = await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id }, include: { lines: true } })
      if (!order) throw notFound('Pedido não encontrado.')
      if (order.status === 'cancelado') throw new AppError(409, 'Pedido cancelado não pode ser reaberto.')
      const { count } = await tx.order.updateMany({ where: { id, status: { not: 'cancelado' } }, data: { status } })
      if (count === 0) throw new AppError(409, 'Pedido cancelado não pode ser reaberto.')
      if (status === 'cancelado') {
        for (const line of order.lines) {
          await tx.product.update({ where: { id: line.productId }, data: { stock: { increment: line.quantity } } })
        }
      }
      return tx.order.findUniqueOrThrow({ where: { id }, include: { lines: true } })
    })
    await audit(db, adminOf(req).id, `order.status.${status}`, `order:${id}`)
    return updated
  })

  app.post('/orders/:id/anonymize', async (req) => {
    const { id } = idParams.parse(req.params)
    const { count } = await db.order.updateMany({ where: { id }, data: { ...ANONYMIZED.order, anonymizedAt: new Date() } })
    if (count === 0) throw notFound('Pedido não encontrado.')
    await audit(db, adminOf(req).id, 'order.anonymize', `order:${id}`)
    return db.order.findUniqueOrThrow({ where: { id }, include: { lines: true } })
  })

  // ---------- Solicitações de serviço ----------

  app.get('/service-requests', async (req) => db.serviceRequest.findMany(page(req.query)))

  app.patch('/service-requests/:id', async (req) => {
    const { id } = idParams.parse(req.params)
    const { status } = statusBody.parse(req.body)
    const { count } = await db.serviceRequest.updateMany({ where: { id }, data: { status } })
    if (count === 0) throw notFound('Solicitação não encontrada.')
    await audit(db, adminOf(req).id, `service-request.status.${status}`, `service-request:${id}`)
    return db.serviceRequest.findUniqueOrThrow({ where: { id } })
  })

  app.post('/service-requests/:id/anonymize', async (req) => {
    const { id } = idParams.parse(req.params)
    const { count } = await db.serviceRequest.updateMany({
      where: { id },
      data: { ...ANONYMIZED.serviceRequest, anonymizedAt: new Date() },
    })
    if (count === 0) throw notFound('Solicitação não encontrada.')
    await audit(db, adminOf(req).id, 'service-request.anonymize', `service-request:${id}`)
    return db.serviceRequest.findUniqueOrThrow({ where: { id } })
  })

  // ---------- Ofertas de doação ----------

  app.get('/donation-offers', async (req) => db.donationOffer.findMany(page(req.query)))

  app.patch('/donation-offers/:id', async (req) => {
    const { id } = idParams.parse(req.params)
    const { status } = statusBody.parse(req.body)
    const { count } = await db.donationOffer.updateMany({ where: { id }, data: { status } })
    if (count === 0) throw notFound('Oferta de doação não encontrada.')
    await audit(db, adminOf(req).id, `donation-offer.status.${status}`, `donation-offer:${id}`)
    return db.donationOffer.findUniqueOrThrow({ where: { id } })
  })

  app.post('/donation-offers/:id/anonymize', async (req) => {
    const { id } = idParams.parse(req.params)
    const { count } = await db.donationOffer.updateMany({
      where: { id },
      data: { ...ANONYMIZED.donationOffer, anonymizedAt: new Date() },
    })
    if (count === 0) throw notFound('Oferta de doação não encontrada.')
    await audit(db, adminOf(req).id, 'donation-offer.anonymize', `donation-offer:${id}`)
    return db.donationOffer.findUniqueOrThrow({ where: { id } })
  })
}
