import { useEffect } from 'react'

const SITE = 'AAGB – Agricultura Familiar de Bálsamos'

export function usePageTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} | AAGB` : SITE
  }, [title])
}
