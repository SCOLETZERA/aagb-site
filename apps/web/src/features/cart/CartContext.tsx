import { createContext, use, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import type { Product } from '@/domain/types'
import { cartCount, cartReducer, cartTotal, parseStoredCart, type CartLine } from './cartReducer'

const STORAGE_KEY = 'aagb-cart'

interface CartContextValue {
  state: { lines: CartLine[]; count: number; totalCents: number }
  actions: {
    add(product: Product): void
    setQuantity(productId: string, quantity: number): void
    remove(productId: string): void
    clear(): void
  }
  meta: { isOpen: boolean; open(): void; close(): void }
}

const CartContext = createContext<CartContextValue | null>(null)

function loadInitial(): CartLine[] {
  try {
    return parseStoredCart(localStorage.getItem(STORAGE_KEY))
  } catch {
    return []
  }
}

/** Único lugar que sabe como o carrinho é guardado; as telas só usam `useCart()`. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(cartReducer, undefined, loadInitial)
  const [isOpen, setOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
    } catch {
      /* armazenamento indisponível: o carrinho vale só para esta visita */
    }
  }, [lines])

  const value = useMemo<CartContextValue>(
    () => ({
      state: { lines, count: cartCount(lines), totalCents: cartTotal(lines) },
      actions: {
        add: (product) => dispatch({ type: 'add', product }),
        setQuantity: (productId, quantity) => dispatch({ type: 'setQuantity', productId, quantity }),
        remove: (productId) => dispatch({ type: 'remove', productId }),
        clear: () => dispatch({ type: 'clear' }),
      },
      meta: { isOpen, open: () => setOpen(true), close: () => setOpen(false) },
    }),
    [lines, isOpen],
  )

  return <CartContext value={value}>{children}</CartContext>
}

export function useCart() {
  const ctx = use(CartContext)
  if (!ctx) throw new Error('useCart precisa estar dentro de <CartProvider>.')
  return ctx
}
