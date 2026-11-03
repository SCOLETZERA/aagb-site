import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { IconName } from './icon-paths'
import { Icon } from './Icon'
import styles from './Card.module.css'

export function IconBadge({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <span className={styles.iconBadge}>
      <Icon name={name} size={size} />
    </span>
  )
}

export function Pill({ children, tone = 'sun' }: { children: ReactNode; tone?: 'sun' | 'leaf' | 'water' }) {
  return <span className={`${styles.pill} ${styles[tone]}`}>{children}</span>
}

interface LinkCardProps {
  to: string
  title: string
  summary: string
  icon: IconName
  image?: string | undefined
  imageAlt?: string | undefined
  badge?: ReactNode
}

/** Cartão inteiro clicável: o link fica no título e se estende pelo cartão (um único alvo para teclado e leitor de tela). */
export function LinkCard({ to, title, summary, icon, image, imageAlt, badge }: LinkCardProps) {
  return (
    <article className={styles.card}>
      {image ? <img className={styles.cover} src={image} alt={imageAlt ?? ''} loading="lazy" /> : <IconBadge name={icon} />}
      <h3 className={styles.title}>
        <Link to={to} className={styles.stretch}>
          {title}
        </Link>
      </h3>
      <p className={styles.summary}>{summary}</p>
      {badge && <div className={styles.badge}>{badge}</div>}
    </article>
  )
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className={styles.progress} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${value}%` }} />
    </div>
  )
}
