import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useCart } from '@/features/cart/CartContext'
import { useTheme } from '@/features/theme/ThemeContext'
import { Icon } from '@/components/ui/Icon'
import { NAV_ITEMS } from './navigation'
import styles from './Header.module.css'

export function Header() {
  const { theme, toggle } = useTheme()
  const { state, meta } = useCart()
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const { pathname } = useLocation()
  // O menu fecha sozinho ao trocar de página: ele só vale para o caminho em que foi aberto.
  const menuOpen = menuFor === pathname

  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link to="/" className={styles.brand} aria-label="AAGB, página inicial">
          <img src="/img/logo.png" alt="" width="56" height="56" className={styles.logo} />
          <span className={styles.name} translate="no">
            AAGB
            <small>Agricultura Familiar de Bálsamos</small>
          </span>
        </Link>

        <nav className={styles.nav} aria-label="Principal" data-open={menuOpen}>
          <ul id="menu-principal">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end} className={styles.link}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={meta.open}
            aria-label={state.count ? `Carrinho, ${state.count} ${state.count === 1 ? 'item' : 'itens'}` : 'Carrinho vazio'}
          >
            <Icon name="cart" />
            {state.count > 0 && <span className={styles.badge}>{state.count}</span>}
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.menuButton}`}
            onClick={() => setMenuFor(menuOpen ? null : pathname)}
            aria-expanded={menuOpen}
            aria-controls="menu-principal"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          >
            <Icon name={menuOpen ? 'close' : 'menu'} />
          </button>
        </div>
      </div>
    </header>
  )
}
