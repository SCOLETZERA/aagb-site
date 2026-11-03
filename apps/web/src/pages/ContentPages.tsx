import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { LinkCard, Pill } from '@/components/ui/Card'
import { TextField } from '@/components/ui/Field'
import { Container, PageHeader } from '@/components/ui/Layout'
import { EmptyState, NotFoundState, ResourceState } from '@/components/ui/States'
import type { ProjectStatus } from '@/domain/types'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useResource } from '@/hooks/useResource'
import { formatDate } from '@/lib/format'
import { api } from '@/services'
import { DetailLayout } from './DetailLayout'
import styles from './ContentPages.module.css'

const STATUS_LABEL: Record<ProjectStatus, string> = {
  'em-andamento': 'Em andamento',
  planejado: 'Planejado',
  concluido: 'Concluído',
}

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/* ---------- Notícias ---------- */

export function NewsListPage() {
  usePageTitle('Notícias')
  const news = useResource('news', () => api.listNews())
  const [query, setQuery] = useState('')

  if (news.loading || news.error) return <ResourceState resource={news} />
  const q = normalize(query.trim())
  const items = (news.data ?? []).filter((a) => !q || normalize(`${a.title} ${a.summary}`).includes(q))

  return (
    <Container>
      <PageHeader title="Notícias" description="O que acontece na associação e nas comunidades de Bálsamos." />
      <div className={styles.search}>
        <TextField label="Buscar notícias" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {items.length === 0 ? (
        <EmptyState title="Nenhuma notícia encontrada">Tente buscar por outra palavra.</EmptyState>
      ) : (
        <div className={styles.grid}>
          {items.map((a) => (
            <LinkCard
              key={a.id}
              to={`/noticias/${a.id}`}
              title={a.title}
              summary={a.summary}
              icon={a.icon}
              image={a.image}
              imageAlt={a.imageAlt}
              badge={<span className={styles.date}>{formatDate(a.publishedAt)}</span>}
            />
          ))}
        </div>
      )}
    </Container>
  )
}

export function NewsDetailPage() {
  const { id = '' } = useParams()
  const article = useResource(`news:${id}`, () => api.getNews(id))
  const all = useResource('news', () => api.listNews())
  usePageTitle(article.data?.title)

  if (article.loading || article.error) return <ResourceState resource={article} />
  const a = article.data
  if (!a) return <NotFoundState what="notícia" />

  return (
    <DetailLayout
      backTo="/noticias"
      backLabel="Notícias"
      title={a.title}
      lead={a.summary}
      paragraphs={a.body}
      icon={a.icon}
      image={a.image}
      imageAlt={a.imageAlt}
      pill={formatDate(a.publishedAt)}
      related={
        <>
          <h2>Outras notícias</h2>
          {(all.data ?? [])
            .filter((x) => x.id !== a.id)
            .slice(0, 3)
            .map((x) => (
              <LinkCard key={x.id} to={`/noticias/${x.id}`} title={x.title} summary={x.summary} icon={x.icon} />
            ))}
        </>
      }
    />
  )
}

/* ---------- Projetos ---------- */

export function ProjectsListPage() {
  usePageTitle('Projetos')
  const projects = useResource('projects', () => api.listProjects())
  if (projects.loading || projects.error) return <ResourceState resource={projects} />

  return (
    <Container>
      <PageHeader title="Projetos" description="Iniciativas que a associação toca com as famílias associadas." />
      <div className={styles.grid}>
        {(projects.data ?? []).map((p) => (
          <LinkCard
            key={p.id}
            to={`/projetos/${p.id}`}
            title={p.title}
            summary={p.summary}
            icon={p.icon}
            badge={<Pill tone={p.status === 'em-andamento' ? 'leaf' : 'sun'}>{STATUS_LABEL[p.status]}</Pill>}
          />
        ))}
      </div>
    </Container>
  )
}

export function ProjectDetailPage() {
  const { id = '' } = useParams()
  const project = useResource(`project:${id}`, () => api.getProject(id))
  usePageTitle(project.data?.title)

  if (project.loading || project.error) return <ResourceState resource={project} />
  const p = project.data
  if (!p) return <NotFoundState what="página de projeto" />

  return (
    <DetailLayout
      backTo="/projetos"
      backLabel="Projetos"
      title={p.title}
      lead={p.summary}
      paragraphs={p.body}
      icon={p.icon}
      pill={STATUS_LABEL[p.status]}
    />
  )
}

/* ---------- Parceiros ---------- */

export function PartnersListPage() {
  usePageTitle('Parceiros')
  const partners = useResource('partners', () => api.listPartners())
  if (partners.loading || partners.error) return <ResourceState resource={partners} />

  return (
    <Container>
      <PageHeader title="Parceiros" description="Quem caminha com a associação para fortalecer a agricultura familiar." />
      <div className={styles.grid}>
        {(partners.data ?? []).map((p) => (
          <LinkCard
            key={p.id}
            to={`/parceiros/${p.id}`}
            title={p.name}
            summary={p.summary}
            icon={p.icon}
            badge={<Pill tone="water">{p.kind}</Pill>}
          />
        ))}
      </div>
    </Container>
  )
}

export function PartnerDetailPage() {
  const { id = '' } = useParams()
  const partner = useResource(`partner:${id}`, () => api.getPartner(id))
  usePageTitle(partner.data?.name)

  if (partner.loading || partner.error) return <ResourceState resource={partner} />
  const p = partner.data
  if (!p) return <NotFoundState what="página de parceiro" />

  return (
    <DetailLayout
      backTo="/parceiros"
      backLabel="Parceiros"
      title={p.name}
      lead={p.summary}
      paragraphs={p.body}
      icon={p.icon}
      pill={p.kind}
    />
  )
}
