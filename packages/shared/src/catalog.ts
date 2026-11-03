/** Listas fixas do domínio, compartilhadas entre o front-end e a API. */

export const PRODUCT_CATEGORIES = ['Mel', 'Hortaliças', 'Grãos', 'Laticínios', 'Mudas'] as const
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]

export const PROJECT_STATUSES = ['em-andamento', 'planejado', 'concluido'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const DOCUMENT_CATEGORIES = [
  { id: 'prestacao-de-contas', label: 'Prestação de contas', hint: 'Relatórios financeiros e de atividades da diretoria.' },
  { id: 'convenio', label: 'Convênios e parcerias', hint: 'Convênios públicos e parcerias com órgãos de governo.' },
  { id: 'edital', label: 'Editais', hint: 'Editais e chamadas públicas, como as do PAA e do PNAE.' },
  { id: 'ata', label: 'Atas e estatuto', hint: 'Atas de assembleia e documentos de formação da associação.' },
] as const
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]['id']
export const DOCUMENT_CATEGORY_IDS = DOCUMENT_CATEGORIES.map((c) => c.id) as [DocumentCategory, ...DocumentCategory[]]

/** Nomes dos ícones que o front sabe desenhar. A API só aceita estes no conteúdo. */
export const ICON_NAMES = [
  'news', 'hive', 'sprout', 'barn', 'jar', 'leaf', 'wheat', 'cheese', 'tractor', 'clip', 'cart', 'gift', 'drop',
  'tool', 'building', 'users', 'cap', 'coin', 'menu', 'close', 'search', 'sun', 'moon', 'back', 'chevron', 'check',
  'alert', 'instagram', 'pin', 'minus', 'plus',
] as const
export type IconName = (typeof ICON_NAMES)[number]
