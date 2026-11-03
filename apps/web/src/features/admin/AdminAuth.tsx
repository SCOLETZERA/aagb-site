import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createAdminClient, type AdminClient } from './adminClient'
import type { AdminUser } from './types'

type Session = { status: 'loading' } | { status: 'out'; reason?: string } | { status: 'in'; user: AdminUser }

interface AdminAuthValue {
  session: Session
  client: AdminClient
  login(email: string, password: string): Promise<void>
  logout(): Promise<void>
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null)

export function AdminAuthProvider({ baseUrl, children }: { baseUrl: string; children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: 'loading' })

  const client = useMemo(
    () => createAdminClient(baseUrl, () => setSession({ status: 'out', reason: 'Sua sessão expirou. Entre de novo.' })),
    [baseUrl],
  )

  // Ao abrir o painel, descobre se ainda há sessão (o cookie não é visível para o JavaScript).
  useEffect(() => {
    let cancelled = false
    client.request<{ user: AdminUser }>('/admin/auth/me').then(
      ({ user }) => !cancelled && setSession({ status: 'in', user }),
      () => !cancelled && setSession({ status: 'out' }),
    )
    return () => {
      cancelled = true
    }
  }, [client])

  const login = useCallback(
    async (email: string, password: string) => {
      const { user } = await client.request<{ user: AdminUser }>('/admin/auth/login', {
        method: 'POST',
        body: { email, password },
      })
      setSession({ status: 'in', user })
    },
    [client],
  )

  const logout = useCallback(async () => {
    await client.request('/admin/auth/logout', { method: 'POST' }).catch(() => undefined)
    setSession({ status: 'out' })
  }, [client])

  const value = useMemo(() => ({ session, client, login, logout }), [session, client, login, logout])
  return <AdminAuthContext value={value}>{children}</AdminAuthContext>
}

export function useAdminAuth() {
  const ctx = use(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth precisa estar dentro de <AdminAuthProvider>.')
  return ctx
}

/** Usuário logado. Só use dentro das telas protegidas do painel. */
export function useAdminUser(): AdminUser {
  const { session } = useAdminAuth()
  if (session.status !== 'in') throw new Error('Tela do painel sem usuário logado.')
  return session.user
}
