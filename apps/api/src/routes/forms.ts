import { donationOfferSchema, orderSchema, serviceRequestSchema } from '@aagb/shared'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError } from '../lib/errors.js'
import { protocol } from '../lib/protocol.js'
import { createOrder, withUniqueProtocol } from '../services/orders.js'

const orderBody = z.object({
  order: orderSchema,
  // Só produto e quantidade: preço e total vêm do banco. Campos extras são descartados.
  lines: z
    .array(
      z.object({
        productId: z.string().min(1).max(100),
        quantity: z.number().int('Quantidade inválida.').min(1, 'Quantidade inválida.').max(999, 'Quantidade grande demais.'),
      }),
    )
    .min(1, 'Seu carrinho está vazio.')
    .max(50, 'Pedido com itens demais.'),
})

/** Itens que não são uma necessidade cadastrada, mas que o formulário de doação oferece. */
const EXTRA_DONATION_ITEMS = new Map([
  ['outro', 'Outro item'],
  ['dinheiro', 'Doação em dinheiro'],
])

/** Formulários públicos e anônimos. O limite por IP é mais rígido que o geral. */
export async function formRoutes(app: FastifyInstance) {
  const db = app.prisma
  const rateLimit = { max: app.config.FORM_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' }

  app.post('/orders', { config: { rateLimit } }, async (req, reply) => {
    const { order, lines } = orderBody.parse(req.body)
    return reply.status(201).send(await createOrder(db, order, lines))
  })

  app.post('/service-requests', { config: { rateLimit } }, async (req, reply) => {
    const form = serviceRequestSchema.parse(req.body)
    const service = await db.serviceOffer.findUnique({ where: { id: form.serviceId } })
    if (!service) throw new AppError(422, 'Esse serviço não está mais disponível.')
    const created = await withUniqueProtocol(() =>
      db.serviceRequest.create({
        data: {
          protocol: protocol('SV'),
          serviceId: service.id,
          serviceName: service.name,
          name: form.name,
          phone: form.phone,
          locality: form.locality,
          desiredDate: form.desiredDate,
          details: form.details,
        },
      }),
    )
    return reply.status(201).send({ protocol: created.protocol })
  })

  app.post('/donation-offers', { config: { rateLimit } }, async (req, reply) => {
    const form = donationOfferSchema.parse(req.body)
    const itemName =
      EXTRA_DONATION_ITEMS.get(form.itemId) ?? (await db.need.findUnique({ where: { id: form.itemId } }))?.name
    if (!itemName) throw new AppError(422, 'Esse item não está mais na lista de necessidades.')
    const created = await withUniqueProtocol(() =>
      db.donationOffer.create({
        data: {
          protocol: protocol('DO'),
          itemId: form.itemId,
          itemName,
          name: form.name,
          contact: form.contact,
          quantity: form.quantity,
          handover: form.handover,
        },
      }),
    )
    return reply.status(201).send({ protocol: created.protocol })
  })
}
