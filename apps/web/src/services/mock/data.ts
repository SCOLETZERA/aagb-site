import type { Article, Donation, Need, Partner, Product, Project, ServiceOffer, TransparencyDocument } from '@/domain/types'

/** Ainda sem documentos reais publicados: a página mostra o aviso de lista vazia. */
export const documents: TransparencyDocument[] = []

/**
 * DADOS DE EXEMPLO vindos do protótipo V3. Não são informações reais da associação:
 * devem ser substituídos pelo conteúdo oficial (ou pela API) antes de ir ao ar.
 */

export const articles: Article[] = [
  {
    id: 'feira-da-agricultura-familiar',
    title: 'Feira da Agricultura Familiar reúne produtores de Bálsamos',
    publishedAt: '2026-10-30',
    summary: 'Terceira edição acontece no fim do mês com venda direta ao consumidor.',
    body: [
      'A feira reúne associados com hortaliças, mel, queijos e grãos.',
      'A entrada é gratuita e haverá espaço para troca de sementes.',
    ],
    icon: 'news',
    image: '/img/noticia-feira.jpg',
    imageAlt: 'Agricultor entregando um maço de cenouras a uma cliente em uma banca de feira',
  },
  {
    id: 'doacao-de-sementes',
    title: 'Associação recebe nova doação de sementes',
    publishedAt: '2026-10-28',
    summary: 'Sementes de milho e feijão foram entregues aos associados.',
    body: ['As sementes serão distribuídas conforme o tamanho da área plantada de cada família.'],
    icon: 'wheat',
  },
  {
    id: 'curso-de-manejo-de-abelhas',
    title: 'Curso de manejo de abelhas abre inscrições',
    publishedAt: '2026-10-25',
    summary: 'Vagas limitadas para associados.',
    body: ['O curso tem duas tardes de prática e é voltado a quem quer iniciar na apicultura.'],
    icon: 'hive',
    image: '/img/noticia-apicultura.jpg',
    imageAlt: 'Apicultor retirando um quadro de favo de mel de uma colmeia',
  },
  {
    id: 'reuniao-define-calendario-de-plantio',
    title: 'Reunião mensal define calendário de plantio',
    publishedAt: '2026-10-20',
    summary: 'Associados votam as prioridades da safra.',
    body: ['A reunião é aberta e acontece na sede da associação.'],
    icon: 'drop',
  },
]

export const projects: Project[] = [
  {
    id: 'apicultura',
    title: 'Apicultura',
    status: 'em-andamento',
    summary: 'Produção de mel com novas colmeias.',
    body: ['O projeto instala colmeias e capacita associados no manejo, aumentando a renda com mel e derivados.'],
    icon: 'hive',
  },
  {
    id: 'horta-comunitaria',
    title: 'Horta Comunitária',
    status: 'em-andamento',
    summary: 'Cultivo coletivo de hortaliças.',
    body: ['Área coletiva com irrigação, cuja produção abastece a feira e a merenda local.'],
    icon: 'sprout',
  },
  {
    id: 'caprinos-e-ovinos',
    title: 'Caprinos e Ovinos',
    status: 'planejado',
    summary: 'Melhoramento do rebanho.',
    body: ['Prevê aquisição de matrizes e acompanhamento técnico do manejo sustentável.'],
    icon: 'barn',
  },
]

export const partners: Partner[] = [
  {
    id: 'prefeitura',
    name: 'Prefeitura',
    kind: 'Poder público',
    summary: 'Apoio institucional e doações.',
    body: ['Parceria para feiras, sementes e transporte.'],
    icon: 'building',
  },
  {
    id: 'sindicato-rural',
    name: 'Sindicato Rural',
    kind: 'Sindicato',
    summary: 'Representação dos produtores.',
    body: ['Apoia com capacitação e ferramentas.'],
    icon: 'leaf',
  },
  {
    id: 'empresa-de-extensao',
    name: 'Empresa de Extensão',
    kind: 'Assistência técnica',
    summary: 'Orientação técnica.',
    body: ['Fornece técnicos para visitas.'],
    icon: 'cap',
  },
  {
    id: 'cooperativa',
    name: 'Cooperativa',
    kind: 'Comercialização',
    summary: 'Venda coletiva.',
    body: ['Facilita o acesso a mercados.'],
    icon: 'users',
  },
  {
    id: 'banco-do-nordeste',
    name: 'Banco do Nordeste',
    kind: 'Crédito',
    summary: 'Linhas de crédito rural.',
    body: ['Financiamento para custeio e investimento.'],
    icon: 'coin',
  },
]

export const products: Product[] = [
  { id: 'mel-500g', name: 'Mel puro 500 g', category: 'Mel', priceCents: 1800, unit: 'pote 500 g', producer: 'Apiário Bom Jesus', description: 'Mel de florada silvestre, sem aditivos, direto do apiário.', stock: 12, icon: 'jar' },
  { id: 'mel-1kg', name: 'Mel puro 1 kg', category: 'Mel', priceCents: 3200, unit: 'pote 1 kg', producer: 'Apiário Bom Jesus', description: 'Pote grande de mel puro, ideal para a família toda.', stock: 3, icon: 'jar' },
  { id: 'alface-crespa', name: 'Alface crespa', category: 'Hortaliças', priceCents: 300, unit: 'unidade', producer: 'Horta Comunitária', description: 'Colhida no dia, cultivada sem agrotóxicos.', stock: 40, icon: 'leaf' },
  { id: 'coentro-e-cebolinha', name: 'Coentro e cebolinha', category: 'Hortaliças', priceCents: 300, unit: 'maço', producer: 'Horta Comunitária', description: 'Temperos frescos colhidos na manhã da entrega.', stock: 30, icon: 'leaf' },
  { id: 'milho-5kg', name: 'Milho em grão 5 kg', category: 'Grãos', priceCents: 2500, unit: 'saco 5 kg', producer: 'Família Souza', description: 'Milho selecionado da safra da agricultura familiar.', stock: 15, icon: 'wheat' },
  { id: 'feijao-de-corda', name: 'Feijão de corda 1 kg', category: 'Grãos', priceCents: 900, unit: 'kg', producer: 'Família Lima', description: 'Feijão de corda limpo e embalado.', stock: 4, icon: 'wheat' },
  { id: 'queijo-coalho', name: 'Queijo coalho', category: 'Laticínios', priceCents: 3800, unit: 'kg', producer: 'Família Alves', description: 'Queijo artesanal feito com leite de rebanhos da região.', stock: 8, icon: 'cheese' },
  { id: 'mudas-de-hortalicas', name: 'Mudas de hortaliças', category: 'Mudas', priceCents: 200, unit: 'muda', producer: 'Horta Comunitária', description: 'Mudas de tomate, pimentão e couve prontas para plantio.', stock: 60, icon: 'sprout' },
]

export const services: ServiceOffer[] = [
  { id: 'aluguel-de-maquinas', name: 'Aluguel de máquinas', priceLabel: 'A partir de R$ 120 por hora', leadTime: 'Agendar com 3 dias de antecedência', audience: 'Associados em dia', description: 'Trator com grade e arado para preparo da terra.', icon: 'tractor' },
  { id: 'assistencia-tecnica', name: 'Assistência técnica', priceLabel: 'Gratuito para associados', leadTime: 'Visita em até 7 dias', audience: 'Associados e comunidade', description: 'Orientação de plantio, manejo, solo e controle de pragas.', icon: 'clip' },
  { id: 'venda-coletiva', name: 'Venda coletiva', priceLabel: 'Taxa de 5% sobre a venda', leadTime: 'Na próxima feira', audience: 'Associados', description: 'A associação organiza a logística para o produtor vender direto.', icon: 'cart' },
  { id: 'capacitacao-e-cursos', name: 'Capacitação e cursos', priceLabel: 'Gratuito, vagas limitadas', leadTime: 'Conforme calendário', audience: 'Associados e comunidade', description: 'Cursos de apicultura, horta, manejo de rebanho e gestão.', icon: 'cap' },
]

export const needs: Need[] = [
  { id: 'sementes', name: 'Sementes de milho e feijão', unit: 'kg', goal: 300, received: 200, icon: 'wheat' },
  { id: 'irrigacao', name: 'Kits de irrigação por gotejamento', unit: 'kits', goal: 10, received: 4, icon: 'drop' },
  { id: 'colmeias', name: 'Caixas para colmeias', unit: 'unidades', goal: 20, received: 8, icon: 'hive' },
  { id: 'ferramentas', name: 'Ferramentas manuais', unit: 'peças', goal: 50, received: 35, icon: 'tool' },
  { id: 'mudas-e-adubo', name: 'Mudas e adubo orgânico', unit: 'kg', goal: 200, received: 60, icon: 'sprout' },
]

export const donations: Donation[] = [
  { id: 'd1', receivedAt: '2026-10-28', donor: 'Prefeitura', item: 'Sementes de milho', quantity: '200 kg', category: 'Sementes', usage: 'Distribuídas entre 24 famílias associadas.' },
  { id: 'd2', receivedAt: '2026-10-15', donor: 'Sindicato Rural', item: 'Enxadas, foices e pás', quantity: '35 peças', category: 'Ferramentas', usage: 'Disponíveis para empréstimo na sede.' },
  { id: 'd3', receivedAt: '2026-10-02', donor: 'Parceiro local', item: 'Kit de irrigação', quantity: '4 kits', category: 'Irrigação', usage: 'Instalados na horta comunitária.' },
  { id: 'd4', receivedAt: '2026-09-21', donor: 'Empresa de Extensão', item: 'Sementes de feijão', quantity: '80 kg', category: 'Sementes', usage: 'Distribuídas na reunião mensal.' },
  { id: 'd5', receivedAt: '2026-09-10', donor: 'Cooperativa', item: 'Caixas para colmeias', quantity: '8 unidades', category: 'Apicultura', usage: 'Entregues ao projeto de Apicultura.' },
  { id: 'd6', receivedAt: '2026-08-30', donor: 'Doador anônimo', item: 'Mudas de hortaliças', quantity: '60 mudas', category: 'Mudas', usage: 'Plantadas na horta comunitária.' },
  { id: 'd7', receivedAt: '2026-08-12', donor: 'Prefeitura', item: 'Sementes de hortaliças', quantity: '15 kg', category: 'Sementes', usage: 'Divididas entre os associados.' },
  { id: 'd8', receivedAt: '2026-08-05', donor: 'Sindicato Rural', item: 'Mangueiras de irrigação', quantity: '300 m', category: 'Irrigação', usage: 'Usadas na ampliação da horta.' },
]
