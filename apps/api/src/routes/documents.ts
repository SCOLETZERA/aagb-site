import { createReadStream } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { notFound } from '../lib/errors.js'
import { contentDisposition } from '../services/documents.js'
import { idParams } from './public.js'

/** Download público dos PDFs da Transparência: sempre como anexo, nunca exibido como página. */
export async function documentFileRoutes(app: FastifyInstance) {
  app.get('/documents/:id/file', async (req, reply) => {
    const doc = await app.prisma.transparencyDocument.findUnique({ where: idParams.parse(req.params) })
    if (!doc) throw notFound('Documento não encontrado.')
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', contentDisposition(doc.title))
      .header('Content-Length', doc.sizeBytes)
      .header('Cache-Control', 'public, max-age=3600')
      .send(createReadStream(app.documents.fullPath(doc.storedName)))
  })
}
