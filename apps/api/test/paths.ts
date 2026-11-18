import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const TMP_DIR = fileURLToPath(new URL('./.tmp', import.meta.url))
/** Pasta do Postgres temporário dos testes (apagada no fim). */
export const PG_DIR = path.join(TMP_DIR, 'pg')
/** Banco-modelo: já migrado e com os dados de exemplo. Cada arquivo de teste usa uma cópia. */
export const TEMPLATE_DB = 'aagb_modelo'
export const DB_SCHEMA = 'aagb'
