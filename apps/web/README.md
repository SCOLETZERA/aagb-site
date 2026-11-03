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

## Painel administrativo

Em `/admin` (só com `VITE_API_URL` definido). Fica em `src/features/admin`, num pacote separado que o público não baixa.

- Login com a conta criada por `npm run user:create -w apps/api` (ou, em desenvolvimento, a de `SEED_ADMIN_EMAIL` no `.env` da API).
- **Diretoria**: resumo, pedidos, solicitações de serviço, ofertas de doação, conteúdo do site e documentos da Transparência.
- **Administração**: tudo isso, mais contas do painel e auditoria.
- A sessão fica em cookies HttpOnly; `adminClient.ts` renova o acesso sozinho quando expira, uma vez só mesmo com várias telas carregando juntas.
- Front e API precisam estar no mesmo site (ex.: `aagb.org.br` e `api.aagb.org.br`), porque os cookies são `SameSite=Strict`.

## Privacidade (LGPD)

Cada formulário público mostra um aviso curto (`PrivacyNotice`) com link para `/privacidade`. Se a forma de contato da associação ou o prazo de 12 meses mudarem, atualize `src/pages/PrivacyPage.tsx`.

## Antes de publicar

- Cadastrar o conteúdo real pelo painel (os dados de exemplo ficam em `packages/shared/src/sample-data.ts`) e trocar as fotos de `public/img` por conteúdo real da associação.
- Preencher `VITE_WHATSAPP_NUMBER` (ver `.env.example`) se quiser pedidos pelo WhatsApp.
- Configurar no servidor de hospedagem: HTTPS, cabeçalhos de segurança (CSP, etc.) e redirecionar qualquer rota para `index.html` (o site usa rotas no navegador).
