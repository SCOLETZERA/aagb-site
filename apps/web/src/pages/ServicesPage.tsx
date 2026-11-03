import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { IconBadge } from '@/components/ui/Card'
import { FormError, SelectField, TextAreaField, TextField } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { Container, PageHeader, Panel } from '@/components/ui/Layout'
import { ResourceState } from '@/components/ui/States'
import { useForm } from '@/hooks/useForm'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useResource } from '@/hooks/useResource'
import { serviceRequestSchema } from '@/schemas/forms'
import { api } from '@/services'
import styles from './ServicesPage.module.css'

const STEPS = [
  { title: 'Escolha o serviço', text: 'Selecione o serviço e preencha seus dados no formulário.' },
  { title: 'Receba o contato', text: 'A associação fala com você para confirmar data, valor e local.' },
  { title: 'Combine e receba', text: 'Com tudo confirmado, o serviço é realizado na data combinada.' },
]

const today = () => new Date().toISOString().slice(0, 10)

export function ServicesPage() {
  usePageTitle('Serviços')
  const services = useResource('services', () => api.listServices())
  const form = useForm(serviceRequestSchema, { serviceId: '', name: '', phone: '', locality: '', desiredDate: '', details: '' })
  const [protocol, setProtocol] = useState<string | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  if (services.loading || services.error) return <ResourceState resource={services} />
  const list = services.data ?? []

  const choose = (id: string) => {
    setProtocol(null)
    form.setValue('serviceId', id)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    formRef.current?.querySelector<HTMLElement>('select')?.focus({ preventScroll: true })
  }

  const send = form.handleSubmit(async (request) => {
    const receipt = await api.requestService(request)
    setProtocol(receipt.protocol)
  })

  const chosen = list.find((s) => s.id === form.values.serviceId)

  return (
    <Container>
      <PageHeader title="Serviços" description="O que a associação oferece para quem produz e para a comunidade." />

      <div className={styles.cards}>
        {list.map((s) => (
          <article key={s.id} className={styles.card}>
            <IconBadge name={s.icon} />
            <h3>{s.name}</h3>
            <p className={styles.desc}>{s.description}</p>
            <dl className={styles.facts}>
              <dt>Valor</dt>
              <dd>{s.priceLabel}</dd>
              <dt>Prazo</dt>
              <dd>{s.leadTime}</dd>
              <dt>Atende</dt>
              <dd>{s.audience}</dd>
            </dl>
            <Button onClick={() => choose(s.id)} fullWidth>
              Solicitar
            </Button>
          </article>
        ))}
      </div>

      <div className={styles.lower}>
        <div ref={formRef}>
          <h2 className={styles.h2}>Solicitar um serviço</h2>
          <Panel>
            {protocol ? (
              <div className={styles.done}>
                <Icon name="check" size={32} />
                <h3>Solicitação enviada</h3>
                <p>
                  Protocolo <strong>{protocol}</strong>. A associação entrará em contato pelo telefone informado para confirmar data e
                  valor{chosen ? ` do serviço “${chosen.name}”` : ''}.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setProtocol(null)
                    form.reset()
                  }}
                >
                  Nova solicitação
                </Button>
              </div>
            ) : (
              <form onSubmit={send} noValidate>
                <SelectField
                  label="Serviço"
                  options={[{ value: '', label: 'Escolha um serviço' }, ...list.map((s) => ({ value: s.id, label: s.name }))]}
                  {...form.field('serviceId')}
                />
                <TextField label="Seu nome" autoComplete="name" {...form.field('name')} />
                <TextField label="Telefone ou WhatsApp" type="tel" autoComplete="tel" inputMode="tel" {...form.field('phone')} />
                <TextField label="Comunidade ou localidade" {...form.field('locality')} />
                <TextField label="Data desejada (opcional)" type="date" min={today()} {...form.field('desiredDate')} />
                <TextAreaField label="Detalhes do que você precisa (opcional)" {...form.field('details')} />
                {form.formError && <FormError>{form.formError}</FormError>}
                <Button type="submit" size="lg" disabled={form.submitting}>
                  {form.submitting ? 'Enviando…' : 'Enviar solicitação'}
                </Button>
              </form>
            )}
          </Panel>
        </div>

        <div>
          <h2 className={styles.h2}>Como funciona</h2>
          <Panel>
            <ol className={styles.steps}>
              {STEPS.map((s) => (
                <li key={s.title}>
                  <div>
                    <strong>{s.title}</strong>
                    <p>{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </Container>
  )
}
