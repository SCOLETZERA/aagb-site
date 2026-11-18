import { Icon } from '@/components/ui/Icon'
import { Container, PageHeader } from '@/components/ui/Layout'
import { ResourceState } from '@/components/ui/States'
import { DOCUMENT_CATEGORIES } from '@/domain/types'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useResource } from '@/hooks/useResource'
import { formatDate } from '@/lib/format'
import { api } from '@/services'
import styles from './TransparencyPage.module.css'

export function TransparencyPage() {
  usePageTitle('Transparência')
  const documents = useResource('documents', () => api.listDocuments())
  if (documents.loading || documents.error) return <ResourceState resource={documents} />
  const all = documents.data ?? []

  return (
    <Container>
      <PageHeader
        title="Transparência"
        description="Aqui a associação publica a prestação de contas, os convênios, os editais e as atas, para qualquer pessoa consultar."
      />
      <div className={styles.groups}>
        {DOCUMENT_CATEGORIES.map((category) => {
          const items = all.filter((d) => d.category === category.id)
          return (
            <section key={category.id} className={styles.group} aria-labelledby={`cat-${category.id}`}>
              <h2 id={`cat-${category.id}`}>{category.label}</h2>
              <p className={styles.hint}>{category.hint}</p>
              {items.length === 0 ? (
                <p className={styles.empty}>Nenhum documento publicado ainda.</p>
              ) : (
                <ul className={styles.list}>
                  {items.map((d) => (
                    <li key={d.id}>
                      <a href={d.url} target="_blank" rel="noopener noreferrer">
                        <Icon name="clip" size={20} />
                        <span>{d.title}</span>
                        <span className={styles.date}>{formatDate(d.publishedAt, 'short')}</span>
                        {' '}
                        <span className="visually-hidden">(abre em nova aba)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </Container>
  )
}
