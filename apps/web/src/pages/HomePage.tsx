import { Link } from 'react-router-dom'
import { ASSOCIATION } from '@/components/layout/navigation'
import { ButtonLink } from '@/components/ui/Button'
import { IconBadge, LinkCard } from '@/components/ui/Card'
import { Container, Section } from '@/components/ui/Layout'
import type { IconName } from '@/components/ui/icon-paths'
import { formatDate } from '@/lib/format'
import { useResource } from '@/hooks/useResource'
import { usePageTitle } from '@/hooks/usePageTitle'
import { api } from '@/services'
import styles from './HomePage.module.css'

const VALUES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'sprout', title: 'Agricultura familiar', text: 'Produção local feita por famílias da comunidade.' },
  { icon: 'leaf', title: 'Produção sustentável', text: 'Cuidado com a terra, a água e as sementes.' },
  { icon: 'users', title: 'União e cooperação', text: 'Associados que crescem juntos e se apoiam.' },
]

const WAYS: { to: string; icon: IconName; title: string; text: string }[] = [
  { to: '/produtos', icon: 'jar', title: 'Comprar produtos', text: 'Mel, hortaliças, grãos e queijo direto de quem produz.' },
  { to: '/servicos', icon: 'tractor', title: 'Usar os serviços', text: 'Máquinas, assistência técnica, venda coletiva e cursos.' },
  { to: '/doacoes', icon: 'gift', title: 'Fazer uma doação', text: 'Veja o que falta e ajude as famílias associadas.' },
]

function FurrowBand() {
  return (
    <svg className={styles.furrows} viewBox="0 0 1200 80" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 24 C 200 4, 400 44, 600 24 S 1000 4, 1200 24" />
      <path d="M0 44 C 200 24, 400 64, 600 44 S 1000 24, 1200 44" />
      <path d="M0 64 C 200 44, 400 84, 600 64 S 1000 44, 1200 64" />
    </svg>
  )
}

export function HomePage() {
  usePageTitle()
  const news = useResource('news', () => api.listNews())
  const [featured, ...others] = news.data ?? []

  return (
    <>
      <section className={styles.hero}>
        <Container className={styles.heroGrid}>
          <div className={styles.heroText}>
            <h1>Da terra para a mesa, direto de Bálsamos.</h1>
            <p>
              Famílias agricultoras de Nova Russas (CE) reunidas em uma associação para vender melhor, aprender juntas e cuidar da terra.
            </p>
            <div className={styles.cta}>
              <ButtonLink to="/produtos" size="lg">
                Ver produtos
              </ButtonLink>
              <ButtonLink to="/doacoes" size="lg" variant="secondary">
                Como ajudar
              </ButtonLink>
            </div>
          </div>
          <div className={styles.heroArt}>
            <span className={styles.sun} aria-hidden="true" />
            <img
              src="/img/noticia-feira.jpg"
              alt="Agricultor entregando um maço de cenouras a uma cliente em uma banca de feira"
              width="1100"
              height="705"
            />
          </div>
        </Container>
        <FurrowBand />
      </section>

      <Container>
        <section className={styles.about} aria-labelledby="quem-somos">
          <div>
            <h2 id="quem-somos">Quem somos</h2>
            <p>
              A AAGB reúne famílias agricultoras de Bálsamos para fortalecer a produção local, ampliar a renda no campo e valorizar quem
              planta, cria e colhe com as próprias mãos.
            </p>
            <p>
              Por meio de projetos, venda coletiva, assistência técnica e parcerias, a associação apoia seus associados do plantio até a mesa
              do consumidor.
            </p>
            <p className={styles.fact}>
              Fundada em {ASSOCIATION.foundedYear}, em {ASSOCIATION.place}.
            </p>
          </div>
          <ul className={styles.values}>
            {VALUES.map((v) => (
              <li key={v.title}>
                <IconBadge name={v.icon} />
                <div>
                  <h3>{v.title}</h3>
                  <p>{v.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <Section title="Últimas notícias" link={{ to: '/noticias', label: 'Ver todas' }}>
          {news.loading && <p role="status">Carregando notícias…</p>}
          {news.error && (
            <p role="alert">
              Não foi possível carregar as notícias. <button className={styles.retry} onClick={news.reload}>Tentar de novo</button>
            </p>
          )}
          {featured && (
            <div className={styles.news}>
              <Link to={`/noticias/${featured.id}`} className={styles.featured}>
                {featured.image && <img className={styles.featuredImage} src={featured.image} alt="" />}
                <span className={styles.date}>{formatDate(featured.publishedAt)}</span>
                <h3>{featured.title}</h3>
                <p>{featured.summary}</p>
              </Link>
              <div className={styles.newsList}>
                {others.slice(0, 3).map((a) => (
                  <LinkCard
                    key={a.id}
                    to={`/noticias/${a.id}`}
                    title={a.title}
                    summary={a.summary}
                    icon={a.icon}
                    image={a.image}
                    imageAlt={a.imageAlt}
                    badge={<span className={styles.cardDate}>{formatDate(a.publishedAt, 'short')}</span>}
                  />
                ))}
              </div>
            </div>
          )}
        </Section>

        <Section title="Como participar">
          <div className={styles.ways}>
            {WAYS.map((w) => (
              <LinkCard key={w.to} to={w.to} title={w.title} summary={w.text} icon={w.icon} />
            ))}
          </div>
        </Section>
      </Container>
    </>
  )
}
