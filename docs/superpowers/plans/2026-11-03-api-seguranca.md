# API e segurança da AAGB: plano de implementação

> **Para agentes:** use superpowers:executing-plans para executar tarefa por tarefa. Passos em caixas (`- [ ]`).

**Objetivo:** API Fastify em `apps/api` que implementa o contrato `Api` do front, com painel administrativo autenticado e as proteções da seção 5 de `docs/HANDOFF-backend-seguranca.md`.

**Arquitetura:** `packages/shared` guarda os schemas Zod dos formulários e as listas fixas (categorias, ícones), usados pelo front e pelo servidor. A API é uma fábrica `buildApp(config)` (testável com `app.inject`), com plugins por assunto (segurança, autenticação, erros) e rotas por área (pública, formulários, admin). Prisma com SQLite no desenvolvimento e nos testes; Postgres em produção trocando o `provider`.

**Stack:** Node 22, TypeScript, Fastify 5, Prisma 6, Zod 4, @fastify/jwt, bcrypt, Vitest, esbuild (build).

**Spec:** `docs/HANDOFF-backend-seguranca.md` + decisões abaixo (combinadas com o usuário em 03/11/2026).

## Decisões combinadas

- Banco: SQLite no desenvolvimento/testes, Postgres em produção (troca de `provider` no `schema.prisma`). Hospedagem ainda indefinida: nada preso a provedor, tudo por variável de ambiente.
- Papéis: `admin` (tudo, inclusive contas e auditoria) e `diretoria` (pedidos, solicitações, doações, conteúdo, documentos). Papel "sócio" fica para quando houver regras de gestão de sócios.
- Avisos: só pelo painel (itens com status `novo`). Sem e-mail/WhatsApp por enquanto.
- LGPD: dados pessoais de pedidos, solicitações e ofertas de doação são anonimizados após 12 meses (`PERSONAL_DATA_RETENTION_DAYS=365`); o admin pode anonimizar um registro antes, a pedido do titular. Dados pessoais nunca vão para logs.
- Dados reais: o seed usa os dados de exemplo do front, marcados como exemplo.

## Global Constraints

- Mensagens de erro em português, formato `{ "message": string, "fields"?: Record<string,string> }`, compatível com `ApiError(message, status)`.
- IDs em texto (slug), datas `AAAA-MM-DD`, preços em centavos inteiros.
- Senhas: bcrypt custo 12. Access token JWT HS256 de 15 min; refresh token opaco de 7 dias, guardado só como hash SHA-256, com rotação e detecção de reuso.
- Cookies `HttpOnly; SameSite=Strict; Secure` (Secure desligável só fora de produção). CSRF: só `application/json` é aceito no corpo e rotas que mudam estado com cookie exigem `Origin` na lista permitida.
- CORS só com origens de `CORS_ORIGINS`; nunca `*`.
- Corpo JSON até 64 KB; upload de PDF até 10 MB.
- Commits pequenos, mensagem em português "tipo(escopo): descrição", com `Co-Authored-By`. Nada de push.

## Estrutura de arquivos

```
packages/shared/src/{index,forms,catalog}.ts      schemas e listas fixas
apps/api/prisma/{schema.prisma,seed.ts,seed-data.ts}
apps/api/src/
  config.ts            env validado com Zod
  app.ts               buildApp(config, deps) monta plugins e rotas
  server.ts            entrada: lê config, sobe servidor, agenda retenção
  db.ts                PrismaClient
  lib/errors.ts        AppError, notFound(), errorHandler
  lib/protocol.ts      protocol(prefix) aleatório
  lib/mappers.ts       linha do banco -> tipo de domínio
  plugins/security.ts  helmet, cors, rate-limit, checagem de Origin
  plugins/auth.ts      JWT em cookie, requireRole(...)
  services/auth.ts     login, refresh, logout, bloqueio progressivo
  services/orders.ts   createOrder com transação e estoque
  services/retention.ts anonymizeExpired(now)
  services/audit.ts    audit(actor, action, target)
  routes/public.ts     GET de conteúdo
  routes/forms.ts      POST pedidos/serviços/doações
  routes/documents.ts  download de PDF
  routes/admin/*.ts    auth, inbox (pedidos etc.), content, products, documents, users, audit, reports
apps/api/test/*.test.ts  integração com app.inject
apps/web/src/services/httpApi.ts  cliente HTTP do contrato Api
```

## Review Focus

1. Dois pedidos simultâneos do último item: só um passa (decremento condicional `stock >= q` na transação). Teste com `Promise.all`.
2. Linhas repetidas do mesmo produto no pedido somam a quantidade antes de checar estoque. Teste.
3. Preço/total mandado pelo cliente é ignorado. Teste com `priceCents: 1` no corpo.
4. Corpo `text/plain` ou formulário HTML cruzado em rota admin é rejeitado (415/403). Teste.
5. Refresh token reutilizado revoga a família inteira. Teste.

---

### Task 1: `packages/shared`

**Files:** criar `packages/shared/{package.json,tsconfig.json,src/*}`; modificar `apps/web/src/schemas/forms.ts` (reexporta), `apps/web/src/domain/types.ts` (constantes vêm de shared), `apps/web/src/components/ui/icon-paths.ts` (`satisfies Record<IconName,string>`), `package.json` raiz (`workspaces` inclui `packages/*`).

**Produces:** `@aagb/shared` exporta `orderSchema, serviceRequestSchema, donationOfferSchema, validate, OrderForm, ServiceRequestForm, DonationOfferForm, FieldErrors, ValidationResult, PRODUCT_CATEGORIES, DOCUMENT_CATEGORIES, PROJECT_STATUSES, ICON_NAMES, IconName`. `exports` aponta para `src/index.ts` (sem build próprio; o front usa via Vite, a API empacota com esbuild).

- [ ] Mover o conteúdo de `forms.ts` sem mudar comportamento; web reexporta.
- [ ] `npm run lint/typecheck/test/build -w apps/web` passam sem mudança de comportamento.
- [ ] Commit `refactor(shared): extrai schemas e listas fixas para pacote compartilhado`.

### Task 2: base da API (config, app, erros, segurança, Prisma, seed)

**Produces:** `loadConfig(env): Config`; `buildApp(config): Promise<FastifyInstance>`; `AppError(status, message)`; esquema Prisma com `Article, Project, Partner, Product(stock, active), ServiceOffer, Need, Donation, TransparencyDocument(fileName, storedName, size), Order, OrderLine, ServiceRequest, DonationOffer, User, Session, AuditLog`. Listas (`body`) guardadas como texto JSON; enums como texto validado por Zod (SQLite).

- [ ] Testes: config inválida lança erro legível; `GET /api/health` 200; cabeçalhos do helmet presentes (CSP, nosniff); CORS só ecoa origem permitida; rota inexistente devolve 404 `{message}` em português; erro interno não vaza stack.
- [ ] Commit(s): `feat(api): configuração validada e esqueleto do servidor`, `feat(db): esquema Prisma e seed com dados de exemplo`.

### Task 3: rotas públicas de leitura

Rotas `GET /api/{news,projects,partners,products,services,needs,donations,documents}` e `/:id` para news/projects/partners/products. Notícias em ordem decrescente de data; produtos inativos não aparecem.

- [ ] Testes: formatos iguais aos tipos do front (`body` como array, `priceCents` inteiro); 404 para id inexistente.
- [ ] Commit `feat(api): rotas públicas de leitura`.

### Task 4: formulários públicos

`POST /api/orders {order, lines}`, `POST /api/service-requests`, `POST /api/donation-offers` → `201 {protocol}` (`PD-`, `SV-`, `DO-` + 8 caracteres aleatórios). Rate-limit 5/min por IP. Linhas: 1 a 50, `quantity` inteiro 1..999.

- [ ] Testes: Review Focus 1–3; estoque insuficiente 409 com nome do produto; produto inexistente 422; serviço/necessidade inexistente 422; payload > 64 KB 413; tipos errados 400 com `fields`; 6ª requisição 429.
- [ ] Commit `feat(api): pedidos, solicitações e ofertas de doação validados no servidor`.

### Task 5: autenticação e papéis

`POST /api/admin/auth/{login,refresh,logout}`, `GET /api/admin/auth/me`. Bloqueio: 5 falhas seguidas → bloqueio de 1, 2, 4… min (máx. 60), mensagem sempre "E-mail ou senha incorretos." (sem revelar existência; hash fictício quando usuário não existe). Rate-limit do login 10/min por IP. Script `npm run user:create -w apps/api` cria o primeiro admin (senha lida do terminal, mín. 12 caracteres).

- [ ] Testes: login certo define cookies HttpOnly; senha errada e usuário inexistente dão a mesma resposta; bloqueio após 5 falhas; token expirado e adulterado 401; papel diretoria em rota de admin 403; Review Focus 4 e 5; logout revoga.
- [ ] Commit `feat(auth): login com cookies, refresh rotativo e papéis`.

### Task 6: painel administrativo (API) e auditoria

- Caixa de entrada: `GET /api/admin/{orders,service-requests,donation-offers}?status=`, `PATCH .../:id {status}`, `POST .../:id/anonymize`.
- Conteúdo (diretoria+): CRUD de news, projects, partners, services, needs, donations e products (produto excluído vira `active=false`).
- Documentos: `POST /api/admin/documents` (multipart, PDF checado pelos bytes `%PDF-`, 10 MB, nome salvo aleatório), `DELETE`; download público `GET /api/documents/:id/file` com `Content-Type: application/pdf` e `Content-Disposition: attachment`.
- Usuários (admin): listar, criar, mudar papel/ativo, redefinir senha (revoga sessões).
- Auditoria (admin): `GET /api/admin/audit`. Toda escrita admin grava `{userId, action, target, at}` sem dados pessoais.
- Relatório: `GET /api/admin/reports/summary` (pedidos por status, vendas por produto).
- Retenção: `anonymizeExpired(now)` ao subir e a cada 24 h.

- [ ] Testes: CRUD feliz + 403 por papel; upload de arquivo que não é PDF 415; PDF devolvido com cabeçalhos certos; auditoria registrada; retenção anonimiza só o que passou de 365 dias.
- [ ] Commits por assunto.

### Task 7: ligar o front e documentação

- `httpApi.ts` implementando `Api` com `fetch` (`VITE_API_URL`); `services/index.ts` usa `httpApi` quando `VITE_API_URL` existe, senão o mock.
- `apps/api/README.md` e `.env.example`; nota de LGPD para o front (texto de privacidade e aviso nos formulários) nas notas compartilhadas.
- [ ] Verificação final: lint, typecheck, testes e build da API e do front; `npm audit`.
