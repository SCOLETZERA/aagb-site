import { ICON_PATHS, type IconName } from './icon-paths'

interface IconProps {
  name: IconName
  size?: number
  /** Texto para leitores de tela. Sem ele, o ícone é decorativo. */
  label?: string
}

export function Icon({ name, size = 24, label }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      // ICON_PATHS é uma constante do código (nunca vem de usuário nem da API), por isso é seguro injetar.
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  )
}
