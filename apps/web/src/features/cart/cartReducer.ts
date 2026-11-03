import type { Product } from '@/domain/types'

export interface CartLine {
  productId: string
  name: string
  unit: string
  priceCents: number
  quantity: number
  /** Estoque conhecido quando o item foi adicionado; a API valida de novo no pedido. */
  stock: number
}

export type CartAction =
  | { type: 'add'; product: Product }
  | { type: 'setQuantity'; productId: string; quantity: number }
  | { type: 'remove'; productId: string }
  | { type: 'clear' }

export const MAX_PER_LINE = 99

export function cartReducer(lines: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case 'add': {
      const { product } = action
      const existing = lines.find((l) => l.productId === product.id)
      if (existing) {
        const quantity = Math.min(existing.quantity + 1, product.stock, MAX_PER_LINE)
        return lines.map((l) => (l.productId === product.id ? { ...l, quantity, stock: product.stock } : l))
      }
      if (product.stock < 1) return lines
      return [
        ...lines,
        {
          productId: product.id,
          name: product.name,
          unit: product.unit,
          priceCents: product.priceCents,
          quantity: 1,
          stock: product.stock,
        },
      ]
    }
    case 'setQuantity':
      return lines
        .map((l) =>
          l.productId === action.productId
            ? { ...l, quantity: Math.min(Math.floor(action.quantity), l.stock, MAX_PER_LINE) }
            : l,
        )
        .filter((l) => l.quantity > 0)
    case 'remove':
      return lines.filter((l) => l.productId !== action.productId)
    case 'clear':
      return []
  }
}

export const cartCount = (lines: CartLine[]) => lines.reduce((sum, l) => sum + l.quantity, 0)
export const cartTotal = (lines: CartLine[]) => lines.reduce((sum, l) => sum + l.quantity * l.priceCents, 0)

/** Lê o carrinho salvo, descartando qualquer dado que não tenha o formato esperado. */
export function parseStoredCart(raw: string | null): CartLine[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (l): l is CartLine =>
        typeof l === 'object' &&
        l !== null &&
        typeof l.productId === 'string' &&
        typeof l.name === 'string' &&
        typeof l.unit === 'string' &&
        Number.isInteger(l.priceCents) &&
        Number.isInteger(l.quantity) &&
        l.quantity > 0 &&
        Number.isInteger(l.stock),
    )
  } catch {
    return []
  }
}
