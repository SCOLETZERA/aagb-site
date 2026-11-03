import type { Api } from './api'
import { createHttpApi } from './httpApi'
import { mockApi } from './mock/mockApi'

/** Ponto único de troca: com `VITE_API_URL` definido o site usa a API real; sem ele, os dados de exemplo. */
const apiUrl = import.meta.env.VITE_API_URL
export const api: Api = apiUrl ? createHttpApi(apiUrl) : mockApi

export { ApiError } from './api'
export type { Api, OrderLine } from './api'
