import { randomInt } from 'node:crypto'

/** Sem 0/O, 1/I/L: fácil de ditar por telefone. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

export type ProtocolPrefix = 'PD' | 'SV' | 'DO'

/** Protocolo aleatório (ex.: PD-7KQ2M9XA). Não é sequencial, para não revelar volume nem permitir adivinhar outros. */
export function protocol(prefix: ProtocolPrefix): string {
  let code = ''
  for (let i = 0; i < 8; i++) code += ALPHABET[randomInt(ALPHABET.length)]
  return `${prefix}-${code}`
}
