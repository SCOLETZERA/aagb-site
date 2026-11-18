import { useRef, useState, type FormEvent } from 'react'
import { DOCUMENT_CATEGORIES, type TransparencyDocument } from '@aagb/shared'
import { Button } from '@/components/ui/Button'
import { FormError, SelectField, TextField } from '@/components/ui/Field'
import { Panel } from '@/components/ui/Layout'
import { EmptyState, ResourceState } from '@/components/ui/States'
import { useToast } from '@/features/toast/ToastContext'
import { formatDate } from '@/lib/format'
import { ApiError } from '@/services/api'
import { useAdminAuth } from '../AdminAuth'
import { AdminHeader, useAdminResource } from '../ui'
import styles from '../admin.module.css'

const MAX_BYTES = 10 * 1024 * 1024
const CATEGORY_OPTIONS = DOCUMENT_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))
const today = () => new Date().toISOString().slice(0, 10)

export function DocumentsPage() {
  const { client } = useAdminAuth()
  const toast = useToast()
  const docs = useAdminResource<TransparencyDocument[]>('/documents')
  const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/+$/, '') ?? ''

  async function remove(doc: TransparencyDocument) {
    if (!window.confirm(`Tirar "${doc.title}" do site? O arquivo é apagado.`)) return
    try {
      await client.request(`/admin/documents/${encodeURIComponent(doc.id)}`, { method: 'DELETE' })
      toast.show('Documento removido.')
      docs.reload()
    } catch (error) {
      toast.show(error instanceof ApiError ? error.message : 'Não foi possível remover.')
    }
  }

  return (
    <>
      <AdminHeader title="Documentos" description="PDFs da página Transparência: prestação de contas, convênios, editais e atas." />
      <Panel className={styles.section}>
        <UploadForm onUploaded={docs.reload} />
      </Panel>

      <section className={styles.section} aria-labelledby="publicados">
        <h2 id="publicados">Publicados</h2>
        {docs.loading || docs.error ? (
          <ResourceState resource={docs} />
        ) : docs.data!.length === 0 ? (
          <EmptyState title="Nenhum documento publicado ainda." />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Título</th>
                  <th scope="col">Categoria</th>
                  <th scope="col">Data</th>
                  <th scope="col">
                    <span className="visually-hidden">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {docs.data!.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <a href={`${apiUrl}${d.url}`}>{d.title}</a>
                    </td>
                    <td>{DOCUMENT_CATEGORIES.find((c) => c.id === d.category)?.label ?? d.category}</td>
                    <td>{formatDate(d.publishedAt, 'short')}</td>
                    <td>
                      <button type="button" className={`${styles.linkButton} ${styles.danger}`} onClick={() => void remove(d)}>
                        Remover <span className="visually-hidden">{d.title}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function UploadForm({ onUploaded }: { onUploaded(): void }) {
  const { client } = useAdminAuth()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<string>(CATEGORY_OPTIONS[0]!.value)
  const [publishedAt, setPublishedAt] = useState(today)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const file = fileRef.current?.files?.[0]
    const local: Record<string, string> = {}
    if (title.trim().length < 3) local.title = 'Informe o título.'
    if (!file) local.file = 'Escolha o arquivo PDF.'
    else if (file.size > MAX_BYTES) local.file = 'O arquivo passa de 10 MB.'
    else if (!file.name.toLowerCase().endsWith('.pdf')) local.file = 'O arquivo precisa ser um PDF.'
    setErrors(local)
    if (Object.keys(local).length || !file) return

    // A API exige os campos antes do arquivo.
    const form = new FormData()
    form.append('title', title.trim())
    form.append('category', category)
    form.append('publishedAt', publishedAt)
    form.append('file', file)
    setSending(true)
    try {
      await client.request('/admin/documents', { method: 'POST', body: form })
      toast.show('Documento publicado.')
      setTitle('')
      if (fileRef.current) fileRef.current.value = ''
      onUploaded()
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fields)
        setFormError(error.message)
      } else setFormError('Não foi possível enviar.')
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <h2 className={styles.section}>Publicar documento</h2>
      <div className={styles.formGrid}>
        <div className={styles.wide}>
          <TextField label="Título" value={title} error={errors.title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <SelectField label="Categoria" options={CATEGORY_OPTIONS} value={category} error={errors.category} onChange={(e) => setCategory(e.target.value)} />
        <TextField label="Data do documento" type="date" value={publishedAt} error={errors.publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
        <div className={styles.wide}>
          <TextField ref={fileRef} label="Arquivo PDF (até 10 MB)" type="file" accept="application/pdf,.pdf" error={errors.file} />
        </div>
      </div>
      {formError && <FormError>{formError}</FormError>}
      <Button type="submit" disabled={sending}>
        {sending ? 'Enviando…' : 'Publicar'}
      </Button>
    </form>
  )
}
