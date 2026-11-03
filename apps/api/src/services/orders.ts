import type { OrderForm } from '@aagb/shared'
import { Prisma, type PrismaClient } from '@prisma/client'
import { AppError } from '../lib/errors.js'
import { protocol } from '../lib/protocol.js'

export interface OrderLineInput {
  productId: string
  quantity: number
}

/** Soma linhas repetidas do mesmo produto, para checar o estoque pelo total pedido. */
export function mergeLines(lines: OrderLineInput[]): OrderLineInput[] {
  const totals = new Map<string, number>()
  for (const { productId, quantity } of lines) totals.set(productId, (totals.get(productId) ?? 0) + quantity)
  return [...totals].map(([productId, quantity]) => ({ productId, quantity }))
}

const outOfStock = (name: string, stock: number) =>
  new AppError(409, stock > 0 ? `Só temos ${stock} de "${name}" no momento.` : `"${name}" esgotou.`)

/**
 * Cria o pedido com preço do banco. O cliente só informa produto e quantidade.
 *
 * O pedido NÃO baixa o estoque: só confere se a quantidade cabe no estoque de agora. A baixa
 * acontece quando a diretoria conclui o pedido (`changeOrderStatus`). Assim pedidos falsos não
 * esgotam a vitrine; em troca, pode haver mais pedidos do que estoque, e a diretoria decide.
 */
export async function createOrder(prisma: PrismaClient, form: OrderForm, rawLines: OrderLineInput[]) {
  const lines = mergeLines(rawLines)

  return withUniqueProtocol(() =>
    prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { id: { in: lines.map((l) => l.productId) }, active: true },
      })
      const byId = new Map(products.map((p) => [p.id, p]))

      let totalCents = 0
      for (const line of lines) {
        const product = byId.get(line.productId)
        if (!product) throw new AppError(422, 'Um dos produtos do pedido não existe mais.')
        if (line.quantity > product.stock) throw outOfStock(product.name, product.stock)
        totalCents += product.priceCents * line.quantity
      }

      const order = await tx.order.create({
        data: {
          protocol: protocol('PD'),
          name: form.name,
          phone: form.phone,
          delivery: form.delivery,
          // Endereço só é guardado quando é preciso entregar.
          address: form.delivery === 'entrega' ? form.address : '',
          totalCents,
          lines: {
            create: lines.map((line) => {
              const product = byId.get(line.productId)!
              return {
                productId: product.id,
                productName: product.name,
                unitPriceCents: product.priceCents,
                quantity: line.quantity,
              }
            }),
          },
        },
      })
      return { protocol: order.protocol }
    }),
  )
}

export type OrderStatus = 'novo' | 'em-andamento' | 'concluido' | 'cancelado'

/**
 * Muda o status do pedido e move o estoque:
 * - ao CONCLUIR, baixa o estoque de cada item com update condicional (`stock >= quantidade`);
 *   se faltar, nada muda e a resposta é 409 com o produto em falta;
 * - ao SAIR de concluído (reabrir ou cancelar), devolve os itens ao estoque;
 * - cancelado é final.
 * O status só muda se ainda for o que foi lido (evita que dois cliques simultâneos baixem duas vezes).
 */
export async function changeOrderStatus(prisma: PrismaClient, id: string, status: OrderStatus) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id }, include: { lines: true } })
    if (!order) throw new AppError(404, 'Pedido não encontrado.')
    if (order.status === 'cancelado') throw new AppError(409, 'Pedido cancelado não pode ser reaberto.')
    if (order.status === status) return order

    const { count } = await tx.order.updateMany({ where: { id, status: order.status }, data: { status } })
    if (count === 0) throw new AppError(409, 'O pedido mudou enquanto você editava. Recarregue a página.')

    if (status === 'concluido') {
      for (const line of order.lines) {
        const taken = await tx.product.updateMany({
          where: { id: line.productId, stock: { gte: line.quantity } },
          data: { stock: { decrement: line.quantity } },
        })
        if (taken.count === 0) {
          const product = await tx.product.findUniqueOrThrow({ where: { id: line.productId } })
          throw new AppError(
            409,
            `Não dá para concluir: só há ${product.stock} de "${product.name}" em estoque e o pedido pede ${line.quantity}.`,
          )
        }
      }
    } else if (order.status === 'concluido') {
      for (const line of order.lines) {
        await tx.product.update({ where: { id: line.productId }, data: { stock: { increment: line.quantity } } })
      }
    }
    return tx.order.findUniqueOrThrow({ where: { id }, include: { lines: true } })
  })
}

/** Repete a criação se o protocolo aleatório colidir (raríssimo). */
export async function withUniqueProtocol<T>(create: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await create()
    } catch (error) {
      const collided =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        String(error.meta?.target ?? '').includes('protocol')
      if (!collided || i >= attempts) throw error
    }
  }
}
