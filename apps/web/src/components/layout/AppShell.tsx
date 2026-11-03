import { Suspense, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { ResourceState } from '@/components/ui/States'
import { CartDrawer } from '@/features/cart/CartDrawer'
import { Footer } from './Footer'
import { Header } from './Header'
import styles from './AppShell.module.css'

// Enquanto o código de uma página carrega, mostra o mesmo "Carregando…" dos dados, mantendo cabeçalho e rodapé.
const PENDING = { loading: true, error: null, reload: () => undefined }

export function AppShell() {
  const { pathname } = useLocation()
  const main = useRef<HTMLElement>(null)

  // Ao trocar de página: volta ao topo e leva o foco ao conteúdo (ajuda quem usa teclado e leitor de tela).
  useEffect(() => {
    window.scrollTo(0, 0)
    main.current?.focus({ preventScroll: true })
  }, [pathname])

  return (
    <>
      <a href="#conteudo" className={styles.skip}>
        Ir para o conteúdo
      </a>
      <Header />
      <main id="conteudo" ref={main} tabIndex={-1}>
        <Suspense fallback={<ResourceState resource={PENDING} />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <CartDrawer />
    </>
  )
}
