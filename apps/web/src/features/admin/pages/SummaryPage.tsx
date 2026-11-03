import { Link } from 'react-router-dom'
import { ResourceState } from '@/components/ui/States'
import { formatMoney } from '@/lib/format'
import { AdminHeader, useAdminResource } from '../ui'
import { useAdminUser } from '../AdminAuth'
import type { Summary } from '../types'
import styles from '../admin.module.css'

const countOf = (rows: { status: string; count: number }[], status: string) => rows.find((r) => r.status === status)?.count ?? 0

export function SummaryPage() {
  const user = useAdminUser()
  const summary = useAdminResource<Summary>('/admin/reports/summary')
  if (summary.loading || summary.error) return <ResourceState resource={summary} />
  const s = summary.data!

  const waiting = [
    { to: '/admin/pedidos', label: 'Pedidos novos', count: countOf(s.orders, 'novo') },
    { to: '/admin/servicos', label: 'Solicitações de serviço novas', count: countOf(s.serviceRequests, 'novo') },
    { to: '/admin/doacoes', label: 'Ofertas de doação novas', count: countOf(s.donationOffers, 'novo') },
  ]
  const sold = s.orders.filter((o) => o.status !== 'cancelado').reduce((sum, o) => sum + o.totalCents, 0)
  const sales = [...s.sales].sort((a, b) => b.quantity - a.quantity)

  return (
    <>
      <AdminHeader title={`Olá, ${user.name.split(' ')[0]}`} description="O que chegou pelo site e ainda espera resposta." />

      <div className={styles.stats}>
        {waiting.map((w) => (
          <Link key={w.to} to={w.to} className={styles.stat}>
            <strong>{w.count}</strong> <span>{w.label}</span>
          </Link>
        ))}
        <div className={styles.stat}>
          <strong>{formatMoney(sold)}</strong> <span>Em pedidos não cancelados</span>
        </div>
      </div>

      <section className={styles.section} aria-labelledby="vendas">
        <h2 id="vendas">Saída por produto</h2>
        {sales.length === 0 ? (
          <p className={styles.muted}>Nenhum pedido ainda.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Produto</th>
                  <th scope="col" className={styles.num}>
                    Quantidade pedida
                  </th>
                </tr>
              </thead>
              <tbody>
                {sales.map((row) => (
                  <tr key={row.productId}>
                    <td>{row.productName}</td>
                    <td className={styles.num}>{row.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={styles.muted}>Pedidos cancelados não entram na conta.</p>
      </section>
    </>
  )
}
