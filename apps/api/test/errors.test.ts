import type { FastifyReply, FastifyRequest } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../src/lib/errors.js'

describe('log de erro interno', () => {
  it('não registra a mensagem do erro, que pode conter dados pessoais', () => {
    const log = { error: vi.fn() }
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() }
    const error = new Error('Invalid prisma.order.create(): name: "Maria das Dores", phone: "88999990000"')
    errorHandler(error, { log } as unknown as FastifyRequest, reply as unknown as FastifyReply)

    const logged = JSON.stringify(log.error.mock.calls)
    expect(logged).not.toContain('Maria das Dores')
    expect(logged).not.toContain('88999990000')
    expect(logged).toContain('at ')
    expect(reply.status).toHaveBeenCalledWith(500)
  })
})
