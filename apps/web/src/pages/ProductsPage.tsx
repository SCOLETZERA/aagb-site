import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Card'
import { SelectField, TextField } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { BackLink, Container, PageHeader } from '@/components/ui/Layout'
import { EmptyState, NotFoundState, ResourceState } from '@/components/ui/States'
import { PRODUCT_CATEGORIES, type Product, type ProductCategory } from '@/domain/types'
import { useCart } from '@/features/cart/CartContext'
import { useToast } from '@/features/toast/ToastContext'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useResource } from '@/hooks/useResource'
import { formatMoney } from '@/lib/format'
import { api } from '@/services'
import styles from './ProductsPage.module.css'

const SORTS = [
  { value: 'relevancia', label: 'Relevância' },
  { value: 'menor', label: 'Menor preço' },
  { value: 'maior', label: 'Maior preço' },
]

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const LOW_STOCK = 5

function useAddToCart() {
  const { actions } = useCart()
  const toast = useToast()
  return (product: Product) => {
    actions.add(product)
    toast.show(`${product.name} no carrinho`)
  }
}

function StockNote({ stock }: { stock: number }) {
  if (stock < 1) return <p className={`${styles.stock} ${styles.low}`}>Indisponível no momento</p>
  if (stock < LOW_STOCK) return <p className={`${styles.stock} ${styles.low}`}>Últimas {stock} unidades</p>
  return <p className={styles.stock}>Disponível</p>
}

function ProductCard({ product }: { product: Product }) {
  const add = useAddToCart()
  return (
    <article className={styles.card}>
      <Link to={`/produtos/${product.id}`} className={styles.media} data-category={product.category} aria-hidden="true" tabIndex={-1}>
        <Icon name={product.icon} size={56} />
      </Link>
      <div className={styles.body}>
        <p className={styles.category}>{product.category}</p>
        <h3>
          <Link to={`/produtos/${product.id}`}>{product.name}</Link>
        </h3>
        <p className={styles.by}>por {product.producer}</p>
        <p className={styles.price}>
          {formatMoney(product.priceCents)} <small>/ {product.unit}</small>
        </p>
        <StockNote stock={product.stock} />
        <Button onClick={() => add(product)} disabled={product.stock < 1} fullWidth>
          {product.stock < 1 ? 'Indisponível' : 'Adicionar ao carrinho'}
        </Button>
      </div>
    </article>
  )
}

export function ProductsPage() {
  usePageTitle('Produtos')
  const products = useResource('products', () => api.listProducts())
  const [params, setParams] = useSearchParams()

  const category = params.get('categoria') ?? ''
  const sort = params.get('ordem') ?? 'relevancia'
  const query = params.get('q') ?? ''

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  if (products.loading || products.error) return <ResourceState resource={products} />

  const q = normalize(query.trim())
  let list = (products.data ?? []).filter(
    (p) => (!category || p.category === category) && (!q || normalize(`${p.name} ${p.producer} ${p.description}`).includes(q)),
  )
  if (sort === 'menor') list = [...list].sort((a, b) => a.priceCents - b.priceCents)
  if (sort === 'maior') list = [...list].sort((a, b) => b.priceCents - a.priceCents)

  const categories: (ProductCategory | '')[] = ['', ...PRODUCT_CATEGORIES]

  return (
    <Container>
      <PageHeader title="Produtos" description="Direto de quem planta e cria. Monte o pedido e a associação combina a entrega com você." />
      <div className={styles.shop}>
        <aside className={styles.filters} aria-label="Filtros">
          <TextField label="Buscar" type="search" value={query} onChange={(e) => update('q', e.target.value)} />
          <fieldset className={styles.chips}>
            <legend>Categorias</legend>
            {categories.map((c) => (
              <button
                key={c || 'todas'}
                type="button"
                className={styles.chip}
                aria-pressed={category === c}
                onClick={() => update('categoria', c)}
              >
                {c || 'Todas'}
              </button>
            ))}
          </fieldset>
          <SelectField label="Ordenar por" options={SORTS} value={sort} onChange={(e) => update('ordem', e.target.value === 'relevancia' ? '' : e.target.value)} />
        </aside>

        <div>
          <p className={styles.count} role="status">
            {list.length} {list.length === 1 ? 'produto' : 'produtos'}
          </p>
          {list.length === 0 ? (
            <EmptyState title="Nenhum produto encontrado">Limpe a busca ou escolha outra categoria.</EmptyState>
          ) : (
            <div className={styles.grid}>
              {list.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Container>
  )
}

export function ProductDetailPage() {
  const { id = '' } = useParams()
  const product = useResource(`product:${id}`, () => api.getProduct(id))
  const add = useAddToCart()
  usePageTitle(product.data?.name)

  if (product.loading || product.error) return <ResourceState resource={product} />
  const p = product.data
  if (!p) return <NotFoundState what="produto" />

  return (
    <Container>
      <BackLink to="/produtos">Produtos</BackLink>
      <div className={styles.detail}>
        <div className={`${styles.media} ${styles.big}`} data-category={p.category} aria-hidden="true">
          <Icon name={p.icon} size={120} />
        </div>
        <div className={styles.info}>
          <Pill>{p.category}</Pill>
          <h1>{p.name}</h1>
          <p className={styles.by}>Produzido por {p.producer}</p>
          <p className={`${styles.price} ${styles.priceBig}`}>
            {formatMoney(p.priceCents)} <small>/ {p.unit}</small>
          </p>
          <StockNote stock={p.stock} />
          <p>{p.description}</p>
          <Button size="lg" onClick={() => add(p)} disabled={p.stock < 1}>
            {p.stock < 1 ? 'Indisponível' : 'Adicionar ao carrinho'}
          </Button>
        </div>
      </div>
    </Container>
  )
}
