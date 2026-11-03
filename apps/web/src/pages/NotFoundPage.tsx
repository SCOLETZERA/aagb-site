import { NotFoundState } from '@/components/ui/States'
import { usePageTitle } from '@/hooks/usePageTitle'

export function NotFoundPage() {
  usePageTitle('Página não encontrada')
  return <NotFoundState />
}
