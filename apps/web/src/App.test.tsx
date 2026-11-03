import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { App } from './App'
import { CartProvider } from './features/cart/CartContext'
import { ThemeProvider } from './features/theme/ThemeContext'
import { ToastProvider } from './features/toast/ToastContext'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <ToastProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('App', () => {
  it('mostra a página inicial com a navegação principal', async () => {
    renderAt('/')
    expect(await screen.findByRole('heading', { level: 1, name: /da terra para a mesa/i })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument()
  })

  it('lista produtos e adiciona um ao carrinho', async () => {
    const user = userEvent.setup()
    renderAt('/produtos')
    const buttons = await screen.findAllByRole('button', { name: /adicionar ao carrinho/i })
    await user.click(buttons[0]!)
    expect(await screen.findByRole('button', { name: /carrinho, 1 item/i })).toBeInTheDocument()
  })

  it('mostra aviso amigável para endereço inexistente', async () => {
    renderAt('/rota-que-nao-existe')
    expect(await screen.findByRole('heading', { name: /não encontramos/i })).toBeInTheDocument()
  })
})
