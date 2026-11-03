import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { z } from 'zod'
import { validate, type FieldErrors } from '@/schemas/forms'

type ChangeTarget = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

/** Formulário controlado, validado por um schema Zod. Todos os valores são texto, como nos campos HTML. */
export function useForm<S, V extends Record<string, string>>(schema: z.ZodType<S>, initial: V) {
  const [values, setValues] = useState<V>(initial)
  const [errors, setErrors] = useState<FieldErrors<V>>({})
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const setValue = <K extends keyof V>(name: K, value: V[K]) => {
    setValues((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev))
  }

  /** Props prontas para um campo: `<TextField {...form.field('name')} />`. */
  const field = <K extends keyof V & string>(name: K) => ({
    name,
    value: values[name],
    error: errors[name],
    onChange: (e: ChangeEvent<ChangeTarget>) => setValue(name, e.target.value as V[K]),
  })

  const handleSubmit = (onValid: (data: S) => Promise<void> | void) => async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const result = validate(schema, values)
    if (!result.ok) {
      setErrors(result.errors as FieldErrors<V>)
      const first = Object.keys(result.errors)[0]
      if (first) document.getElementsByName(first)[0]?.focus()
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      await onValid(result.data)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Algo deu errado. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setValues(initial)
    setErrors({})
    setFormError(null)
  }

  return { values, setValue, field, errors, submitting, formError, handleSubmit, reset }
}
