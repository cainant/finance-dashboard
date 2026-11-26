# @fd/api — API REST (Cloudflare Workers + Hono + D1)

Worker único com Hono, Drizzle/D1 e os providers de `@fd/financial-providers`.
Fonte da verdade dos contratos: `@fd/contracts` e `docs/architecture.md`.

## Rodando localmente

```bash
# na raiz do monorepo (worktree): copia .env/.dev.vars e instala deps
wt setup .

pnpm --filter @fd/api db:migrate:local
pnpm --filter @fd/api db:seed:local
pnpm --filter @fd/api dev          # http://127.0.0.1:8787
```

Reset completo do D1 local (apaga, migra e semeia):

```bash
pnpm --filter @fd/api db:reset:local
```

O frontend (`apps/web`) faz proxy de `/api` para `127.0.0.1:8787`, então cookie e
origem são as mesmas. Usuário demo do seed local: `demo@finance.local` /
`demo1234` (somente desenvolvimento).

Variáveis em `wrangler.jsonc` e secrets em `.dev.vars` (exemplo em
`.dev.vars.example`). Sem `PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET` o provider
Pluggy fica `configured: false`; sem `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` o
login GitHub fica desabilitado.

## Infraestrutura

- `src/app.ts` compõe o Hono: contexto (Drizzle + registry de providers) → log
  estruturado → secure headers → CSRF → rotas → 404/erros.
- `src/http/errors.ts`: `AppError` e mapeamento para
  `{ "error": { "code", "message", "details"? } }`; `ZodError` → 400
  `validation_error`; provider → 502 `provider_error`; desconhecido → 500
  `internal_error` (sem stack no corpo).
- `src/http/validate.ts`: `jsonBody`/`queryParams`/`routeParams` com
  `@hono/zod-validator` usando os schemas de `@fd/contracts`.
- CORS desligado (origem única). Métodos mutáveis exigem
  `X-Requested-With: fetch` **ou** `Origin` igual à origem do request
  (webhooks são isentos e usam segredo próprio).
- `x-request-id` é ecoado na resposta; logs não incluem corpo, query string,
  valores financeiros ou tokens.
- Dinheiro sempre em centavos (`integer`); datas civis `YYYY-MM-DD`; timestamps
  ISO UTC. Todas as consultas são escopadas por `user_id` (dados de outro
  usuário respondem 404).

## Autenticação

| Rota                            | Descrição                                                                  |
| ------------------------------- | -------------------------------------------------------------------------- |
| `GET /api/auth/providers`       | métodos habilitados (`password`, `github`) e `setupRequired`               |
| `POST /api/auth/login`          | `{ email, password }` → cookie `fd_session`                                |
| `POST /api/auth/setup`          | cria o **primeiro** usuário (somente com zero usuários e senha habilitada) |
| `POST /api/auth/logout`         | apaga a sessão e limpa o cookie                                            |
| `GET /api/auth/me`              | usuário da sessão                                                          |
| `GET /api/auth/github`          | inicia OAuth (state em cookie HttpOnly de 10 min)                          |
| `GET /api/auth/github/callback` | troca o code, valida allowlist, cria sessão e redireciona para `/`         |

- Sessão: token aleatório de 32 bytes (base64url) no cookie `fd_session`
  `HttpOnly; SameSite=Lax; Path=/` (`Secure` em `APP_ENV=production`),
  TTL de 30 dias com renovação deslizante. O D1 guarda apenas o SHA-256 (hex).
- Senha: PBKDF2-SHA256 com **exatamente 100.000 iterações**, salt aleatório,
  formato `pbkdf2$100000$<saltB64>$<hashB64>` e comparação em tempo constante.
  Habilitada só com `ENABLE_PASSWORD_LOGIN=true` (dev/teste: o custo de CPU não
  cabe nos 10 ms do Workers Free).
- Rate limit de login em `login_attempts`: 10 falhas por 15 min por IP **e** por
  e-mail (o e-mail é guardado como SHA-256).
- GitHub: allowlist `ALLOWED_GITHUB_LOGINS` (vírgulas, case-insensitive). Lista
  vazia nega todos os logins. Erros redirecionam para `/login?error=...`
  (`github_state`, `github_not_allowed`, `github_denied`, `github_error`,
  `github_not_configured`). Não vincula conta por e-mail.
- Recomendação de produção: Cloudflare Access na frente do domínio.

## Endpoints autenticados

| Rota                                                                          | Resposta                                                                           |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /api/overview?from&to`                                                   | `overviewResponse` (KPIs + período anterior)                                       |
| `GET /api/analytics/cashflow?from&to&granularity`                             | `cashflowResponse` (day/week/month, buckets vazios preenchidos)                    |
| `GET /api/analytics/categories?from&to&type`                                  | `categoryBreakdownResponse`                                                        |
| `GET /api/analytics/net-worth?from&to`                                        | `netWorthResponse` (série diária, máx. 366 dias)                                   |
| `GET /api/analytics/monthly?months`                                           | `monthlyResponse` (máx. 36)                                                        |
| `GET /api/accounts`                                                           | `accountsResponse`                                                                 |
| `GET /api/accounts/:id`                                                       | `accountSchema` (entidade)                                                         |
| `GET /api/transactions?from&to&accountId&categoryId&type&q&cursor&limit&sort` | `transactionsResponse`                                                             |
| `PATCH /api/transactions/:id` `{ categoryId?, notes? }`                       | `{ data: transactionSchema }`                                                      |
| `GET /api/categories`                                                         | `categoriesResponse` (sistema + usuário)                                           |
| `POST /api/categories`                                                        | `categorySchema` (201)                                                             |
| `GET /api/credit-cards`                                                       | `creditCardsResponse`                                                              |
| `GET /api/credit-cards/:id/bills`                                             | `billsResponse`                                                                    |
| `GET /api/bills/upcoming?days&limit`                                          | `upcomingBillsResponse`                                                            |
| `GET /api/bills/:id/transactions`                                             | `{ data: transactionSchema[] }`                                                    |
| `GET /api/investments`                                                        | `investmentsResponse`                                                              |
| `GET /api/connections`                                                        | `connectionsResponse`                                                              |
| `POST /api/connections` `{ provider, itemId?, ... }`                          | `{ data: connectionSchema }` (201)                                                 |
| `DELETE /api/connections/:id`                                                 | `{ ok: true }` (cascade; Pluggy revoga `DELETE /items/:id`, 404 tolerado)          |
| `POST /api/connections/:id/sync`                                              | `syncRunResponse` (run concluído; 502 se o run falhar)                             |
| `GET /api/connections/:id/sync-runs?limit`                                    | `syncRunsResponse`                                                                 |
| `GET /api/providers`                                                          | `providersResponse`                                                                |
| `POST /api/providers/pluggy/connect-token` `{ itemId? }`                      | `{ accessToken, connectorId }` (nunca expõe clientSecret; sem webhookUrl por item) |
| `GET/PUT /api/settings`                                                       | `settingsResponse`                                                                 |

Notas de contrato/comportamento:

- **Conexão demo**: `POST /api/connections { provider: "demo" }` cria as três
  conexões fictícias (Banco Aurora, Nuvem Bank, Cooperativa Horizonte) e
  devolve a principal. `POST .../sync` nessa conexão sincroniza as três (o
  dataset demo é dividido por instituição). Em produção `ENABLE_DEMO_PROVIDER=false`
  rejeita a criação e `/api/providers` não lista demo.
- **MeuPluggy**: `POST /api/connections` exige `itemId` de um item autorizado no
  Meu Pluggy. `connect-token` aceita `itemId` para reconectar (validado contra as
  conexões do usuário) e devolve o `connectorId` do MeuPluggy resolvido via
  `GET /connectors?countries=BR`. O widget é restrito a esse conector.
- **Contas multi-banco**: `accounts.institution_name` guarda o banco derivado do
  COMPE/nome do cartão ou herdado das demais contas do item; a UI agrupa por
  essa instituição quando presente.
- **Consentimento**: `connections.consent_expires_at` expõe o `Item.consentExpiresAt`
  (MeuPluggy: 1 ano) e aparece no card da conexão.
- **Cursor de transações**: keyset por `(date, id)` nos sorts por data e
  `(amount, id)` nos sorts por valor; cursor inválido/ de outra ordenação → 400.
- **Patrimônio**: contas não-crédito + investimentos − saldo devedor dos
  cartões. Investimentos não têm histórico; o valor atual é usado em todos os
  pontos. A série diária é limitada a 366 dias para caber na CPU do Free.
- **Faturas**: o status é rederivado por datas (`paid` é preservado), porque o
  Pluggy não envia status e o banco pode estar sincronizado há dias.
- `GET /api/auth/providers.setupRequired` segue o contrato (`true` quando não há
  usuários), mas `POST /api/auth/setup` responde 403 se o login por senha
  estiver desligado.

## Sincronização

`src/sync/SyncService` usa o registry de `@fd/financial-providers`:

- upsert idempotente por `(connection, external_id)` / `(account, external_id)`
  para instituições, contas, cartões, faturas, transações e investimentos;
- `categoryHint` → categoria de sistema por slug. Aliases do seed:
  `contas-servicos` → `contas-e-servicos` e `impostos-taxas` →
  `impostos-e-taxas`. `category_source = 'user'` nunca é sobrescrito;
- **histórico inicial por conta**: conta nova busca 365 dias (ou continua o cursor
  pendente) até gravar `accounts.history_synced_at`; `connections.last_synced_at`
  só é gravado quando todas as contas completaram. Depois disso, janela
  incremental desde `last_synced_at − 7 dias`;
- cartão: convenção de sinal detectada por conta (`accounts.amount_sign_convention`);
  compras = despesa negativa, pagamento = transferência, estorno = receita;
- faturas vencidas há mais de 90 dias ficam `closed` (histórico), não `overdue`;
- orçamento de subrequests para transações (`requestBudget`/`maxPages`); se o
  provider devolver `partial`, o cursor pendente vai para `sync_runs.stats_json`
  (chave interna `_pending`) e o próximo cron continua de onde parou;
- snapshots de saldo: diários nos últimos 90 dias e semanais antes disso (demo
  gera histórico retroativo coerente com as transações); Pluggy grava somente o
  saldo atual (o histórico começa no primeiro sync, sem fabricar série);
- `sync_runs` registra stats e erro sanitizado; falha do provider **não apaga**
  dados e marca a conexão como `error`/`login_required`; `OUTDATED` vira
  `outdated` e o cron volta a tentar;
- disparo: `POST /api/connections/:id/sync` (inline, devolve o run concluído),
  webhook e Cron Trigger `0 */6 * * *` (até 2 conexões ativas por execução,
  começando pelas mais antigas/`PARTIAL_SYNC`).

### Webhook do Pluggy

`POST /api/webhooks/pluggy` exige `x-webhook-secret` == `PLUGGY_WEBHOOK_SECRET`
(configurado no `POST /webhooks` da Pluggy com `headers`), confere `clientId` e
responde 202 rápido. O recurso é **sempre re-buscado** no provider em background
(`executionCtx.waitUntil`). `item/deleted` marca a conexão como `disconnected`;
`transactions/deleted` apaga os `transactionIds` da conexão de forma idempotente.
Não há HMAC (a Pluggy não assina webhooks). O webhook é **global**; o connect
token não define `webhookUrl` para não duplicar eventos. Registre/atualize com
`node --env-file=.dev.vars scripts/register-pluggy-webhook.mjs` (idempotente,
não imprime segredos).

## Testes

```bash
pnpm --filter @fd/api test
```

Rodam no runtime real (workerd) com `@cloudflare/vitest-plugin` e D1 local; as
migrations de `packages/database/migrations` são aplicadas no setup de cada
arquivo. Nenhum teste faz chamada de rede (GitHub/Pluggy são mockados).

Cobertura: auth (setup/login/logout/me/rate limit/sessão expirada/OAuth),
CSRF/headers, autorização entre usuários, endpoints principais validando as
respostas com `@fd/contracts`, sync demo ponta a ponta (idempotência, categoria
manual preservada, snapshots retroativos), sync Pluggy com fixtures (contas
BANK/CREDIT, faturas, investimentos, `/v2/transactions` com cursor, categorias e
snapshots), connect-token/IDOR, remoção remota, falha de provider sem perda de
dados, cron e webhook (segredo/clientId/re-fetch/`transactions/deleted`).
