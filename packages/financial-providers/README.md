# @fd/financial-providers

Contrato normalizado de providers financeiros do Lumen Finance, com dois
adapters prontos: `DemoProvider` (offline, determinístico) e `PluggyProvider`
(Open Finance via Pluggy). O pacote é autocontido: tipos `Provider*` próprios,
sem `@fd/contracts`, sem Drizzle e sem APIs Node. Roda em Cloudflare Workers
com `fetch`, `AbortSignal`, `setTimeout` e Web APIs padrão.

```
src/
  types.ts        FinancialProvider + tipos Provider*
  categories.ts   slugs de categoriaHint (seed do app)
  errors.ts       ProviderError + helpers
  bills.ts        deriveBillStatus (open|closed|paid|overdue)
  cache.ts        KeyValueCache (adapter de KV)
  registry.ts     createProviderRegistry(env)
  demo/           DemoProvider determinístico
  pluggy/         PluggyClient + PluggyProvider + mappers
```

## Instalação/uso

O pacote é interno e "just-in-time": exporta `src/*.ts` direto, sem build.

```ts
import {
  createProviderRegistry,
  type FinancialProvider,
  type KeyValueCache,
} from "@fd/financial-providers";

const cache: KeyValueCache = {
  get: (key) => env.CACHE.get(key),
  put: (key, value, ttlSeconds) => env.CACHE.put(key, value, { expirationTtl: ttlSeconds }),
  delete: (key) => env.CACHE.delete(key),
};

const registry = createProviderRegistry(
  {
    PLUGGY_CLIENT_ID: env.PLUGGY_CLIENT_ID,
    PLUGGY_CLIENT_SECRET: env.PLUGGY_CLIENT_SECRET,
    ENABLE_DEMO_PROVIDER: env.ENABLE_DEMO_PROVIDER,
    CACHE: cache,
  },
  { now: () => new Date() },
);

// Só retorna provider registrado (Pluggy exige clientId + clientSecret;
// demo exige ENABLE_DEMO_PROVIDER verdadeiro).
const provider: FinancialProvider = registry.require("pluggy");

// Para /api/providers: lista os conhecidos, inclusive não configurados.
const descriptors = registry.list();
// [{ id, name, configured, capabilities }, ...]
```

### Contrato (`types.ts`)

```ts
interface FinancialProvider {
  readonly id: "demo" | "pluggy";
  readonly capabilities: {
    supportsManualRefresh: boolean;
    supportsWebhooks: boolean;
    supportsCreditCards: boolean;
    supportsInvestments: boolean;
  };

  getConnection(externalId: string): Promise<ProviderConnection>;
  getAccounts(connectionExternalId: string): Promise<ProviderAccount[]>;
  getTransactions(
    accountExternalId: string,
    opts: ProviderTransactionsOptions,
  ): Promise<ProviderTransaction[]>;
  getTransactionsPage?(
    accountExternalId: string,
    opts: ProviderTransactionsOptions,
  ): Promise<ProviderTransactionsPage>;
  getCreditCards(connectionExternalId: string): Promise<ProviderCreditCard[]>;
  getBills(accountExternalId: string): Promise<ProviderBill[]>;
  getBalances(connectionExternalId: string): Promise<ProviderBalance[]>;
  getInvestments(connectionExternalId: string): Promise<ProviderInvestment[]>;
  refreshConnection?(externalId: string): Promise<ProviderRefreshResult>;
}
```

Convenções (as mesmas de `docs/architecture.md`):

- **Dinheiro** em centavos (`number` inteiro), moeda ISO 4217 (`BRL`).
- **Sinal**: `amountCents > 0` = entrada, `< 0` = saída. `type` é
  `income | expense | transfer`; `transfer` é dinheiro saindo de uma conta sua
  para outra (não entra em receita/despesa).
- **Datas** `YYYY-MM-DD`; timestamps ISO-8601 UTC.
- **Cartão**: a conta `credit_card` segue a convenção do Open Finance —
  `balanceCents` é o valor **devido** (positivo = dívida), não saldo em conta.
  `availableCents`/`availableLimitCents` é o limite disponível.
- **Faturas**: o fornecedor não manda `status`; use `deriveBillStatus` (o
  provider já devolve derivado).
- **Categorias**: `categoryHint` é uma sugestão de slug de sistema, nunca
  `category_id` do usuário. Lista em `PROVIDER_CATEGORY_HINTS`; metadados
  (`label`, `kind`) em `PROVIDER_CATEGORY_HINT_INFO`.
- **Dados demo** precisam ser exibidos na UI com o selo "Demonstração".

## DemoProvider

Determinístico (seed fixa) e sem rede. O `now` é injetável para testes:

```ts
import { DemoProvider, DEMO_CONNECTION_EXTERNAL_IDS } from "@fd/financial-providers";

const demo = new DemoProvider({ now: new Date("2026-11-10T15:00:00.000Z") });
const connection = await demo.getConnection(DEMO_CONNECTION_EXTERNAL_IDS.aurora);
const accounts = await demo.getAccounts(DEMO_CONNECTION_EXTERNAL_IDS.aurora);
```

Dados:

- 3 instituições fictícias: **Banco Aurora**, **Nuvem Bank**,
  **Cooperativa Horizonte** (cores próprias, sem nomes de bancos reais).
- 3 contas correntes + 2 poupanças; 2 cartões (Visa/Mastercard) com limite,
  fechamento, vencimento e 7 faturas por cartão (**6 fechadas + a aberta**).
- 3 investimentos: CDB, Tesouro Selic e fundo multimercado.
- ~12 meses de transações em BRL: salário mensal, freelas esporádicos,
  aluguel/condomínio, luz/água/internet, mercado semanal, restaurantes/delivery,
  transporte por app, combustível, assinaturas, farmácia, compras parceladas
  (`Parcela 3/10`), Pix enviados/recebidos e rendimentos.
- Saldos coerentes: saldo atual = abertura + Σ transações `posted`
  (`DEMO_OPENING_BALANCES_CENTS` expõe as aberturas para auditoria/testes).
- `DEMO_CONNECTION_EXTERNAL_IDS` contém os IDs estáveis de conexão.

`getTransactionsPage` no demo devolve tudo (`partial: false`, `requestCount: 0`).
Transações vêm ordenadas por data decrescente, como extrato.

## PluggyProvider / PluggyClient

```ts
import { PluggyProvider } from "@fd/financial-providers";

const pluggy = new PluggyProvider({
  clientId: env.PLUGGY_CLIENT_ID,
  clientSecret: env.PLUGGY_CLIENT_SECRET,
  // baseUrl?: "https://api.pluggy.ai"
  // cache?: KeyValueCache
  // fetch?: typeof fetch (testes)
  // defaultMaxPages?: 10
  // defaultRequestBudget?: 45
});
```

Responsabilidades do cliente:

- `POST /auth` → apiKey com **TTL de 2h**; cache em memória do isolate e cache
  opcional em KV (com margem de 5 min). Um 401 descarta a chave e reautentica
  **uma vez**.
- `X-API-KEY` em todas as chamadas autenticadas.
- Retry com backoff exponencial + equal jitter **apenas** para 429/5xx/rede;
  respeita `Retry-After` e `RateLimit-Reset`. Nunca repete 400/401/403/404/409.
- Timeout por tentativa via `AbortSignal` (`timeoutMs`, default 15s); aborto do
  chamador não é retryable.
- Erros HTTP → `ProviderError` (`auth_failed`, `not_found`, `rate_limited`,
  `unavailable`, `invalid_response`), com mensagem sanitizada (sem body/token).

### Sinal no cartão (a parte que mais dá bug)

A Pluggy já normaliza `type`; **nunca** derive o sinal de `Math.sign(amount)`:

| Conta         | `amount` | `type`   | `amountCents` no app             |
| ------------- | -------- | -------- | -------------------------------- |
| BANK          | negativo | `DEBIT`  | negativo (despesa)               |
| BANK          | positivo | `CREDIT` | positivo (receita)               |
| CREDIT/CARTÃO | positivo | `DEBIT`  | **negativo** (compra)            |
| CREDIT/CARTÃO | negativo | `CREDIT` | **positivo** (pagamento/estorno) |

Se `type` faltar (schema tolera), o mapper aceita `accountType: "credit_card"`
para tratar amount positivo como compra. Datas de transação são convertidas de
UTC para `America/Sao_Paulo` (UTC−3) antes de truncar o dia.

### Paginação e limite de 50 subrequests (Workers Free)

Para transações, use `getTransactionsPage` e persista `nextCursor`/`partial`
entre execuções:

```ts
let cursor: string | null = null;
let partial = true;

while (partial) {
  const page = await provider.getTransactionsPage(account.id, {
    from: windowFrom,
    to: windowTo,
    cursor,
    maxPages: 4,
    requestBudget: 12, // inclui somente as chamadas de /v2/transactions
  });

  await saveTransactions(page.transactions);
  cursor = page.nextCursor;
  partial = page.partial;
}
```

- `requestBudget`/`maxPages` são por chamada; default do provider: 45 e 10.
- `partial: true` + `nextCursor` significa "há mais páginas; continue no
  próximo ciclo/cron".
- `getTransactions` é o atalho que segue páginas até o fim (respeitando o
  orçamento default) — bom para o demo/consultas pequenas, mas para sync
  incremental prefira a versão paginada.
- O cursor exposto é somente o valor de `after`, nunca a string `next` inteira
  (passar a string inteira gera `INVALID_CURSOR` no Pluggy).

### Outros endpoints

- `getItem` / `updateItem` (`PATCH /items/:id`).
- `getBills` → status derivado por data/pagamentos.
- `getInvestments` (por `itemId`).
- `createConnectToken` (widget): campos sempre dentro de `options`
  (`itemId` é o único no root).
- `getConnectors({ sandbox: true })`: resolve o conector sandbox; **nunca**
  fixe o ID no código.

### MeuPluggy

Itens do conector **MeuPluggy (200)** são proxy somente leitura: o
`refreshConnection` detecta o conector e devolve
`{ refreshed: false, detail: "meu_pluggy_reads_only" }` sem chamar
`PATCH /items`. A sincronização normal (leitura) funciona; o item é atualizado
do lado do Meu Pluggy a cada 24h.

## Como adicionar um novo provider

1. Crie `src/<nome>/` com um `provider.ts` que implemente `FinancialProvider`.
2. Implemente primeiro os **mappers puros** (raw do fornecedor → `Provider*`):
   sinal, centavos, datas, categoria e status de fatura. Coloque fixtures
   realistas em `test/fixtures/<nome>/` e teste os mappers isoladamente.
3. Use `ProviderError` com `code`/`retryable`/`status`; nunca inclua body,
   token ou dado pessoal em mensagens.
4. Se houver paginação, exponha `getTransactionsPage` com `maxPages`,
   `requestBudget`, `nextCursor` e `partial` (respeite os 50 subrequests/request
   do Workers Free).
5. Adicione o novo `ProviderId` em `src/types.ts` e o nome/capabilities
   estáticas em `src/registry.ts` (`PROVIDER_NAMES`/`STATIC_CAPABILITIES`).
6. Registre no `createProviderRegistry` somente se as credenciais necessárias
   existirem; providers não configurados devem aparecer em `list()` com
   `configured: false`.
7. Adicione testes de: determinismo (se aplicável), mappers, erros, retry,
   paginação e registry — tudo com `fetch` mockado, **sem rede**.
8. Atualize este README e, se o modelo de domínio mudar, `docs/architecture.md`.

## Testes

```bash
pnpm --filter @fd/financial-providers test
pnpm --filter @fd/financial-providers typecheck
pnpm --filter @fd/financial-providers lint
```

Os testes não fazem chamadas de rede: o `fetch` é injetado/mockado e as
fixtures ficam em `test/fixtures/pluggy/`.
