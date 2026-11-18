import { useState } from 'react'
import { ResourceState } from '@/components/ui/States'
import { formatDateTime } from '../format'
import { STATUS_LABEL, type AuditEntry, type InboxStatus } from '../types'
import { AdminHeader, Pager, useAdminResource } from '../ui'
import styles from '../admin.module.css'

const PAGE_SIZE = 100

const WHAT: Record<string, string> = {
  order: 'pedido',
  'service-request': 'solicitação de serviço',
  'donation-offer': 'oferta de doação',
  news: 'notícia',
  projects: 'projeto',
  partners: 'parceiro',
  products: 'produto',
  services: 'serviço',
  needs: 'necessidade',
  donations: 'doação recebida',
  documents: 'documento',
  users: 'conta',
}

const VERB: Record<string, string> = {
  create: 'cadastrou',
  update: 'editou',
  delete: 'excluiu',
  anonymize: 'apagou os dados pessoais de',
  'password-reset': 'trocou a senha de',
  'cli-upsert': 'criou pelo terminal a',
}

/** "order.status.cancelado" → "mudou pedido para Cancelado"; "products.update" → "editou produto". */
export function describeAction(action: string): string {
  if (action === 'auth.login') return 'entrou no painel'
  if (action === 'auth.confirm') return 'confirmou a senha'
  const [what = '', verb = '', extra] = action.split('.')
  const noun = WHAT[what] ?? what
  if (verb === 'status' && extra) return `mudou ${noun} para ${STATUS_LABEL[extra as InboxStatus] ?? extra}`
  return `${VERB[verb] ?? verb} ${noun}`.trim()
}

export function AuditPage() {
  const [page, setPage] = useState(1)
  const log = useAdminResource<AuditEntry[]>(`/admin/audit?page=${page}`)

  return (
    <>
      <AdminHeader
        title="Auditoria"
        description="Quem fez o quê no painel. O registro guarda só identificadores, nunca nome ou telefone de quem fez pedido."
      />
      {log.loading || log.error ? (
        <ResourceState resource={log} />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Quando</th>
                  <th scope="col">Quem</th>
                  <th scope="col">O quê</th>
                  <th scope="col">Registro</th>
                </tr>
              </thead>
              <tbody>
                {log.data!.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDateTime(e.createdAt)}</td>
                    <td>{e.user?.name ?? 'Sistema'}</td>
                    <td>{describeAction(e.action)}</td>
                    <td className={styles.muted}>{e.target}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} hasNext={log.data!.length === PAGE_SIZE} onChange={setPage} />
        </>
      )}
    </>
  )
}
