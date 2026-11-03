import { describe, expect, it } from 'vitest'
import type { Product } from '@/domain/types'
import { cartCount, cartReducer, cartTotal, parseStoredCart, type CartLine } from './cartReducer'

const mel: Product = {
  id: 'mel', name: 'Mel 500 g', category: 'Mel', priceCents: 1800, unit: 'pote', producer: 'X', description: '', stock: 2, icon: 'jar',
}

describe('cartReducer', () => {
  it('adiciona um produto novo e soma quantidades repetidas', () => {
    let lines = cartReducer([], { type: 'add', product: mel })
    lines = cartReducer(lines, { type: 'add', product: mel })
    expect(lines).toHaveLength(1)
    expect(lines[0]?.quantity).toBe(2)
  })

  it('não passa do estoque', () => {
    let lines: CartLine[] = []
    for (let i = 0; i < 5; i++) lines = cartReducer(lines, { type: 'add', product: mel })
    expect(lines[0]?.quantity).toBe(2)
  })

  it('não adiciona produto sem estoque', () => {
    expect(cartReducer([], { type: 'add', product: { ...mel, stock: 0 } })).toEqual([])
  })

  it('remove a linha quando a quantidade chega a zero', () => {
    const lines = cartReducer([], { type: 'add', product: mel })
    expect(cartReducer(lines, { type: 'setQuantity', productId: 'mel', quantity: 0 })).toEqual([])
  })

  it('aceita quantidades acima de 99 enquanto houver estoque', () => {
    const lines = cartReducer([], { type: 'add', product: { ...mel, stock: 500 } })
    expect(cartReducer(lines, { type: 'setQuantity', productId: 'mel', quantity: 250 })[0]?.quantity).toBe(250)
  })

  it('ignora quantidade que não é número', () => {
    const lines = cartReducer([], { type: 'add', product: mel })
    expect(cartReducer(lines, { type: 'setQuantity', productId: 'mel', quantity: NaN })).toEqual(lines)
  })

  it('calcula quantidade e total em centavos', () => {
    let lines = cartReducer([], { type: 'add', product: mel })
    lines = cartReducer(lines, { type: 'add', product: mel })
    expect(cartCount(lines)).toBe(2)
    expect(cartTotal(lines)).toBe(3600)
  })
})

describe('parseStoredCart', () => {
  it('ignora lixo e formatos inválidos', () => {
    expect(parseStoredCart(null)).toEqual([])
    expect(parseStoredCart('não é json')).toEqual([])
    expect(parseStoredCart('{"a":1}')).toEqual([])
    expect(parseStoredCart('[{"productId":"x","quantity":-3}]')).toEqual([])
  })

  it('recupera um carrinho válido', () => {
    const line: CartLine = { productId: 'mel', name: 'Mel', unit: 'pote', priceCents: 1800, quantity: 1, stock: 3 }
    expect(parseStoredCart(JSON.stringify([line]))).toEqual([line])
  })
})
