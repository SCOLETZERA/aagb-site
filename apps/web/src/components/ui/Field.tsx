import { useId, type ComponentProps, type ReactNode } from 'react'
import styles from './Field.module.css'

interface FieldChrome {
  label: string
  error?: string | undefined
  hint?: string
}

interface ShellProps extends FieldChrome {
  id: string
  children: ReactNode
}

function FieldShell({ id, label, error, hint, children }: ShellProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  )
}

const describedBy = (id: string, error?: string, hint?: string) =>
  [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined

export function TextField({ label, error, hint, ...input }: FieldChrome & ComponentProps<'input'>) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <input
        id={id}
        className={styles.control}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...input}
      />
    </FieldShell>
  )
}

export function TextAreaField({ label, error, hint, ...input }: FieldChrome & ComponentProps<'textarea'>) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <textarea
        id={id}
        className={`${styles.control} ${styles.area}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...input}
      />
    </FieldShell>
  )
}

interface SelectProps extends FieldChrome, ComponentProps<'select'> {
  options: { value: string; label: string }[]
}

export function SelectField({ label, error, hint, options, ...select }: SelectProps) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <select
        id={id}
        className={`${styles.control} ${styles.select}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...select}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

/** Mensagem de erro geral de um formulário (por exemplo, falha de envio). */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p className={styles.formError} role="alert">
      {children}
    </p>
  )
}
