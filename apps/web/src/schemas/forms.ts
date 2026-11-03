import { z } from 'zod'

const name = z.string().trim().min(3, 'Informe seu nome completo.').max(120, 'Use no máximo 120 caracteres.')

const phone = z
  .string()
  .trim()
  .refine((v) => /^\d{10,11}$/.test(v.replace(/\D/g, '')), 'Informe um telefone com DDD, por exemplo (88) 99999-0000.')

export const orderSchema = z
  .object({
    name,
    phone,
    delivery: z.enum(['retirada', 'entrega']),
    address: z.string().trim().max(200, 'Use no máximo 200 caracteres.'),
  })
  .superRefine((v, ctx) => {
    if (v.delivery === 'entrega' && v.address.length < 5) {
      ctx.addIssue({ code: 'custom', path: ['address'], message: 'Informe o endereço para a entrega.' })
    }
  })
export type OrderForm = z.infer<typeof orderSchema>

export const serviceRequestSchema = z.object({
  serviceId: z.string().min(1, 'Escolha um serviço.'),
  name,
  phone,
  locality: z.string().trim().min(2, 'Informe a comunidade ou localidade.').max(120, 'Use no máximo 120 caracteres.'),
  desiredDate: z.string().refine((v) => v === '' || !Number.isNaN(Date.parse(v)), 'Data inválida.'),
  details: z.string().trim().max(1000, 'Use no máximo 1000 caracteres.'),
})
export type ServiceRequestForm = z.infer<typeof serviceRequestSchema>

const emailOrPhone = z
  .string()
  .trim()
  .min(1, 'Informe um telefone ou e-mail para contato.')
  .refine(
    (v) => z.email().safeParse(v).success || /^\d{10,11}$/.test(v.replace(/\D/g, '')),
    'Use um e-mail válido ou um telefone com DDD.',
  )

export const donationOfferSchema = z.object({
  itemId: z.string().min(1, 'Escolha o que você quer doar.'),
  name,
  contact: emailOrPhone,
  quantity: z.string().trim().min(1, 'Informe a quantidade ou o valor.').max(80, 'Use no máximo 80 caracteres.'),
  handover: z.enum(['levar', 'buscar']),
})
export type DonationOfferForm = z.infer<typeof donationOfferSchema>

export type FieldErrors<T> = Partial<Record<keyof T, string>>

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors<T> }

/** Valida os dados e devolve o primeiro erro de cada campo. */
export function validate<T>(schema: z.ZodType<T>, values: unknown): ValidationResult<T> {
  const result = schema.safeParse(values)
  if (result.success) return { ok: true, data: result.data }
  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '')
    if (key && !(key in errors)) errors[key] = issue.message
  }
  return { ok: false, errors: errors as FieldErrors<T> }
}
