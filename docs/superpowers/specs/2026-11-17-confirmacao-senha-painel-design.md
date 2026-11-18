# Confirmação de senha nas ações sobre contas do painel (design)

Data: 17/11/2026. Origem: revisão de segurança do PR #3, em que o painel passou a ter um único papel.

## Por quê

Desde o PR #3, toda conta do painel é administradora. Na tela **Contas**, quem está logado consegue trocar a senha de qualquer pessoa, criar conta, desativar e reativar conta sem digitar mais nada. Com isso, quem roubar uma sessão aberta (computador emprestado, aba esquecida) toma o painel de forma permanente: troca as senhas dos outros e cria uma conta própria para voltar depois. A auditoria registra, mas não impede.

Objetivo: **uma sessão roubada, sozinha, não basta para mexer em contas.** Para isso, é preciso ter confirmado a senha há pouco tempo.

## Partes

### A. Proteção das rotas (pequena)
- `apps/api/src/routes/admin/reports.ts` passa a usar `app.addHook('preHandler', requireAdmin())` no grupo, como os outros arquivos, em vez de `preHandler` rota por rota.
- Teste fixo que lista **todas** as rotas registradas sob `/api/admin` (pelo hook `onRoute`, registrado antes das rotas) e confere que cada uma responde 401 sem login. Ficam fora só `auth/login`, `auth/refresh` e `auth/logout`. Assim, uma rota nova esquecida sem login quebra o teste.

### B. Confirmação de senha com validade de 5 minutos

**Abordagens consideradas**
1. Pedir a senha atual em cada ação. É simples e não guarda estado novo, mas obriga a digitar a senha toda vez.
2. **Confirmar uma vez e valer por 5 minutos (escolhida pelo usuário).** É mais confortável para quem vai mexer em várias contas seguidas. O servidor guarda quando a sessão confirmou.

**Como funciona**
- **Banco:** a tabela `Session` ganha `confirmedAt DateTime?`. Na renovação (rotação do refresh token), a sessão nova herda o `confirmedAt` da anterior, para a confirmação não se perder quando o token de 15 min vence no meio do caminho.
- **Nova rota `POST /api/admin/auth/confirm`**, com corpo `{ password }`, exige login (`requireAdmin`):
  - **senha certa:** grava `confirmedAt = agora` na sessão ativa daquela família, zera o contador de falhas, registra `auth.confirm` na auditoria e responde 204;
  - **senha errada:** conta como falha de login, com o mesmo incremento atômico e o mesmo bloqueio progressivo. Responde **403** "Senha incorreta." (não 401, para o painel não tentar renovar a sessão nem deslogar);
  - **conta bloqueada:** responde 403 "Muitas tentativas. Aguarde alguns minutos e tente de novo.", sem comparar a senha;
  - mesmo limite por IP do login (`LOGIN_RATE_LIMIT_PER_MINUTE`).
- **Rotas que exigem confirmação recente** (`confirmedAt` há no máximo 5 min): `POST /users`, `PATCH /users/:id` e `PUT /users/:id/password`. A listagem `GET /users` não exige. A checagem fica no servidor, num hook só dessas rotas, depois de `requireAdmin`.
- **Sem confirmação recente:** a resposta é **403** com `{ message: "Confirme sua senha para continuar.", code: "confirm_password" }`. O campo `code` é novo no formato de erro (`ErrorBody` e `AppError` ganham `code` opcional).
- **Painel (front):**
  - `ApiError` passa a ler `code`;
  - na tela Contas, se uma ação receber `confirm_password`, abre uma janela "Confirme sua senha" com um campo de senha;
  - ao confirmar, chama `/admin/auth/confirm` e repete a ação automaticamente;
  - senha errada aparece na própria janela.
- **Limites que continuam como estão:** trocar a própria senha encerra todas as sessões, inclusive a atual (já é assim). Desativar a própria conta continua proibido.

## Fora do escopo
- Avisar por e-mail quando uma conta é criada ou tem a senha trocada (não há envio de e-mail).
- Pedir confirmação para conteúdo, pedidos ou documentos.
- Mudar o script `create-user` (roda no servidor, fora do painel).

## Verificação
- Testes escritos antes da correção e conferidos falhando sem ela:
  - sem confirmação, as três rotas dão 403 `confirm_password`;
  - com confirmação, funcionam;
  - depois de 5 min, voltam a exigir;
  - a confirmação sobrevive à renovação do token;
  - a confirmação de uma sessão não vale para outra sessão do mesmo usuário;
  - senha errada conta para o bloqueio;
  - todas as rotas do painel exigem login.
- No front: teste da janela de confirmação e da repetição automática da ação.
- Rodar lint, tipos, testes e build. Testar no navegador o fluxo da tela Contas.
