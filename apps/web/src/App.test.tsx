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
    // A página carrega sob demanda (import dinâmico) e pode demorar quando os testes rodam em paralelo.
    const buttons = await screen.findAllByRole('button', { name: /adicionar ao carrinho/i }, { timeout: 5000 })
    await user.click(buttons[0]!)
    expect(await screen.findByRole('button', { name: /carrinho, 1 item/i })).toBeInTheDocument()
  })

  it('mostra aviso amigável para endereço inexistente', async () => {
    renderAt('/rota-que-nao-existe')
    expect(await screen.findByRole('heading', { name: /não encontramos/i })).toBeInTheDocument()
  })

  it('formulário de serviço mostra o aviso de privacidade com link para a política', async () => {
    renderAt('/servicos')
    await screen.findByRole('button', { name: /enviar solicitação/i }, { timeout: 5000 })
    const link = screen.getAllByRole('link', { name: /como cuidamos dos seus dados/i })[0]
    expect(link).toHaveAttribute('href', '/privacidade')
    expect(screen.getByText(/só para agendar o serviço com você/i)).toBeInTheDocument()
  })

  it('mostra a política de privacidade', async () => {
    renderAt('/privacidade')
    expect(await screen.findByRole('heading', { level: 1, name: /como cuidamos dos seus dados/i }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /seus direitos/i })).toBeInTheDocument()
  })
})
