import { describe, expect, it } from 'vitest'
import type { CartLine } from '@/features/cart/cartReducer'
import { orderMessage, whatsappNumber, whatsappUrl } from './whatsapp'

const lines: CartLine[] = [{ productId: 'mel', name: 'Mel puro 500 g', unit: 'pote', priceCents: 1800, quantity: 2, stock: 5 }]

describe('whatsappNumber', () => {
  it('aceita números plausíveis e ignora formatação', () => {
    expect(whatsappNumber('+55 (88) 99999-0000')).toBe('5588999990000')
  })

  it('desliga o recurso quando falta ou é inválido', () => {
    expect(whatsappNumber(undefined)).toBeNull()
    expect(whatsappNumber('')).toBeNull()
    expect(whatsappNumber('12345')).toBeNull()
  })
})

describe('orderMessage', () => {
  it('lista itens, total e forma de recebimento', () => {
    const text = orderMessage({ name: 'Maria', phone: '88999990000', delivery: 'retirada', address: '' }, lines, 3600)
    expect(text).toContain('2× Mel puro 500 g')
    expect(text).toContain('Retirar na sede')
    expect(text).toMatch(/36,00/)
  })

  it('inclui o endereço quando a entrega é em casa', () => {
    const text = orderMessage({ name: 'Maria', phone: '88999990000', delivery: 'entrega', address: 'Rua A, 10' }, lines, 3600)
    expect(text).toContain('Rua A, 10')
  })
})

describe('whatsappUrl', () => {
  it('codifica o texto para a URL', () => {
    expect(whatsappUrl('5588999990000', 'olá & tchau')).toBe('https://wa.me/5588999990000?text=ol%C3%A1%20%26%20tchau')
  })
})
