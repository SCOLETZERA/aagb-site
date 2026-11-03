const dateTime = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Fortaleza',
})

/** Data e hora de um registro (ISO completo), no fuso do Ceará. */
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso))

/** Só dígitos, com DDI 55, para abrir conversa no WhatsApp. */
export function whatsappLink(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 11) return null
  return `https://wa.me/55${digits}`
}

/** Sugere um identificador de endereço (ex.: "Mel puro 500 g" → "mel-puro-500-g"). */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}
