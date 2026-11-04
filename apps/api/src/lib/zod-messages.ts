import { z } from 'zod'

export const REQUIRED_MESSAGE = 'Campo obrigatório.'

/**
 * Mensagens em português para as falhas que o schema não descreve (campo ausente, tipo errado).
 * As mensagens escritas nos schemas compartilhados continuam valendo; isto só cobre o que sobra,
 * que de outro modo chegaria ao usuário em inglês e com termos técnicos.
 */
z.config({
  customError: (issue) => {
    if (issue.code === 'invalid_type' && issue.input === undefined) return REQUIRED_MESSAGE
    if (issue.code === 'invalid_type') return 'Valor em formato inválido.'
    if (issue.code === 'unrecognized_keys') return 'Campo não reconhecido.'
    return 'Valor inválido.'
  },
})
