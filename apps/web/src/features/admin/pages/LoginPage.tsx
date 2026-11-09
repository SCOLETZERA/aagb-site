import { Link } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { FormError, TextField } from '@/components/ui/Field'
import { useForm } from '@/hooks/useForm'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useAdminAuth } from '../AdminAuth'
import styles from '../admin.module.css'

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Informe o e-mail.'),
  password: z.string().min(1, 'Informe a senha.'),
})

export function LoginPage({ reason }: { reason?: string | undefined }) {
  usePageTitle('Entrar no painel')
  const { login } = useAdminAuth()
  const form = useForm(loginSchema, { email: '', password: '' })

  return (
    <main className={styles.loginPage}>
      <div className={styles.loginBox}>
        <img src="/img/logo.png" alt="" width="64" height="64" />
        <h1>Painel da AAGB</h1>
        <p>Área de administração do site da associação.</p>
        <form onSubmit={form.handleSubmit((data) => login(data.email, data.password))} noValidate>
          {reason && !form.formError && <FormError>{reason}</FormError>}
          <TextField label="E-mail" type="email" autoComplete="username" {...form.field('email')} />
          <TextField label="Senha" type="password" autoComplete="current-password" {...form.field('password')} />
          {form.formError && <FormError>{form.formError}</FormError>}
          <Button type="submit" fullWidth size="lg" disabled={form.submitting}>
            {form.submitting ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
        <Link to="/">Voltar ao site</Link>
      </div>
    </main>
  )
}
