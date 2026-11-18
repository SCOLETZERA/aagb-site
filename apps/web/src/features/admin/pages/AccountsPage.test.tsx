import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '@/features/toast/ToastContext'
import { AdminApp } from '../AdminApp'
import type { AdminUser } from '../types'

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const me: AdminUser = { id: 'u1', email: 'ana@aagb.test', name: 'Ana Souza' }
const CONFIRM_REQUIRED = { message: 'Confirme sua senha para continuar.', code: 'confirm_password' }

/** API falsa: as ações sobre contas pedem confirmação até `/admin/auth/confirm` receber a senha certa. */
function fakeApi() {
  let confirmed = false
  const accounts = [
    { id: 'u1', email: 'ana@aagb.test', name: 'Ana Souza', active: true, createdAt: '2026-11-01T12:00:00.000Z' },
    { id: 'u2', email: 'joao@aagb.test', name: 'João Lima', active: true, createdAt: '2026-11-02T12:00:00.000Z' },
    { id: 'u3', email: 'rita@aagb.test', name: 'Rita Alves', active: true, createdAt: '2026-11-03T12:00:00.000Z' },
  ]
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input).replace('http://api.test/api', '')
    const method = init?.method ?? 'GET'
    if (url === '/admin/auth/me') return json(200, { user: me })
    if (url === '/admin/auth/refresh') return json(401, { message: 'Sua sessão expirou. Entre de novo.' })
    if (url === '/admin/auth/confirm' && method === 'POST') {
      const { password } = JSON.parse(String(init!.body)) as { password: string }
      if (password !== 'senha-certa-123') return json(403, { message: 'Senha incorreta.' })
      confirmed = true
      return json(204)
    }
    if (url === '/admin/users' && method === 'GET') return json(200, accounts)
    const patch = url.match(/^\/admin\/users\/(\w+)$/)
    if (patch && method === 'PATCH') {
      if (!confirmed) return json(403, CONFIRM_REQUIRED)
      const account = accounts.find((a) => a.id === patch[1])!
      Object.assign(account, JSON.parse(String(init!.body)))
      return json(200, account)
    }
    return json(404, { message: 'Não encontrado.' })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const calls = (fetchMock: ReturnType<typeof fakeApi>, path: string, method = 'GET') =>
  fetchMock.mock.calls.filter(([input, init]) => String(input).endsWith(path) && (init?.method ?? 'GET') === method).length

function renderAccounts() {
  return render(
    <MemoryRouter initialEntries={['/admin/contas']}>
      <ToastProvider>
        <Routes>
          <Route path="/admin/*" element={<AdminApp apiUrl="http://api.test" />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

const confirmDialog = () => screen.findByRole('dialog', { name: 'Confirme sua senha' })

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('contas: confirmação de senha', () => {
  it('pede a senha, confirma e repete a ação sozinho', async () => {
    const user = userEvent.setup()
    const fetchMock = fakeApi()
    renderAccounts()
    await user.click(await screen.findByRole('button', { name: 'Desativar João Lima' }, { timeout: 3000 }))

    const dialog = await confirmDialog()
    await user.type(within(dialog).getByLabelText('Sua senha'), 'senha-certa-123')
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText('Conta desativada.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Confirme sua senha' })).not.toBeInTheDocument())
    expect(calls(fetchMock, '/admin/users/u2', 'PATCH')).toBe(2)
  })

  it('senha errada aparece na janela, que continua aberta, sem derrubar a sessão', async () => {
    const user = userEvent.setup()
    const fetchMock = fakeApi()
    renderAccounts()
    await user.click(await screen.findByRole('button', { name: 'Desativar João Lima' }, { timeout: 3000 }))

    const dialog = await confirmDialog()
    await user.type(within(dialog).getByLabelText('Sua senha'), 'senha-errada')
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }))

    expect(await within(dialog).findByText('Senha incorreta.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Confirme sua senha' })).toBeInTheDocument()
    expect(calls(fetchMock, '/admin/auth/refresh', 'POST')).toBe(0)
  })

  it('os botões de cada conta dizem o nome da pessoa ao leitor de tela', async () => {
    fakeApi()
    renderAccounts()
    expect(await screen.findByRole('button', { name: 'Desativar João Lima' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trocar senha de João Lima' })).toBeInTheDocument()
  })

  it('fechar a janela cancela a ação e avisa', async () => {
    const user = userEvent.setup()
    const fetchMock = fakeApi()
    renderAccounts()
    await user.click(await screen.findByRole('button', { name: 'Desativar João Lima' }, { timeout: 3000 }))

    const dialog = await confirmDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Fechar' }))

    expect(await screen.findByText('Confirme sua senha para continuar.')).toBeInTheDocument()
    expect(calls(fetchMock, '/admin/users/u2', 'PATCH')).toBe(1)
  })

  it('depois de confirmar, a ação seguinte não pede a senha de novo', async () => {
    const user = userEvent.setup()
    fakeApi()
    renderAccounts()
    await user.click(await screen.findByRole('button', { name: 'Desativar João Lima' }, { timeout: 3000 }))
    const dialog = await confirmDialog()
    await user.type(within(dialog).getByLabelText('Sua senha'), 'senha-certa-123')
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByText('Conta desativada.')).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Reativar João Lima' }))
    expect(await screen.findByText('Conta reativada.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Confirme sua senha' })).not.toBeInTheDocument()
  })

  it('duas ações esperando a mesma confirmação seguem juntas depois dela', async () => {
    const user = userEvent.setup()
    const fetchMock = fakeApi()
    renderAccounts()
    await user.click(await screen.findByRole('button', { name: 'Desativar João Lima' }, { timeout: 3000 }))
    await confirmDialog()
    // A janela é modal no navegador; aqui o clique por baixo dela simula uma segunda ação disparada junto.
    await user.click(screen.getByRole('button', { name: 'Desativar Rita Alves', hidden: true }))

    const dialog = await confirmDialog()
    await user.type(within(dialog).getByLabelText('Sua senha'), 'senha-certa-123')
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(calls(fetchMock, '/admin/users/u2', 'PATCH')).toBe(2))
    await waitFor(() => expect(calls(fetchMock, '/admin/users/u3', 'PATCH')).toBe(2))
  })

  it('sair da tela com a janela aberta cancela a ação', async () => {
    const user = userEvent.setup()
    fakeApi()
    renderAccounts()
    await user.click(await screen.findByRole('button', { name: 'Desativar João Lima' }, { timeout: 3000 }))
    await confirmDialog()
    await user.click(screen.getByRole('link', { name: 'Resumo', hidden: true }))
    expect(await screen.findByText('Confirme sua senha para continuar.')).toBeInTheDocument()
  })
})
