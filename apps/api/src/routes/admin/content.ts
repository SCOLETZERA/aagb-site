import { ICON_NAMES, PRODUCT_CATEGORIES, PROJECT_STATUSES } from '@aagb/shared'
import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError, notFound } from '../../lib/errors.js'
import { toArticle, toDonation, toNeed, toPartner, toProduct, toProject, toService } from '../../lib/mappers.js'
import { adminOf, requireAdmin } from '../../plugins/auth.js'
import { audit } from '../../services/audit.js'
import { idParams } from '../public.js'

// ---------- Campos ----------

export const slug = z
  .string()
  .max(80, 'Use no máximo 80 caracteres.')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use só letras minúsculas, números e hífens (ex.: mel-500g).')
const text = (max: number) => z.string().trim().min(1, 'Campo obrigatório.').max(max, `Use no máximo ${max} caracteres.`)
export const isoDate = z.iso.date('Use a data no formato AAAA-MM-DD.')
const icon = z.enum(ICON_NAMES, 'Ícone inválido.')
const paragraphs = z.array(text(5000)).min(1, 'Escreva pelo menos um parágrafo.').max(50)
const count = z.number().int().min(0).max(1_000_000)
/** Imagem do próprio site (/img/…) ou endereço https. Nada de `javascript:` ou `data:`. */
const imagePath = z
  .string()
  .max(300)
  // "(?!\/)" barra "//outro-site.com/…", que o navegador leria como endereço de outro site.
  .refine((v) => /^\/(?!\/)[\w\-./]+$/.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v), 'Use um caminho /img/… ou um endereço https.')

const schemas = {
  news: z.object({
    title: text(200),
    publishedAt: isoDate,
    summary: text(400),
    body: paragraphs,
    icon,
    // Ausente no PUT = remover a imagem.
    image: imagePath.nullable().default(null),
    imageAlt: text(300).nullable().default(null),
  }),
  projects: z.object({ title: text(200), status: z.enum(PROJECT_STATUSES), summary: text(400), body: paragraphs, icon }),
  partners: z.object({ name: text(200), kind: text(100), summary: text(400), body: paragraphs, icon }),
  products: z.object({
    name: text(120),
    category: z.enum(PRODUCT_CATEGORIES, 'Categoria inválida.'),
    priceCents: z.number().int().min(0).max(10_000_000),
    unit: text(60),
    producer: text(120),
    description: text(1000),
    stock: count,
    icon,
    active: z.boolean().default(true),
  }),
  services: z.object({
    name: text(120),
    priceLabel: text(120),
    leadTime: text(120),
    audience: text(120),
    description: text(1000),
    icon,
  }),
  needs: z.object({ name: text(120), unit: text(40), goal: count, received: count, icon }),
  donations: z.object({
    receivedAt: isoDate,
    donor: text(120),
    item: text(200),
    quantity: text(80),
    category: text(60),
    usage: text(400),
  }),
}

type Path = keyof typeof schemas

/** O mínimo dos delegates do Prisma que o CRUD genérico usa. */
interface Delegate<Row> {
  findMany(args: { orderBy: { createdAt: 'desc' } }): Promise<Row[]>
  create(args: { data: Record<string, unknown> }): Promise<Row>
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<Row>
  delete(args: { where: { id: string } }): Promise<Row>
}

interface Resource<Row> {
  delegate: Delegate<Row>
  toOut: (row: Row) => unknown
  /** Produtos não são apagados: ficam inativos para não quebrar pedidos antigos. */
  softDelete?: boolean
}

/** Os delegates do Prisma têm assinaturas genéricas demais para o TypeScript casar sozinho. */
function resource<Row>(delegate: unknown, toOut: (row: Row) => unknown, softDelete = false): Resource<unknown> {
  return { delegate: delegate as Delegate<unknown>, toOut: toOut as (row: unknown) => unknown, softDelete }
}

/** Listas viram texto JSON no banco. */
const toData = (input: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(input).map(([k, v]) => [k, Array.isArray(v) ? JSON.stringify(v) : v]))

/** CRUD do conteúdo público. Diretoria e administradores podem editar. */
export async function contentRoutes(app: FastifyInstance) {
  const db = app.prisma
  app.addHook('preHandler', requireAdmin())

  const resources: Record<Path, Resource<unknown>> = {
    news: resource(db.article, toArticle),
    projects: resource(db.project, toProject),
    partners: resource(db.partner, toPartner),
    products: resource(db.product, (p: Prisma.ProductGetPayload<object>) => ({ ...toProduct(p), active: p.active }), true),
    services: resource(db.serviceOffer, toService),
    needs: resource(db.need, toNeed),
    donations: resource(db.donation, toDonation),
  }

  for (const path of Object.keys(schemas) as Path[]) {
    const schema = schemas[path]
    const { delegate, toOut, softDelete } = resources[path]
    const createSchema = schema.extend({ id: slug })

    app.get(`/${path}`, async () => (await delegate.findMany({ orderBy: { createdAt: 'desc' } })).map(toOut))

    app.post(`/${path}`, async (req, reply) => {
      const input = createSchema.parse(req.body)
      const row = await delegate.create({ data: toData(input) }).catch(rethrow)
      await audit(db, adminOf(req).id, `${path}.create`, `${path}:${input.id}`)
      return reply.status(201).send(toOut(row))
    })

    app.put(`/${path}/:id`, async (req) => {
      const { id } = idParams.parse(req.params)
      const input = schema.parse(req.body)
      const row = await delegate.update({ where: { id }, data: toData(input) }).catch(rethrow)
      await audit(db, adminOf(req).id, `${path}.update`, `${path}:${id}`)
      return toOut(row)
    })

    app.delete(`/${path}/:id`, async (req, reply) => {
      const { id } = idParams.parse(req.params)
      if (softDelete) await delegate.update({ where: { id }, data: { active: false } }).catch(rethrow)
      else await delegate.delete({ where: { id } }).catch(rethrow)
      await audit(db, adminOf(req).id, `${path}.delete`, `${path}:${id}`)
      return reply.status(204).send()
    })
  }
}

/** Traduz os erros conhecidos do Prisma para mensagens ao usuário. */
function rethrow(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw new AppError(409, 'Já existe um item com esse identificador.')
    if (error.code === 'P2025') throw notFound('Item não encontrado.')
  }
  throw error
}
