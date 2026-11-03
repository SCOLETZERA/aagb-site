import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

/** Confere o tipo pelo conteúdo (assinatura "%PDF-"), não pela extensão nem pelo tipo informado. */
export const isPdf = (data: Buffer) => data.subarray(0, 5).toString('latin1') === '%PDF-'

/** Armazena arquivos com nome aleatório: o nome enviado nunca vira caminho no disco. */
export function createDocumentStore(uploadDir: string) {
  const dir = path.resolve(uploadDir)
  const fullPath = (storedName: string) => {
    if (!/^[0-9a-f-]{36}\.pdf$/.test(storedName)) throw new Error('Nome de arquivo armazenado inválido.')
    return path.join(dir, storedName)
  }

  return {
    fullPath,
    async save(data: Buffer): Promise<string> {
      await mkdir(dir, { recursive: true })
      const storedName = `${randomUUID()}.pdf`
      await writeFile(fullPath(storedName), data, { flag: 'wx', mode: 0o640 })
      return storedName
    },
    remove: (storedName: string) => unlink(fullPath(storedName)).catch(() => undefined),
  }
}

export type DocumentStore = ReturnType<typeof createDocumentStore>

/** Nome de download legível e seguro para o cabeçalho Content-Disposition. */
export function contentDisposition(title: string): string {
  const printable = [...title.normalize('NFC')].map((c) => (c.charCodeAt(0) < 0x20 ? ' ' : c)).join('')
  const base = printable.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120) || 'documento'
  const ascii = base.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/[%;]/g, '').trim() || 'documento'
  return `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(`${base}.pdf`)}`
}
