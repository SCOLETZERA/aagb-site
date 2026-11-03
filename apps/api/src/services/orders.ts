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
 * Cria o pedido com preço e estoque do banco. O cliente só informa produto e quantidade.
 *
 * O estoque é baixado com um update condicional (`stock >= quantidade`) dentro da transação:
 * se dois pedidos disputam o último item, só um consegue e o outro recebe 409.
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

      for (const line of lines) {
        const { count } = await tx.product.updateMany({
          where: { id: line.productId, stock: { gte: line.quantity } },
          data: { stock: { decrement: line.quantity } },
        })
        if (count === 0) {
          const fresh = await tx.product.findUniqueOrThrow({ where: { id: line.productId } })
          throw outOfStock(fresh.name, fresh.stock)
        }
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
