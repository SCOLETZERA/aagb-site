# Banco no Supabase: guia de publicação

O banco da AAGB é **Postgres**. Em produção, a ideia é usar o **Supabase**, que oferece Postgres pronto. No desenvolvimento e nos testes, roda um Postgres local, sem instalar nada.

O Supabase guarda **só o banco**. A API (Fastify) continua precisando de um serviço de hospedagem próprio, como Render, Railway ou Fly. O site e a API conversam com o banco apenas pela nossa API; o navegador nunca fala direto com o Supabase.

## Como o banco está protegido

O Supabase tem uma "Data API" que pode expor tabelas do esquema `public` para qualquer pessoa que tenha a chave pública do projeto. As tabelas da AAGB guardam senhas embaralhadas, sessões, pedidos e dados pessoais, então ficam protegidas em quatro camadas:

1. **Esquema próprio.** As tabelas ficam no esquema `aagb`, indicado por `schema=aagb` no endereço de conexão, nunca no `public`.
2. **A migração recusa o `public`.** Se alguém tentar criar as tabelas no `public` de um banco do Supabase, a primeira migração para com erro.
3. **A migração fecha o esquema.** Ela tira dos papéis públicos do Supabase (`anon` e `authenticated`) o acesso ao esquema e às tabelas, e liga RLS em todas as tabelas, sem nenhuma política de acesso. A API, dona das tabelas, não é afetada.
4. **A API confere o endereço ao iniciar.** Em produção, ela não sobe sem `schema=` próprio e sem `sslmode=require` (conexão criptografada).

Os testes automáticos (`apps/api/test/supabase.test.ts`) imitam o pior caso do Supabase, com os papéis públicos recebendo acesso a tudo que é criado, e conferem que mesmo assim eles não leem nem alteram nada.

## Passo a passo da primeira publicação

### 1. Criar o projeto
- Em supabase.com, crie um projeto.
- Escolha a região **South America (São Paulo)**, para os dados ficarem no Brasil (LGPD).
- Use uma senha forte para o banco e guarde num gerenciador de senhas.

### 2. Desligar a Data API (recomendado)
A AAGB não usa a Data API. Nas configurações do projeto, na parte da **Data API**, desligue-a ou tire o esquema `aagb` da lista de esquemas expostos (ele não entra nessa lista por padrão).

### 3. Pegar os endereços de conexão
No botão **Connect** do projeto, copie:
- **Transaction pooler** (porta 6543): vai em `DATABASE_URL`, que a API usa. Acrescente `?pgbouncer=true&schema=aagb&sslmode=require`.
- **Session pooler** (porta 5432): vai em `DIRECT_URL`, usada só pelas migrações. Acrescente `?schema=aagb&sslmode=require`.

Exemplo (troque `PROJETO`, `SENHA` e a região):

```
DATABASE_URL=postgresql://postgres.PROJETO:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&schema=aagb&sslmode=require
DIRECT_URL=postgresql://postgres.PROJETO:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?schema=aagb&sslmode=require
```

Esses valores vão nas variáveis de ambiente do serviço que hospeda a API, **nunca no Git**. Se a senha tiver caracteres especiais (`@`, `#`, `/`…), ela precisa ser codificada no endereço (ex.: `@` vira `%40`).

### 4. Criar as tabelas
De um computador com o projeto e as duas variáveis acima configuradas:

```bash
npm run db:migrate -w apps/api
```

O comando aplica as migrações de `apps/api/prisma/migrations`. Rodar de novo não repete nada.

### 5. Criar a primeira conta do painel

```bash
npm run user:create -w apps/api -- --email voce@exemplo.org --name "Seu Nome"
```

**Não rode `db:seed` em produção.** Ele grava os dados de exemplo, que não são dados reais da associação.

### 6. Conferir
- No painel do Supabase, abra o **Security Advisor**: não deve haver alerta sobre tabelas expostas ou sem RLS.
- Entre no painel da AAGB e faça um pedido de teste pela vitrine.

## A cada nova versão do código

Rode `npm run db:migrate -w apps/api` **antes** de subir a API nova. Quando o esquema mudar, quem desenvolve cria a migração com `npm run db:migrate:dev -w apps/api`, contra o Postgres local, e a coloca no Git junto com o código.

## Plano gratuito: o que saber

Condições conferidas em novembro de 2026; confira a página de preços do Supabase antes de decidir:
- até 500 MB de banco por projeto, o que dá para a AAGB por bastante tempo;
- **o projeto é pausado depois de uma semana sem uso** e volta quando alguém abre o painel do Supabase; num site no ar, isso derruba o site até alguém religar;
- o plano pago não pausa.

Também confira, na página de preços, como funcionam os **backups** em cada plano.

## PDFs da Transparência

Os PDFs continuam sendo salvos em disco (`UPLOAD_DIR`), não no Supabase. A hospedagem da API precisa de um disco persistente, com backup. Usar o armazenamento do Supabase exigiria mudar o código; isso ficou para depois.

## Desenvolvimento local

```bash
npm run db:local -w apps/api      # sobe o Postgres local (deixe esse terminal aberto)
npm run db:migrate -w apps/api    # em outro terminal, na primeira vez e a cada migração nova
npm run db:seed -w apps/api       # dados de exemplo e conta de teste (SEED_ADMIN_* no .env)
npm run dev:api
```

- Os dados ficam em `apps/api/.pgdata`, fora do Git.
- O `.env.example` já traz os endereços certos para esse Postgres local.
- Os dados de um banco SQLite antigo (`apps/api/prisma/dev.db`) não são levados para o Postgres; eram só dados de exemplo e de teste.
- O Postgres local vem do pacote `embedded-postgres`, só de desenvolvimento.
  - No Windows, o script de instalação que o npm bloqueia não faz nada e não precisa ser aprovado.
  - No Linux ou macOS, aprove-o com `npm install-scripts approve @embedded-postgres/<plataforma>` se o Postgres local não subir.
