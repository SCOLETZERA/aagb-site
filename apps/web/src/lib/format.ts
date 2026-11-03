const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const longDate = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })

export const formatMoney = (cents: number) => currency.format(cents / 100)

export const formatDate = (iso: string, style: 'long' | 'short' = 'long') =>
  (style === 'long' ? longDate : shortDate).format(new Date(`${iso}T00:00:00Z`))

export const percent = (part: number, total: number) =>
  total <= 0 ? 0 : Math.min(100, Math.round((part / total) * 100))
