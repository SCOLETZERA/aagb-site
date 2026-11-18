import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '@/features/toast/ToastContext'
import { AdminApp } from './AdminApp'
import { describeAction } from './pages/AuditPage'
import type { AdminUser } from './types'

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const board: AdminUser = { id: 'u1', email: 'ana@aagb.test', name: 'Ana Souza' }
const summary = {
  orders: [{ status: 'novo', count: 3, totalCents: 5400 }],
  serviceRequests: [{ status: 'novo', count: 1 }],
  donationOffers: [],
  sales: [{ productId: 'mel-500g', productName: 'Mel puro 500 g', quantity: 3 }],
}

/** API falsa: responde por rota; `loggedIn` controla o /me. */
function fakeApi(user: AdminUser | null) {
  let current = user
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input).replace('http://api.test/api', '')
    const method = init?.method ?? 'GET'
    if (url === '/admin/auth/me') return current ? json(200, { user: current }) : json(401, { message: 'Faça login.' })
    if (url === '/admin/auth/refresh') return json(401, { message: 'Sua sessão expirou. Entre de novo.' })
    if (url === '/admin/auth/login' && method === 'POST') {
      const { password } = JSON.parse(String(init!.body)) as { password: string }
      if (password !== 'senha-certa-123') return json(401, { message: 'E-mail ou senha incorretos.' })
      current = board
      return json(200, { user: board })
    }
    if (url === '/admin/reports/summary') return json(200, summary)
    return json(404, { message: 'Não encontrado.' })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderAdmin(apiUrl: string | undefined = 'http://api.test') {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <ToastProvider>
        <Routes>
          <Route path="/admin/*" element={<AdminApp apiUrl={apiUrl} />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('painel administrativo', () => {
  it('sem VITE_API_URL avisa que o painel precisa da API', () => {
    renderAdmin('')
    expect(screen.getByRole('heading', { name: /painel indisponível/i })).toBeInTheDocument()
  })

  it('sem sessão mostra o login; senha errada mostra o erro do servidor; certa abre o resumo', async () => {
    const user = userEvent.setup()
    fakeApi(null)
    renderAdmin()
    expect(await screen.findByRole('heading', { name: /painel da aagb/i })).toBeInTheDocument()

    await user.type(screen.getByLabelText('E-mail'), 'ana@aagb.test')
    await user.type(screen.getByLabelText('Senha'), 'errada')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Senha'))
    await user.type(screen.getByLabelText('Senha'), 'senha-certa-123')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('heading', { name: 'Olá, Ana' }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /3 pedidos novos/i })).toHaveAttribute('href', '/admin/pedidos')
    expect(screen.getByRole('cell', { name: 'Mel puro 500 g' })).toBeInTheDocument()
  })

  it('quem entra vê o menu completo, com contas e auditoria', async () => {
    fakeApi(board)
    renderAdmin()
    const nav = await screen.findByRole('navigation', { name: 'Painel' })
    expect(within(nav).getByRole('link', { name: 'Contas' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Auditoria' })).toBeInTheDocument()
  })
})

describe('texto da auditoria', () => {
  it('traduz as ações para português', () => {
    expect(describeAction('order.status.cancelado')).toBe('mudou pedido para Cancelado')
    expect(describeAction('products.update')).toBe('editou produto')
    expect(describeAction('donation-offer.anonymize')).toBe('apagou os dados pessoais de oferta de doação')
    expect(describeAction('auth.login')).toBe('entrou no painel')
    expect(describeAction('auth.confirm')).toBe('confirmou a senha')
  })
})
