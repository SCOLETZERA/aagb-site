# Passagem de contexto: site da AAGB (estado em 17/11/2026, `main` em `7f7e785`)

Leia este arquivo inteiro antes de mexer no código. Ele substitui `docs/HANDOFF-backend-seguranca.md` como ponto de partida; aquele documento descreve o projeto **antes** do back-end existir.

A próxima tarefa provavelmente envolve **segurança**. Antes de mudar qualquer coisa nessa área, leia a seção 4 e os arquivos que ela cita.

## 1. O projeto

Site da **Associação de Agricultores e Agricultoras na Agricultura Familiar de Bálsamos** (AAGB), zona rural de Nova Russas (CE). CNPJ 00.613.476/0001-06. Público: famílias rurais, compradores locais e doadores, quase sempre no celular.

Partes:
- portal institucional: notícias, projetos, parceiros, a feira (FEAAB) e transparência;
- vitrine de produtos com pedido, sem pagamento online;
- solicitação de serviços e oferta de doações;
- painel administrativo em `/admin`.

## 2. Repositório e ambiente

- **GitHub:** `SCOLETZERA/aagb-site` (**privado**). A conta ativa no `gh` é SCOLETZERA.
- **`main`:** tem todo o front, o back e o pacote compartilhado (commit `7f7e785`, depois dos PRs #1 a #3). As branches `feat/web-frontend`, `claude/api-seguranca-78315d`, `fix/responsividade-mobile`, `fix/pendencias-tecnicas` e `feat/painel-unico-admin` já estão contidas nela.
- **Máquina:** Windows 11, Node 22, npm 12.
- **Scripts de instalação:** o npm 12 bloqueia scripts de instalação. Os aprovados ficam em `allowScripts` no `package.json` da raiz, presos à versão: bcrypt, @prisma/client, prisma, @prisma/engines e esbuild. Atualizar algum deles exige `npm install-scripts approve <pacote>`.
- **Permissões do Claude Code:** `~/.claude/settings.json` libera `gh repo create`, `git push` e `git remote set-head`. No modo automático, o classificador já bloqueou envio ao GitHub mesmo assim; no modo manual funciona.
- **Commits:** pequenos, um assunto por commit, mensagem em português no formato `tipo(escopo): descrição`, com a linha `Co-Authored-By` no fim. **Nada vai para o remoto sem o usuário pedir.**

### Comandos (na raiz)

```bash
npm install                      # também gera o client do Prisma
npm run lint                     # API + web
npm run typecheck                # shared + API + web
npm test                         # API (78 testes) + web (52 testes)
npm run build                    # API (esbuild) + web (Vite)
```

### Rodar localmente

1. Copie `apps/api/.env.example` para `apps/api/.env` e preencha `JWT_SECRET`. Para ter uma conta de teste do painel, preencha também `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`. Cada worktree novo começa **sem** `.env`.
2. Prepare o banco: `npm run db:push -w apps/api` e depois `npm run db:seed -w apps/api`.
   **Ao atualizar o código**, rode `npm run db:push -w apps/api` de novo antes de subir a API: ainda não há migrações, e a coluna `Session.confirmedAt` (17/11/2026) precisa existir, senão o login e o painel inteiro param.
3. Suba a API: `npm run dev:api` (http://localhost:3333).
4. Para o site usar a API, crie `apps/web/.env.local` com `VITE_API_URL=http://localhost:3333`. Sem isso, o site usa os dados de exemplo.
5. Suba o site: `npm run dev:web` (http://localhost:5173).
6. Se usar outra porta, inclua a origem em `CORS_ORIGINS` no `.env` da API.

## 3. Estrutura

```
packages/shared/src/   forms.ts (schemas Zod dos formulários), domain.ts (tipos), catalog.ts (categorias, status, ícones), sample-data.ts
apps/api/
  prisma/              schema.prisma (SQLite; produção: trocar provider para postgresql), seed.ts, seed-data.ts
  scripts/create-user.ts   cria/redefine conta do painel (senha digitada oculta)
  src/config.ts        env validado com Zod (falha ao iniciar se inválido)
  src/app.ts           buildApp(config): monta plugins e rotas; logger sem IP, cabeçalhos, query nem corpo
  src/lib/errors.ts, lib/zod-messages.ts   respostas de erro; mensagens de validação sempre em português
  src/plugins/security.ts  helmet/CSP, CORS, rate-limit, checagem de Origin (CSRF)
  src/plugins/auth.ts      JWT em cookie, requireAdmin(), cookies
  src/services/        auth.ts (login, refresh, bloqueio), orders.ts (pedido e status/estoque), documents.ts (PDF), retention.ts (LGPD), audit.ts
  src/routes/          public.ts, forms.ts, documents.ts (download), admin/{auth,inbox,content,documents,users,reports}.ts
  test/                integração com app.inject; cada arquivo usa uma cópia de um banco SQLite modelo
apps/web/src/
  services/            api.ts (interface Api + ApiError), httpApi.ts (API real), mock/ (dados de exemplo)
  features/admin/      painel: adminClient.ts (fetch com cookies e refresh único), AdminAuth.tsx, AdminApp.tsx, pages/*
  features/cart/       carrinho (localStorage, sem dados pessoais)
  components/ui/PrivacyNotice.tsx, pages/PrivacyPage.tsx   LGPD
```

## 4. Modelo de segurança atual (o que existe e por quê)

**Autenticação** (`plugins/auth.ts`, `services/auth.ts`, `routes/admin/auth.ts`)
- **Senhas:** bcrypt com custo 12 (`BCRYPT_COST`; o mínimo 12 é obrigatório fora dos testes). Senha com no mínimo 12 caracteres e no máximo 72 bytes.
- **Login:** a resposta é sempre "E-mail ou senha incorretos." Quando o usuário não existe, compara contra um hash fictício, para o tempo de resposta não revelar quem tem conta.
- **Bloqueio:** depois de 5 falhas, 1, 2, 4… até 60 min. O contador sobe com **incremento atômico**. Há também limite de 10 tentativas por minuto por IP.
- **Access token:** JWT HS256 de 15 min no cookie `aagb_at` (path `/api/admin`). O payload tem só `sub` (usuário) e `fam` (família de sessões); **não há papel no token**.
- **Refresh token:** opaco, 7 dias, no cookie `aagb_rt` (path `/api/admin/auth`). O banco guarda só o hash SHA-256. É trocado a cada uso; **reusar um token antigo revoga a família inteira**.
- **`requireAdmin()`:** relê o usuário e a sessão do banco **a cada requisição**. Por isso, logout, desativação e redefinição de senha valem na hora.
- **Cookies:** `HttpOnly; SameSite=Strict`, com `Secure` obrigatório em produção. Consequência: **o front e a API precisam estar no mesmo site** (ex.: `aagb.org.br` e `api.aagb.org.br`).
- **Front:** `adminClient.ts` faz **uma única renovação compartilhada** quando várias requisições recebem 401 ao mesmo tempo. Duas renovações paralelas seriam vistas como reuso e derrubariam a sessão; não remova isso.

**Autorização** (mudou no PR #3, `feat/painel-unico-admin`)
- **Existe um único papel.** Toda conta ativa do painel é administradora e acessa tudo: caixa de entrada, conteúdo, documentos, relatório, contas e auditoria. A separação entre `admin` e `diretoria`, que existia antes, foi removida a pedido do usuário.
- A coluna `role` continua no banco, sempre gravada como `"admin"`, mas **não é consultada**. Contas antigas com `"diretoria"` entram como administradoras.
- Login, `/me` e a lista de contas não devolvem papel. Ninguém desativa a própria conta.
- **Confirmação de senha** (17/11/2026, depois da revisão do papel único):
  - criar conta, alterar conta e trocar senha (`POST /users`, `PATCH /users/:id`, `PUT /users/:id/password`) exigem que a senha tenha sido confirmada **há no máximo 5 minutos naquele login**;
  - a confirmação é feita em `POST /api/admin/auth/confirm` e gravada em `Session.confirmedAt` de **todas** as linhas da família de sessões; a checagem lê a mais recente da família. Assim, ela sobrevive à renovação do token (inclusive se as duas coisas acontecerem ao mesmo tempo), mas outro login da mesma pessoa não aproveita a confirmação;
  - sem confirmação recente, a resposta é 403 com `code: "confirm_password"`, e o painel abre a janela "Confirme sua senha" (`useConfirmPassword.tsx`) e repete a ação;
  - senha errada na confirmação conta para o mesmo bloqueio do login e responde 403, nunca 401 (com 401, o painel tentaria renovar a sessão e deslogaria a pessoa); cada tentativa errada ou bloqueada grava `auth.confirm-failed` na auditoria;
  - no painel, várias ações podem esperar a mesma confirmação; fechar a janela ou sair da tela cancela todas;
  - objetivo: uma sessão roubada, sozinha, não basta para trocar a senha dos outros nem criar uma conta própria.
- Cada grupo de rotas é registrado com `app.register` próprio e coloca `requireAdmin()` como hook do grupo. O teste `test/admin-routes.test.ts` percorre **todas** as rotas registradas e falha se: alguma rota sob `/api/admin`, fora login/refresh/logout, responder sem login; aparecer rota fora de `/api/admin` que não esteja no inventário de rotas públicas (`PUBLIC_ROUTES`); ou alguma escrita em `/api/admin/users` não exigir senha confirmada. Rota pública nova exige incluir no inventário, de propósito. **Não use `fastify-plugin` nesses grupos**: isso vazaria o hook para outros grupos. Rotas sem login no prefixo `/api/admin`: só `auth/login`, `auth/refresh` e `auth/logout`.
- Se a próxima tarefa reintroduzir papéis ou permissões finas, siga o padrão anterior: checagem no servidor em cada grupo de rotas, papel relido do banco (nunca do token) e testes de 403 por papel.

**CSRF e rede** (`plugins/security.ts`)
- Todo POST/PUT/PATCH/DELETE em `/api/admin/` exige `Origin` dentro de `CORS_ORIGINS`.
- A checagem usa o **padrão da rota resolvida** (`request.routeOptions.url`), não a URL crua. Antes, `/api/%61dmin/...` escapava dela.
- O parser de `text/plain` foi removido; só são aceitos JSON e multipart (no upload).
- CORS só com a lista configurada, nunca `*`.
- Helmet com CSP `default-src 'none'`, `frame-ancestors 'none'`, `no-referrer` e CORP `same-site`.
- Corpo de no máximo 64 KB. Limite global de 120 requisições por minuto por IP; formulários públicos, 5 por minuto.
- `TRUST_PROXY` aceita só `false` ou o número de proxies. `true` foi proibido porque deixaria qualquer `X-Forwarded-For` anular o limite por IP.

**Entradas públicas** (`routes/forms.ts`, `services/orders.ts`)
- Validadas com os mesmos schemas de `packages/shared`.
- O pedido aceita **só produto e quantidade**; preço e total vêm do banco.
- **O pedido não baixa estoque.** Ele só confere se a quantidade cabe no estoque atual. A baixa acontece quando alguém do painel **conclui** o pedido, com update condicional `stock >= qtd` dentro da transação; sair de concluído devolve. O status muda com lock otimista (`where: { id, status: lido }`). Essa regra foi decisão do usuário: impede que pedidos falsos esgotem a vitrine.
- O protocolo é aleatório e não sequencial (ex.: `PD-7KQ2M9XA`).
- No carrinho (PR #2), o limite de 99 por produto saiu e a quantidade pode ser digitada; o teto é o estoque conhecido no navegador, e o servidor aceita até 999 por linha e 50 linhas.

**Documentos** (`services/documents.ts`, `routes/admin/documents.ts`, `routes/documents.ts`)
- Só PDF, conferido pela assinatura `%PDF-`, com até 10 MB.
- O arquivo é salvo com nome UUID; `fullPath` reconfere o nome com uma regex antes de tocar o disco.
- O multipart só é lido depois da checagem de papel.
- Download sempre como anexo (`Content-Disposition: attachment`), com nome de arquivo sanitizado.

**Erros e logs** (`lib/errors.ts`)
- As respostas seguem `{ message, fields? }` em português. Campos ausentes ou de tipo errado viram "Campo obrigatório." / "Valor em formato inválido." (`lib/zod-messages.ts`), sem termos técnicos do Zod.
- Erro 500 devolve mensagem genérica. O log guarda só nome, código e as linhas `at` da pilha, porque a mensagem de erro do Prisma pode conter nome e telefone.

**LGPD** (`services/retention.ts`, `server.ts`)
- Dados pessoais de pedidos, solicitações e ofertas são anonimizados depois de `PERSONAL_DATA_RETENTION_DAYS` (365), ao iniciar e a cada 24 h.
- Sessões vencidas ou revogadas há mais de 30 dias são apagadas.
- O painel pode anonimizar um registro a pedido do titular.
- O endereço só é guardado quando o pedido é para entrega.
- Base legal: art. 7º, V. Por isso há um aviso nos formulários, **não** uma caixa de consentimento.

**Auditoria:** login e toda escrita do painel gravam `{userId, action, target}`, só com identificadores e nunca dados pessoais.

## 5. Revisões e verificação já feitas

- **Revisão manual:** corrigiu 6 falhas (commit `eb27c14`): desvio do CSRF por URL codificada, contador de falhas não atômico, dados pessoais em log, imagem `//host`, `TRUST_PROXY=true`, campos sem limite de tamanho. Cada uma tem teste de regressão; os de CSRF e de login foram conferidos falhando sem a correção.
- **`/security-review` na branch inteira:** nenhuma vulnerabilidade com confiança ≥ 0,8. Essa revisão foi **antes** dos PRs #1 a #3.
- **Revisão do papel único (PR #3), 17/11/2026:**
  - não achou falha no código: as 46 rotas do painel recusam acesso sem login e um papel enviado no corpo é ignorado;
  - riscos de projeto apontados: contas antigas de "diretoria" ganharam poder total; qualquer conta podia trocar a senha de outra e criar contas sem confirmação; `reports.ts` exigia login rota por rota;
  - resposta: confirmação de senha nas ações sobre contas e teste fixo de login em todas as rotas (seção 4);
  - antes de publicar, confira quem tem conta no painel.
- **`npm audit`:** os 3 avisos altos (deepmerge-ts da CLI do Prisma 6) foram resolvidos com `overrides` no `package.json` da raiz; remova o override ao migrar para o Prisma 7. Restam 12 avisos moderados no ESLint (minimatch), só de desenvolvimento. **Não use `npm audit fix --force`.**
- **Testado no navegador:** login, resumo, mudança de status de pedido, cadastro de notícia e layout no celular.
- **Não testado pela interface:** upload de PDF e a regra nova de estoque. As duas só têm testes automáticos.
- **Não testado:** Postgres e qualquer ambiente de produção.

## 6. Skills de revisão instaladas

Em `~/.claude/skills`, vindas de cursor/plugins (MIT). Todas só rodam quando o usuário digita o comando:
- `thermo-nuclear-review`: bugs e segurança;
- `thermo-nuclear-code-quality-review`: qualidade e manutenção do código;
- `thermos`: roda as duas.

Também existe `/security-review`, que precisa do remoto `origin`.

## 7. Pendências conhecidas

- **Faltam do plano original:** gestão de sócios, produção para feiras e relatórios além do resumo.
- **Faltam para publicar:**
  - hospedagem (indefinida);
  - Postgres com migrações;
  - domínio e HTTPS;
  - CSP e fallback para `index.html` no servidor do front;
  - disco persistente para `UPLOAD_DIR`, com backup;
  - conteúdo real no lugar dos dados de exemplo.
- **Decisões do usuário (não mudar sem perguntar):**
  - painel com um único papel: toda conta é administradora;
  - avisos de pedido só pelo painel;
  - pedidos pelo WhatsApp ficam fora do painel (o botão só aparece com `VITE_WHATSAPP_NUMBER`);
  - contato para pedidos sobre dados: Instagram e sede;
  - estoque só baixa ao concluir.

## 8. Como o usuário gosta de trabalhar

- Responda sempre em português do Brasil, de forma clara para quem não é técnico.
- Use as skills de boas práticas quando fizer sentido; para mudanças planejadas, `superpowers:brainstorming` e depois `superpowers:writing-plans`.
- Seja honesto sobre o que foi e o que não foi verificado. Rode lint, tipos, testes e build antes de dizer que algo funciona.
- Para mudanças de segurança: escreva o teste que prova a falha, confira que ele falha sem a correção e só então corrija.
