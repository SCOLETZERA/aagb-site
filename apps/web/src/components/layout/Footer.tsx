import { Link } from 'react-router-dom'
import { Icon } from '@/components/ui/Icon'
import { Container } from '@/components/ui/Layout'
import { useResource } from '@/hooks/useResource'
import { api } from '@/services'
import { ASSOCIATION } from './navigation'
import styles from './Footer.module.css'

export function Footer() {
  const partners = useResource('partners', () => api.listPartners())

  return (
    <footer className={styles.footer}>
      <Container>
        <div className={styles.grid}>
          <div>
            <h2>{ASSOCIATION.shortName}</h2>
            <p>{ASSOCIATION.name}</p>
            <p className={styles.small}>Desde {ASSOCIATION.foundedYear} · CNPJ {ASSOCIATION.cnpj}</p>
          </div>

          <div>
            <h2>Onde estamos</h2>
            <p className={styles.with}>
              <Icon name="pin" size={20} />
              {ASSOCIATION.place}
            </p>
            <p className={styles.with}>
              <Icon name="instagram" size={20} />
              <a href={ASSOCIATION.instagramUrl} target="_blank" rel="noopener noreferrer">
                {ASSOCIATION.instagramHandle}
                <span className="visually-hidden"> (abre em nova aba)</span>
              </a>
            </p>
          </div>

          <div>
            <h2>Parceiros</h2>
            <ul className={styles.partners}>
              {partners.data?.map((p) => (
                <li key={p.id}>
                  <Link to={`/parceiros/${p.id}`}>{p.name}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className={styles.copy}>© 2026 {ASSOCIATION.shortName}. Todos os direitos reservados.</p>
      </Container>
    </footer>
  )
}
