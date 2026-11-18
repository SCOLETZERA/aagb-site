import { useState, type FormEvent } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Drawer'
import { FormError, SelectField, TextAreaField, TextField } from '@/components/ui/Field'
import { EmptyState, ResourceState } from '@/components/ui/States'
import { useToast } from '@/features/toast/ToastContext'
import { ApiError } from '@/services/api'
import { useAdminAuth } from '../AdminAuth'
import { CONTENT_TYPES, toFormValues, toPayload, type ContentType, type FieldDef, type FormValues } from '../contentTypes'
import { slugify } from '../format'
import { AdminHeader, useAdminResource } from '../ui'
import styles from '../admin.module.css'

type Item = Record<string, unknown> & { id: string }
type Editing = { mode: 'new' } | { mode: 'edit'; item: Item } | null

export function ContentPage() {
  const { type } = useParams()
  const def = CONTENT_TYPES.find((t) => t.type === type)
  if (!def) return <Navigate to="/admin" replace />
  // `key` zera o estado ao trocar de tipo de conteúdo.
  return <ContentList key={def.type} def={def} />
}

function ContentList({ def }: { def: ContentType }) {
  const { client } = useAdminAuth()
  const toast = useToast()
  const list = useAdminResource<Item[]>(`/admin/content/${def.type}`)
  const [editing, setEditing] = useState<Editing>(null)

  async function remove(item: Item) {
    const title = String(item[def.titleField])
    const note = def.type === 'products' ? ' O produto sai da vitrine, mas os pedidos antigos continuam.' : ''
    if (!window.confirm(`Excluir "${title}"?${note}`)) return
    try {
      await client.request(`/admin/content/${def.type}/${encodeURIComponent(item.id)}`, { method: 'DELETE' })
      toast.show(`"${title}" excluído.`)
      list.reload()
    } catch (error) {
      toast.show(error instanceof ApiError ? error.message : 'Não foi possível excluir.')
    }
  }

  return (
    <>
      <AdminHeader
        title={def.plural}
        description="O que é salvo aqui aparece no site na hora."
        actions={<Button onClick={() => setEditing({ mode: 'new' })}>Cadastrar {def.singular}</Button>}
      />

      {list.loading || list.error ? (
        <ResourceState resource={list} />
      ) : list.data!.length === 0 ? (
        <EmptyState title="Nada cadastrado ainda." />
      ) : (
        <ul className={styles.items}>
          {list.data!.map((item) => (
            <li key={item.id} className={styles.item}>
              <div className={styles.itemHead}>
                <h2>{String(item[def.titleField])}</h2>
                <span className={styles.muted}>{def.describe(item)}</span>
              </div>
              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => setEditing({ mode: 'edit', item })}>
                  Editar <span className="visually-hidden">{String(item[def.titleField])}</span>
                </Button>
                {!(def.type === 'products' && item.active === false) && (
                  <button type="button" className={`${styles.linkButton} ${styles.danger}`} onClick={() => void remove(item)}>
                    Excluir <span className="visually-hidden">{String(item[def.titleField])}</span>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.mode === 'edit' ? `Editar ${def.singular}` : `Cadastrar ${def.singular}`}
        className={styles.editor}
      >
        {editing && (
          <Editor
            key={editing.mode === 'edit' ? editing.item.id : 'new'}
            def={def}
            item={editing.mode === 'edit' ? editing.item : null}
            onSaved={(title) => {
              toast.show(`"${title}" salvo.`)
              setEditing(null)
              list.reload()
            }}
          />
        )}
      </Drawer>
    </>
  )
}

function Editor({ def, item, onSaved }: { def: ContentType; item: Item | null; onSaved(title: string): void }) {
  const { client } = useAdminAuth()
  const [values, setValues] = useState<FormValues>(() => toFormValues(def, item))
  const [id, setId] = useState(item?.id ?? '')
  const [idTouched, setIdTouched] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const set = (name: string, value: string | boolean) => {
    setValues((v) => ({ ...v, [name]: value }))
    setErrors((e) => (e[name] ? { ...e, [name]: '' } : e))
    // Sugere o identificador a partir do título enquanto a pessoa não mexer nele.
    if (!item && !idTouched && name === def.titleField && typeof value === 'string') setId(slugify(value))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    const payload = toPayload(def, values)
    try {
      const path = `/admin/content/${def.type}`
      if (item) await client.request(`${path}/${encodeURIComponent(item.id)}`, { method: 'PUT', body: payload })
      else await client.request(path, { method: 'POST', body: { id, ...payload } })
      onSaved(String(values[def.titleField]))
    } catch (error) {
      if (error instanceof ApiError) {
        // "body.0" → "body": o erro aparece no campo inteiro.
        const byField: Record<string, string> = {}
        for (const [key, message] of Object.entries(error.fields)) {
          const name = key.split('.')[0]!
          byField[name] ??= message
        }
        setErrors(byField)
        setFormError(Object.keys(byField).length ? 'Confira os campos marcados.' : error.message)
      } else {
        setFormError('Não foi possível salvar.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className={styles.formGrid}>
        {!item && (
          <div className={styles.wide}>
            <TextField
              label="Identificador no endereço"
              hint="Aparece no link do site. Só letras minúsculas, números e hífens. Não muda depois."
              value={id}
              error={errors.id}
              onChange={(e) => {
                setIdTouched(true)
                setId(e.target.value)
              }}
            />
          </div>
        )}
        {def.fields.map((f) => (
          <div key={f.name} className={f.wide ? styles.wide : undefined}>
            <FieldInput field={f} value={values[f.name]!} error={errors[f.name]} onChange={(v) => set(f.name, v)} />
          </div>
        ))}
      </div>
      {formError && <FormError>{formError}</FormError>}
      <div className={styles.editorActions}>
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
    </form>
  )
}

function FieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: FieldDef
  value: string | boolean
  error: string | undefined
  onChange(value: string | boolean): void
}) {
  const common = { label: field.label, error, ...(field.hint ? { hint: field.hint } : {}) }
  switch (field.kind) {
    case 'checkbox':
      return (
        <label className={styles.check}>
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {field.label}
        </label>
      )
    case 'textarea':
    case 'paragraphs':
      return (
        <TextAreaField
          {...common}
          rows={field.kind === 'paragraphs' ? 8 : 3}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'select':
    case 'icon':
      return <SelectField {...common} options={[...(field.options ?? [])]} value={String(value)} onChange={(e) => onChange(e.target.value)} />
    case 'date':
      return <TextField {...common} type="date" value={String(value)} onChange={(e) => onChange(e.target.value)} />
    case 'integer':
      return <TextField {...common} type="number" inputMode="numeric" min={0} step={1} value={String(value)} onChange={(e) => onChange(e.target.value)} />
    case 'money':
      return <TextField {...common} inputMode="decimal" value={String(value)} onChange={(e) => onChange(e.target.value)} />
    default:
      return <TextField {...common} value={String(value)} onChange={(e) => onChange(e.target.value)} />
  }
}
