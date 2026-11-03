# AAGB – API

Back-end do site da AAGB: Fastify + Prisma + Zod, com autenticação JWT em cookie para o painel administrativo.
Implementa o contrato `Api` do front (`apps/web/src/services/api.ts`) e valida os formulários com os mesmos schemas Zod, que ficam em `packages/shared`.

## Primeiros passos (a partir da raiz do repositório)

```bash
npm install                                  # também gera o client do Prisma
cp apps/api/.env.example apps/api/.env       # preencha JWT_SECRET
npm run db:push -w apps/api                  # cria as tabelas
npm run db:seed -w apps/api                  # dados de exemplo (não são dados reais); com SEED_ADMIN_* no .env, cria uma conta de teste do painel
npm run user:create -w apps/api -- --email voce@exemplo.org --name "Seu Nome" --role admin
npm run dev:api                              # http://localhost:3333
```

Para o front usar a API, crie `apps/web/.env.local` com `VITE_API_URL=http://localhost:3333`.

## Comandos

| Comando | Para quê |
| --- | --- |
| `npm run dev -w apps/api` | servidor com recarga automática |
| `npm test -w apps/api` | testes de integração (cada arquivo usa um banco SQLite descartável) |
| `npm run typecheck -w apps/api` / `npm run lint -w apps/api` | tipos e lint |
| `npm run build -w apps/api` | gera `dist/server.js` e `dist/create-user.js` com esbuild |
| `npm start -w apps/api` | roda o build |

## Rotas

Públicas (sem login):

- `GET /api/news`, `/api/news/:id`, `/api/projects`, `/api/projects/:id`, `/api/partners`, `/api/partners/:id`, `/api/products`, `/api/products/:id`, `/api/services`, `/api/needs`, `/api/donations`, `/api/documents`
- `GET /api/documents/:id/file`: download do PDF, sempre como anexo
- `POST /api/orders` `{ order, lines: [{ productId, quantity }] }`, `POST /api/service-requests`, `POST /api/donation-offers`: devolvem `201 { protocol }`

Painel (`/api/admin`, cookie de sessão):

| Rota | Papéis |
| --- | --- |
| `POST auth/login`, `POST auth/refresh`, `POST auth/logout`, `GET auth/me` | todos |
| `GET/PATCH orders`, `service-requests`, `donation-offers` (+ `POST :id/anonymize`) | admin, diretoria |
| `GET/POST/PUT/DELETE content/{news,projects,partners,products,services,needs,donations}` | admin, diretoria |
| `POST documents` (multipart: `title`, `category`, `publishedAt` e depois `file`), `DELETE documents/:id` | admin, diretoria |
| `GET reports/summary` | admin, diretoria |
| `GET/POST/PATCH users`, `PUT users/:id/password`, `GET audit` | admin |

Erros: `{ "message": "texto em português", "fields"?: { "campo": "erro" } }` com o status HTTP adequado.

## Segurança: o que está implementado

- **Senhas** com bcrypt (custo 12, mínimo 12 caracteres). Login devolve sempre "E-mail ou senha incorretos.", com hash fictício quando o usuário não existe, para não revelar quem tem conta.
- **Força bruta**: bloqueio progressivo da conta após 5 falhas (1, 2, 4… até 60 minutos) e limite de 10 tentativas de login por minuto por IP.
- **Sessão**: access token JWT HS256 de 15 minutos e refresh token opaco de 7 dias, ambos em cookies `HttpOnly; SameSite=Strict; Secure`. Só o hash SHA-256 do refresh vai ao banco. Cada uso troca o token; reusar um token antigo revoga todas as sessões daquele login. Usuário e sessão são conferidos no banco a cada requisição, então logout, desativação e troca de papel valem na hora.
- **CSRF**: rotas do painel que mudam dados exigem `Origin` da lista `CORS_ORIGINS`; o servidor só aceita JSON (e multipart no upload), que outro site não consegue enviar sem passar pelo CORS.
- **Pedidos**: o cliente manda só produto e quantidade. Preço, total e estoque vêm do banco; a baixa do estoque é um update condicional dentro da transação.
- **Validação**: Zod em toda entrada, com limites de tamanho; corpo JSON de até 64 KB; formulários públicos limitados a 5 envios por minuto por IP.
- **Cabeçalhos**: helmet (CSP `default-src 'none'`, HSTS, nosniff, `no-referrer`), CORS só com as origens configuradas, `Cache-Control: no-store` no painel.
- **Upload**: só PDF, conferido pela assinatura `%PDF-` do conteúdo; até 10 MB; salvo com nome aleatório; servido com `Content-Type: application/pdf` e `Content-Disposition: attachment`.
- **LGPD**: o endereço só é guardado em entregas. Dados pessoais são anonimizados após `PERSONAL_DATA_RETENTION_DAYS` (365 por padrão), ao iniciar e a cada 24 h, e o painel pode anonimizar um registro a pedido do titular. Logs não registram IP, cabeçalhos, query string nem corpo.
- **Auditoria**: login e toda escrita do painel registram quem, o quê e quando, sem dados pessoais.
- **Configuração**: tudo vem de variáveis de ambiente validadas ao iniciar; em produção a API recusa subir com cookies sem `Secure` ou bcrypt abaixo de 12.

## Produção

- **Banco**: troque `provider` para `"postgresql"` em `prisma/schema.prisma`, aponte `DATABASE_URL` para o Postgres e use `prisma migrate deploy` (gere as migrações com `prisma migrate dev` antes do primeiro deploy).
- **HTTPS** obrigatório (`COOKIE_SECURE=true`). Atrás de proxy, `TRUST_PROXY=1` (o número de proxies à frente da API); nunca `true`, que aceitaria qualquer `X-Forwarded-For` e anularia o limite por IP.
- **Mesmo site**: os cookies são `SameSite=Strict`, então o front e a API precisam estar no mesmo site (ex.: `aagb.org.br` e `api.aagb.org.br`).
- **`UPLOAD_DIR`** precisa estar num disco persistente, com backup junto com o banco.
- O CSP aqui vale só para as respostas da API; o servidor que entrega o front precisa do próprio CSP.

## Dependências

- `package-lock.json` versionado; rode `npm audit` antes de cada deploy.
- Scripts de instalação ficam bloqueados por padrão (npm 12). Os aprovados estão em `allowScripts` no `package.json` da raiz, presos à versão: atualizar `bcrypt`, `prisma`, `@prisma/client`, `@prisma/engines` ou `esbuild` exige aprovar de novo (`npm install-scripts approve <pacote>`).
- Situação em 03/11/2026: os 3 avisos altos da CLI do Prisma 6 (`deepmerge-ts` < 8, estouro de pilha ao mesclar objetos recursivos) foram resolvidos com `overrides` no `package.json` da raiz, que força `deepmerge-ts@8.0.2`. Ao migrar para o Prisma 7, remova esse override. Restam 12 avisos moderados no ESLint (`minimatch`), ferramenta só de desenvolvimento que não entra em `dist/`; forçar o `minimatch` novo quebraria o ESLint. Não use `npm audit fix --force`.
