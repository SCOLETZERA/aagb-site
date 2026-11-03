import { CONTENT_TYPES, toFormValues, toPayload } from './contentTypes'
import { slugify } from './format'

const byType = (type: string) => CONTENT_TYPES.find((t) => t.type === type)!

describe('conversão do formulário de conteúdo', () => {
  it('produto: preço em reais vira centavos e volta igual', () => {
    const def = byType('products')
    const item = { id: 'mel', name: 'Mel', category: 'Mel', priceCents: 1850, unit: 'pote', producer: 'X', description: 'Bom', stock: 3, icon: 'jar', active: false }
    const values = toFormValues(def, item)
    expect(values).toMatchObject({ priceCents: '18,50', stock: '3', active: false })
    expect(toPayload(def, { ...values, priceCents: '1.234,5' })).toMatchObject({ priceCents: 123450, stock: 3, active: false })
  })

  it('notícia: parágrafos separados por linha em branco e imagem vazia omitida', () => {
    const def = byType('news')
    const payload = toPayload(def, {
      ...toFormValues(def, null),
      title: ' Título ',
      body: 'Primeiro.\n\n\nSegundo\ncom quebra.\n',
      image: '',
    })
    expect(payload.title).toBe('Título')
    expect(payload.body).toEqual(['Primeiro.', 'Segundo\ncom quebra.'])
    expect(payload).not.toHaveProperty('image')
    expect(payload.icon).toBe('news')
  })

  it('sugere identificador sem acentos', () => {
    expect(slugify('Feijão de corda 1 kg')).toBe('feijao-de-corda-1-kg')
  })
})
