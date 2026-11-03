# Passagem de contexto: back-end e segurança da AAGB

Documento para quem assume o **back-end e a segurança** (`apps/api`). O front-end já está pronto na branch `feat/web-frontend` e foi feito em outra conversa. Leia este arquivo inteiro antes de escrever código.

## 1. O projeto

Site da **Associação de Agricultores e Agricultoras na Agricultura Familiar de Bálsamos** (AAGB), zona rural de Nova Russas (CE). CNPJ 00.613.476/0001-06, fundada em 16/05/1995. O evento principal é a 10ª FEAAB (Feira Agropecuária e da Agricultura Familiar). Instagram: @agropecuariabalsamos.

O site deve ser **totalmente funcional, bem estruturado e seguro para quem vai usar**. O público é composto por famílias rurais, compradores locais e doadores, em grande parte no celular.

Plano original do projeto (arquivo "Informações-Balsamos.html" do usuário):
- portal institucional responsivo (feito no front);
- vitrine de produtos com pedido (feito no front, com dados de exemplo);
- área de **transparência** e editais, com prestação de contas, convênios e PAA/PNAE (tela feita, lista vazia);
- **painel administrativo** para gestão de sócios, produção disponível para feiras e relatórios (**não existe ainda: é parte do seu trabalho**).

## 2. Stack combinada com o usuário

React, TypeScript, Node.js, **Fastify, Bcrypt, Prisma, Zod, JWT**. Monorepo com npm workspaces (`apps/web`, `apps/api`).

## 3. Estado do repositório

- Git: branch `main` tem só o esqueleto; todo o trabalho do front está em `feat/web-frontend` (commits pequenos, em português, formato "tipo(escopo): descrição", com a linha `Co-Authored-By` ao final).
- `apps/api/package.json` já lista as dependências: `fastify`, `@fastify/cookie`, `@fastify/cors`, `@fastify/helmet`, `@fastify/jwt`, `@fastify/rate-limit`, `@prisma/client`, `bcrypt`, `dotenv`, `zod`. **Não há nenhum código em `apps/api`** (nem `src`, nem `prisma`, nem `tsconfig`). Os scripts do `package.json` já apontam para `src/server.ts` e `prisma/seed.ts`.
- Atenção: o npm bloqueou os scripts de instalação de `bcrypt` (node-gyp) e `@prisma/client` (postinstall). Será preciso aprová-los (`npm install-scripts approve <pacote>`) ou gerar o client do Prisma à mão. Verifique se há ferramentas de compilação no Windows.
- `.gitignore` já ignora `node_modules`, `dist`, `.env`, `*.db`, `*.db-journal` (sugere SQLite no desenvolvimento).
- `npm audit` mostra 12 avisos moderados, todos em `minimatch` dentro do ESLint (ferramenta de desenvolvimento). Não force `audit fix --force`: quebraria o lint.
- Ambiente do usuário: Windows 11, Node 22, npm 12.

## 4. O que o front exige do back-end

O ponto de troca é `apps/web/src/services/index.ts`: hoje `export const api = mockApi`. O contrato é a interface `Api` em `apps/web/src/services/api.ts`:

```
listNews, getNews(id), listProjects, getProject(id), listPartners, getPartner(id),
listProducts, getProduct(id), listServices, listNeeds, listDonations, listDocuments,
submitOrder(order, lines), requestService(request), offerDonation(offer)
```

Os formatos de resposta estão em `apps/web/src/domain/types.ts`. Regras já adotadas: IDs em texto (slugs legíveis), datas ISO `AAAA-MM-DD`, **preços em centavos (inteiros)**, erros como `ApiError(message, status)` com mensagem em português que o usuário final lê.

Os formulários públicos (sem login) e seus schemas Zod estão em `apps/web/src/schemas/forms.ts`: `orderSchema`, `serviceRequestSchema`, `donationOfferSchema`. **O servidor deve revalidar com os mesmos schemas**; sugestão: extrair para um pacote compartilhado (`packages/shared`) em vez de copiar.

Dados de exemplo para virar `seed`: `apps/web/src/services/mock/data.ts` (não são dados reais da associação).

O README `apps/web/README.md` tem os passos para ligar o front à API (criar `httpApi.ts` implementando `Api`).

## 5. Segurança: o que precisa existir (nada disso existe hoje)

Hoje o front só faz validação no navegador, que não protege nada. Pedidos, solicitações e doações não vão a lugar nenhum. Itens esperados:

1. **Autenticação da área administrativa**: login com senha guardada com Bcrypt (custo adequado), JWT de vida curta + refresh, preferencialmente em cookie `HttpOnly; Secure; SameSite` (se usar cookies, tratar CSRF). Bloqueio/atraso progressivo contra força bruta, sem revelar se o usuário existe.
2. **Autorização por papel** (ex.: administrador, diretoria, sócio). Os formulários públicos (pedido, serviço, doação) são **anônimos**, mas com proteção contra abuso.
3. **Validação no servidor** com Zod em toda entrada, com limites de tamanho. Nunca confiar no front.
4. **Pedido**: recalcular preço e total no servidor a partir do banco, checar estoque real, aceitar só `productId` e `quantity` do cliente. Tratar concorrência no estoque (transação).
5. **Cabeçalhos e rede**: `@fastify/helmet` (incluindo CSP), CORS com lista de origens permitidas (nunca `*` com credenciais), `@fastify/rate-limit` mais rígido nas rotas de login e envio de formulários, limite de corpo da requisição.
6. **Dados pessoais e LGPD**: o site coleta nome, telefone, e-mail e endereço. Definir finalidade, base legal, retenção e exclusão; não registrar dados pessoais em logs; texto de privacidade e aviso de consentimento no front (hoje não existe). Considerar criptografia de campos sensíveis em repouso conforme o risco.
7. **Upload de documentos** da área de Transparência (PDF): validar tipo real (não só extensão), tamanho, nome do arquivo, e servir com `Content-Disposition`/tipo corretos; sem execução.
8. **Segredos e configuração**: tudo em variáveis de ambiente validadas com Zod na inicialização; `.env` nunca no Git; criar `.env.example`.
9. **Erros**: respostas padronizadas, sem vazar stack trace nem detalhes do banco; mensagens em português compatíveis com `ApiError`.
10. **Auditoria**: registro de ações administrativas (quem, o quê, quando) sem dados pessoais desnecessários.
11. **Dependências**: política de atualização, `npm audit`, lockfile versionado.
12. **Testes**: testes de integração das rotas (incluindo casos de abuso: payload gigante, tipos errados, estoque insuficiente, token expirado/adulterado, papel sem permissão).

## 6. Banco de dados

Prisma. Modelos devem espelhar `domain/types.ts`: Article, Project, Partner, Product (com estoque), ServiceOffer, Need, Donation, TransparencyDocument, mais as tabelas de entrada: Order (+ linhas), ServiceRequest, DonationOffer, e User/Session para o painel. SQLite no desenvolvimento é aceitável; para produção, **pergunte ao usuário** (Postgres é o caminho natural). Crie `seed` a partir do mock.

## 7. Perguntas que dependem do usuário (não decida sozinho)

- Onde será hospedado (e se há orçamento para banco gerenciado)?
- Quem serão os administradores e quantos papéis são necessários?
- Notificações: a diretoria recebe aviso de novo pedido/doação por e-mail, WhatsApp ou só pelo painel? (Não há número de WhatsApp definido: o front lê `VITE_WHATSAPP_NUMBER`.)
- Existe algum domínio, certificado ou serviço de e-mail?
- Quais dados a associação aceita guardar e por quanto tempo (LGPD)?
- Os dados reais (produtos, projetos, parceiros, documentos) virão de quem e em que formato?

## 8. Como o usuário gosta de trabalhar

- Fala português do Brasil; responda sempre em português.
- Pediu explicitamente para **usar as skills de boas práticas** disponíveis (design, React, git, verificação) quando fizer sentido, e para **versionar com boas práticas**: commits pequenos por assunto, mensagens em português, uma branch por tarefa.
- Valorize honestidade: relate o que foi verificado e o que não foi. Rode lint, tipos, testes e build antes de dizer que algo funciona.
- Não envie nada a repositório remoto sem pedir.

## 9. Sugestão de ordem de trabalho

1. Ler este arquivo e o contrato (`api.ts`, `types.ts`, `forms.ts`); conferir o ambiente (bcrypt/Prisma instalam?).
2. Combinar com o usuário as perguntas da seção 7 que bloqueiam.
3. Planejar (skill `superpowers:writing-plans`) e criar `packages/shared` com os schemas.
4. Prisma + seed; rotas públicas de leitura; rotas de formulário com validação e limites; autenticação e papéis; painel administrativo (API primeiro, interface depois, em coordenação com o front).
5. Testes de integração e revisão de segurança (skills `security-review` / `cso` se disponíveis) antes de ligar o front (`httpApi.ts`).
