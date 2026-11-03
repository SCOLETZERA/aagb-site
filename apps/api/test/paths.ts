import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const TMP_DIR = fileURLToPath(new URL('./.tmp', import.meta.url))
export const TEMPLATE_DB = path.join(TMP_DIR, 'template.db')
