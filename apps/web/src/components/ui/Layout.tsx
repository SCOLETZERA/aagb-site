import type { ComponentProps, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import styles from './Layout.module.css'

export function Container({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={[styles.container, className].filter(Boolean).join(' ')} {...rest} />
}

interface PageHeaderProps {
  title: string
  description?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <h1>{title}</h1>
        {description && <p className={styles.lead}>{description}</p>}
      </div>
      {actions}
    </header>
  )
}

export function Section({ title, link, children }: { title: string; link?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2>{title}</h2>
        {link && (
          <Link to={link.to} className={styles.sectionLink}>
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={styles.back}>
      <Icon name="back" size={18} />
      {children}
    </Link>
  )
}

export function Panel({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={[styles.panel, className].filter(Boolean).join(' ')} {...rest} />
}
