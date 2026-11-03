import { useEffect, useRef, useState } from 'react'

type Settled<T> = { key: string; data: T; error: null } | { key: string; data: null; error: Error }

/**
 * Carrega um recurso assíncrono (hoje a API simulada, depois a API real).
 * `key` identifica o recurso: quando muda, o carregamento recomeça.
 */
export function useResource<T>(key: string, fetcher: () => Promise<T>) {
  const [settled, setSettled] = useState<Settled<T> | null>(null)
  const [attempt, setAttempt] = useState(0)
  const fetcherRef = useRef(fetcher)
  const fullKey = `${key}#${attempt}`

  useEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    let cancelled = false
    fetcherRef.current().then(
      (data) => {
        if (!cancelled) setSettled({ key: fullKey, data, error: null })
      },
      (error: unknown) => {
        if (!cancelled) {
          setSettled({ key: fullKey, data: null, error: error instanceof Error ? error : new Error(String(error)) })
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [fullKey])

  const current = settled?.key === fullKey ? settled : null
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: current === null,
    reload: () => setAttempt((n) => n + 1),
  }
}
