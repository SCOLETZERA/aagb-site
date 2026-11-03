import type { ReactNode } from 'react'
import { IconBadge, Pill } from '@/components/ui/Card'
import type { IconName } from '@/components/ui/icon-paths'
import { BackLink, Container } from '@/components/ui/Layout'
import styles from './DetailLayout.module.css'

interface DetailLayoutProps {
  backTo: string
  backLabel: string
  title: string
  lead: string
  paragraphs: string[]
  icon: IconName
  image?: string | undefined
  imageAlt?: string | undefined
  pill?: string
  related?: ReactNode
}

/** Estrutura comum das páginas de detalhe (notícia, projeto, parceiro). */
export function DetailLayout({ backTo, backLabel, title, lead, paragraphs, icon, image, imageAlt, pill, related }: DetailLayoutProps) {
  return (
    <Container>
      <BackLink to={backTo}>{backLabel}</BackLink>
      <div className={styles.layout}>
        <article className={styles.article}>
          {image ? <img className={styles.hero} src={image} alt={imageAlt ?? ''} width="1280" height="720" /> : <IconBadge name={icon} size={32} />}
          {pill && (
            <div>
              <Pill>{pill}</Pill>
            </div>
          )}
          <h1>{title}</h1>
          <p className={styles.lead}>{lead}</p>
          {paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </article>
        {related && <aside className={styles.related}>{related}</aside>}
      </div>
    </Container>
  )
}
