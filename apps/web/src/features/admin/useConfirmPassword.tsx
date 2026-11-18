import { useCallback, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Drawer'
import { FormError, TextField } from '@/components/ui/Field'
import { ApiError } from '@/services/api'
import { useAdminAuth } from './AdminAuth'

const CANCELLED = 'Confirme sua senha para continuar.'

/**
 * Ações sobre contas exigem senha confirmada há pouco. `guard(run)` roda a ação; se o servidor
 * pedir confirmação (`code: "confirm_password"`), abre a janela "Confirme sua senha", confirma e
 * repete a ação uma vez. Fechar a janela cancela a ação.
 */
export function useConfirmPassword(): { guard<T>(run: () => Promise<T>): Promise<T>; dialog: ReactNode } {
  const { client } = useAdminAuth()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef<{ confirmed(): void; cancelled(): void } | null>(null)

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
      pending.current = { confirmed: resolve, cancelled: () => reject(new ApiError(CANCELLED, 403)) }
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
      const done = pending.current
      pending.current = null
      close()
      done?.confirmed()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível confirmar.')
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    const waiting = pending.current
    pending.current = null
    close()
    waiting?.cancelled()
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
