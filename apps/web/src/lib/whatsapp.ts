import type { CartLine } from '@/features/cart/cartReducer'
import type { OrderForm } from '@/schemas/forms'
import { formatMoney } from './format'

/** Só aceita um número plausível (10 a 15 dígitos); qualquer outra coisa desliga o recurso. */
export function whatsappNumber(raw: string | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 15 ? digits : null
}

export function orderMessage(order: OrderForm, lines: CartLine[], totalCents: number): string {
  const items = lines.map((l) => `• ${l.quantity}× ${l.name} (${formatMoney(l.priceCents)})`).join('\n')
  const how = order.delivery === 'entrega' ? `Receber em casa: ${order.address}` : 'Retirar na sede da associação'
  return [
    'Olá! Quero fazer um pedido pelo site da AAGB:',
    items,
    `Total estimado: ${formatMoney(totalCents)}`,
    how,
    `Nome: ${order.name}`,
    `Telefone: ${order.phone}`,
  ].join('\n')
}

export const whatsappUrl = (number: string, text: string) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`
