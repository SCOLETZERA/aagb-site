import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { IconBadge, Pill, ProgressBar } from '@/components/ui/Card'
import { FormError, SelectField, TextField } from '@/components/ui/Field'
import { PrivacyNotice } from '@/components/ui/PrivacyNotice'
import { Icon } from '@/components/ui/Icon'
import { Container, PageHeader, Panel, Section } from '@/components/ui/Layout'
import { ResourceState } from '@/components/ui/States'
import { useForm } from '@/hooks/useForm'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useResource } from '@/hooks/useResource'
import { formatDate, percent } from '@/lib/format'
import { donationOfferSchema } from '@/schemas/forms'
import { api } from '@/services'
import styles from './DonationsPage.module.css'

const HANDOVER = [
  { value: 'levar', label: 'Levo até a sede da associação' },
  { value: 'buscar', label: 'Prefiro que busquem comigo' },
]

export function DonationsPage() {
  usePageTitle('Doações')
  const needs = useResource('needs', () => api.listNeeds())
  const donations = useResource('donations', () => api.listDonations())
  const form = useForm(donationOfferSchema, { itemId: '', name: '', contact: '', quantity: '', handover: 'levar' })
  const [protocol, setProtocol] = useState<string | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  if (needs.loading || needs.error) return <ResourceState resource={needs} />
  if (donations.loading || donations.error) return <ResourceState resource={donations} />
  const needList = needs.data ?? []
  const received = donations.data ?? []

  const missing = needList.filter((n) => n.received < n.goal).length
  const byCategory = new Map<string, number>()
  received.forEach((d) => byCategory.set(d.category, (byCategory.get(d.category) ?? 0) + 1))
  const ranking = [...byCategory.entries()].sort((a, b) => b[1] - a[1])
  const top = ranking[0]

  const itemOptions = [
    { value: '', label: 'Escolha o que quer doar' },
    ...needList.map((n) => ({ value: n.id, label: n.name })),
    { value: 'outro', label: 'Outro item' },
    { value: 'dinheiro', label: 'Doação em dinheiro' },
  ]
  const itemLabel = itemOptions.find((o) => o.value === form.values.itemId)?.label

  const choose = (id: string) => {
    setProtocol(null)
    form.setValue('itemId', id)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    formRef.current?.querySelector<HTMLElement>('select')?.focus({ preventScroll: true })
  }

  const send = form.handleSubmit(async (offer) => {
    const receipt = await api.offerDonation(offer)
    setProtocol(receipt.protocol)
  })

  return (
    <Container>
      <PageHeader title="Doações" description="Veja o que já foi recebido, o que ainda falta e como ajudar." />

      <dl className={styles.stats}>
        <div>
          <dt>Doações recebidas</dt>
          <dd>{received.length}</dd>
        </div>
        <div>
          <dt>Categoria mais doada</dt>
          <dd>{top?.[0] ?? '—'}</dd>
        </div>
        <div>
          <dt>Itens ainda em falta</dt>
          <dd>{missing}</dd>
        </div>
      </dl>

      <Section title="O que precisamos">
        <ul className={styles.needs}>
          {needList.map((n) => {
            const pct = percent(n.received, n.goal)
            const done = n.received >= n.goal
            return (
              <li key={n.id} className={styles.need}>
                <IconBadge name={n.icon} />
                <div className={styles.needText}>
                  <h3>{n.name}</h3>
                  <p>{done ? 'Meta alcançada' : `Faltam ${n.goal - n.received} ${n.unit}`}</p>
                </div>
                <div className={styles.needBar}>
                  <ProgressBar value={pct} label={`${n.name}: ${pct}% da meta`} />
                  <p>
                    {n.received} de {n.goal} {n.unit} ({pct}%)
                  </p>
                </div>
                <Button variant="secondary" onClick={() => choose(n.id)} disabled={done}>
                  Quero doar
                </Button>
              </li>
            )
          })}
        </ul>
      </Section>

      <div className={styles.lower}>
        <div ref={formRef}>
          <h2 className={styles.h2}>Quero fazer uma doação</h2>
          <Panel>
            {protocol ? (
              <div className={styles.done}>
                <Icon name="check" size={32} />
                <h3>Obrigado pela doação!</h3>
                <p>
                  Protocolo <strong>{protocol}</strong>. Registramos sua oferta{itemLabel ? ` de “${itemLabel}”` : ''}. A associação vai falar
                  com você pelo contato informado para combinar a entrega.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setProtocol(null)
                    form.reset()
                  }}
                >
                  Fazer outra doação
                </Button>
              </div>
            ) : (
              <form onSubmit={send} noValidate>
                <SelectField label="O que você quer doar?" options={itemOptions} {...form.field('itemId')} />
                <TextField label="Quantidade ou valor" hint="Por exemplo: 20 kg, 5 peças ou R$ 50" {...form.field('quantity')} />
                <TextField label="Seu nome" autoComplete="name" {...form.field('name')} />
                <TextField label="Telefone ou e-mail" autoComplete="email" {...form.field('contact')} />
                <SelectField label="Como será a entrega?" options={HANDOVER} {...form.field('handover')} />
                <PrivacyNotice purpose="combinar a sua doação" />
                {form.formError && <FormError>{form.formError}</FormError>}
                <Button type="submit" size="lg" disabled={form.submitting}>
                  {form.submitting ? 'Enviando…' : 'Enviar oferta de doação'}
                </Button>
              </form>
            )}
          </Panel>
        </div>

        <div>
          <h2 className={styles.h2}>Mais doados</h2>
          <Panel>
            <ul className={styles.ranking}>
              {ranking.map(([category, count]) => (
                <li key={category}>
                  <div className={styles.rankRow}>
                    <strong>{category}</strong>
                    <span>{count} {count === 1 ? 'doação' : 'doações'}</span>
                  </div>
                  <ProgressBar value={percent(count, top?.[1] ?? 1)} label={`${category}: ${count} doações`} />
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <Section title="Doações recebidas">
        <ul className={styles.history}>
          {received.map((d) => (
            <li key={d.id}>
              <div className={styles.rankRow}>
                <strong>
                  {d.item} · {d.quantity}
                </strong>
                <Pill>{d.category}</Pill>
              </div>
              <p className={styles.meta}>
                {formatDate(d.receivedAt)} · de {d.donor}
              </p>
              <p>{d.usage}</p>
            </li>
          ))}
        </ul>
      </Section>
    </Container>
  )
}
