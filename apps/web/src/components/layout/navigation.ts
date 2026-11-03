export const NAV_ITEMS = [
  { to: '/', label: 'Início', end: true },
  { to: '/noticias', label: 'Notícias', end: false },
  { to: '/projetos', label: 'Projetos', end: false },
  { to: '/produtos', label: 'Produtos', end: false },
  { to: '/servicos', label: 'Serviços', end: false },
  { to: '/doacoes', label: 'Doações', end: false },
  { to: '/parceiros', label: 'Parceiros', end: false },
] as const

export const ASSOCIATION = {
  name: 'Associação de Agricultores e Agricultoras na Agricultura Familiar de Bálsamos',
  shortName: 'AAGB',
  cnpj: '00.613.476/0001-06',
  foundedYear: 1995,
  place: 'Localidade Bálsamos, Zona Rural, Nova Russas (CE)',
  instagramHandle: '@agropecuariabalsamos',
  instagramUrl: 'https://www.instagram.com/agropecuariabalsamos/',
} as const
