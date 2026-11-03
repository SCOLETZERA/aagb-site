import * as sample from '@aagb/shared/sample-data'
import type { PrismaClient } from '@prisma/client'

const json = (list: string[]) => JSON.stringify(list)

/** createdAt crescente para manter a ordem original nas listas. */
const at = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 1000)

/**
 * Grava os DADOS DE EXEMPLO do front (não são dados reais da associação).
 * Apaga o conteúdo público antes; não mexe em pedidos, usuários nem auditoria.
 */
export function seedSampleData(prisma: PrismaClient) {
  return prisma.$transaction([
    prisma.article.deleteMany(),
    prisma.project.deleteMany(),
    prisma.partner.deleteMany(),
    prisma.serviceOffer.deleteMany(),
    prisma.need.deleteMany(),
    prisma.donation.deleteMany(),
    prisma.article.createMany({ data: sample.articles.map((a, i) => ({ ...a, body: json(a.body), createdAt: at(i) })) }),
    prisma.project.createMany({ data: sample.projects.map((p, i) => ({ ...p, body: json(p.body), createdAt: at(i) })) }),
    prisma.partner.createMany({ data: sample.partners.map((p, i) => ({ ...p, body: json(p.body), createdAt: at(i) })) }),
    prisma.serviceOffer.createMany({ data: sample.services.map((s, i) => ({ ...s, createdAt: at(i) })) }),
    prisma.need.createMany({ data: sample.needs.map((n, i) => ({ ...n, createdAt: at(i) })) }),
    prisma.donation.createMany({ data: sample.donations.map((d, i) => ({ ...d, createdAt: at(i) })) }),
    // Produtos podem ter pedidos ligados: atualiza em vez de apagar.
    ...sample.products.map((p, i) =>
      prisma.product.upsert({ where: { id: p.id }, create: { ...p, createdAt: at(i) }, update: { ...p, active: true } }),
    ),
  ])
}
