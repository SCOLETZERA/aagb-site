import { useState } from 'react'
import { ResourceState, EmptyState } from '@/components/ui/States'
import { useToast } from '@/features/toast/ToastContext'
import { formatDate, formatMoney } from '@/lib/format'
import { ApiError } from '@/services/api'
import { useAdminAuth } from '../AdminAuth'
import { formatDateTime, whatsappLink } from '../format'
import { INBOX_STATUSES, STATUS_LABEL, type DonationOfferRow, type InboxStatus, type OrderRow, type ServiceRequestRow } from '../types'
import { AdminHeader, Pager, StatusBadge, useAdminResource } from '../ui'
import styles from '../admin.module.css'

type Kind = 'orders' | 'service-requests' | 'donation-offers'
type Row = OrderRow | ServiceRequestRow | DonationOfferRow

const PAGE_SIZE = 50

const TEXT: Record<Kind, { title: string; description: string; one: string; empty: string }> = {
  orders: {
    title: 'Pedidos',
    description: 'Pedidos de produtos feitos pelo site. Preço e total já vêm conferidos com o estoque.',
    one: 'pedido',
    empty: 'Nenhum pedido aqui.',
  },
  'service-requests': {
    title: 'Solicitações de serviço',
    description: 'Pedidos de aluguel de máquinas, assistência técnica, cursos e venda coletiva.',
    one: 'solicitação',
    empty: 'Nenhuma solicitação aqui.',
  },
  'donation-offers': {
    title: 'Ofertas de doação',
    description: 'Pessoas que querem doar. Combine a entrega ou a busca com elas.',
    one: 'oferta',
    empty: 'Nenhuma oferta aqui.',
  },
}

const FILTERS: { value: InboxStatus | ''; label: string }[] = [
  ...INBOX_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
  { value: '', label: 'Todos' },
]

export function InboxPage({ kind }: { kind: Kind }) {
  const [status, setStatus] = useState<InboxStatus | ''>('novo')
  const [page, setPage] = useState(1)
  const query = new URLSearchParams({ page: String(page), ...(status ? { status } : {}) })
  const list = useAdminResource<Row[]>(`/admin/${kind}?${query}`)
  const text = TEXT[kind]

  return (
    <>
      <AdminHeader title={text.title} description={text.description} />
      <div className={styles.filters} role="group" aria-label="Filtrar por situação">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            className={styles.filter}
            aria-pressed={status === f.value}
            onClick={() => {
              setStatus(f.value)
              setPage(1)
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {list.loading || list.error ? (
        <ResourceState resource={list} />
      ) : list.data!.length === 0 ? (
        <EmptyState title={text.empty} />
      ) : (
        <>
          <ul className={styles.items}>
            {list.data!.map((row) => (
              <InboxItem key={row.id} kind={kind} row={row} onChanged={list.reload} />
            ))}
          </ul>
          <Pager page={page} hasNext={list.data!.length === PAGE_SIZE} onChange={setPage} />
        </>
      )}
    </>
  )
}

function InboxItem({ kind, row, onChanged }: { kind: Kind; row: Row; onChanged(): void }) {
  const { client } = useAdminAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const removed = row.anonymizedAt !== null

  async function act(run: () => Promise<unknown>, done: string) {
    setBusy(true)
    try {
      await run()
      toast.show(done)
      onChanged()
    } catch (error) {
      toast.show(error instanceof ApiError ? error.message : 'Não foi possível salvar.')
    } finally {
      setBusy(false)
    }
  }

  function changeStatus(next: InboxStatus) {
    if (next === row.status) return
    if (kind === 'orders' && next === 'cancelado') {
      const ok = window.confirm(`Cancelar o pedido ${row.protocol}? Os itens voltam ao estoque e o pedido não pode ser reaberto.`)
      if (!ok) return
    }
    void act(
      () => client.request(`/admin/${kind}/${row.id}`, { method: 'PATCH', body: { status: next } }),
      `${row.protocol}: ${STATUS_LABEL[next].toLowerCase()}.`,
    )
  }

  function anonymize() {
    const ok = window.confirm(
      `Apagar nome, telefone, e-mail e endereço de ${row.protocol}? Use quando a pessoa pedir. Não dá para desfazer.`,
    )
    if (ok) void act(() => client.request(`/admin/${kind}/${row.id}/anonymize`, { method: 'POST' }), 'Dados pessoais apagados.')
  }

  const statusId = `status-${row.id}`

  return (
    <li className={styles.item}>
      <div className={styles.itemHead}>
        <h2 className={styles.protocol}>{row.protocol}</h2>
        <StatusBadge status={row.status} />
        <span className={styles.muted}>{formatDateTime(row.createdAt)}</span>
      </div>

      {kind === 'orders' && <OrderFacts order={row as OrderRow} removed={removed} />}
      {kind === 'service-requests' && <ServiceFacts request={row as ServiceRequestRow} removed={removed} />}
      {kind === 'donation-offers' && <DonationFacts offer={row as DonationOfferRow} removed={removed} />}

      <div className={styles.actions}>
        <label htmlFor={statusId}>Situação</label>
        <select
          id={statusId}
          value={row.status}
          disabled={busy || (kind === 'orders' && row.status === 'cancelado')}
          onChange={(e) => changeStatus(e.target.value as InboxStatus)}
        >
          {INBOX_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {!removed && (
          <button type="button" className={`${styles.linkButton} ${styles.danger}`} disabled={busy} onClick={anonymize}>
            Apagar dados pessoais
          </button>
        )}
      </div>
    </li>
  )
}

function Person({ name, contact, removed }: { name: string; contact: string; removed: boolean }) {
  if (removed) {
    return (
      <>
        <dt>Pessoa</dt>
        <dd className={styles.muted}>Dados pessoais apagados (LGPD)</dd>
      </>
    )
  }
  const wa = whatsappLink(contact)
  const isEmail = contact.includes('@')
  return (
    <>
      <dt>Nome</dt>
      <dd>{name}</dd>
      <dt>Contato</dt>
      <dd>
        {isEmail ? <a href={`mailto:${contact}`}>{contact}</a> : <a href={`tel:${contact.replace(/[^\d+]/g, '')}`}>{contact}</a>}
        {wa && (
          <>
            {' · '}
            <a href={wa} target="_blank" rel="noopener noreferrer">
              WhatsApp<span className="visually-hidden"> (abre em nova aba)</span>
            </a>
          </>
        )}
      </dd>
    </>
  )
}

function OrderFacts({ order, removed }: { order: OrderRow; removed: boolean }) {
  return (
    <>
      <dl className={styles.facts}>
        <Person name={order.name} contact={order.phone} removed={removed} />
        <dt>Receber</dt>
        <dd>{order.delivery === 'entrega' ? `Entrega${order.address ? `: ${order.address}` : ''}` : 'Retirada na sede'}</dd>
      </dl>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="visually-hidden">Itens do pedido {order.protocol}</caption>
          <thead>
            <tr>
              <th scope="col">Produto</th>
              <th scope="col" className={styles.num}>Qtd.</th>
              <th scope="col" className={styles.num}>Preço</th>
              <th scope="col" className={styles.num}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.productName}</td>
                <td className={styles.num}>{l.quantity}</td>
                <td className={styles.num}>{formatMoney(l.unitPriceCents)}</td>
                <td className={styles.num}>{formatMoney(l.unitPriceCents * l.quantity)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3}>
                <strong>Total</strong>
              </td>
              <td className={styles.num}>
                <strong>{formatMoney(order.totalCents)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  )
}

function ServiceFacts({ request, removed }: { request: ServiceRequestRow; removed: boolean }) {
  return (
    <dl className={styles.facts}>
      <dt>Serviço</dt>
      <dd>{request.serviceName}</dd>
      <Person name={request.name} contact={request.phone} removed={removed} />
      {!removed && (
        <>
          <dt>Localidade</dt>
          <dd>{request.locality}</dd>
        </>
      )}
      <dt>Data desejada</dt>
      <dd>{request.desiredDate ? formatDate(request.desiredDate.slice(0, 10)) : 'Sem preferência'}</dd>
      {!removed && request.details && (
        <>
          <dt>Detalhes</dt>
          <dd>{request.details}</dd>
        </>
      )}
    </dl>
  )
}

function DonationFacts({ offer, removed }: { offer: DonationOfferRow; removed: boolean }) {
  return (
    <dl className={styles.facts}>
      <dt>Doação</dt>
      <dd>
        {offer.itemName} · {offer.quantity}
      </dd>
      <dt>Entrega</dt>
      <dd>{offer.handover === 'levar' ? 'A pessoa leva até a sede' : 'A associação busca'}</dd>
      <Person name={offer.name} contact={offer.contact} removed={removed} />
    </dl>
  )
}
