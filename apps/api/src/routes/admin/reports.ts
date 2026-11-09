import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../../plugins/auth.js'

const auditQuery = z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1) })

/** Auditoria e resumo do painel. */
export async function reportRoutes(app: FastifyInstance) {
  const db = app.prisma

  app.get('/audit', { preHandler: requireAdmin() }, async (req) => {
    const { page } = auditQuery.parse(req.query)
    return db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      skip: (page - 1) * 100,
      include: { user: { select: { id: true, name: true } } },
    })
  })

  /** Contagens por status e vendas por produto (pedidos não cancelados). Sem dados pessoais. */
  app.get('/reports/summary', { preHandler: requireAdmin() }, async () => {
    const [orders, serviceRequests, donationOffers, sales] = await Promise.all([
      db.order.groupBy({ by: ['status'], _count: { _all: true }, _sum: { totalCents: true } }),
      db.serviceRequest.groupBy({ by: ['status'], _count: { _all: true } }),
      db.donationOffer.groupBy({ by: ['status'], _count: { _all: true } }),
      db.orderLine.groupBy({
        by: ['productId', 'productName'],
        where: { order: { status: { not: 'cancelado' } } },
        _sum: { quantity: true },
      }),
    ])
    return {
      orders: orders.map((o) => ({ status: o.status, count: o._count._all, totalCents: o._sum.totalCents ?? 0 })),
      serviceRequests: serviceRequests.map((s) => ({ status: s.status, count: s._count._all })),
      donationOffers: donationOffers.map((d) => ({ status: d.status, count: d._count._all })),
      sales: sales.map((s) => ({ productId: s.productId, productName: s.productName, quantity: s._sum.quantity ?? 0 })),
    }
  })
}
