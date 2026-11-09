import { randomUUID } from 'node:crypto'
import { DOCUMENT_CATEGORY_IDS } from '@aagb/shared'
import multipart from '@fastify/multipart'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError, notFound } from '../../lib/errors.js'
import { toDocument } from '../../lib/mappers.js'
import { adminOf, requireAdmin } from '../../plugins/auth.js'
import { audit } from '../../services/audit.js'
import { MAX_DOCUMENT_BYTES, isPdf } from '../../services/documents.js'
import { idParams } from '../public.js'
import { isoDate } from './content.js'

const fieldsSchema = z.object({
  title: z.string().trim().min(3, 'Informe o título.').max(200, 'Use no máximo 200 caracteres.'),
  category: z.enum(DOCUMENT_CATEGORY_IDS, 'Categoria inválida.'),
  publishedAt: isoDate,
})

/**
 * Documentos da Transparência. Envio em multipart/form-data com os campos
 * `title`, `category` e `publishedAt` ANTES do campo `file` (um PDF de até 10 MB).
 */
export async function adminDocumentRoutes(app: FastifyInstance) {
  const db = app.prisma
  await app.register(multipart, {
    limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1, fields: 5, fieldSize: 1000, parts: 6, headerPairs: 50 },
  })
  app.addHook('preHandler', requireAdmin())

  app.post('/documents', async (req, reply) => {
    if (!req.isMultipart()) throw new AppError(415, 'Envie o documento como formulário com arquivo.')
    const file = await req.file()
    if (!file) throw new AppError(400, 'Escolha o arquivo PDF.')

    const raw: Record<string, unknown> = {}
    for (const [name, field] of Object.entries(file.fields)) {
      if (field && !Array.isArray(field) && field.type === 'field') raw[name] = field.value
    }
    const fields = fieldsSchema.parse(raw)

    const data = await file.toBuffer()
    if (!isPdf(data)) throw new AppError(415, 'O arquivo precisa ser um PDF.')

    const storedName = await app.documents.save(data)
    try {
      const doc = await db.transparencyDocument.create({
        data: { id: randomUUID(), ...fields, storedName, sizeBytes: data.length },
      })
      await audit(db, adminOf(req).id, 'documents.create', `documents:${doc.id}`)
      return reply.status(201).send(toDocument(doc))
    } catch (error) {
      await app.documents.remove(storedName)
      throw error
    }
  })

  app.delete('/documents/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params)
    const doc = await db.transparencyDocument.findUnique({ where: { id } })
    if (!doc) throw notFound('Documento não encontrado.')
    await db.transparencyDocument.delete({ where: { id } })
    await app.documents.remove(doc.storedName)
    await audit(db, adminOf(req).id, 'documents.delete', `documents:${id}`)
    return reply.status(204).send()
  })
}
