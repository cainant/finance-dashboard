# Variáveis, secrets e bindings

Referência única do que o Lumen Finance lê em desenvolvimento e em produção. A fonte da verdade de arquitetura é [`architecture.md`](./architecture.md); o passo a passo de deploy é [`deploy.md`](./deploy.md).

Regra de ouro: **valor público e não sensível** vai em `vars` no `wrangler.jsonc`; **credencial** vai em secret (`wrangler secret put` em produção e `.dev.vars` localmente). Nunca commite `.dev.vars`, tokens ou chaves.

## API (`apps/api`)

### Variáveis públicas (`vars`)

Definidas em `apps/api/wrangler.jsonc`. Em produção, ajuste os valores antes do `wrangler deploy`; localmente, o `.dev.vars` pode sobrescrever.

| Nome | Obrigatória? | Exemplo (dev) | Exemplo (prod) | Para que serve |
| --- | --- | --- | --- | --- |
| `APP_ENV` | Sim | `development` | `production` | Ambiente lógico retornado por `/api/health` e usado para decisões de cookie/segurança. |
| `ENABLE_DEMO_PROVIDER` | Sim | `true` | `false` | Habilita o provider `demo` **apenas em dev/teste**. Em produção deve ser `false`: `POST /api/connections` demo responde 400, `/api/providers` não lista demo e a UI não mostra CTA/selo de demonstração. O e2e depende do demo em dev. |
| `ENABLE_PASSWORD_LOGIN` | Sim | `true` | `false` | Habilita login por e-mail/senha (PBKDF2). **Em produção deve ser `false`**: o hash não cabe nos 10 ms de CPU do Workers Free. |
| `ALLOWED_GITHUB_LOGINS` | Só em dev (em prod é secret) | vazio | *(via secret)* | Em dev pode ficar em `wrangler.jsonc`/`.dev.vars`. Em produção fica como secret do Worker (`wrangler secret put ALLOWED_GITHUB_LOGINS --env production`) para não expor logins no repositório público. |

Observações:

- `ENABLE_DEMO_PROVIDER` e `ENABLE_PASSWORD_LOGIN` são strings `"true"`/`"false"` no JSONC, não booleanos.
- Em produção, `ENABLE_DEMO_PROVIDER=false`; a migration `0003` remove conexões demo antigas e a UI passa a convidar ao MeuPluggy.
- `ALLOWED_GITHUB_LOGINS` vazio em produção significa que ninguém entra por GitHub. Preencha antes do primeiro acesso.
- O Worker também pode ser configurado pelo dashboard, mas o `wrangler.jsonc` é a fonte da verdade: um `wrangler deploy` reaplica os valores do arquivo.
- **Opcional avançado:** o provider Pluggy aceita `PLUGGY_BASE_URL` para apontar para um proxy de teste; o default é `https://api.pluggy.ai` e não é necessário configurar em produção. Não há entrada para ele no `wrangler.jsonc` da v1.

### Secrets

Nunca aparecem no repositório. Em produção, configure com `wrangler secret put <NOME>` a partir de `apps/api`; localmente, em `apps/api/.dev.vars` (modelo em [`apps/api/.dev.vars.example`](../apps/api/.dev.vars.example)).

| Nome | Obrigatório? | Exemplo | Para que serve |
| --- | --- | --- | --- |
| `GITHUB_CLIENT_ID` | Sim, para login GitHub em produção | `Iv1.0123456789abcdef` | Client ID da GitHub OAuth App. |
| `GITHUB_CLIENT_SECRET` | Sim, para login GitHub em produção | `ghs_...` (gerado no GitHub) | Client secret da GitHub OAuth App; troca do `code` por token. |
| `ALLOWED_GITHUB_LOGINS` | Sim, para login GitHub em produção | `seu-usuario` ou `user1,user2` | Lista de logins do GitHub autorizados, separada por vírgula e sem espaços. Fora da lista, o OAuth autentica mas não cria sessão. |
| `PLUGGY_CLIENT_ID` | Opcional | UUID do dashboard Pluggy | Autenticação na API da Pluggy (`POST /auth`). Sem ele, o provider `pluggy` fica indisponível. |
| `PLUGGY_CLIENT_SECRET` | Opcional | secret do dashboard Pluggy | Par do Client ID; mostrado uma única vez na Pluggy. |
| `PLUGGY_WEBHOOK_SECRET` | Obrigatório se usar webhook | string aleatória longa | Valor esperado no header `x-webhook-secret` do `POST /api/webhooks/pluggy`. A Pluggy não assina webhooks com HMAC; o segredo em header é a validação disponível. |

Gerar um segredo de webhook:

```bash
node -p "require('crypto').randomBytes(32).toString('base64url')"
```

O mesmo valor deve ir para `PLUGGY_WEBHOOK_SECRET` (Worker) e para o header `X-Webhook-Secret` na criação do webhook na Pluggy. Use o script idempotente em vez de montar o `curl` na mão:

```bash
cd apps/api
node --env-file=.dev.vars scripts/register-pluggy-webhook.mjs
```

O script lê também `PLUGGY_WEBHOOK_URL` (URL completa) ou `APP_URL` (origem; ele acrescenta `/api/webhooks/pluggy`) e `PLUGGY_BASE_URL` (default `https://api.pluggy.ai`). Esses três são variáveis **do script**, não do Worker, e não devem ser configuradas como secrets no Cloudflare.

Verificar quais secrets existem (sem revelar valores):

```bash
pnpm --filter @fd/api exec wrangler secret list
```

### Bindings

| Binding | Tipo | Onde é configurado | Obrigatório? | Exemplo | Observações |
| --- | --- | --- | --- | --- | --- |
| `DB` | D1 database | `apps/api/wrangler.jsonc` → `d1_databases` | Sim | `database_name: "finance-dashboard"`, `database_id: "<uuid>"` | Migrations em `packages/database/migrations`; `migrations_dir` já aponta para lá. |
| `CACHE` | KV namespace | `apps/api/wrangler.jsonc` → `kv_namespaces` | Sim no deploy; cache opcional na arquitetura | `id: "<namespace-id>"` | Uso somente leitura/cache com TTL (ex.: apiKey da Pluggy). Nunca escrever por request: o Free permite 1.000 escritas/dia. |
| Cron Trigger | Agendamento | `apps/api/wrangler.jsonc` → `triggers.crons` | Sim | `0 */6 * * *` | Executa o handler `scheduled` a cada 6h (UTC). Não é variável de ambiente. |

O KV local é criado automaticamente pelo `wrangler dev`; para produção, preencha o `id` real. Os IDs placeholder (`00000000-...`) existem apenas para o arquivo validar antes do primeiro deploy.

### O que não existe (para não inventar)

- Não há `PLUGGY_ITEM_IDS` na v1. Itens do MeuPluggy são cadastrados via `POST /api/connections` com o `itemId` (conforme arquitetura); veja [`open-finance.md`](./open-finance.md).
- Não há `DATABASE_URL`, `JWT_SECRET` ou `SESSION_SECRET`: a sessão é opaca, guardada em D1, e o token é aleatório.
- Não há `VITE_API_URL`: o frontend chama `/api` na mesma origem.

## Web / Pages (`apps/web`)

O frontend não tem secrets nem variáveis de runtime próprias. Ele é estático (`apps/web/dist`) e a Pages Function resolve a API por binding.

| Nome | Tipo | Onde é configurado | Obrigatório? | Exemplo | Observações |
| --- | --- | --- | --- | --- | --- |
| `API` | Service binding (Pages Function → Worker) | `apps/web/wrangler.jsonc` → `services` | Sim em produção | `{ "binding": "API", "service": "finance-dashboard-api" }` | Mantém a mesma origem para o cookie `fd_session`. Em dev, o Vite faz proxy de `/api` para `127.0.0.1:8787`, então o binding não é usado. |
| `pages_build_output_dir` | Configuração de build | `apps/web/wrangler.jsonc` | Sim | `./dist` | Saída do `vite build`; usada pelo `wrangler pages deploy`. |

Notas:

- Como o `apps/web/wrangler.jsonc` tem `pages_build_output_dir` e `services`, ele é a fonte da verdade do projeto Pages. Bindings declarados no dashboard ficam somente leitura enquanto esse arquivo for usado no deploy.
- Se você optar por Git integration do Pages em vez de Direct Upload, configure `NODE_VERSION=24` e `PNPM_VERSION=12` nas variáveis de build do projeto. O caminho documentado usa Direct Upload e não precisa disso.
- Não há `VITE_*` no projeto hoje. Se um dia houver, lembre: tudo que começa com `VITE_` é público no bundle.

## CI/CD (GitHub Actions)

Estes secrets ficam no repositório (`Settings → Secrets and variables → Actions`), não no Worker.

| Nome | Obrigatório? | Exemplo | Para que serve |
| --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Sim, para o workflow de deploy | token criado no dashboard | Autentica `wrangler d1 migrations apply`, `wrangler deploy` e `wrangler pages deploy`. |
| `CLOUDFLARE_ACCOUNT_ID` | Sim, para o workflow de deploy | `023e105f4ecef8ad9ca31a8372d0c353` | Conta Cloudflare usada pelo Wrangler. |
| `CLOUDFLARE_D1_DATABASE_ID` | Sim, para o workflow de deploy | UUID do banco D1 | Injetado em `env.production.d1_databases[0].database_id` por `apps/api/scripts/with-prod-wrangler.mjs`. |
| `CLOUDFLARE_KV_NAMESPACE_ID` | Sim, para o workflow de deploy | ID hex do namespace KV | Injetado em `env.production.kv_namespaces[0].id` por `apps/api/scripts/with-prod-wrangler.mjs`. |
| `PROD_URL` | Opcional | `https://seu-dominio.exemplo` | URL de produção verificada por `agent-cli smoke prod` após o deploy. |

Escopos sugeridos para o token (mínimo necessário):

- **Account → Workers Scripts: Edit** (deploy do Worker e do Cron Trigger);
- **Account → Cloudflare Pages: Edit** (deploy do site);
- **Account → D1: Edit** (migrations remotas);
- **Account → Workers KV Storage: Edit** (bindings do Worker);
- **Account → Account Settings: Read** (resolver a conta).

Não use o token global de API nem o `wrangler login` em CI. O workflow [`deploy.yml`](../.github/workflows/deploy.yml) roda depois do CI verde na `main` (ou manualmente) e avisa (sem falhar) quando os secrets não estão configurados. Para deploys manuais locais, coloque `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_KV_NAMESPACE_ID` e `PROD_URL` em `apps/api/.env.deploy` (gitignored, modelo em `apps/api/.env.deploy.example`).

## Resumo de precedência

1. **Produção:** secrets definidos com `wrangler secret put` ficam disponíveis em `env` junto com os `vars` do `wrangler.jsonc`. O deploy reaplica os `vars` do arquivo; secrets persistem entre deploys.
2. **Local (`wrangler dev`):** `.dev.vars` tem precedência sobre os `vars` de nível superior do `wrangler.jsonc`; secrets e vars convivem no mesmo objeto `env`.
3. **Pages:** sem secrets de aplicação; o único binding é `API`. O cookie de sessão é emitido e lido pelo Worker, na mesma origem do site.
