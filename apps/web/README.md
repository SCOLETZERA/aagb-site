# AAGB – front-end

Site da Associação de Agricultores e Agricultoras na Agricultura Familiar de Bálsamos.
React 19 + TypeScript + Vite. Hoje roda só com dados de exemplo; o back-end (Fastify + Prisma) vive em `apps/api`.

## Comandos (a partir da raiz do repositório)

```bash
npm run dev:web                    # servidor de desenvolvimento em http://localhost:5173
npm run build -w apps/web          # typecheck + build de produção
npm run lint -w apps/web           # ESLint (inclui regras de acessibilidade)
npm test -w apps/web               # Vitest
```

## Como está organizado

| Pasta | Para quê |
| --- | --- |
| `src/domain` | Reexporta os tipos de domínio de `@aagb/shared`, o mesmo formato que a API devolve. |
| `src/schemas` | Reexporta os schemas Zod de `@aagb/shared`; o servidor valida com os mesmos. |
| `src/services` | `Api` (contrato), `httpApi` (API real) e `mock/` (dados de exemplo). |
| `src/features` | Estado com contexto: carrinho, tema, avisos. |
| `src/components` | `ui/` (peças de interface) e `layout/` (cabeçalho, rodapé). |
| `src/pages` | Uma página por rota, carregadas sob demanda. |
| `src/content` | Textos editoriais fixos (ex.: página da feira). |
| `src/styles` | Tokens de design (cores, tipografia, espaços) e base. |

## Ligando ao back-end

`src/services/httpApi.ts` implementa a interface `Api` com `fetch`. Basta definir `VITE_API_URL` em `.env.local` (ex.: `http://localhost:3333`); sem ela, o site continua com os dados de exemplo. Os schemas dos formulários, os tipos de domínio e os dados de exemplo vivem em `packages/shared` e são os mesmos que a API usa. Detalhes do servidor em `apps/api/README.md`.

## Antes de publicar

- Cadastrar o conteúdo real pelo painel (os dados de exemplo ficam em `packages/shared/src/sample-data.ts`) e trocar as fotos de `public/img` por conteúdo real da associação.
- Preencher `VITE_WHATSAPP_NUMBER` (ver `.env.example`) se quiser pedidos pelo WhatsApp.
- Configurar no servidor de hospedagem: HTTPS, cabeçalhos de segurança (CSP, etc.) e redirecionar qualquer rota para `index.html` (o site usa rotas no navegador).
