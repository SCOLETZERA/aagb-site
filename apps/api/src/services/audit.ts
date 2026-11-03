import type { PrismaClient } from '@prisma/client'

/**
 * Registra uma ação administrativa: quem, o quê e sobre qual registro.
 * `target` é um identificador (ex.: "order:ckx…", "product:mel-500g"), nunca nome, telefone ou e-mail.
 */
export function audit(prisma: PrismaClient, userId: string | null, action: string, target: string) {
  return prisma.auditLog.create({ data: { userId, action, target } })
}
