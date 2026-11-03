import { PRODUCT_CATEGORIES, PROJECT_STATUSES, type IconName } from '@aagb/shared'

/** Como cada campo aparece no formulário e como o texto digitado vira o valor da API. */
export type FieldKind = 'text' | 'textarea' | 'paragraphs' | 'date' | 'integer' | 'money' | 'select' | 'icon' | 'checkbox'

export interface FieldDef {
  name: string
  label: string
  kind: FieldKind
  hint?: string
  options?: readonly { value: string; label: string }[]
  /** Campo que pode ficar vazio (vai como ausente para a API). */
  optional?: boolean
  wide?: boolean
}

export interface ContentType {
  /** Segmento da rota da API: /api/admin/content/<type>. */
  type: string
  singular: string
  plural: string
  /** Campo usado como título na lista e para sugerir o identificador. */
  titleField: string
  /** Texto curto abaixo do título na lista. */
  describe: (item: Record<string, unknown>) => string
  fields: FieldDef[]
}

const opts = (values: readonly string[], labels: Record<string, string> = {}) =>
  values.map((value) => ({ value, label: labels[value] ?? value }))

const PROJECT_LABEL: Record<string, string> = { 'em-andamento': 'Em andamento', planejado: 'Planejado', concluido: 'Concluído' }

/** Ícones que fazem sentido para conteúdo, com nome em português. Os de interface (menu, fechar…) ficam de fora. */
const CONTENT_ICONS: Partial<Record<IconName, string>> = {
  news: 'Jornal',
  hive: 'Colmeia',
  jar: 'Pote',
  sprout: 'Broto',
  leaf: 'Folha',
  wheat: 'Grãos',
  cheese: 'Queijo',
  drop: 'Gota d’água',
  barn: 'Celeiro',
  tractor: 'Trator',
  tool: 'Ferramenta',
  clip: 'Prancheta',
  cart: 'Carrinho',
  gift: 'Presente',
  coin: 'Moeda',
  building: 'Prédio',
  users: 'Pessoas',
  cap: 'Formatura',
  pin: 'Local',
}

const icon: FieldDef = {
  name: 'icon',
  label: 'Ícone',
  kind: 'icon',
  options: Object.entries(CONTENT_ICONS).map(([value, label]) => ({ value, label })),
}
const paragraphs: FieldDef = {
  name: 'body',
  label: 'Texto',
  kind: 'paragraphs',
  hint: 'Deixe uma linha em branco entre os parágrafos.',
  wide: true,
}

export const CONTENT_TYPES: ContentType[] = [
  {
    type: 'news',
    singular: 'notícia',
    plural: 'Notícias',
    titleField: 'title',
    describe: (i) => String(i.publishedAt),
    fields: [
      { name: 'title', label: 'Título', kind: 'text', wide: true },
      { name: 'publishedAt', label: 'Data de publicação', kind: 'date' },
      icon,
      { name: 'summary', label: 'Resumo', kind: 'textarea', wide: true },
      paragraphs,
      { name: 'image', label: 'Imagem (opcional)', kind: 'text', optional: true, hint: 'Caminho /img/… ou endereço https.' },
      { name: 'imageAlt', label: 'Descrição da imagem (opcional)', kind: 'text', optional: true, hint: 'Para quem usa leitor de tela.' },
    ],
  },
  {
    type: 'projects',
    singular: 'projeto',
    plural: 'Projetos',
    titleField: 'title',
    describe: (i) => PROJECT_LABEL[String(i.status)] ?? String(i.status),
    fields: [
      { name: 'title', label: 'Nome do projeto', kind: 'text', wide: true },
      { name: 'status', label: 'Situação', kind: 'select', options: opts(PROJECT_STATUSES, PROJECT_LABEL) },
      icon,
      { name: 'summary', label: 'Resumo', kind: 'textarea', wide: true },
      paragraphs,
    ],
  },
  {
    type: 'partners',
    singular: 'parceiro',
    plural: 'Parceiros',
    titleField: 'name',
    describe: (i) => String(i.kind),
    fields: [
      { name: 'name', label: 'Nome', kind: 'text' },
      { name: 'kind', label: 'Tipo (ex.: Poder público)', kind: 'text' },
      icon,
      { name: 'summary', label: 'Resumo', kind: 'textarea', wide: true },
      paragraphs,
    ],
  },
  {
    type: 'products',
    singular: 'produto',
    plural: 'Produtos',
    titleField: 'name',
    describe: (i) => `${String(i.category)} · estoque ${String(i.stock)}${i.active === false ? ' · inativo' : ''}`,
    fields: [
      { name: 'name', label: 'Nome', kind: 'text' },
      { name: 'category', label: 'Categoria', kind: 'select', options: opts(PRODUCT_CATEGORIES) },
      { name: 'priceCents', label: 'Preço (R$)', kind: 'money', hint: 'Ex.: 18,00' },
      { name: 'unit', label: 'Unidade (ex.: pote 500 g)', kind: 'text' },
      { name: 'stock', label: 'Estoque', kind: 'integer' },
      { name: 'producer', label: 'Produtor', kind: 'text' },
      icon,
      { name: 'description', label: 'Descrição', kind: 'textarea', wide: true },
      { name: 'active', label: 'À venda no site', kind: 'checkbox' },
    ],
  },
  {
    type: 'services',
    singular: 'serviço',
    plural: 'Serviços',
    titleField: 'name',
    describe: (i) => String(i.priceLabel),
    fields: [
      { name: 'name', label: 'Nome', kind: 'text' },
      { name: 'priceLabel', label: 'Preço (texto livre)', kind: 'text', hint: 'Ex.: A partir de R$ 120 por hora' },
      { name: 'leadTime', label: 'Prazo', kind: 'text' },
      { name: 'audience', label: 'Para quem', kind: 'text' },
      icon,
      { name: 'description', label: 'Descrição', kind: 'textarea', wide: true },
    ],
  },
  {
    type: 'needs',
    singular: 'necessidade',
    plural: 'Necessidades',
    titleField: 'name',
    describe: (i) => `${String(i.received)} de ${String(i.goal)} ${String(i.unit)}`,
    fields: [
      { name: 'name', label: 'O que a associação precisa', kind: 'text', wide: true },
      { name: 'unit', label: 'Unidade (ex.: kg)', kind: 'text' },
      icon,
      { name: 'goal', label: 'Meta', kind: 'integer' },
      { name: 'received', label: 'Já recebido', kind: 'integer' },
    ],
  },
  {
    type: 'donations',
    singular: 'doação recebida',
    plural: 'Doações recebidas',
    titleField: 'item',
    describe: (i) => `${String(i.donor)} · ${String(i.receivedAt)}`,
    fields: [
      { name: 'item', label: 'Item', kind: 'text' },
      { name: 'quantity', label: 'Quantidade', kind: 'text' },
      { name: 'donor', label: 'Doador', kind: 'text', hint: 'Use "Doador anônimo" se a pessoa preferir.' },
      { name: 'receivedAt', label: 'Data do recebimento', kind: 'date' },
      { name: 'category', label: 'Categoria (ex.: Sementes)', kind: 'text' },
      { name: 'usage', label: 'Como foi usada', kind: 'textarea', wide: true },
    ],
  },
]

export type FormValues = Record<string, string | boolean>

/** Valores do formulário (texto) a partir de um item da API. */
export function toFormValues(def: ContentType, item: Record<string, unknown> | null): FormValues {
  const values: FormValues = {}
  for (const f of def.fields) {
    const v = item?.[f.name]
    if (f.kind === 'checkbox') values[f.name] = item ? v !== false : true
    else if (f.kind === 'paragraphs') values[f.name] = Array.isArray(v) ? v.join('\n\n') : ''
    else if (f.kind === 'money') values[f.name] = typeof v === 'number' ? (v / 100).toFixed(2).replace('.', ',') : ''
    else if (f.kind === 'select' || f.kind === 'icon') values[f.name] = v == null ? (f.options?.[0]?.value ?? '') : String(v)
    else if (f.kind === 'date') values[f.name] = v == null ? new Date().toISOString().slice(0, 10) : String(v)
    else values[f.name] = v == null ? '' : String(v)
  }
  return values
}

/** Corpo para a API. A validação de verdade é do servidor; aqui só convertemos os tipos. */
export function toPayload(def: ContentType, values: FormValues): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const f of def.fields) {
    const raw = values[f.name]
    if (f.kind === 'checkbox') {
      body[f.name] = raw === true
      continue
    }
    const text = String(raw ?? '').trim()
    if (f.optional && text === '') continue
    if (f.kind === 'paragraphs') body[f.name] = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    else if (f.kind === 'integer') body[f.name] = text === '' ? null : Number(text)
    else if (f.kind === 'money') body[f.name] = text === '' ? null : Math.round(Number(text.replace(/\./g, '').replace(',', '.')) * 100)
    else body[f.name] = text
  }
  return body
}
