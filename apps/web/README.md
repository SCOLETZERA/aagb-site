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
| `src/domain` | Tipos de domínio (artigos, produtos, doações…). É o formato que a API deve devolver. |
| `src/schemas` | Schemas Zod dos formulários. Reutilizar no servidor para validar de novo. |
| `src/services` | `Api` (contrato) e `mock/` (dados de exemplo). **Ponto de troca para a API real.** |
| `src/features` | Estado com contexto: carrinho, tema, avisos. |
| `src/components` | `ui/` (peças de interface) e `layout/` (cabeçalho, rodapé). |
| `src/pages` | Uma página por rota, carregadas sob demanda. |
| `src/content` | Textos editoriais fixos (ex.: página da feira). |
| `src/styles` | Tokens de design (cores, tipografia, espaços) e base. |

## Ligando ao back-end

1. Criar `src/services/httpApi.ts` implementando a interface `Api` de `src/services/api.ts`, com `fetch` para a API.
2. Trocar `export const api = mockApi` por `httpApi` em `src/services/index.ts`. Nenhuma página precisa mudar.
3. Combinar com o back-end: IDs em texto, datas ISO (`AAAA-MM-DD`), preços em centavos, e `ApiError` com status HTTP para erros.
4. O que o servidor **deve** fazer de novo (o front não é confiável): validar com os mesmos schemas Zod, checar estoque e preço reais do pedido, limitar requisições e autenticar a área administrativa.

## Antes de publicar

- Trocar os dados de `src/services/mock/data.ts` e as fotos de `public/img` por conteúdo real da associação.
- Preencher `VITE_WHATSAPP_NUMBER` (ver `.env.example`) se quiser pedidos pelo WhatsApp.
- Configurar no servidor de hospedagem: HTTPS, cabeçalhos de segurança (CSP, etc.) e redirecionar qualquer rota para `index.html` (o site usa rotas no navegador).
