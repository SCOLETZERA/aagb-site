import { Link } from 'react-router-dom'
import styles from './PrivacyNotice.module.css'

interface PrivacyNoticeProps {
  /** O que fazemos com os dados, em poucas palavras (ex.: "combinar a retirada ou a entrega do pedido"). */
  purpose: string
}

/**
 * Aviso curto da LGPD junto ao botão de envio. Não é uma caixa de "aceito": a base legal
 * é atender ao pedido da própria pessoa (LGPD, art. 7º, V), não o consentimento.
 */
export function PrivacyNotice({ purpose }: PrivacyNoticeProps) {
  return (
    <p className={styles.notice}>
      Usamos seus dados só para {purpose}. Eles ficam guardados por até 12 meses e depois são apagados.{' '}
      <Link to="/privacidade">Como cuidamos dos seus dados</Link>
    </p>
  )
}
