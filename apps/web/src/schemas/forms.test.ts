import { describe, expect, it } from 'vitest'
import { donationOfferSchema, orderSchema, serviceRequestSchema, validate } from './forms'

describe('orderSchema', () => {
  const base = { name: 'Maria da Silva', phone: '(88) 99999-0000', delivery: 'retirada', address: '' }

  it('aceita um pedido para retirada sem endereço', () => {
    expect(validate(orderSchema, base).ok).toBe(true)
  })

  it('exige endereço quando a entrega é em casa', () => {
    const result = validate(orderSchema, { ...base, delivery: 'entrega' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.address).toMatch(/endereço/i)
  })

  it('rejeita telefone sem DDD', () => {
    const result = validate(orderSchema, { ...base, phone: '99999' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.phone).toBeDefined()
  })

  it('rejeita forma de entrega desconhecida', () => {
    expect(validate(orderSchema, { ...base, delivery: 'drone' }).ok).toBe(false)
  })
})

describe('serviceRequestSchema', () => {
  it('exige serviço escolhido e localidade', () => {
    const result = validate(serviceRequestSchema, {
      serviceId: '', name: 'João Pereira', phone: '88999990000', locality: '', desiredDate: '', details: '',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['locality', 'serviceId'])
  })
})

describe('donationOfferSchema', () => {
  const base = { itemId: 'sementes', name: 'Ana Souza', contact: '', quantity: '20 kg', handover: 'levar' }

  it('aceita e-mail ou telefone como contato', () => {
    expect(validate(donationOfferSchema, { ...base, contact: 'ana@exemplo.com' }).ok).toBe(true)
    expect(validate(donationOfferSchema, { ...base, contact: '(88) 98888-7777' }).ok).toBe(true)
  })

  it('rejeita contato inválido', () => {
    expect(validate(donationOfferSchema, { ...base, contact: 'abc' }).ok).toBe(false)
  })
})
