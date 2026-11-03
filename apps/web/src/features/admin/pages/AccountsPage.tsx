import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Drawer'
import { FormError, SelectField, TextField } from '@/components/ui/Field'
import { ResourceState } from '@/components/ui/States'
import { useToast } from '@/features/toast/ToastContext'
import { ApiError } from '@/services/api'
import { useAdminAuth, useAdminUser } from '../AdminAuth'
import { formatDateTime } from '../format'
import type { Account, Role } from '../types'
import { AdminHeader, useAdminResource } from '../ui'
import styles from '../admin.module.css'

const ROLE_OPTIONS = [
  { value: 'diretoria', label: 'Diretoria: pedidos, conteúdo e documentos' },
  { value: 'admin', label: 'Administração: tudo, inclusive contas' },
]

type Dialog = { kind: 'new' } | { kind: 'password'; account: Account } | null

export function AccountsPage() {
  const me = useAdminUser()
  const { client } = useAdminAuth()
  const toast = useToast()
  const accounts = useAdminResource<Account[]>('/admin/users')
  const [dialog, setDialog] = useState<Dialog>(null)

  async function update(account: Account, body: Partial<Pick<Account, 'role' | 'active'>>, done: string) {
    try {
      await client.request(`/admin/users/${account.id}`, { method: 'PATCH', body })
      toast.show(done)
      accounts.reload()
    } catch (error) {
      toast.show(error instanceof ApiError ? error.message : 'Não foi possível salvar.')
    }
  }

  return (
    <>
      <AdminHeader
        title="Contas do painel"
        description="Quem pode entrar no painel. Desativar ou trocar o papel vale na hora."
        actions={<Button onClick={() => setDialog({ kind: 'new' })}>Nova conta</Button>}
      />
      {accounts.loading || accounts.error ? (
        <ResourceState resource={accounts} />
      ) : (
        <ul className={styles.items}>
          {accounts.data!.map((a) => {
            const self = a.id === me.id
            const roleId = `role-${a.id}`
            return (
              <li key={a.id} className={styles.item}>
                <div className={styles.itemHead}>
                  <h2>
                    {a.name}
                    {self && ' (você)'}
                  </h2>
                  <span className={styles.muted}>{a.email}</span>
                  {!a.active && <span className={`${styles.status} ${styles['status-cancelado']}`}>Desativada</span>}
                </div>
                <p className={styles.muted}>Criada em {formatDateTime(a.createdAt)}</p>
                <div className={styles.actions}>
                  <label htmlFor={roleId}>Papel</label>
                  <select
                    id={roleId}
                    value={a.role}
                    disabled={self}
                    onChange={(e) => void update(a, { role: e.target.value as Role }, 'Papel alterado.')}
                  >
                    <option value="diretoria">Diretoria</option>
                    <option value="admin">Administração</option>
                  </select>
                  <button type="button" className={styles.linkButton} onClick={() => setDialog({ kind: 'password', account: a })}>
                    Trocar senha<span className="visually-hidden"> de {a.name}</span>
                  </button>
                  {!self && (
                    <button
                      type="button"
                      className={`${styles.linkButton} ${a.active ? styles.danger : ''}`}
                      onClick={() => {
                        if (a.active && !window.confirm(`Desativar a conta de ${a.name}? A pessoa sai do painel na hora.`)) return
                        void update(a, { active: !a.active }, a.active ? 'Conta desativada.' : 'Conta reativada.')
                      }}
                    >
                      {a.active ? 'Desativar' : 'Reativar'}
                      <span className="visually-hidden"> {a.name}</span>
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Drawer
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog?.kind === 'password' ? `Nova senha para ${dialog.account.name}` : 'Nova conta'}
      >
        {dialog?.kind === 'new' && (
          <NewAccountForm
            onDone={() => {
              toast.show('Conta criada.')
              setDialog(null)
              accounts.reload()
            }}
          />
        )}
        {dialog?.kind === 'password' && (
          <PasswordForm
            account={dialog.account}
            onDone={() => {
              toast.show('Senha trocada. As sessões abertas dessa conta foram encerradas.')
              setDialog(null)
            }}
          />
        )}
      </Drawer>
    </>
  )
}

const PASSWORD_HINT = 'Pelo menos 12 caracteres. Uma frase com espaços é fácil de lembrar e difícil de adivinhar.'

function useSubmit(run: () => Promise<void>) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFormError(null)
    try {
      await run()
    } catch (error) {
      setErrors(error instanceof ApiError ? error.fields : {})
      setFormError(error instanceof ApiError ? error.message : 'Não foi possível salvar.')
    } finally {
      setBusy(false)
    }
  }
  return { errors, formError, busy, submit }
}

function NewAccountForm({ onDone }: { onDone(): void }) {
  const { client } = useAdminAuth()
  const [values, setValues] = useState({ name: '', email: '', role: 'diretoria', password: '' })
  const form = useSubmit(async () => {
    await client.request('/admin/users', { method: 'POST', body: values })
    onDone()
  })
  const bind = (name: keyof typeof values) => ({
    value: values[name],
    error: form.errors[name],
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value })),
  })

  return (
    <form onSubmit={form.submit} noValidate>
      <TextField label="Nome" autoComplete="off" {...bind('name')} />
      <TextField label="E-mail" type="email" autoComplete="off" {...bind('email')} />
      <SelectField label="Papel" options={ROLE_OPTIONS} {...bind('role')} />
      <TextField label="Senha inicial" type="password" autoComplete="new-password" hint={PASSWORD_HINT} {...bind('password')} />
      {form.formError && <FormError>{form.formError}</FormError>}
      <Button type="submit" size="lg" fullWidth disabled={form.busy}>
        {form.busy ? 'Criando…' : 'Criar conta'}
      </Button>
    </form>
  )
}

function PasswordForm({ account, onDone }: { account: Account; onDone(): void }) {
  const { client } = useAdminAuth()
  const [password, setPassword] = useState('')
  const form = useSubmit(async () => {
    await client.request(`/admin/users/${account.id}/password`, { method: 'PUT', body: { password } })
    onDone()
  })

  return (
    <form onSubmit={form.submit} noValidate>
      <TextField
        label="Nova senha"
        type="password"
        autoComplete="new-password"
        hint={PASSWORD_HINT}
        value={password}
        error={form.errors.password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {form.formError && <FormError>{form.formError}</FormError>}
      <Button type="submit" size="lg" fullWidth disabled={form.busy}>
        {form.busy ? 'Salvando…' : 'Trocar senha'}
      </Button>
    </form>
  )
}
