import type { Api } from './api'
import { mockApi } from './mock/mockApi'

/** Ponto único de troca: quando a API real existir, devolver `httpApi` aqui. */
export const api: Api = mockApi

export { ApiError } from './api'
export type { Api, OrderLine } from './api'
