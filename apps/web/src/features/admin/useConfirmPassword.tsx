import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Drawer'
import { FormError, TextField } from '@/components/ui/Field'
import { ApiError } from '@/services/api'
import { useAdminAuth } from './AdminAuth'

const CANCELLED = 'Confirme sua senha para continuar.'

/**
 * Ações sobre contas exigem senha confirmada há pouco. `guard(run)` roda a ação; se o servidor
 * pedir confirmação (`code: "confirm_password"`), abre a janela "Confirme sua senha", confirma e
 * repete a ação uma vez. Fechar a janela, ou sair da tela com ela aberta, cancela a ação.
 * Se outra ação pedir confirmação enquanto a janela está aberta, as duas esperam a mesma confirmação.
 */
export function useConfirmPassword(): { guard<T>(run: () => Promise<T>): Promise<T>; dialog: ReactNode } {
  const { client } = useAdminAuth()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Ações esperando a confirmação. Todas seguem juntas ao confirmar e são canceladas juntas ao fechar.
  const waiting = useRef<{ confirmed(): void; cancelled(): void }[]>([])

  const settle = useCallback((how: 'confirmed' | 'cancelled') => {
    const all = waiting.current
    waiting.current = []
    for (const w of all) w[how]()
  }, [])

  // Sair da tela com a janela aberta: nenhuma ação fica esperando para sempre.
  useEffect(() => () => settle('cancelled'), [settle])

  const close = useCallback(() => {
    setOpen(false)
    setPassword('')
    setError(null)
  }, [])

  const guard = useCallback(async <T,>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run()
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== 'confirm_password') throw err
    }
    await new Promise<void>((resolve, reject) => {
      waiting.current.push({ confirmed: resolve, cancelled: () => reject(new ApiError(CANCELLED, 403)) })
      setOpen(true)
    })
    return run()
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await client.request('/admin/auth/confirm', { method: 'POST', body: { password } })
      close()
      settle('confirmed')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível confirmar.')
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    close()
    settle('cancelled')
  }

  const dialog = (
    <Drawer open={open} onClose={cancel} title="Confirme sua senha">
      <form onSubmit={submit} noValidate>
        <p>Para mexer em contas, digite a sua senha. Ela vale por 5 minutos.</p>
        <TextField
          label="Sua senha"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <FormError>{error}</FormError>}
        <Button type="submit" size="lg" fullWidth disabled={busy}>
          {busy ? 'Confirmando…' : 'Confirmar'}
        </Button>
      </form>
    </Drawer>
  )

  return { guard, dialog }
}
