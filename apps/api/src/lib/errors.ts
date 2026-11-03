import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'

/** Erro com mensagem pensada para o usuário final (em português) e status HTTP. */
export class AppError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'AppError'
    this.status = status
  }
}

export const notFound = (message = 'Não encontrado.') => new AppError(404, message)

export interface ErrorBody {
  message: string
  /** Primeiro erro de cada campo, quando a falha é de validação. */
  fields?: Record<string, string>
}

function zodBody(error: ZodError): ErrorBody {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.')
    if (key && !(key in fields)) fields[key] = issue.message
  }
  return { message: error.issues[0]?.message ?? 'Confira os dados enviados.', fields }
}

/** Mensagens para os erros do próprio Fastify, sem detalhes internos. */
const FASTIFY_MESSAGES: Record<number, string> = {
  400: 'Dados inválidos.',
  401: 'Faça login para continuar.',
  403: 'Você não tem permissão para isso.',
  404: 'Não encontrado.',
  413: 'Os dados enviados são grandes demais.',
  415: 'Formato de dados não aceito.',
  429: 'Muitas tentativas. Aguarde um pouco e tente de novo.',
}

export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ZodError) return reply.status(400).send(zodBody(error))
  if (error instanceof AppError) return reply.status(error.status).send({ message: error.message })

  const status = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500
  if (status < 500) {
    return reply.status(status).send({ message: FASTIFY_MESSAGES[status] ?? FASTIFY_MESSAGES[400] })
  }

  // Só nome, código e pilha: mensagens de erro do banco podem conter valores enviados.
  request.log.error({ err: { name: error.name, code: (error as FastifyError).code, stack: error.stack } }, 'erro interno')
  return reply.status(500).send({ message: 'Erro interno. Tente novamente mais tarde.' })
}

export function notFoundHandler(_request: FastifyRequest, reply: FastifyReply) {
  return reply.status(404).send({ message: 'Recurso não encontrado.' })
}
