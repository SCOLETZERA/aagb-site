import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useResource } from '@/hooks/useResource'
import { useAdminAuth } from './AdminAuth'
import { STATUS_LABEL, type InboxStatus } from './types'
import styles from './admin.module.css'

/** Título da tela do painel, com ações à direita. */
export function AdminHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  usePageTitle(`${title} · Painel`)
  return (
    <div className={styles.head}>
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions}
    </div>
  )
}

export function StatusBadge({ status }: { status: InboxStatus }) {
  return <span className={`${styles.status} ${styles[`status-${status}`]}`}>{STATUS_LABEL[status]}</span>
}

/** `useResource` com o cliente do painel. `path` é relativo a /api. */
export function useAdminResource<T>(path: string) {
  const { client } = useAdminAuth()
  return useResource<T>(`admin:${path}`, () => client.request<T>(path))
}

export function Pager({ page, hasNext, onChange }: { page: number; hasNext: boolean; onChange(page: number): void }) {
  if (page === 1 && !hasNext) return null
  return (
    <nav className={styles.pager} aria-label="Páginas">
      <Button variant="secondary" disabled={page === 1} onClick={() => onChange(page - 1)}>
        Anterior
      </Button>
      <span className={styles.muted}>Página {page}</span>
      <Button variant="secondary" disabled={!hasNext} onClick={() => onChange(page + 1)}>
        Próxima
      </Button>
    </nav>
  )
}
