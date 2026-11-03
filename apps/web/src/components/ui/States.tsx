import type { ReactNode } from 'react'
import { ButtonLink, Button } from './Button'
import { Container } from './Layout'
import styles from './States.module.css'

interface ResourceStateProps {
  resource: { loading: boolean; error: Error | null; reload(): void }
}

/** Mostra o carregamento ou o erro de um `useResource`. */
export function ResourceState({ resource }: ResourceStateProps) {
  if (resource.error) {
    return (
      <Container>
        <div className={styles.state} role="alert">
          <h2>Não foi possível carregar</h2>
          <p>{resource.error.message || 'Verifique sua conexão e tente de novo.'}</p>
          <Button onClick={resource.reload}>Tentar de novo</Button>
        </div>
      </Container>
    )
  }
  return (
    <Container>
      <div className={styles.loading} role="status">
        <span className={styles.spinner} aria-hidden="true" />
        Carregando…
      </div>
    </Container>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={styles.state}>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  )
}

export function NotFoundState({ what = 'página' }: { what?: string }) {
  return (
    <Container>
      <div className={styles.state}>
        <h1>Não encontramos esta {what}</h1>
        <p>O endereço pode ter mudado ou o conteúdo foi removido.</p>
        <ButtonLink to="/">Voltar ao início</ButtonLink>
      </div>
    </Container>
  )
}
