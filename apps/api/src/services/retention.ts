import type { PrismaClient } from '@prisma/client'

export const REMOVED = '[removido]'

/** Campos pessoais de cada entrada, já com os valores que os substituem. */
export const ANONYMIZED = {
  order: { name: REMOVED, phone: '', address: '' },
  serviceRequest: { name: REMOVED, phone: '', locality: '', details: '' },
  donationOffer: { name: REMOVED, contact: '' },
} as const

/**
 * LGPD: apaga nome, telefone, e-mail, endereço e observações das entradas com mais de
 * `retentionDays` dias. O resto (o que foi pedido, quanto, quando) fica para os relatórios.
 */
export async function anonymizeExpired(prisma: PrismaClient, retentionDays: number, now = new Date()) {
  const where = { createdAt: { lt: new Date(now.getTime() - retentionDays * 86_400_000) }, anonymizedAt: null }
  const [orders, serviceRequests, donationOffers] = await prisma.$transaction([
    prisma.order.updateMany({ where, data: { ...ANONYMIZED.order, anonymizedAt: now } }),
    prisma.serviceRequest.updateMany({ where, data: { ...ANONYMIZED.serviceRequest, anonymizedAt: now } }),
    prisma.donationOffer.updateMany({ where, data: { ...ANONYMIZED.donationOffer, anonymizedAt: now } }),
  ])
  return { orders: orders.count, serviceRequests: serviceRequests.count, donationOffers: donationOffers.count }
}

/** Apaga sessões vencidas ou revogadas há mais de 30 dias (o histórico curto serve para detectar reuso de token). */
export async function purgeOldSessions(prisma: PrismaClient, now = new Date()) {
  const before = new Date(now.getTime() - 30 * 86_400_000)
  const { count } = await prisma.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: before } }, { revokedAt: { lt: before } }] },
  })
  return count
}
