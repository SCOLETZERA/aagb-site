import type { IconName } from '@/components/ui/icon-paths'

/** Texto editorial da página da feira, baseado no documento "Informações-Balsamos". */

export interface FeaabArea {
  id: string
  icon: IconName
  title: string
  text: string
}

export const FEAAB = {
  edition: '10ª FEAAB',
  fullName: 'Feira Agropecuária e da Agricultura Familiar',
  intro:
    'A FEAAB é o encontro anual que liga o campo, os produtores e a comunidade de Nova Russas. Em cada edição, a feira reúne exposição de animais, comida típica e a venda direta de quem produz.',
} as const

export const FEAAB_AREAS: FeaabArea[] = [
  {
    id: 'ovinos-e-caprinos',
    icon: 'barn',
    title: 'Pista de ovinos e caprinos',
    text: 'Exposição e julgamento de raças de destaque na região, com criadores locais, desfile de animais e muita troca de conhecimento técnico.',
  },
  {
    id: 'culinaria-tipica',
    icon: 'cheese',
    title: 'Culinária típica e panelada',
    text: 'Pratos sertanejos servidos em panelas de barro, churrasco de carne de ovino e caprino e delícias regionais na praça de alimentação.',
  },
  {
    id: 'bancas-e-mel',
    icon: 'hive',
    title: 'Bancas de produtos e mel',
    text: 'Mel de abelha e derivados, hortifrúti fresco da agricultura familiar, bananas, temperos verdes e artesanato em madeira e crochê.',
  },
  {
    id: 'sustentabilidade',
    icon: 'sprout',
    title: 'Sustentabilidade e brinquedos',
    text: 'Artesanato ecológico e brinquedos feitos com material reciclável por produtores locais, mostrando a economia circular na comunidade.',
  },
]
