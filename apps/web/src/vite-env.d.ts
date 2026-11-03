/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Número da associação com DDI e DDD, só dígitos (ex.: 5588999990000). Sem ele, o botão de WhatsApp some. */
  readonly VITE_WHATSAPP_NUMBER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
