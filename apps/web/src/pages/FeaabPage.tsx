import { ASSOCIATION } from '@/components/layout/navigation'
import { ButtonLink } from '@/components/ui/Button'
import { IconBadge } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Container, PageHeader } from '@/components/ui/Layout'
import { FEAAB, FEAAB_AREAS } from '@/content/feaab'
import { usePageTitle } from '@/hooks/usePageTitle'
import styles from './FeaabPage.module.css'

export function FeaabPage() {
  usePageTitle(FEAAB.edition)

  return (
    <Container>
      <PageHeader title={FEAAB.edition} description={`${FEAAB.fullName}. ${FEAAB.intro}`} />

      <ul className={styles.areas}>
        {FEAAB_AREAS.map((area) => (
          <li key={area.id} className={styles.area}>
            <IconBadge name={area.icon} size={28} />
            <div>
              <h2>{area.title}</h2>
              <p>{area.text}</p>
            </div>
          </li>
        ))}
      </ul>

      <section className={styles.follow} aria-labelledby="acompanhe">
        <div>
          <h2 id="acompanhe">Acompanhe a feira</h2>
          <p>Fotos, vídeos e avisos de cada edição saem primeiro no Instagram da associação.</p>
        </div>
        <ButtonLink to={ASSOCIATION.instagramUrl} target="_blank" rel="noopener noreferrer" size="lg">
          <Icon name="instagram" size={20} />
          {ASSOCIATION.instagramHandle}
          <span className="visually-hidden"> (abre em nova aba)</span>
        </ButtonLink>
      </section>
    </Container>
  )
}
