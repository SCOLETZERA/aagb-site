import { Suspense, lazy, useEffect, useRef, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { ResourceState } from '@/components/ui/States'
import { AdminAuthProvider, useAdminAuth, useAdminUser } from './AdminAuth'
import { CONTENT_TYPES } from './contentTypes'
import { LoginPage } from './pages/LoginPage'
import styles from './admin.module.css'

const SummaryPage = lazy(() => import('./pages/SummaryPage').then((m) => ({ default: m.SummaryPage })))
const InboxPage = lazy(() => import('./pages/InboxPage').then((m) => ({ default: m.InboxPage })))
const ContentPage = lazy(() => import('./pages/ContentPage').then((m) => ({ default: m.ContentPage })))
const DocumentsPage = lazy(() => import('./pages/DocumentsPage').then((m) => ({ default: m.DocumentsPage })))
const AccountsPage = lazy(() => import('./pages/AccountsPage').then((m) => ({ default: m.AccountsPage })))
const AuditPage = lazy(() => import('./pages/AuditPage').then((m) => ({ default: m.AuditPage })))

const PENDING = { loading: true, error: null, reload: () => undefined }

/** Painel administrativo em /admin. Fica fora do layout público e só funciona com a API real. */
export function AdminApp({ apiUrl = import.meta.env.VITE_API_URL }: { apiUrl?: string | undefined }) {
  useNoIndex()
  if (!apiUrl) {
    return (
      <div className={styles.loginPage}>
        <div className={styles.loginBox}>
          <h1>Painel indisponível</h1>
          <p>O painel precisa da API. Defina VITE_API_URL no arquivo .env.local do front e reinicie o site.</p>
          <Link to="/">Voltar ao site</Link>
        </div>
      </div>
    )
  }
  return (
    <AdminAuthProvider baseUrl={apiUrl}>
      <Gate />
    </AdminAuthProvider>
  )
}

function Gate() {
  const { session } = useAdminAuth()
  if (session.status === 'loading') return <ResourceState resource={PENDING} />
  if (session.status === 'out') return <LoginPage reason={session.reason} />
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<SummaryPage />} />
        <Route path="pedidos" element={<InboxPage kind="orders" />} />
        <Route path="servicos" element={<InboxPage kind="service-requests" />} />
        <Route path="doacoes" element={<InboxPage kind="donation-offers" />} />
        <Route path="conteudo/:type" element={<ContentPage />} />
        <Route path="documentos" element={<DocumentsPage />} />
        <Route path="contas" element={<AccountsPage />} />
        <Route path="auditoria" element={<AuditPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  )
}

function Shell() {
  const user = useAdminUser()
  const { logout } = useAdminAuth()
  const { pathname } = useLocation()
  const main = useRef<HTMLElement>(null)

  useEffect(() => {
    main.current?.focus({ preventScroll: true })
  }, [pathname])

  return (
    <>
      <header className={styles.top}>
        <div className={styles.topBar}>
          <Link to="/admin" className={styles.brand}>
            <img src="/img/logo.png" alt="" width="40" height="40" />
            <span>
              AAGB <small>Painel</small>
            </span>
          </Link>
          <p className={styles.who}>{user.name}</p>
          <button type="button" className={styles.topButton} onClick={() => void logout()}>
            Sair
          </button>
        </div>
      </header>
      <div className={styles.layout}>
        <nav className={styles.nav} aria-label="Painel">
          <ul>
            <NavItem to="/admin" end>Resumo</NavItem>
            <li className={styles.navGroup} aria-hidden="true">Entradas</li>
            <NavItem to="/admin/pedidos">Pedidos</NavItem>
            <NavItem to="/admin/servicos">Serviços</NavItem>
            <NavItem to="/admin/doacoes">Doações</NavItem>
            <li className={styles.navGroup} aria-hidden="true">Site</li>
            {CONTENT_TYPES.map((t) => (
              <NavItem key={t.type} to={`/admin/conteudo/${t.type}`}>
                {t.plural}
              </NavItem>
            ))}
            <NavItem to="/admin/documentos">Documentos</NavItem>
            <li className={styles.navGroup} aria-hidden="true">Administração</li>
            <NavItem to="/admin/contas">Contas</NavItem>
            <NavItem to="/admin/auditoria">Auditoria</NavItem>
            <li className={styles.navGroup} aria-hidden="true">Site público</li>
            <NavItem to="/">Voltar ao site</NavItem>
          </ul>
        </nav>
        <main ref={main} tabIndex={-1} className={styles.main}>
          <Suspense fallback={<ResourceState resource={PENDING} />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </>
  )
}

function NavItem({ to, end, children }: { to: string; end?: boolean; children: ReactNode }) {
  return (
    <li>
      <NavLink to={to} end={end}>
        {children}
      </NavLink>
    </li>
  )
}

/** O painel não deve aparecer em buscadores. */
function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.append(meta)
    return () => meta.remove()
  }, [])
}
