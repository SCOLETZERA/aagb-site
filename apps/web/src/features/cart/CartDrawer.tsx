import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { FormError, SelectField, TextField } from '@/components/ui/Field'
import { PrivacyNotice } from '@/components/ui/PrivacyNotice'
import { Drawer } from '@/components/ui/Drawer'
import { Icon } from '@/components/ui/Icon'
import { formatMoney } from '@/lib/format'
import { useForm } from '@/hooks/useForm'
import { orderMessage, whatsappNumber, whatsappUrl } from '@/lib/whatsapp'
import { orderSchema } from '@/schemas/forms'
import { api } from '@/services'
import { useCart } from './CartContext'
import styles from './CartDrawer.module.css'

const DELIVERY_OPTIONS = [
  { value: 'retirada', label: 'Retirar na sede da associação' },
  { value: 'entrega', label: 'Receber em casa' },
]

export function CartDrawer() {
  const { state, actions, meta } = useCart()
  const [protocol, setProtocol] = useState<string | null>(null)
  const form = useForm(orderSchema, { name: '', phone: '', delivery: 'retirada', address: '' })

  const send = form.handleSubmit(async (order) => {
    const lines = state.lines.map((l) => ({ productId: l.productId, quantity: l.quantity }))
    const receipt = await api.submitOrder(order, lines)
    actions.clear()
    form.reset()
    setProtocol(receipt.protocol)
  })

  const whatsapp = whatsappNumber(import.meta.env.VITE_WHATSAPP_NUMBER)

  /** O pedido segue pelo WhatsApp do próprio usuário; só abrimos a conversa com a mensagem pronta. */
  const sendWhatsapp = form.handleSubmit((order) => {
    if (!whatsapp) return
    window.open(whatsappUrl(whatsapp, orderMessage(order, state.lines, state.totalCents)), '_blank', 'noopener,noreferrer')
  })

  return (
    <Drawer open={meta.isOpen} onClose={meta.close} title="Seu pedido">
      {state.lines.length === 0 && protocol && (
        <div className={styles.done}>
          <Icon name="check" size={32} />
          <h3>Pedido enviado</h3>
          <p>
            Protocolo <strong>{protocol}</strong>. A associação vai confirmar a disponibilidade e combinar a entrega com você pelo telefone
            informado.
          </p>
          <Button variant="secondary" onClick={() => setProtocol(null)}>
            Fazer outro pedido
          </Button>
        </div>
      )}

      {state.lines.length === 0 && !protocol && (
        <div className={styles.empty}>
          <p>Seu carrinho está vazio.</p>
          <Link to="/produtos" onClick={meta.close} className={styles.browse}>
            Ver produtos
          </Link>
        </div>
      )}

      {state.lines.length > 0 && (
        <>
          <ul className={styles.lines}>
            {state.lines.map((line) => (
              <li key={line.productId} className={styles.line}>
                <div>
                  <strong>{line.name}</strong>
                  <p className={styles.sub}>
                    {formatMoney(line.priceCents)} · {line.unit}
                  </p>
                </div>
                <div className={styles.qty} role="group" aria-label={`Quantidade de ${line.name}`}>
                  <button type="button" onClick={() => actions.setQuantity(line.productId, line.quantity - 1)} aria-label="Diminuir">
                    <Icon name="minus" size={18} />
                  </button>
                  <span aria-live="polite">{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() => actions.setQuantity(line.productId, line.quantity + 1)}
                    disabled={line.quantity >= line.stock}
                    aria-label="Aumentar"
                  >
                    <Icon name="plus" size={18} />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <p className={styles.total}>
            <span>Total</span>
            <strong>{formatMoney(state.totalCents)}</strong>
          </p>

          <form onSubmit={send} noValidate>
            <TextField label="Seu nome" autoComplete="name" {...form.field('name')} />
            <TextField label="Telefone ou WhatsApp" type="tel" autoComplete="tel" inputMode="tel" {...form.field('phone')} />
            <SelectField label="Como prefere receber?" options={DELIVERY_OPTIONS} {...form.field('delivery')} />
            {form.values.delivery === 'entrega' && (
              <TextField label="Endereço para entrega" autoComplete="street-address" {...form.field('address')} />
            )}
            <PrivacyNotice purpose="combinar a retirada ou a entrega do seu pedido" />
            {form.formError && <FormError>{form.formError}</FormError>}
            <Button type="submit" fullWidth size="lg" disabled={form.submitting}>
              {form.submitting ? 'Enviando…' : 'Enviar pedido'}
            </Button>
            {whatsapp && (
              <Button variant="secondary" fullWidth className={styles.second} onClick={sendWhatsapp} disabled={form.submitting}>
                Enviar pelo WhatsApp
                <span className="visually-hidden"> (abre em nova aba)</span>
              </Button>
            )}
            <p className={styles.note}>Não há pagamento online. A associação combina o valor e a entrega com você.</p>
          </form>
        </>
      )}
    </Drawer>
  )
}
