# Confirmação de senha no painel: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** fechar duas brechas abertas desde que o painel passou a ter um único papel:
- garantir por teste que toda rota do painel exige login;
- exigir senha confirmada há no máximo 5 minutos para criar conta, alterar conta e trocar senha.

**Arquitetura:**
- **Confirmação:** fica em `Session.confirmedAt` e passa adiante quando o token de renovação é trocado. `requireAdmin` passa a expor a sessão em `request.adminSession`. O guarda `requireRecentConfirmation()` responde 403 com `code: "confirm_password"`. A nova rota `POST /auth/confirm` grava a confirmação.
- **Senha errada:** reaproveita o contador e o bloqueio do login.
- **No painel:** o hook `useConfirmPassword` mostra a janela "Confirme sua senha" e repete a ação depois.

**Tecnologias:** Fastify 5, Prisma (SQLite em dev/teste), Zod, bcrypt, Vitest; React + Testing Library no front.

**Spec:** `docs/superpowers/specs/2026-11-17-confirmacao-senha-painel-design.md`

## Restrições globais

- **Prazo da confirmação:** 5 minutos (`CONFIRMATION_TTL_MS = 5 * 60_000`).
- **Respostas da API:**

  | Situação | Status | Mensagem |
  |---|---|---|
  | Sem confirmação recente | 403 | `{ message: "Confirme sua senha para continuar.", code: "confirm_password" }` |
  | Senha errada na confirmação | 403 | "Senha incorreta." |
  | Conta bloqueada | 403 | "Muitas tentativas. Aguarde alguns minutos e tente de novo." |
  | Confirmação aceita | 204 | (sem corpo) |

  Nenhuma dessas respostas pode ser 401: com 401, o painel tentaria renovar a sessão e acabaria deslogando a pessoa.
- **Rota de confirmação:** `POST /api/admin/auth/confirm`, corpo `{ password }`. Exige `requireAdmin` e usa o limite por IP `LOGIN_RATE_LIMIT_PER_MINUTE`, igual ao login. A confirmação aceita grava `auth.confirm` na auditoria, com alvo `user:<id>`.
- **Rotas protegidas pela confirmação:** `POST /users`, `PATCH /users/:id` e `PUT /users/:id/password`. A listagem `GET /users` continua sem confirmação.
- **Escopo da confirmação:** vale só para a família de sessões em que foi feita, nunca para outro login da mesma pessoa.
- **Segurança:** testes de segurança são escritos antes e conferidos falhando sem a correção.
- **Commits e textos:** commits pequenos, em português, no formato `tipo(escopo): descrição`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nada de push. Textos da interface em português do Brasil.
- **Não mexer:** não remover a renovação única compartilhada do `adminClient.ts` e não usar `fastify-plugin` nos grupos de rotas.

## Pontos de atenção na revisão

1. **Ações seguidas sem pedir senha de novo.** Depois de confirmar, outra ação logo em seguida não pode pedir a senha outra vez. Teste da Tarefa 4: duas ações seguidas, a janela aparece só uma vez.
2. **Janela fechada sem confirmar.** A ação não roda e aparece a mensagem "Confirme sua senha para continuar." Teste da Tarefa 4.
3. **Senha errada na janela.** O erro aparece na própria janela, ela continua aberta e a pessoa continua logada. Teste da Tarefa 4 e teste de 403 (não 401) na Tarefa 2.
4. **Confirmação feita, depois o token de 15 minutos vence.** A confirmação continua valendo enquanto não passar de 5 minutos. Teste de renovação na Tarefa 2.
5. **Pessoa bloqueada pela própria confirmação.** O login também fica bloqueado. É esperado, porque usa o mesmo contador. Teste na Tarefa 2.

---

### Task 1: toda rota do painel exige login

**Arquivos:**
- Alterar: `apps/api/src/app.ts` (assinatura de `buildApp`)
- Alterar: `apps/api/src/routes/admin/reports.ts`
- Alterar: `apps/api/test/helpers.ts` (`makeApp` repassa `onRoute`)
- Criar: `apps/api/test/admin-routes.test.ts`

**Interfaces:**
- Produz: `buildApp(config: Config, options?: { onRoute?: (route: RouteOptions) => void }): Promise<FastifyInstance>`. Registra `app.addHook('onRoute', options.onRoute)` antes de qualquer rota.
- Produz: `makeApp(env?, before?, options?: { onRoute?: ... })`. O terceiro parâmetro vai direto para `buildApp`.

- [ ] **Passo 1: Escrever o teste `admin-routes.test.ts`.**
  - Coleta as rotas com `onRoute`, mantendo as de `url` que começa com `/api/admin` e descartando o método `HEAD`.
  - Antes do laço, confere que a lista tem mais de 40 rotas, para o teste não passar vazio.
  - Para cada rota, troca `:id` por `cm0000000000000000000000` e faz `inject` sem cookie, com `origin: ORIGIN` e corpo `{}` quando não for GET.
  - Espera 401 em todas, exceto `/api/admin/auth/login`, `/api/admin/auth/refresh` e `/api/admin/auth/logout`.
  - Na falha, mostra a lista de rotas abertas no formato `"MÉTODO url -> status"`, para ficar claro qual rota escapou.
- [ ] **Passo 2: Provar que o teste pega uma rota aberta.**
  - Tire temporariamente o `preHandler` de `/reports/summary`.
  - Rode `npx vitest run test/admin-routes.test.ts` (em `apps/api`). Esperado: FAIL listando `GET /api/admin/reports/summary -> 200`.
  - Desfaça a remoção.
- [ ] **Passo 3: Trocar a proteção em `reports.ts`.** No lugar dos dois `preHandler` por rota, use `app.addHook('preHandler', requireAdmin())` no grupo.
- [ ] **Passo 4: Rodar a suíte.** Rode `npm test -w apps/api`. Esperado: todos passam.
- [ ] **Passo 5: Commit.** Mensagem: `test(api): garante que toda rota do painel exige login`.

### Task 2: confirmação de senha na API (sessão, rota e bloqueio)

**Arquivos:**
- Alterar: `apps/api/prisma/schema.prisma`. Adicionar `Session.confirmedAt DateTime?`, com comentário `///` explicando o campo.
- Alterar: `apps/api/src/lib/errors.ts`.
  - `AppError` ganha `code?: string` como terceiro parâmetro do construtor.
  - `ErrorBody` ganha `code?: string`.
  - O `errorHandler` envia `code` quando ele existir.
- Alterar: `apps/api/src/services/auth.ts`.
  - Extrair `registerFailure(userId, now)`, com o incremento atômico e o bloqueio, de dentro de `login`.
  - `newSession(userId, familyId?, confirmedAt?: Date | null)`.
  - `refresh` repassa `session.confirmedAt`.
  - Novo `confirmPassword(...)`.
- Alterar: `apps/api/src/plugins/auth.ts`. Adicionar `request.adminSession`, `CONFIRMATION_TTL_MS` e `requireRecentConfirmation()`.
- Alterar: `apps/api/src/routes/admin/auth.ts`. Adicionar a rota `POST /confirm`.
- Alterar: `apps/api/test/helpers.ts`. Adicionar `confirm(app, who)`.
- Criar: `apps/api/test/confirm.test.ts`.

**Interfaces:**
- **`authService.confirmPassword(userId: string, familyId: string, password: string, now = new Date()): Promise<void>`**
  - conta bloqueada (`lockedUntil > now`): lança `AppError(403, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.')` sem comparar a senha;
  - senha errada: chama `registerFailure` e lança `AppError(403, 'Senha incorreta.')`;
  - senha certa: zera `failedLogins` e `lockedUntil`, e faz `session.updateMany({ where: { userId, familyId, revokedAt: null }, data: { confirmedAt: now } })`.
- **`request.adminSession?: { familyId: string; confirmedAt: Date | null }`**: preenchido por `requireAdmin()` a partir da sessão que ele já busca.
- **`requireRecentConfirmation(now: () => Date = () => new Date())`**: preHandler que lança `AppError(403, 'Confirme sua senha para continuar.', 'confirm_password')` quando `confirmedAt` é nulo ou tem mais de `CONFIRMATION_TTL_MS`. Usado na Tarefa 3.
- **`confirm(app, who: { cookie: string }): Promise<void>`** (em `helpers.ts`): faz o POST em `/api/admin/auth/confirm` com a senha `PASSWORD` e lança erro se a resposta não for 204.

- [ ] **Passo 1: Escrever `confirm.test.ts`.** Use `makeApp` e `loggedIn`. Os casos:
  - **Senha certa grava a confirmação:**
    - a resposta é 204;
    - a sessão ativa da família fica com `confirmedAt` preenchido;
    - a auditoria tem `auth.confirm`.
  - **Senha errada:**
    - a resposta é 403 com `message` "Senha incorreta.";
    - `failedLogins` sobe 1;
    - `GET /auth/me` com o mesmo cookie continua 200.
  - **Cinco senhas erradas bloqueiam a conta:**
    - `lockedUntil` fica preenchido;
    - a sexta tentativa, mesmo com a senha certa, responde 403 "Muitas tentativas…";
    - `login(app, email)` responde 401.
  - **Sem login:** a resposta é 401.
  - **Corpo sem `password`:** a resposta é 400.
  - **A confirmação sobrevive à renovação:**
    - confirmar e depois chamar `POST /auth/refresh` com o cookie `aagb_rt`;
    - a nova sessão ativa da família tem o mesmo `confirmedAt`.
  - **A confirmação não vale para outro login:**
    - a mesma pessoa entra duas vezes (dois cookies, duas famílias);
    - confirma só na primeira;
    - a sessão da segunda família continua com `confirmedAt` nulo.
- [ ] **Passo 2: Rodar o teste e ver falhar.** Rode `npx vitest run test/confirm.test.ts`. Esperado: FAIL, porque a rota `/confirm` dá 404.
- [ ] **Passo 3: Implementar.** Faça as mudanças da lista de arquivos, seguindo os contratos das Interfaces. Atenção:
  - a template de teste é recriada com `db push` em `global-setup.ts`, então não há migração a escrever;
  - rode `npm run db:push -w apps/api` só se houver um banco local de desenvolvimento;
  - rode `npx prisma generate` (em `apps/api`) para os tipos.
- [ ] **Passo 4: Rodar a suíte.** Rode `npx vitest run test/confirm.test.ts` e depois `npm test -w apps/api`. Esperado: todos passam, inclusive os de login e bloqueio em `auth.test.ts`.
- [ ] **Passo 5: Commit.** Mensagem: `feat(api): rota para confirmar a senha na sessão do painel`.

### Task 3: exigir confirmação recente nas ações sobre contas

**Arquivos:**
- Alterar: `apps/api/src/routes/admin/users.ts`. Adicionar `{ preHandler: requireRecentConfirmation() }` em `POST /users`, `PATCH /users/:id` e `PUT /users/:id/password`.
- Alterar: `apps/api/test/admin.test.ts`. Em "contas e relatórios", chamar `await confirm(app, admin)` antes das escritas de conta.
- Alterar: `apps/api/test/confirm.test.ts`. Adicionar os casos abaixo.

**Interfaces:**
- Usa: `requireRecentConfirmation()`, `CONFIRMATION_TTL_MS` e `confirm(app, who)`, da Tarefa 2.

- [ ] **Passo 1: Escrever os testes em `confirm.test.ts`.** Os casos:
  - **Sem confirmação, as três escritas são recusadas:**
    - `POST /users` com um corpo válido, `PATCH /users/:id` com `{ name }` e `PUT /users/:id/password` respondem 403 com `code: 'confirm_password'`;
    - nada muda no banco: a conta não é criada, o nome não muda e o `passwordHash` continua igual;
    - `GET /users` responde 200.
  - **Com confirmação, as três funcionam:** respondem 201, 200 e 204.
  - **A confirmação vence:**
    - grave `confirmedAt = new Date(Date.now() - CONFIRMATION_TTL_MS - 1000)` direto na sessão;
    - `PATCH` responde 403 `confirm_password`.
  - **Confirmação ainda dentro do prazo:**
    - grave `confirmedAt` 4 minutos atrás;
    - `PATCH` responde 200.
  - **A confirmação de um login não libera outro:**
    - confirme na família 1;
    - `PATCH` com o cookie da família 2 responde 403.
- [ ] **Passo 2: Rodar e ver falhar.** Rode `npx vitest run test/confirm.test.ts`. Esperado: FAIL, porque as escritas sem confirmação respondem 201/200/204 em vez de 403.
- [ ] **Passo 3: Proteger as rotas.** Adicione o `preHandler` nas três rotas de `users.ts` e o `confirm` em `admin.test.ts`.
- [ ] **Passo 4: Rodar a suíte.** Rode `npm test -w apps/api`. Esperado: todos passam.
- [ ] **Passo 5: Commit.** Mensagem: `feat(api): ações sobre contas exigem senha confirmada há até 5 minutos`.

### Task 4: janela "Confirme sua senha" no painel

**Arquivos:**
- Alterar: `apps/web/src/services/api.ts`. `ApiError` ganha `readonly code?: string`, como 4º parâmetro do construtor.
- Alterar: `apps/web/src/services/httpApi.ts`. `errorFrom` lê `body.code` quando for string.
- Criar: `apps/web/src/features/admin/useConfirmPassword.tsx`.
- Alterar: `apps/web/src/features/admin/pages/AccountsPage.tsx`.
  - Chama o hook.
  - Repassa `guard` como prop para `NewAccountForm` e `PasswordForm`.
  - Envolve as chamadas de `update`, `NewAccountForm` e `PasswordForm` em `guard`.
  - Renderiza `dialog`.
- Alterar: `apps/web/src/features/admin/pages/AuditPage.tsx`. `describeAction('auth.confirm')` devolve `'confirmou a senha'`.
- Criar: `apps/web/src/features/admin/pages/AccountsPage.test.tsx`. Usa o mesmo padrão de API falsa e renderização de `AdminApp.test.tsx`, entrando direto em `/admin/contas`.

**Interfaces:**
- **`useConfirmPassword(): { guard<T>(run: () => Promise<T>): Promise<T>; dialog: ReactNode }`**
  - `guard` roda `run`;
  - se der `ApiError` com `code === 'confirm_password'`, abre um `Drawer` com o título "Confirme sua senha" e o campo "Sua senha" (`type="password"`, `autoComplete="current-password"`);
  - ao enviar, chama `POST /admin/auth/confirm` e depois repete `run` uma vez;
  - senha errada: mostra a mensagem da API dentro do `Drawer`, que continua aberto;
  - `Drawer` fechado sem confirmar: rejeita com `ApiError('Confirme sua senha para continuar.', 403)`;
  - o campo de senha é limpo sempre que a janela fecha.

- [ ] **Passo 1: Escrever `AccountsPage.test.tsx`.** A API falsa:
  - `GET /admin/users` devolve duas contas;
  - `PATCH /admin/users/:id` responde 403 `{ message: 'Confirme sua senha para continuar.', code: 'confirm_password' }` até que `/admin/auth/confirm` receba `senha-certa-123`, e 200 depois disso;
  - `/admin/auth/confirm` com outra senha responde 403 `{ message: 'Senha incorreta.' }`.

  Os casos:
  - **Desativar com confirmação:**
    - clicar em "Desativar" (com `window.confirm` simulado como true) abre a janela "Confirme sua senha";
    - digitar `senha-certa-123` e enviar fecha a janela e mostra o aviso "Conta desativada.";
    - o `PATCH` foi chamado duas vezes.
  - **Senha errada:** a janela mostra "Senha incorreta." e continua aberta. `/admin/auth/refresh` não é chamado.
  - **Janela fechada:** fechar no botão "Fechar" mostra o aviso "Confirme sua senha para continuar.".
  - **Segunda ação no prazo:** depois de confirmar, uma segunda ação (reativar) não abre a janela.
- [ ] **Passo 2: Rodar e ver falhar.** Rode `npx vitest run src/features/admin/pages/AccountsPage.test.tsx` (em `apps/web`). Esperado: FAIL, porque a janela não aparece.
- [ ] **Passo 3: Implementar.** Faça as mudanças da lista de arquivos, seguindo a interface acima.
- [ ] **Passo 4: Rodar a suíte.** Rode `npm test -w apps/web`. Esperado: todos passam.
- [ ] **Passo 5: Commit.** Mensagem: `feat(web): painel pede a senha antes de mexer em contas`.

### Task 5: verificação final e documentação

**Arquivos:**
- Alterar: `docs/HANDOFF-contexto-projeto.md`.
  - Seção 4: descrever a confirmação de senha e o teste de rotas.
  - Seção 5: registrar a revisão do PR #3.
  - Atualizar os números de testes.
- Alterar: `apps/api/README.md`, se ele listar as rotas do painel. Incluir `POST /api/admin/auth/confirm`.

- [ ] **Passo 1: Checagens completas.** Rode na raiz `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`. Esperado: tudo passa. Anote o total de testes.
- [ ] **Passo 2: Teste no navegador.**
  - Prepare o ambiente: `.env` com `JWT_SECRET` e conta de seed, `db:push`, `db:seed`, `dev:api` e `dev:web` com `VITE_API_URL`.
  - Abra a tela Contas e, com a senha certa, faça: criar conta → confirmar senha; desativar conta → não pede de novo (dentro dos 5 minutos).
  - Numa nova sessão, erre a senha na janela.
  - Tire um print.
- [ ] **Passo 3: Commit.** Mensagem: `docs: confirmação de senha no painel e revisão do papel único`.
