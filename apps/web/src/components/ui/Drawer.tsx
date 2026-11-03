import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'
import styles from './Drawer.module.css'

interface DrawerProps {
  open: boolean
  onClose(): void
  title: string
  children: ReactNode
  /** Classe extra, por exemplo para um painel mais largo. */
  className?: string
}

/** Painel lateral sobre `<dialog>`: o navegador cuida do foco, do Esc e de bloquear o fundo. */
export function Drawer({ open, onClose, title, children, className }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    // Clicar no fundo escurecido é só um atalho de mouse; no teclado o <dialog> já fecha com Esc e há o botão "Fechar".
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events
    <dialog
      ref={ref}
      className={[styles.drawer, className].filter(Boolean).join(' ')}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={styles.panel}>
        <div className={styles.head}>
          <h2>{title}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
