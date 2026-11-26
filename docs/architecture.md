# Finance Dashboard — Arquitetura e decisões (fonte da verdade)

Este documento é o contrato entre todas as frentes. Toda subtarefa deve segui-lo.
A arquitetura vigente é descrita aqui; cada decisão nova vira um arquivo em [decisions/](decisions/README.md),
com contexto, alternativas e consequências. O registro abaixo é histórico e não recebe linhas novas.

## Restrição de custo: ZERO

O projeto deve rodar 100% nos planos gratuitos (Cloudflare Workers Free, Pages, D1, KV free; GitHub Free; Pluggy sandbox/MeuPluggy).
- Nada que exija Workers Paid, cartão de crédito ou produto pago (sem Queues, sem R2, sem Durable Objects pagos).
- Workers Free = 10 ms de CPU por request: evitar trabalho pesado de CPU por request (KDFs, agregações em JS sobre milhares de linhas → agregar em SQL).
- KV Free = 1.000 escritas/dia: KV só para cache de leitura (ex.: apiKey do Pluggy, TTL); nunca escrever por request.
- CI enxuto (GitHub Actions privado = 2.000 min/mês): cache do pnpm, um job, Playwright só chromium.

## Visão geral

Dashboard pessoal de finanças (mercado brasileiro, BRL, pt-BR), monorepo pnpm + Turborepo.

```
finance-dashboard/ (raiz do repo)
├── apps/
│   ├── web/        React 19 + Vite + TanStack (Router, Query, Form, Table, Virtual) + Tailwind v4 + shadcn/ui + Recharts + Lucide
│   └── api/        Cloudflare Worker + Hono + Zod + Drizzle (D1)
├── packages/
│   ├── contracts/            Schemas Zod + tipos TS compartilhados (DTOs da API REST)  -> @fd/contracts
│   ├── database/             Schema Drizzle, migrations SQL (D1), seed                 -> @fd/database
│   ├── financial-providers/  Interface FinancialProvider + DemoProvider + PluggyProvider -> @fd/financial-providers
│   ├── ui/                   Componentes compartilhados (shadcn base, tokens)           -> @fd/ui
│   └── config/               tsconfig base, eslint, prettier                           -> @fd/config
└── docs/
```

Escopo de pacotes: `@fd/*`. Pacotes internos são "just-in-time" (exportam `src/*.ts` direto, sem build), exceto
quando algo exigir build.

## Convenções de domínio

- **Dinheiro**: sempre inteiro em centavos (`amountCents: number`), moeda `currency: "BRL"` (ISO 4217). Nunca float.
- **Sinal**: transações com `amountCents` positivo = entrada (receita), negativo = saída (despesa). Campo derivado `type: "income" | "expense" | "transfer"`.
- **Movimentação interna não é receita nem despesa**: `type` é derivado na sincronização e os agregados (`/api/overview`, `/api/analytics/*`) só somam `income`/`expense`. Viram `type: "transfer"`:
  - pagamento de fatura de cartão (sinal forte de pagamento/estorno na conta cartão);
  - transferência cuja contraparte é o **próprio titular** — a contraparte é o trecho depois do separador da descrição (`|` no Open Finance, ` - ` no conector do banco) e precisa conter todos os tokens de `users.name` com 3+ caracteres (sem acento, caixa alta). Regra em `packages/financial-providers/src/pluggy/internal-transfers.ts`. **Requisito**: o nome precisa render ao menos **2 tokens significativos**; conectores curtos ("e", "da") e sobrenomes de 1–2 letras são descartados, e um `users.name` que é só o login do GitHub (1 token) **desliga a regra** para aquele usuário — não há detecção de titular por CPF ainda (follow-up: `paymentData.payer/receiver.documentNumber`). Risco aceito: o casamento é por subconjunto de tokens, então "<Titular> Junior" ou "<Titular> MEI Ltda" também viram `transfer`.
  O sync também **reclassifica o histórico já gravado** (`income`/`expense` → `transfer`), porque a janela incremental só revisita ~7 dias; sem isso os KPIs continuariam inflados até um novo histórico completo. A varredura é em lotes de 150 linhas com keyset em `transactions.id` e só considera contas que não são cartão (o mapper também não aplica a regra em cartão), com os tokens do titular calculados uma vez por sync; o progresso (`_backfill`: versão da regra, identidade do titular, cursor, `done`) vive em `sync_runs.stats_json` — histórico concluído custa zero leitura e falha na reclassificação não derruba o sync. Limites conhecidos: a reclassificação **só vai de `income`/`expense` para `transfer`** (mudar o nome do titular não desfaz o que já foi reclassificado); o `_backfill.identity` guarda o nome normalizado em repouso no D1 (não é exposto pela API); e o rollback por `accounts.history_synced_at = NULL` reimporta a janela de 365 dias — linhas mais antigas mantêm o `type` atual.
- **Datas**: ISO 8601 strings na API (`2026-11-10` para datas, `2026-11-10T12:00:00.000Z` para timestamps). No D1, `text` ISO.
- **IDs**: strings (`crypto.randomUUID()`), prefixo opcional não necessário.
- **Idioma**: UI em pt-BR; código, nomes de rotas da API e identificadores em inglês.
- **Origem dos dados**: toda entidade sincronizada carrega `connectionId` e a conexão carrega `provider` (`"demo" | "pluggy"`).
  Dados do provider demo são SEMPRE rotulados na UI como "Demonstração" (badge). Nunca apresentar dado fictício como real.

## Modelo de dados (D1 / Drizzle) — tabelas

- `users` (id, email unique, name, password_hash nullable, github_login unique nullable, avatar_url, created_at)
- `sessions` (id = hash SHA-256 do token, user_id, expires_at, created_at, user_agent)
- `institutions` (id, provider, external_id, name, logo_url, primary_color, type) — unique(provider, external_id)
- `connections` (id, user_id, provider, external_id, institution_id, status: `active|syncing|error|login_required|outdated|disconnected`, status_detail, last_synced_at, provider_updated_at, consent_expires_at, created_at, updated_at)
- `accounts` (id, user_id, connection_id, external_id, type: `checking|savings|credit_card|investment|other`, subtype, name, number_masked, institution_name (banco da própria conta; MeuPluggy pode ter vários), currency, balance_cents, available_cents, amount_sign_convention (cartão), history_synced_at, updated_at) — unique(connection_id, external_id)
- `credit_cards` (account_id PK -> accounts, brand, level, limit_cents, available_limit_cents, closing_day, due_day)
- `bills` (id, account_id, external_id, due_date, closing_date, total_cents, minimum_payment_cents, status derivado: `open|closed|paid|overdue` (Pluggy não envia status; derivar por datas/pagamentos)) — faturas
- `categories` (id, user_id nullable (null = sistema), name, slug, icon (nome lucide), color, kind: `income|expense|transfer`, parent_id)
- `transactions` (id, user_id, account_id, connection_id, external_id, date, description, amount_cents, currency, type, category_id, status: `posted|pending`, bill_id nullable, merchant, notes, installment_number nullable, total_installments nullable, budget_group_id nullable (exceção manual do grupo de metas; o sync nunca escreve), created_at, updated_at) — unique(account_id, external_id); índices em (user_id, date), (account_id, date), (category_id)
- `balance_snapshots` (account_id, date, balance_cents) — PK(account_id, date); base para evolução patrimonial
- `sync_runs` (id, connection_id, started_at, finished_at, status: `running|success|error`, error_code, error_message (sem dados sensíveis), stats_json)
- `investments` (id, user_id, connection_id, external_id, type (`fixed_income|fund|equity|etf|security|other`), name, balance_cents, amount_profit_cents nullable, currency, updated_at) — unique(connection_id, external_id). Patrimônio = contas não-crédito + investimentos − faturas abertas.
- `settings` (user_id, key, value_json) — PK(user_id, key). A chave `budgetReferenceIncomeCents` guarda a renda de referência das metas (fora de `/api/settings`).
- `budget_groups` (id, user_id, name, color, target_bps (meta em pontos-base da renda de referência), position, created_at, updated_at) — grupos de metas; os 6 padrão nascem no primeiro `GET /api/budget` com id `<userId>:<slug>`
- `card_payment_plans` (account_id PK → accounts (cartão), user_id, mode: `pay_on_due|reserve`, reserve_account_id nullable → accounts, reserve_investment_id nullable → investments, updated_at) — sem linha = `pay_on_due`; no máximo uma fonte de reserva
- `budget_category_groups` (user_id, category_id, group_id) — PK(user_id, category_id); grupo padrão da categoria. Grupo efetivo da transação = `transactions.budget_group_id ?? budget_category_groups.group_id`

Migrations versionadas em `packages/database/migrations` (geradas pelo drizzle-kit, dialeto sqlite/D1),
aplicadas com `wrangler d1 migrations apply` (o `apps/api/wrangler.jsonc` aponta `migrations_dir` para lá).

## API REST (apps/api, Hono) — prefixo `/api`

Respostas JSON. Erro padrão: `{ "error": { "code": string, "message": string, "details"?: unknown } }` com status HTTP adequado.
Validação com Zod (`@hono/zod-validator` ou equivalente) usando schemas de `@fd/contracts`. Listas paginadas:
`{ data: T[], page: { cursor?: string | null, nextCursor: string | null, total?: number } }` quando aplicável.

Públicas:
- `GET  /api/health`
- `POST /api/auth/login` {email, password} -> seta cookie `fd_session` (HttpOnly, Secure em prod, SameSite=Lax, Path=/)
- `POST /api/auth/logout`
- `GET  /api/auth/me`
- `POST /api/auth/setup` cria o primeiro usuário (somente se não existir nenhum usuário)
- `POST /api/webhooks/pluggy` (Pluggy NÃO assina webhooks: validar header secreto `x-webhook-secret` == `PLUGGY_WEBHOOK_SECRET` (configurado via `POST /webhooks` com `headers`), checar `clientId`, e SEMPRE re-buscar o recurso no provider; responder 2xx rápido e sincronizar em background; `transactions/deleted` apaga os ids locais)

Autenticadas (middleware de sessão):
- `GET  /api/overview?from&to` -> KPIs (saldo consolidado, receitas, despesas, resultado, patrimônio, variações vs período anterior)
- `GET  /api/analytics/cashflow?from&to&granularity=day|week|month`
- `GET  /api/analytics/categories?from&to&type=expense|income`
- `GET  /api/analytics/net-worth?from&to`
- `GET  /api/investments`
- `GET  /api/analytics/monthly?months=12` (receitas x despesas por mês)
- `GET  /api/accounts`, `GET /api/accounts/:id`
- `GET  /api/transactions?from&to&accountId&categoryId&type&q&uncategorized&cursor&limit&sort`
- `GET  /api/transactions/summary?from&to&accountId&categoryId&type&q&uncategorized` -> receitas, despesas, resultado, `totalCount` e contagem por categoria de **todo** o filtro (uma agregação em SQL)
- `GET  /api/transactions/uncategorized-count` -> `{ count }` (contagem global sem categoria; regra em `apps/api/src/domain/transactions.ts`)
- `PATCH /api/transactions/:id` {categoryId?, notes?, budgetGroupId?}
- `GET  /api/categories`, `POST /api/categories`
- `GET  /api/credit-cards`, `GET /api/credit-cards/:id/bills`, `GET /api/bills/:id/transactions`
- `PUT  /api/credit-cards/:id/payment-plan` {mode: `pay_on_due|reserve`, reserveAccountId?, reserveInvestmentId?}; `GET /api/card-reserves` -> por reserva: a cobrar (faturas não pagas + fatura corrente derivada), guardado (saldo da fonte), falta guardar e gasto desde o último depósito. Ver `docs/decisions/2026-11-18-reserva-para-faturas.md`
- `GET  /api/bills/upcoming` (faturas persistidas com status != `paid` **mais** a fatura corrente derivada do saldo de cada cartão — ver decisão de 2026-11-11)
- `GET  /api/connections`, `POST /api/connections` {provider, itemId?}, `DELETE /api/connections/:id` (Pluggy: revoga `DELETE /items/:id`, tolerante a 404)
- `POST /api/connections/:id/sync`, `GET /api/connections/:id/sync-runs`
- `GET  /api/providers` -> lista providers disponíveis e se estão configurados (demo só aparece com `ENABLE_DEMO_PROVIDER=true`; pluggy só se secrets presentes)
- `POST /api/providers/pluggy/connect-token` {itemId?} -> `{ accessToken, connectorId }` para o widget Pluggy Connect (nunca expõe clientSecret; `itemId` valida que o item pertence ao usuário; sem `webhookUrl` por item)
- `GET/PUT /api/settings`
- `GET  /api/budget` -> renda de referência, grupos de metas e vínculos categoria → grupo; `PUT /api/budget` {referenceIncomeCents?, groups?} (substitui a lista de grupos, soma ≤ 100%); `PUT /api/budget/categories/:categoryId` {groupId | null}; `GET /api/budget/progress?month=YYYY-MM` -> realizado × meta por grupo no mês (default: mês UTC; a web manda o mês de São Paulo). Ver `docs/decisions/2026-11-17-metas-por-grupo.md`

## Autenticação

App pessoal, sessão própria em D1, dois métodos de login (estratégias plugáveis em `apps/api/src/auth/`):
- **GitHub OAuth (produção)**: `GET /api/auth/github` → redirect com `state` (cookie HttpOnly) → `GET /api/auth/github/callback` troca o code (fetch para github.com, custo de CPU ~0), lê `/user`, e só permite se `login` ∈ `ALLOWED_GITHUB_LOGINS` (secret em produção / var em dev, vírgula-separado). Cria/atualiza o usuário (`users.github_login`) e emite sessão. Secrets: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `ALLOWED_GITHUB_LOGINS`. Gratuito, sem cartão, cabe nos 10 ms de CPU do Free.
- **Senha (somente dev/teste)**: habilitada apenas se `ENABLE_PASSWORD_LOGIN=true` (default true em dev, false em produção) — PBKDF2 não cabe nos 10 ms de CPU do Workers Free.
- `GET /api/auth/providers` informa à UI quais métodos estão habilitados.
- Senha com PBKDF2-SHA256 (WebCrypto, EXATAMENTE 100_000 iterações — teto do workerd; 100_001 lança erro em produção mas não no Node/wrangler dev; salt aleatório). por isso o login por senha é restrito a dev/teste (≈40 ms CPU > 10 ms do Free) — formato `pbkdf2$<iter>$<saltB64>$<hashB64>`.
- Sessão: token aleatório 32 bytes (base64url) no cookie; no banco guarda-se apenas o SHA-256 do token. Expira em 30 dias, renovação deslizante.
- Rate limit de login por senha via tabela D1 `login_attempts` (não KV — limite de escritas).
- Recomendação adicional em produção: Cloudflare Access na frente (documentar, não obrigatório).
- Usuário demo criado pelo seed local: `demo@finance.local` / `demo1234` (apenas ambiente local; documentado).

## Origem única (cookies)

- Dev: Vite (`apps/web`, porta 5173) faz proxy de `/api` -> `http://127.0.0.1:8787` (wrangler dev).
- Prod: Cloudflare Pages serve `apps/web/dist`; uma Pages Function em `apps/web/functions/api/[[path]].ts` faz proxy de
  `/api/*` para o Worker via **service binding** (`API`). Assim frontend e API compartilham a mesma origem e o cookie.

## Providers financeiros (`@fd/financial-providers`)

```ts
interface FinancialProvider {
  readonly id: "demo" | "pluggy";
  getConnection(externalId: string): Promise<ProviderConnection>;
  getAccounts(connectionExternalId: string): Promise<ProviderAccount[]>;
  getTransactions(accountExternalId: string, opts: { from: string; to: string }): Promise<ProviderTransaction[]>;
  getCreditCards(connectionExternalId: string): Promise<ProviderCreditCard[]>;
  getBills(accountExternalId: string): Promise<ProviderBill[]>;
  getBalances(connectionExternalId: string): Promise<ProviderBalance[]>;
  getInvestments(connectionExternalId: string): Promise<ProviderInvestment[]>;
}
```
- Tipos `Provider*` são normalizados (centavos, ISO) e independentes do fornecedor.
- Erros tipados: `ProviderError` com `code: "unavailable" | "auth_failed" | "login_required" | "rate_limited" | "not_found" | "invalid_response"` e `retryable`.
- `DemoProvider`: determinístico (seed fixa), 3 instituições fictícias (nomes inventados, ex.: "Banco Aurora", "Nuvem Bank", "Cooperativa Horizonte"), contas corrente/poupança/investimento, 2 cartões com faturas, ~12 meses de transações realistas em BRL com categorias brasileiras (Mercado, Restaurantes, Transporte, Moradia, Saúde, Educação, Lazer, Assinaturas, Salário, Pix recebido...).
- `PluggyProvider`: REST `https://api.pluggy.ai` (auth `POST /auth` com clientId/clientSecret -> apiKey cacheada, header `X-API-KEY`; `/items/:id`, `/accounts?itemId=` (paginado `{results,...}`), **`/v2/transactions?accountId=&dateFrom=&dateTo=`** com cursor `after` e resposta `{results,next}` (o `/transactions` v1 está deprecated), `/bills?accountId=` (campos `billClosingDate`, `minimumPaymentAmount`), `/investments?itemId=`, `/connect_token`, `/connectors?sandbox=true&countries=BR`, `DELETE /items/:id`). **Sinal**: conta corrente usa o sinal de `amount` (no sandbox real, 31/31 coincidem com `DEBIT`/`CREDIT`). Cartão não é confiável por `type` nem pelo sinal isolado: o sandbox devolve compras com `amount` negativo e `type: "CREDIT"`, enquanto a documentação/Open Finance usa compras positivas. O provider detecta a convenção por conta (`purchase_negative`/`purchase_positive`) com sinais fortes de pagamento/estorno e sinal dominante (amostra ≥ 5), persiste em `accounts.amount_sign_convention` e mapeia compra = despesa negativa, pagamento = transferência positiva e estorno = receita positiva. Dois modos: sandbox (conector Pluggy Bank, id resolvido via `/connectors?sandbox=true`, nunca hardcoded) e **MeuPluggy** (conector 200, `name: "MeuPluggy"`, gratuito para uso pessoal): o backend resolve o conector por id/name e devolve em `connect-token`; itens MeuPluggy não aceitam `PATCH /items` → 'Atualizar' apenas relê dados e `DELETE /items/:id` revoga o item. Contas guardam `institution_name` derivado do COMPE (`bankData.transferNumber`) ou do nome do cartão, para exibir bancos diferentes no mesmo item; cartão sem COMPE e com nome genérico (`GOLD`, `platinum`) herda a única instituição distinta das outras contas do item (item com dois bancos fica `null`). Ver `docs/research/pluggy-api-reference.md`. Usar `fetch` puro (compatível com Workers). Mapear status de item para status de conexão (inclui `outdated`). Retry com backoff para 429/5xx.
- Sincronização (`apps/api`, serviço `SyncService`): upsert idempotente por `(connection, external_id)`, snapshot diário de saldo, registro em `sync_runs`, status da conexão atualizado; falha do provider não apaga dados existentes. Disparo: manual (endpoint), webhook, e Cron Trigger (`scheduled`) a cada 6h. Execução inline com `ctx.waitUntil` (sem Queues), sincronização incremental com janela desde `min(last_synced_at, provider_updated_at)` − 7 dias (o frescor do snapshot do provider manda; ver `docs/decisions/2026-11-14-janela-incremental-pela-atualizacao-do-provider.md`) e **orçamento compartilhado de 45 subrequests por invocação** (item + contas + faturas + investimentos + páginas de transações). O `POST .../sync?refresh=true` pede atualização ao provider antes de ler (`PATCH /items` no Pluggy); no MeuPluggy é no-op declarado (`refreshed: false`), porque o conector não aceita atualização manual. O cron processa até 2 conexões; a que não couber no orçamento fica para o próximo ciclo. O demo pagina o histórico em 60 transações por conta (`_pending` em `stats_json`), então o primeiro sync completo leva alguns POSTs em vez de montar tudo em um request. A UI repete `POST /api/connections/:id/sync` enquanto `statusDetail = "PARTIAL_SYNC"` (limite de 12 iterações, progresso "Importando histórico… fatia n" e invalidação única no fim); o cron prioriza conexões com `PARTIAL_SYNC` para continuar a importação. **Histórico inicial**: conta nova usa 365 dias (ou o cursor pendente) até `accounts.history_synced_at` ser gravado; `connections.last_synced_at` só é preenchido quando todas as contas completaram o histórico, então uma conexão recém-criada não vira incremental prematuramente. No Pluggy, o primeiro sync grava o snapshot do dia (sem inventar histórico) e `transactions/deleted` do webhook apaga os ids locais de forma idempotente.
- **D1 Free = 50 queries por invocação**: `db.batch()` conta como **uma** query, então todo upsert em lote do sync (contas, cartões+faturas, transações, investimentos, saldos+snapshots, finish) vai em um único batch por conexão. Medido no teste `d1-budget.test.ts`: máx. 42 queries no workerd. No `wrangler dev`, o sync demo completo levou 7 slices, máx. **224 ms** por slice e 1,27 s no total (antes: 2,4 s em um único POST para uma conexão).
- **CPU do demo**: o dataset de 12 meses (~760 transações) custa ~20 ms para gerar; `prewarmDemoDataset()` roda na avaliação do módulo (startup, que não conta no CPU por request) e o cache é por data UTC. O que sobra no request é percorrer o dataset aquecido (~3 ms medidos) + montar os batches.

## Bindings Cloudflare (apps/api/wrangler.jsonc)

- `DB` (D1, `finance-dashboard`), `CACHE` (KV, opcional, só leitura/cache com TTL). Sem Queues e sem R2 (exigem plano pago/cartão).
- Vars: `APP_ENV` (`development|production`), `ENABLE_DEMO_PROVIDER` (`true` em dev/teste, `false` em produção), `ENABLE_PASSWORD_LOGIN` (`ALLOWED_GITHUB_LOGINS` fica em `vars` só em dev; em produção é secret).
- Secrets (nunca versionados; local em `apps/api/.dev.vars`, exemplo em `.dev.vars.example`): `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `ALLOWED_GITHUB_LOGINS` (em produção).

## Frontend

- Rotas (TanStack Router, file-based via plugin Vite): `/login`, `/setup`, `/` (Overview), `/accounts`, `/accounts/$accountId`,
  `/transactions`, `/credit-cards`, `/credit-cards/$accountId` (detalhe do cartão/fatura, `?bill=`), `/analytics`, `/budget` (Metas), `/connections`, `/settings`. Layout autenticado `_app` com sidebar.
- Busca de dados com TanStack Query (query keys centralizadas em `src/lib/queries.ts`), cliente fetch tipado em `src/lib/api.ts` usando tipos de `@fd/contracts`.
- Filtros de período e de transações como **search params validados** (Zod) do TanStack Router.
- Tabelas com TanStack Table; lista longa de transações com TanStack Virtual. Abaixo de `md` a tabela de transações vira uma lista de cartões virtualizada (mesmos filtros, busca e carregamento automático das páginas seguintes).
- Formulários com TanStack Form.
- Formatação: `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })`, datas `pt-BR`.
- Tema: dark padrão, light opcional, persistido (localStorage + settings). Tailwind v4 com tokens CSS (shadcn).
- Headers de segurança do Pages em `apps/web/public/_headers` (CSP compatível com o bundle, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` e HSTS); o script anti-flash de tema é externo (`public/theme-init.js`) e o mesmo arquivo é aplicado em `vite dev`/`vite preview` por um plugin.

## Identidade visual

Nome do produto: **Lumen Finance** (marca própria). Inspiração: densidade e precisão do painel da Cloudflare, sem copiar.
- Tema escuro padrão, neutro e acromático: fundo `oklch(0.1 0 0)`, cards `oklch(0.17 0 0)` com borda 1px e **sem sombra**; sombra só em popover, dialog e toast.
- Acento único azul (`oklch(0.56 0.2 258)` no escuro, `oklch(0.52 0.2 258)` no claro); verde, vermelho e âmbar só carregam significado (entrada, saída, atenção) e nunca viram cor de botão.
- Tipografia Inter com `tabular-nums` em valores monetários e escala fechada: 12/13/14/16/20/24px, controles de 28/32/36px, linhas de 44px, raio base 8px. Rótulos em 12–13px peso 500, sem caixa alta com tracking largo.
- Sidebar de 256px (trilha de 56px), topbar de 56px, cards com cabeçalho de 44px, pills de 20px e abas segmentadas. O filtro de período vive no `PageHeader` das páginas que dependem dele (`ToggleGroup` 7D/30D/90D/12M + calendário).
- Gráficos Recharts com linha de 1,5px, área a 12%, grade horizontal sutil e eixo Y à direita; estado vazio "Sem dados" sobre uma onda cinza.
- Animações sutis (transições 150–200ms), skeletons em todo carregamento, empty states com ícone + texto + ação.

## Registro de decisões

Arquivo histórico até 2026-11-11. Decisões a partir de 2026-11-12 ficam em [decisions/](decisions/README.md),
um arquivo por decisão, para que PRs simultâneos não conflitem nesta lista.

- 2026-11-10: auth própria (PBKDF2 + sessão em D1) em vez de Better Auth/Clerk — app pessoal, zero dependência externa, compatível com Workers.
- 2026-11-10: Pluggy escolhido como provider Open Finance inicial (sandbox gratuito com conector "Pluggy Bank"/MeuPluggy); avaliação detalhada em `docs/research/open-finance-providers.md`.
- 2026-11-10: pesquisa (docs/research) corrigiu: PBKDF2 fixo 100k + Workers Paid, webhook sem HMAC, /v2/transactions, sinal por `type`, tabela `investments`, status de fatura derivado, MeuPluggy para uso pessoal real.
- 2026-11-10: restrição de custo zero → login de produção via GitHub OAuth (allowlist), senha só em dev; sem Queues/R2; rate limit em D1.
- 2026-11-10: proxy via Pages Function + service binding para manter origem única.
- 2026-11-10: **TypeScript pinado em 6.0.3** (não 7.0.2). O TS 7 é o port nativo e o `typescript-eslint` 8.72 declara peer `>=4.8.4 <6.1.0`; subir para 7 quebraria o lint. Reavaliar quando `typescript-eslint` suportar TS 7.
- 2026-11-10: testes da API rodam no runtime real de Workers com `@cloudflare/vitest-plugin` 1.7.0 (o `@cloudflare/vitest-pool-workers` foi descontinuado/renomeado) + Vitest 5.1.0 — o plugin declara peer `^4.1.0 || ^5.0.0`, então não foi preciso separar versões de Vitest por app.
- 2026-11-10: `@tanstack/react-table` 9.3.1 (v9 é a tag `latest` no npm, com API nova); as telas de tabela devem seguir a documentação da v9.
- 2026-11-10: **D1 Free: 50 queries por invocação; `db.batch()` conta como 1** (documentação Cloudflare). O sync agrupa todas as escritas de uma conexão em poucos batches e o cron limita a 2 conexões (orçamento de 45 subrequests/request). Teste `d1-budget.test.ts` mede 42 queries no pior slice.
- 2026-11-10: **D1 `LIKE`/`GLOB` aceita no máximo 50 bytes de padrão**. A busca de transações usa `instr(lower(col), lower(?))` com parâmetro vinculado, o que também elimina o escape manual de `%`/`_`/`\`.
- 2026-11-10: **DemoProvider aquece o dataset no startup** (`prewarmDemoDataset`, cache por data UTC) e pagina transações em 60 por conta. O build frio (~20 ms) sai do CPU por request e o sync inicial é fatiado com cursor em `sync_runs.stats_json._pending`.
- 2026-11-10: **Snapshot histórico de cartão usa sinal invertido**: `balance_cents` de cartão é dívida; compra negativa aumenta a dívida. O histórico é calculado a partir de agregações no D1 (`SUM` por dia + total), não das páginas baixadas, para continuar correto após retomada de cursor.
- 2026-11-10: auth hardening: setup atômico (`INSERT ... WHERE NOT EXISTS`), e-mail GitHub só verificado, sessão não escreve no D1 para token inexistente e manutenção no cron em um batch.
- 2026-11-10: Vite dev com `server.host = 127.0.0.1` — no Windows `localhost` resolvia para `::1` e o proxy/curl em `127.0.0.1:5173` não respondia.
- 2026-11-10: pnpm 12 usa `allowBuilds` (scripts de instalação) e gate de supply-chain com `minimumReleaseAgeExclude` para pacotes recém-publicados.
- 2026-11-10: UI do sync demo fatiado: o botão de Conexões e o "Sincronizar" da Visão geral repetem o POST enquanto houver `PARTIAL_SYNC` (limite de 12 fatias), com progresso por fatia e invalidação única no fim. O cron prioriza `PARTIAL_SYNC` antes de `last_synced_at` antigo; o e2e prova o histórico completo de 12 meses (> 700 transações) após conectar a demonstração.
- 2026-11-10: headers de segurança no Pages via `_headers` (CSP, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`). O tema anti-flash saiu do inline e o Zod roda em `jitless` sob CSP estrita; o mesmo arquivo é replicado em dev/preview por plugin do Vite.
- 2026-11-10: responsividade: transações em cartões virtualizados abaixo de `md`; comparativo mensal de Análises em coluna inteira, sem rolagem horizontal em 1280/1440.
- 2026-11-10: **demonstração fora da produção**: `ENABLE_DEMO_PROVIDER=false` no ambiente `production`; o registry só lista demo quando habilitado, `POST /api/connections` demo responde 400 e a UI deriva a visibilidade de `/api/providers`. A migration `0003` remove conexões demo antigas; dev/teste/e2e continuam com demo.
- 2026-11-10: **MeuPluggy no widget**: `POST /api/providers/pluggy/connect-token` aceita `itemId` (validado contra as conexões do usuário) e devolve `connectorId` resolvido por `GET /connectors?countries=BR` (id 200 confirmado; fallback por nome). O widget oficial v2.8.2 é carregado sob demanda e restrito ao conector; reconexão usa `updateItem`.
- 2026-11-10: **webhook global**: o connect token não define `webhookUrl`; o webhook é criado via `POST /webhooks` com `event: all` e header `X-Webhook-Secret` (script idempotente `register-pluggy-webhook.mjs`, PATCH se já existir). `transactions/deleted` apaga os ids locais; os demais eventos re-buscam/sincronizam.
- 2026-11-10: **instituição por conta**: `accounts.institution_name` guarda o banco derivado do COMPE (`bankData.transferNumber`) ou do nome do cartão; `connections.consent_expires_at` expõe o consentimento de 1 ano do MeuPluggy. Status `OUTDATED` vira `outdated` na UI ("Desatualizada") e o cron volta a tentar.
- 2026-11-10: **sinal real do cartão (sandbox)**: o conector Pluggy Bank devolve compras com `amount` negativo e `type: "CREDIT"`, ao contrário da documentação; por isso o cartão detecta a convenção por conta (`amount_sign_convention`), com pagamento/estorno por sinais fortes e sinal dominante (amostra ≥ 5), e compra sempre vira despesa negativa. Conta corrente usa o sinal do `amount`.
- 2026-11-10: **histórico inicial**: `POST /api/connections` não herda `last_synced_at` do item; cada conta usa 365 dias (ou cursor pendente) até `accounts.history_synced_at`, e `connections.last_synced_at` só é gravado quando todas as contas completaram o histórico. Faturas vencidas há > 90 dias ficam `closed` em vez de `overdue` eternamente.
- 2026-11-11: **redesign "estilo Cloudflare"** no `apps/web`: tokens neutros com acento azul (`--border-subtle`/`--subtle-foreground`), raio base 8px, cards sem sombra, escala fechada de 12–24px e controles de 28–36px; primitivos e componentes de domínio reescritos, sidebar/topbar novas, paleta de comandos, valores ocultáveis e período no `PageHeader`.
- 2026-11-11: **instituição do cartão MeuPluggy**: o cartão não traz COMPE (`bankData` nulo) e o nome é genérico (`GOLD`, `platinum`), então `deriveMeuPluggyInstitutionName` devolvia `null` e a UI exibia o conector "MeuPluggy". `getAccounts` agora resolve a instituição por item: conta sem banco herda a única instituição distinta das demais contas do mesmo item; se o item misturar bancos, continua `null`. O rótulo de transação usa `accounts.institution_name` (o DTO `institutionName`) antes do nome da conexão, e o upsert do sync atualiza as linhas existentes.
- 2026-11-11: **"sem categoria" = `category_id IS NULL` + `status = 'posted'` + `type IN ('income','expense')`**, a mesma regra das análises. Transferências ficam fora (não recebem categoria por natureza e não entram em receitas/despesas), pendentes ficam fora (ainda podem mudar) e conexões `disconnected` entram (o DELETE apaga em cascata; a listagem e as análises não filtram status de conexão). A contagem é um `COUNT(*)` escopado por `user_id` (índice `transactions_user_id_date_idx`, sem migration nova) em `GET /api/transactions/uncategorized-count`, e a listagem aceita `uncategorized=true` com a mesma condição.
- 2026-11-11: **valores do grupo "Contas" na sidebar**: cada instituição mostra a linha inteira do card de /accounts — o líquido quando tem fatura aberta (saldos − faturas abertas) ou o saldo das contas **incluindo investimentos** — e um grupo só de cartão mostra a dívida negativa em tom de perigo, nunca `0`. "Todas as contas" passa a ser o "Em contas" do resumo de patrimônio (`summarizeAccounts` sobre as mesmas contas exibidas): sem cartões e sem investimentos, por isso não é a soma das linhas; a sidebar também filtra contas demo fora de produção, enquanto a página Contas soma tudo. As linhas são ordenadas pelo valor exibido (líquido/saldo). O formato é curto e com moeda (`formatCompactMoneyFromCents`: "R$ 515", "-R$ 1.234", centavos só em valores com centavos abaixo de R$ 100, sempre truncando), o `title` e um `sr-only` dizem o que o número é (saldo, líquido ou fatura aberta) e o modo "Ocultar valores" mascara valor, dica e `title` sem pintar a máscara de vermelho.
- 2026-11-11: **movimentação interna fora de receitas/despesas**: em produção, `Transferência Recebida|<titular>` entrava como receita, as saídas para o mesmo titular entravam como despesa (a maior parte das despesas) e inflavam a taxa de poupança; o pagamento de fatura no cartão já era `transfer`. A classificação passou a usar sinais estruturais — natureza da descrição (Pix/TED/DOC/transferência/pagamento/resgate/aplicação, cada um com contraparte) + contraparte depois de `|` ou ` - ` (inclui NBSP) + todos os tokens de `users.name` (3+ caracteres, mínimo de 2 tokens) — e o sync reclassifica o histórico antigo em lotes de 150 linhas por execução, só em contas que não são cartão, com cursor/versão em `sync_runs.stats_json` (`_backfill`) e **zero leitura** quando concluído. `deriveMeuPluggyInstitutionName` e a convenção de sinal do cartão não mudam. Rollback de dados: `UPDATE accounts SET history_synced_at = NULL` + sync completo reimporta até 365 dias com a classificação vigente.
- 2026-11-11: **regra única do delta**: percentual (`deltaPercent`, em pontos) só quando a base é comparável (mesmo sinal, base ≥ R$ 100,00 e |variação| ≤ 500%); base zero, base minúscula, sinais opostos ou percentual acima do teto mostram a diferença absoluta em reais ("+R$ 7.500,00") e "—" quando não há base. O helper `apps/web/src/lib/delta.ts` (`describeDelta`/`formatDelta`) atende os KPIs da Visão geral e de Análises, o patrimônio e a tabela mês a mês; o `formatDelta` usa o `useMoneyFormatter` para respeitar "Ocultar valores" (rótulo acessível fala a magnitude, sem sinal duplicado).
- 2026-11-11: **sub-itens de Contas na sidebar filtram `/accounts` por conexão + instituição** (`?connection=&institution=`, validados em `accountsSearchSchema`). O grupo é identificado por `connectionId:institutionName` porque um item MeuPluggy pode ter bancos diferentes; assim dois itens "MeuPluggy" nunca apontam para a mesma vista. A página recorta só a lista (o resumo de patrimônio continua global) e o item ativo é derivado da URL, não de estado local. Filtro inexistente cai em "Todas as contas" e é removido da URL com `replace`.
- 2026-11-11: **resumo da lista de transações vem da API** (`GET /api/transactions/summary`), numa única agregação SQL com `GROUP BY category_id` (total, receitas, despesas e contagem por categoria): somar no cliente só as páginas carregadas fazia os totais mudarem a cada "Carregar mais". O recorte é o do filtro, montado por `transactionFilterConditions` (mesma função da lista). Receitas/despesas/resultado usam `incomeExpenseSums` — a regra única das agregações, a mesma dos KPIs: só `income`/`expense` e só `status = 'posted'` (transferências, inclusive as internas do #45, e pendentes ficam fora), então o mesmo período devolve os mesmos números de `/api/overview` e o card se rotula "efetivadas, sem transferências". `totalCount` e as contagens por categoria contam tudo o que a lista mostra (pendentes e transferências incluídos), porque fecham com as linhas visíveis e com o rodapé "50 de N"; sem o agregado (carregando ou erro) o card mostra "—" e o rodapé cai no texto antigo, nunca em R$ 0,00 ou num N inventado.
- 2026-11-11: **fatura corrente derivada do cartão** em `GET /api/bills/upcoming`. O Pluggy/MeuPluggy só devolve faturas fechadas (`/bills`); com todas pagas, a fatura em aberto não existia em lugar nenhum e a Visão geral dizia "sem faturas abertas" com dívida no patrimônio. Regras: (1) **vencimento** = primeira ocorrência de `due_day` estritamente depois de `MAX(bills.due_date)` do cartão (pagas incluídas) e nunca no passado — uma fatura paga em 07/11 leva a derivada para 07/12 mesmo em 31/10; por construção toda fatura existente fica em ciclo anterior, então não há checagem de bloqueio; (2) **valor** = `min(compras líquidas do ciclo, accounts.balance_cents)`. Compras líquidas = `SUM(-amount_cents)` de `type IN ('expense','income')` com `date >= MAX(bills.closing_date)` (o dia do fechamento já pertence ao ciclo corrente e estornos abatem); pagamentos e créditos chegam como `transfer` (`mappers.ts`) e ficam fora. O saldo devedor é teto porque é o total que se deve: num cartão o ciclo pode somar menos que o saldo (usa o ciclo); noutro, o ciclo já foi pago (pagamento + descontos como `transfer`) e o saldo restante, pequeno, é o valor coerente; sem nenhuma fatura sincronizada, o saldo é a única fonte; (3) a derivada respeita `days`/`limit` e vem com `estimated: true` no contrato (`UpcomingBill.estimated`), rotulada como "estimada" na UI e **fora** da faixa "Requer atenção" (o valor ainda está incompleto); (4) **fechamento** = primeiro `closing_day` depois do último fechamento (ou um mês depois dele quando o cartão não informa `closing_day`, como nos dois cartões de produção), nunca depois do vencimento; (5) cartão com valor em aberto zero não gera fatura. O id é sintético e determinístico (`open-invoice:<accountId>:<dueDate>`, nunca colide com o D1), então `GET /api/bills/:id/transactions` responde 404 para ele e nenhuma tela oferece ação de lançamentos a partir de `/bills/upcoming`. São 2 queries por request (subconsultas agregadas por cartão), sem migration. **Aproximações registradas**: "hoje" é a data civil **UTC** (`todayIsoDate`) — das 21h às 23h59 BRT o dia UTC já virou e a derivada pode pular de mês no dia do vencimento; o deslocamento de vencimento para o próximo **dia útil** (a Platinum vence em 23/11 quando o 22 cai no domingo) não é inferido; transações `pending` datadas 1–2 dias antes do fechamento e sem `bill_id` não entram em nenhuma das duas somas (ficaram fora da fatura fechada, que só soma `posted`, e antes do corte `date >= closing`). O teto `min(ciclo, saldo)` superestima quando o saldo inclui parcelas futuras e há pagamento antecipado no ciclo (aproximação aceita); fatura sem `closing_date` não deriva, para não contar em dobro.
- 2026-11-11: **logo real do banco no avatar**: a web resolve o logo pelo `institutionName` da conta (COMPE/alias do Pluggy, comparação exata após normalizar, sem substring) contra o catálogo de conectores e usa `https://cdn.pluggy.ai/assets/connector-icons/<arquivo>.svg` — a CSP já libera `https://*.pluggy.ai` em `img-src`. MeuPluggy (200) e Pluggy Bank (2) devolvem `sandbox.svg` e **nunca** são logo de banco; demo e bancos sem conector (Agibank, Banco Original, Banco Votorantim, Will Bank) caem nas iniciais. As iniciais ficam atrás do `<img>`: o fundo branco só entra no `onLoad` (sem tile branco se o CDN travar) e o `onError` volta para elas. A lista canônica de nomes vem de `KNOWN_ACCOUNT_BANK_NAMES` (`@fd/financial-providers`, COMPE + alias de cartão) e o teste da web exige logo para todo banco fora da lista explícita sem logo. Privacidade: o CDN vê os ids de banco pedidos (`referrerPolicy="no-referrer"` no `<img>`); a resposta é `Cache-Control: public, max-age=0, must-revalidate` (ETag/304) e o caminho `/assets/connector-icons/` pode mudar — nesse caso o avatar volta às iniciais, sem quebrar a tela. A paleta de comandos segue sem avatar.
- 2026-11-11: **série patrimonial reconstruída antes do primeiro snapshot**: o primeiro sync grava só o snapshot do dia, então os dias anteriores caíam no saldo atual e viravam uma linha reta. Agora, dia sem snapshot até a data é `saldo atual − Σ transações posteriores` (até hoje; no cartão o sinal inverte, como no histórico do sync); dias cobertos por snapshot continuam usando o snapshot, sem reconstruir duas vezes. Isso implica um possível salto no primeiro snapshot: os dias anteriores são reconstruídos a partir do saldo atual e podem não coincidir exatamente com o valor gravado. `balanceTotals` usa a mesma regra em qualquer data, para o delta do KPI do overview acompanhar o gráfico, e as duas funções compartilham o fragmento `balanceAtSql`. Quando `period.to` está no passado ("Mês passado", período personalizado), as transações de `(to, hoje]` entram numa CTE `tail` agregada por conta e somada à reconstrução — sem isso a série ficava no nível do saldo atual. As datas geradas param em `period.to` (o clamp de 366 dias continua limitando a série) e o `tail` só é montado quando `to < hoje`, então o custo cresce com os dias da janela e com as transações do tail, nunca com `hoje − from`. Continua uma consulta só (CTE recursiva de datas, com cada transação lida uma vez via join por dia + janela acumulada), e o overview não chama `netWorthSeries`. **Investimentos** não têm histórico: a tabela `investments` entra como valor constante em todos os pontos (e no KPI), por isso a página Contas também soma `/api/investments` em `summarizeAccounts` — foi essa a divergência de 854 centavos entre o gráfico e o resumo. As posições não são distribuídas pelos cards de instituição (não têm instituição própria); o painel Patrimônio mostra esse total junto de "Investimentos" e avisa quando `/api/investments` falha, degradando só o resumo sem esconder a lista de contas.
- 2026-11-11: **painel de detalhe da transação vive na URL (`?tx=<id>`)**, junto dos filtros (que continuam na URL): o link é compartilhável e o recarregamento mantém o painel aberto. Abrir é um push de histórico, então o "voltar" do navegador fecha; Fechar/Esc/overlay desempilham a mesma entrada (sem "voltar" morto) e Anterior/Próxima trocam o `tx` com replace, para um único "voltar" continuar fechando. A nota digitada é salva na desmontagem do painel (o "voltar" não passa por `onOpenChange`). `?tx=` que não resolve na lista carregada sai da URL com `replace` assim que a lista é real e está estável (sem placeholder), para não guardar id morto nem reabrir o painel depois de "Carregar mais"; ids da segunda página em diante (além dos 50 carregados) não abrem por link. `tx` não conta como filtro (o estado vazio não vira "filtros ativos"). O valor repete o texto da tabela com sinal (`+R$`/`-R$`) e o campo `type` do provedor aparece como "Movimentação" (Receita/Despesa/Transferência entre contas, com tooltip), porque é a classificação do sync e não a nossa categoria.
- 2026-11-12: **fechamento derivado e status de fatura na tela Cartões**: o Pluggy pode omitir `creditData.balanceCloseDate` no cartão (a tela mostrava "Fecha dia —"), mas toda fatura traz `billClosingDate`; `GET /api/credit-cards` completa `closingDay` com a moda dos dias das 6 faturas mais recentes com fechamento (empate fica com a mais recente — o dia isolado oscila com fim de semana/feriado), numa query a mais só quando o cartão não informa. Na lista de faturas (Cartões e detalhe do cartão), a paga mostra a data ("venceu em 07/11", ou "paga" quando o pagamento veio antes do vencimento) em vez de "venceu há N dias", e a `closed` com vencimento no passado — o histórico > 90 dias sem pagamento que o servidor rederiva — aparece como "Encerrada" em tom neutro, não como pendência.
- 2026-11-13: **card de KPI: variação em linha própria e legenda sem truncar**: o valor
  ocupa a linha inteira e o selo do delta fica sempre abaixo dele, na mesma altura em todos
  os cards (percentual ou diferença em reais). A linha do selo é reservada mesmo sem delta
  (`kpi-delta` com altura mínima, `aria-hidden`), então a legenda também não sobe; o skeleton
  reserva a mesma linha. A legenda (contexto do delta ou `hint`) quebra em até duas linhas com
  `line-clamp-2` em vez de `truncate` e expõe o texto completo no `title`. A sparkline continua
  colada na base (`mt-auto`) e os cards da mesma linha esticam juntos; o e2e
  `kpi-cards.spec.ts` mede selo, legenda e sparkline por linha em 1440/1280/430 px, com o
  overview stubado por valores fixos (delta percentual e em reais).
