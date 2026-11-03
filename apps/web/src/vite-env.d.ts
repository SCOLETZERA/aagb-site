/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Número da associação com DDI e DDD, só dígitos (ex.: 5588999990000). Sem ele, o botão de WhatsApp some. */
  readonly VITE_WHATSAPP_NUMBER?: string
  /** Endereço da API (ex.: https://api.aagb.org.br). Sem ele, o site usa os dados de exemplo. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
