import { ASSOCIATION } from '@/components/layout/navigation'
import { Container, PageHeader } from '@/components/ui/Layout'
import { usePageTitle } from '@/hooks/usePageTitle'
import styles from './PrivacyPage.module.css'

/** Política de privacidade (LGPD) em linguagem simples. Atualizar se a forma de contato ou o prazo mudarem. */
export function PrivacyPage() {
  usePageTitle('Privacidade')

  return (
    <Container>
      <PageHeader
        title="Como cuidamos dos seus dados"
        description="Pedimos só o necessário para atender você, guardamos por pouco tempo e não vendemos nem repassamos nada."
      />
      <div className={styles.prose}>
        <section>
          <h2>Quem cuida dos dados</h2>
          <p>
            A {ASSOCIATION.name} ({ASSOCIATION.shortName}), CNPJ {ASSOCIATION.cnpj}, {ASSOCIATION.place}.
          </p>
        </section>

        <section>
          <h2>O que coletamos e para quê</h2>
          <dl className={styles.uses}>
            <dt>Pedido de produtos</dt>
            <dd>
              Nome e telefone, para combinar a retirada ou a entrega. O endereço só é pedido e guardado quando você escolhe
              receber em casa.
            </dd>
            <dt>Solicitação de serviço</dt>
            <dd>Nome, telefone, localidade, data desejada e detalhes, para agendar o serviço.</dd>
            <dt>Oferta de doação</dt>
            <dd>Nome e um telefone ou e-mail, para combinar a entrega ou a busca da doação.</dd>
          </dl>
          <p>
            Usamos esses dados porque você pediu um atendimento e precisamos deles para responder (Lei Geral de Proteção de
            Dados, art. 7º, inciso V). Não usamos para propaganda.
          </p>
        </section>

        <section>
          <h2>Por quanto tempo</h2>
          <p>
            Até 12 meses depois do envio. Depois disso, o sistema apaga automaticamente nome, telefone, e-mail, endereço e
            detalhes, e guarda só o que serve para a prestação de contas da associação: o que foi pedido ou doado, a
            quantidade e a data.
          </p>
        </section>

        <section>
          <h2>Quem vê os dados</h2>
          <p>
            Só as pessoas da associação responsáveis pelo painel, com login e senha. Cada entrada no painel e cada alteração ficam
            registradas. Não vendemos nem repassamos seus dados a ninguém.
          </p>
        </section>

        <section>
          <h2>Seus direitos</h2>
          <p>
            Você pode pedir para ver, corrigir ou apagar seus dados a qualquer momento. Fale com a associação pelo Instagram{' '}
            <a href={ASSOCIATION.instagramUrl} target="_blank" rel="noopener noreferrer">
              {ASSOCIATION.instagramHandle}
              {' '}
              <span className="visually-hidden">(abre em nova aba)</span>
            </a>{' '}
            ou na sede, informando o número de protocolo que você recebeu.
          </p>
        </section>

        <section>
          <h2>Cookies</h2>
          <p>
            O site não usa cookies de propaganda nem de rastreamento. A escolha de tema claro ou escuro fica salva só no seu
            aparelho. A área administrativa usa cookies de sessão, apenas para manter quem trabalha na associação conectado.
          </p>
        </section>
      </div>
    </Container>
  )
}
