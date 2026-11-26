# Pluggy API — referência de implementação (cliente `fetch` em TypeScript)

Extraído do [OpenAPI oficial](https://docs.pluggy.ai/openapi/pluggy-api.json) e das páginas de produto,
em **2026-11-10**. Campos marcados **não confirmado** não apareceram em fonte oficial ou aparecem em
exemplo sem estar no schema.

Escopo: o suficiente para implementar `PluggyProvider` + `SyncService` em Cloudflare Workers com
`fetch` puro (sem SDK).

---

## 1. Base e transporte

```
https://api.pluggy.ai
```

- Somente HTTPS/TLS ≥ 1.2; `Content-Type: application/json`.
- A API **adiciona campos novos sem versionar**: o parser precisa ignorar chaves desconhecidas (não usar
  validação estrita que rejeite extras; no Zod, `passthrough` ou só os campos que importam).
- Toda resposta traz `x-request-id` (UUID) — logar em qualquer erro.
- Erros:

```jsonc
// erro "global"
{ "code": 400, "message": "Bad Request", "codeDescription": "ITEM_PARAMETER_INVALID", "data": {} }

// erro de criação de item (400)
{
  "code": 400,
  "codeDescription": "ITEM_USER_ALREADY_EXISTS",
  "message": "There are other items with the same credentials, you can't create a new one",
  "errors": [],           // legado
  "details": [],          // campo realmente populado em 400
  "errorId": "..."        // = x-request-id
}
```

`code` é **número** (não string). Status possíveis: 400, 401, 403, 404, 405, 406, 409, 429, 500, 503.

---

## 2. Autenticação

### 2.1 API Key

```http
POST /auth
Content-Type: application/json

{ "clientId": "<uuid>", "clientSecret": "<secret>" }
```

```json
{ "apiKey": "eyJhbGciOi..." }
```

- TTL **2 horas**.
- Guardar em memória do isolate (`let cached: { apiKey, expiresAt }`) e renovar com margem.
- Não há endpoint de refresh nem de introspecção; se vier `401`, descartar o cache e reautenticar **uma**
  vez.
- Rate limit de `/auth`: 360/min por IP — o cache resolve.

### 2.2 Connect Token (só para o widget)

```http
POST /connect_token
X-API-KEY: <apiKey>

{
  "itemId": "<uuid>",                       // opcional: atualizar item existente
  "options": {
    "clientUserId": "cainan",
    "webhookUrl": "https://app.exemplo.com/api/webhooks/pluggy",
    "oauthRedirectUri": "https://app.exemplo.com/connections",
    "avoidDuplicates": true,
    "products": ["ACCOUNTS", "CREDIT_CARDS", "TRANSACTIONS", "INVESTMENTS"]
  }
}
```

```json
{ "accessToken": "eyJhbGciOi..." }
```

- TTL **30 min**; um por conexão.
- Escopo: `GET /items/{id}` do item criado **com esse token** e `GET /accounts?itemId=` (reduzido).
  Qualquer outro produto com connect token → **403**.
- ⚠️ Campos no **root** do body são **ignorados silenciosamente** (200 OK). Sempre em `options`.

### 2.3 Headers

| Header | Uso |
|---|---|
| `X-API-KEY: <apiKey>` | todas as chamadas de servidor |
| `X-API-KEY: <accessToken>` | widget / chamadas de escopo reduzido |
| `Content-Type: application/json` | POST/PATCH |

---

## 3. Paginação

### 3.1 Page-based (accounts, bills, investments, webhooks)

```json
{ "total": 200, "totalPages": 15, "page": 1, "results": [] }
```

`page` (default 1), `pageSize` (default 500, **máx. 500**; acima disso → 400, não trunca).
Iterar `page` de 1 até `totalPages`. `results` é sempre array (nunca `null`).

### 3.2 Cursor (transactions v2, items v2)

```json
{ "results": [], "next": "?after=MjAyMC0xMC0xNVQwMDowMDowMC4wMDBafGE4NTM0Yzg1..." }
```

`next` é uma **query string pronta** (começa com `?`); concatenar ao path e parar quando `null`.
Se montar manualmente, `after` recebe apenas o valor decodificado — nunca a string `next` inteira
(erro `INVALID_CURSOR`).

---

## 4. Item

```http
GET /items/{id}
```

```jsonc
{
  "id": "e062ab2b-...",
  "connector": {
    "id": 200,
    "name": "MeuPluggy",
    "primaryColor": "ef294b",
    "institutionUrl": "https://meu.pluggy.ai/",
    "imageUrl": "https://cdn.pluggy.ai/...",
    "type": "PERSONAL_BANK",
    "country": "BR",
    "hasMFA": false,
    "oauth": true,
    "isSandbox": false,
    "isOpenFinance": false,
    "products": ["ACCOUNTS", "CREDIT_CARDS", "TRANSACTIONS", "INVESTMENTS"],
    "health": { "status": "ONLINE", "stage": null }
  },
  "status": "UPDATED",
  "executionStatus": "SUCCESS",
  "error": { "code": "USER_INPUT_TIMEOUT", "message": "...", "providerMessage": "...", "attributes": {} },
  "parameter": null,
  "userAction": null,
  "webhookUrl": null,
  "createdAt": "2026-11-10T12:00:00.000Z",
  "updatedAt": "2026-11-10T12:00:05.000Z",
  "lastUpdatedAt": "2026-11-10T12:00:05.000Z",
  "statusDetail": null,
  "nextAutoSyncAt": null,
  "consecutiveFailedLoginAttempts": 0,
  "consentExpiresAt": null,
  "resourcesCollectedAt": null,
  "hasResourcesPendingAuthorization": null,
  "products": ["ACCOUNTS", "CREDIT_CARDS", "TRANSACTIONS"],
  "clientUserId": "cainan",       // presente nos exemplos; NÃO declarado em properties (não confirmado no schema)
  "oauthRedirectUri": null
}
```

- Obrigatórios no schema: `id`, `status`, `executionStatus`. **Todo o resto pode faltar.**
- `error` é `null` quando não há erro; `{ code, message }` obrigatórios, `providerMessage` e
  `attributes` opcionais.
- `statusDetail` (quando `PARTIAL_SUCCESS`) tem `{ isUpdated, products: [{ product, isUpdated, warnings[] }] }`
  — **não confirmado** em detalhe; use só para diagnóstico.

### 4.1 Enum `status`

`UPDATING` · `LOGIN_ERROR` · `OUTDATED` · `WAITING_USER_INPUT` · `UPDATED`

### 4.2 Enum `executionStatus`

Transitórios: `CREATED`, `LOGIN_IN_PROGRESS`, `LOGIN_MFA_IN_PROGRESS`, `ACCOUNTS_IN_PROGRESS`,
`CREDITCARDS_IN_PROGRESS`, `TRANSACTIONS_IN_PROGRESS`, `INVESTMENT_TRANSACTIONS_IN_PROGRESS`,
`PAYMENT_DATA_IN_PROGRESS`, `IDENTITY_IN_PROGRESS`, `MERGING`.

Sucesso: `SUCCESS`, `PARTIAL_SUCCESS`.

Erro: `ERROR`, `MERGE_ERROR`, `INVALID_CREDENTIALS`, `ALREADY_LOGGED_IN`, `SITE_NOT_AVAILABLE`,
`INVALID_CREDENTIALS_MFA`, `USER_INPUT_TIMEOUT`, `ACCOUNT_LOCKED`, `ACCOUNT_NEEDS_ACTION`,
`USER_NOT_SUPPORTED`, `ACCOUNT_CREDENTIALS_RESET`, `CONNECTION_ERROR`, `USER_AUTHORIZATION_NOT_GRANTED`,
`USER_AUTHORIZATION_REVOKED`.

Intermediários: `WAITING_USER_INPUT`, `USER_AUTHORIZATION_PENDING`.

### 4.3 Mapa para `connections.status` (modelo do app)

| Pluggy | `connections.status` |
|---|---|
| `UPDATING` (ou `executionStatus` transitório) | `syncing` |
| `UPDATED` + `SUCCESS` | `active` |
| `UPDATED` + `PARTIAL_SUCCESS` | `active` (+ `status_detail`) |
| `WAITING_USER_INPUT`, `USER_AUTHORIZATION_PENDING` | `login_required` |
| `LOGIN_ERROR`, `INVALID_CREDENTIALS`, `USER_AUTHORIZATION_EXPIRED` | `login_required` |
| `OUTDATED`, `ERROR`, `MERGE_ERROR`, `SITE_NOT_AVAILABLE`, `CONNECTION_ERROR` | `error` |
| `item/deleted` (webhook) | `disconnected` |

---

## 5. Account

```http
GET /accounts?itemId=<uuid>&type=BANK|CREDIT
GET /accounts/{id}
```

```jsonc
{
  "id": "a658c848-...",
  "type": "BANK",                       // BANK | CREDIT
  "subtype": "CHECKING_ACCOUNT",        // CHECKING_ACCOUNT | SAVINGS_ACCOUNT | CREDIT_CARD
  "number": "0001/12345-0",             // cartão: só os 4 últimos dígitos ("1234")
  "name": "Conta Corrente",
  "marketingName": "GOLD Conta Corrente",
  "balance": 21544.6,
  "itemId": "a0922d6f-...",
  "taxNumber": "333.333.333-33",
  "owner": "John Doe",
  "currencyCode": "BRL",
  "bankData": { ... } | null,
  "creditData": { ... } | null,
  "createdAt": "2026-01-15T13:21:08.456Z",
  "updatedAt": "2026-07-22T18:05:11.328Z"
}
```

Obrigatórios: `id`, `type`, `subtype`, `number`, `name`, `balance`, `itemId`, `currencyCode`,
`createdAt`, `updatedAt`. `bankData`/`creditData` são **mutuamente exclusivos** conforme `type`.

### 5.1 `bankData`

```jsonc
{
  "transferNumber": "123/0001/12345-0",
  "closingBalance": 21544.6,
  "automaticallyInvestedBalance": 2154.46,
  "overdraftContractedLimit": 0,
  "overdraftUsedLimit": 0,
  "unarrangedOverdraftAmount": 0,
  "hasReservedBalance": true,           // "caixinhas" / saldo reservado
  "reservedBalances": [ { "name": "Caixinha Para Férias", "availableAmounts": [ ... ] } ]
}
```

Todos os campos numéricos são `number | null`.

### 5.2 `creditData`

```jsonc
{
  "level": "BLACK",                     // string | null
  "brand": "MASTERCARD",                // string | null
  "brandAdditionalInfo": null,
  "balanceCloseDate": "2026-07-23",     // date-time | null (data de fechamento)
  "balanceDueDate": "2026-07-28",       // date-time | null (vencimento)
  "availableCreditLimit": 300000,       // number | null
  "creditLimit": 300000,                // number | null
  "balanceForeignCurrency": 0,
  "minimumPayment": 100.62,             // number | null
  "isLimitFlexible": false,             // boolean | null
  "status": "ACTIVE",                   // ACTIVE | BLOCKED | CANCELLED | null
  "holderType": "MAIN",                 // MAIN | ADDITIONAL | null
  "disaggregatedCreditLimits": [ ... ] | null,
  "additionalCards": [ ... ] | null
}
```

### 5.3 Semântica de `balance`

- `BANK`: saldo **disponível** para gastar. Pode ser negativo (= dívida, ex. cheque especial).
- `CREDIT`: valor da fatura aberta (o que se deve). Em Open Finance é o **limite usado**.
  Pode ser negativo se a fatura anterior foi paga a mais.
- Identidade útil: `creditLimit = availableCreditLimit + balance + dívida anterior`.
- Em Open Finance, `balance` é o disponível; `bankData.closingBalance` = `balance` + bloqueado
  (`null` se a instituição não reporta bloqueio). Em Itaú/BB PF, quando há investimento automático > 0,
  ele **é** o `balance` — não somar de novo.

### 5.4 Saldo em tempo real (sem sync)

```http
GET /accounts/{id}/balance     // somente API key; connect token → 403
```

```json
{ "balance": 1500.5, "blockedBalance": 0, "automaticallyInvestedBalance": 0,
  "closingBalance": 1500.5, "currencyCode": "BRL", "updateDateTime": "2026-11-10T12:00:00.000Z" }
```

Obrigatórios: `balance`, `currencyCode`, `updateDateTime`. Ótimo para `balance_snapshots` diários sem
disparar `PATCH /items`.

---

## 6. Transaction

```http
GET /v2/transactions?accountId=<uuid>&dateFrom=2026-01-01&dateTo=2026-11-10&after=...
GET /transactions?accountId=<uuid>&from=2026-01-01&to=2026-11-10&page=1&pageSize=500   // DEPRECATED
```

| Parâmetro | Onde | Observação |
|---|---|---|
| `accountId` | ambos | **obrigatório** |
| `dateFrom` / `dateTo` | v2 | `yyyy-mm-dd`, inclusivos |
| `from` / `to` | v1 | `yyyy-mm-dd` |
| `ids` | ambos | máx. **500** por request |
| `createdAtFrom` | ambos | `yyyy-mm-ddThh:mm:ss.000Z`; não pode junto com `dateFrom` |
| `after` | v2 | cursor |
| `page`, `pageSize` | v1 | `pageSize` ≤ 500 |
| `billId` | v1 | filtra transações de uma fatura |

```jsonc
{
  "id": "6ec156fe-e8ac-4d9a-a4b3-7770529ab01c",
  "description": "NETFLIX.COM",
  "descriptionRaw": null,
  "currencyCode": "BRL",
  "amount": -55.9,
  "amountInAccountCurrency": null,
  "date": "2026-07-10T00:00:00.000Z",
  "balance": 3500,
  "type": "DEBIT",                      // DEBIT | CREDIT
  "status": "POSTED",                   // POSTED | PENDING
  "category": "Assinaturas",            // string | null (exige plano Pro)
  "categoryId": "05000000",
  "accountId": "03cc0eff-...",
  "providerCode": "123456",
  "providerId": null,                   // só Open Finance
  "operationType": "PIX",               // só Open Finance
  "operationTypeAdditionalInfo": null,
  "paymentData": null,
  "creditCardMetadata": {
    "installmentNumber": 2,
    "totalInstallments": 6,
    "totalAmount": -335.4,              // só conectores diretos
    "payeeMCC": 5812,
    "cardNumber": "1234",
    "billId": "3b3341e4-...",           // só Open Finance
    "purchaseDate": "2026-06-10T00:00:00.000Z",
    "billForecastDate": "2026-07"
  },
  "merchant": {
    "name": "Netflix",
    "businessName": "NETFLIX ENTRETENIMENTO BRASIL LTDA.",
    "cnpj": "00.000.000/0000-00",
    "cnae": "5911100",
    "category": "Video Streaming"
  },
  "order": 3,
  "createdAt": "2026-07-10T03:00:00.000Z",
  "updatedAt": "2026-07-10T03:00:00.000Z"
}
```

Obrigatórios: `id`, `description`, `currencyCode`, `amount`, `date`, `accountId`, `createdAt`,
`updatedAt`. **`type` e `status` são obrigatórios na doc de produto, mas não no schema OpenAPI** —
tratar como opcionais defensivamente.

### 6.1 Convenção de sinal — a parte que mais dá bug

| Conta | Regra |
|---|---|
| **BANK** | `amount > 0` = entrada (`type: CREDIT`); `amount < 0` = saída (`type: DEBIT`) |
| **CREDIT** | `amount > 0` = **compra/despesa** (aumenta a dívida); `amount < 0` = **pagamento/estorno** (reduz) |
| `type` (ambos) | **já normalizado pela Pluggy**: compra no cartão = `DEBIT`, pagamento de fatura = `CREDIT` |

Ou seja: no cartão, `amount` e `type` **discordam** em sinal. Nunca derive o sinal do `amount` bruto.

Normalização para o domínio do app (`amountCents` positivo = receita, negativo = despesa):

```ts
const cents = Math.round(Math.abs(tx.amount) * 100);
const amountCents = tx.type === "CREDIT" ? cents : -cents;
// equivalente e mais seguro que usar Math.sign(tx.amount)
```

Isso funciona para BANK e CREDIT e resolve o caso do cartão. Para transferência entre contas da mesma
pessoa, `type` continua correto (débito numa, crédito na outra); a marcação `type: "transfer"` do app
tem de ser derivada (ex.: `operationType` PIX/TED + contraparte `owner`), não vem do provider.

> **Atualização após teste real no sandbox (2026-11-10):** o conector Pluggy Bank devolveu as 18
> compras do cartão com `amount` **negativo** e `type: "CREDIT"`, contrariando a regra acima. Na
> conta corrente, sinal e `type` coincidiram nas 31 transações. A implementação atual usa o sinal do
> `amount` para BANK e detecta a convenção do cartão por conta (`purchase_negative` no sandbox,
> `purchase_positive` no formato da documentação), com sinais fortes de pagamento/estorno e sinal
> dominante (amostra ≥ 5), persistindo em `accounts.amount_sign_convention`.

### 6.2 Data

`date` é ISO-8601 em **UTC**. A doc diz explicitamente: "if it is necessary to interpret it as
Brazilian time, you will need to convert it to GMT-3". Consequências:

- `date.slice(0, 10)` **erra o dia** para transações entre 00:00 e 02:59 UTC.
- Converter para `America/Sao_Paulo` (ou `date - 3h`) antes de extrair `yyyy-mm-dd`.
- Guardar no D1 como `yyyy-mm-dd` (coluna `date`) e manter o instante original se precisar de ordenação
  fina (`order`).

### 6.3 Metadados de cartão

`installmentNumber`, `totalInstallments`, `payeeMCC`, `cardNumber`, `billId`, `purchaseDate`,
`totalAmount`, `billForecastDate` (`YYYY-MM`), `paymentType` (`SINGLE|INSTALLMENT`),
`billPostDate`, `transactionDateTime`. Os campos de Open Finance podem vir ausentes em conectores
diretos e vice-versa.

### 6.4 Identidade da transação entre syncs

- O `id` é **estável** na maioria dos casos (inclusive `PENDING → POSTED`).
- Quando `date`, `description` ou `amount` mudam demais, a Pluggy **apaga e recria** com novo `id`
  (sem campo de link). Para reconciliar: `providerId` (só Open Finance) ou `providerCode`; em
  conectores diretos, `date + amount + description`.
- `transactions/deleted` pode ser seguido de reaparecimento → tratar delete como idempotente, não como
  verdade absoluta.
- Reconectar conta cria **novo item** com **novos ids**; não há dedupe automático entre itens.

### 6.5 Saldo fim do dia

O `balance` da transação é o saldo **imediatamente após** ela. O saldo de fechamento do dia é o
`balance` da **primeira** transação daquele dia na ordenação descrita pela API (a mais recente).
Suportado só em conectores diretos (Itaú PJ, Bradesco PJ) — para Open Finance, usar
`GET /accounts/{id}/balance` e gravar snapshot próprio.

---

## 7. Bill (fatura)

```http
GET /bills?accountId=<uuid>&page=1&pageSize=500
GET /bills/{id}
```

```jsonc
{
  "id": "76edd0fa-57b4-4391-be8d-e8b6249d04b1",
  "dueDate": "2026-09-15T00:00:00.000Z",
  "billClosingDate": "2026-09-07T00:00:00.000Z",   // number|string|null — data de fechamento
  "totalAmount": 10000.76,
  "totalAmountCurrencyCode": "BRL",
  "minimumPaymentAmount": 3000,
  "allowsInstallments": true,
  "financeCharges": [
    { "id": "...", "type": "IOF", "amount": 7.01, "currencyCode": "BRL", "additionalInfo": "NA" }
  ],
  "payments": [
    { "id": "...", "valueType": "FULL_PAYMENT", "paymentDate": "2026-09-15T00:00:00.000Z",
      "paymentMode": "PIX", "amount": 10000.76, "currencyCode": "BRL" }
  ]
}
```

Obrigatórios: `id`, `dueDate`, `totalAmount`, `totalAmountCurrencyCode`, `financeCharges`, `payments`.
`minimumPaymentAmount`, `allowsInstallments` e `billClosingDate` são opcionais.

`financeCharges[].type`: `LATE_PAYMENT_REMUNERATIVE_INTEREST` | `LATE_PAYMENT_FEE` |
`LATE_PAYMENT_INTEREST` | `IOF` | `OTHER`.
`payments[].valueType`: `FULL_PAYMENT` | `MINIMUM_PAYMENT` | `OTHER`.
`payments[].paymentMode`: `PIX` | `DEBIT_ACCOUNT` | boleto etc. (string livre).

**Não existe campo `status` na Bill.** O modelo do app (`open|closed|paid|overdue`) precisa ser
derivado:

```
pago      → sum(payments) >= totalAmount            (ou regra oficial abaixo)
atrasada  → dueDate < hoje && !pago
fechada   → billClosingDate <= hoje && !pago
aberta    → billClosingDate > hoje (ou null)
```

Regra oficial de quitação de uma fatura N (a fatura é considerada paga quando os pagamentos do ciclo
seguinte cobrem o total + encargos):

```
totalAmount(Bill N) + sum(financeCharges(Bill N+1)) == sum(payments(Bill N+1))
```

`closing_date` do app ← `billClosingDate`; `due_date` ← `dueDate`; `total_cents` ← `totalAmount`;
`minimum_payment_cents` ← `minimumPaymentAmount ?? null`.

Cobertura: obrigatório em Open Finance regulado; em conectores diretos só Inter PF e Itaú Cartões.

---

## 8. Investment

```http
GET /investments?itemId=<uuid>&type=FIXED_INCOME&page=1&pageSize=500
GET /investments/{id}
GET /investments/{id}/transactions
```

```jsonc
{
  "id": "...",
  "itemId": "...",
  "type": "FIXED_INCOME",          // COE|EQUITY|ETF|FIXED_INCOME|MUTUAL_FUND|SECURITY|OTHER
  "subtype": "CDB",                // TREASURY|CDB|LCI|LCA|LC|LF|CRI|CRA|DEBENTURES|CORPORATE_DEBT|
                                   // STOCK|BDR|REAL_ESTATE_FUND|DERIVATIVES|OPTION|ETF|
                                   // INVESTMENT_FUND|MULTIMARKET_FUND|FIXED_INCOME_FUND|STOCK_FUND|
                                   // ETF_FUND|OFFSHORE_FUND|FIP_FUND|EXCHANGE_FUND|FI_INFRA|FI_AGRO|
                                   // RETIREMENT|STRUCTURED_NOTE|OTHER|null
  "name": "CDR",
  "number": null,
  "balance": 2000,                 // valor líquido atual
  "quantity": 3,
  "value": 500,                    // valor unitário
  "amount": 1500,                  // valor investido (principal)
  "amountOriginal": 1000,
  "amountProfit": 359.39,
  "taxes": 40.61,
  "rate": 150,
  "rateType": "CDI",
  "fixedAnnualRate": 2.5,
  "lastMonthRate": -0.8,
  "lastTwelveMonthsRate": 5.97,
  "annualRate": 7.64,
  "dueDate": "2026-07-23T16:16:27.300Z",
  "issuer": "Banco do Pluggy",
  "issuerCNPJ": "40.430.971/0001-96",
  "code": "ISUS11",
  "isin": "123456789",
  "status": "ACTIVE",              // ACTIVE | TOTAL_WITHDRAWAL (não confirmado como enum fechado)
  "institution": { "name": "BANCO BTG PACTUAL S/A", "number": "30306294000145" }
}
```

- Sempre por `itemId` — **não existe** endpoint por conta.
- Para patrimônio, somar `balance`. Para rentabilidade, `amountProfit` / `lastTwelveMonthsRate`.
- `GET /investments/{id}/transactions` devolve aplicações/resgates (page-based).

---

## 9. Rate limits

| Endpoint | req/min por IP |
|---|---|
| `POST /auth` | 360 |
| `GET /accounts`, `/accounts/{id}` | 360 |
| `GET /transactions`, `/transactions/{id}`, `/v2/transactions` | 360 |
| `GET /investments`, `/investments/{id}`, `/investments/{id}/transactions` | 360 |
| `PATCH /items` | **20** |

429:

```json
{ "message": "Too many requests. Please try again later (see Retry-After header in seconds)", "code": 429 }
```

Headers: `RateLimit-Limit`, `RateLimit-Reset` (segundos), `Retry-After` (sempre 60).

Estratégia no Worker: retry com backoff exponencial + jitter **apenas** para 429/5xx, respeitando
`RateLimit-Reset`; nunca retry em 400/401/403/404/409. Limitar concorrência (o Worker tem no máximo 6
conexões simultâneas de saída).

---

## 10. Webhooks

### 10.1 Criação

```http
POST /webhooks
X-API-KEY: <apiKey>

{ "url": "https://app.exemplo.com/api/webhooks/pluggy", "event": "all",
  "headers": { "X-Webhook-Secret": "<segredo>" } }
```

`event` aceita `all` ou um evento específico (`WebhookEventType` no OpenAPI). `headers` só pode ser
definido via API (não pelo Dashboard). Webhook criado em `/webhooks` assina **todos** os itens da
aplicação; `webhookUrl` em Item/Connect Token assina só aquele item, mas **não envia headers
customizados**.

### 10.2 Eventos

```
item/created, item/updated, item/error, item/deleted,
item/waiting_user_input, item/waiting_user_action, item/login_succeeded,
connector/status_updated,
transactions/created, transactions/updated, transactions/deleted
```

(Existem também `payment_intent/*`, `payment_request/updated`, `scheduled_payment/*`, `boleto/updated`,
`automatic_pix_payment/*`, `smart_transfer_*`, `pix_biometric_*` — fora do escopo.)

### 10.3 Payload

Comum: `event`, `eventId`, `clientId`, `triggeredBy` (`USER|CLIENT|SYNC|INTERNAL`), + id da entidade.

| Evento | Campos |
|---|---|
| `item/*` | `itemId`, `clientUserId`; em `item/error`: `error { code, message, parameter? }` |
| `transactions/created` | `itemId`, `accountId`, `transactionsCount`, `transactionsMinDate`, `transactionsCreatedAtFrom`, `createdTransactionsLink` |
| `transactions/updated` / `deleted` | `itemId`, `accountId`, `transactionIds[]` |
| `connector/status_updated` | `connectorId`, `data.status` (`ONLINE`/`UNSTABLE`/`OFFLINE`) |

`id` aparece em `transactions/created` com o mesmo valor de `itemId` (legado).

### 10.4 Verificação

**Não há assinatura HMAC no Pluggy.** Passos corretos:

1. Se o webhook foi criado em `POST /webhooks` com `headers`, exigir o header secreto; responder `401`
   se ausente/errado (e lembrar: `401` **não** é re-tentado).
2. Comparar `clientId` com o da aplicação.
3. Responder `2XX` imediatamente (< 10 s), processar depois (`ctx.waitUntil` / Queue).
4. Re-buscar o recurso com API key: `GET /items/{id}` para `item/*`; `GET /v2/transactions` (por
   `ids`/`createdAtFrom`) para `transactions/*`.
5. Opcional: whitelist de IP `52.67.145.81`.

Retries: 3 tentativas (imediata, ~15 min, ~2 h). Sem retry em `400/401/403/404/405`; `3XX` conta como
falha. `item/waiting_user_input` e `item/login_succeeded`: 3 tentativas ~6 min.

---

## 11. Mapa de normalização para o domínio do app

| Destino (D1) | Origem Pluggy | Regra |
|---|---|---|
| `accounts.external_id` | `Account.id` | direto |
| `accounts.type` | `Account.type` + `subtype` | `BANK` + `CHECKING_ACCOUNT` → `checking`; `BANK` + `SAVINGS_ACCOUNT` → `savings`; `CREDIT` + `CREDIT_CARD` → `credit_card` |
| `accounts.balance_cents` | `Account.balance` | `Math.round(balance * 100)` (BANK e CREDIT) |
| `accounts.available_cents` | `creditData.availableCreditLimit` | cartão; senão `null` |
| `accounts.number_masked` | `Account.number` | cartão já vem só com 4 dígitos |
| `credit_cards.brand` | `creditData.brand` | `MASTERCARD`/`VISA`/`ELO`/... |
| `credit_cards.level` | `creditData.level` | `BLACK`/`PLATINUM`/... |
| `credit_cards.limit_cents` | `creditData.creditLimit` | centavos |
| `credit_cards.available_limit_cents` | `creditData.availableCreditLimit` | centavos |
| `credit_cards.closing_day` | `creditData.balanceCloseDate` | **dia do mês** (derivar de `balanceCloseDate`) |
| `credit_cards.due_day` | `creditData.balanceDueDate` | **dia do mês** |
| `bills.closing_date` | `Bill.billClosingDate` | opcional |
| `bills.status` | — | derivado (seção 7) |
| `transactions.amount_cents` | `Transaction.amount` + `type` | seção 6.1 |
| `transactions.date` | `Transaction.date` | converter para GMT-3 antes de truncar |
| `transactions.status` | `Transaction.status` | `POSTED` → `posted`, `PENDING` → `pending` |
| `transactions.merchant` | `Transaction.merchant.name` | `merchant` pode ser `null` |
| `transactions.bill_id` | `creditCardMetadata.billId` | só Open Finance |
| `balance_snapshots.balance_cents` | `Account.balance` ou `/balance` | snapshot diário |

---

## 12. Pontos "não confirmados" / lacunas do schema

Marcar no código como tolerantes a ausência:

1. **`Item.clientUserId`** aparece nos exemplos e é citado na doc, mas **não está em `properties`** do
   schema `Item`. Tratar como opcional.
2. **`Item.statusDetail`** é só `$ref` opaco; a estrutura interna (`products`, `isUpdated`, `warnings`)
   vem da prosa da doc, não do schema.
3. **`Investment.status`** (`ACTIVE`/`TOTAL_WITHDRAWAL`) aparece em exemplos, sem enum no schema.
4. **`Account.type`**: o schema lista só `BANK`/`CREDIT`, mas a prosa menciona `PAYMENT_ACCOUNT` em
   fluxos de pagamento. Não usar enum fechado no parser.
5. **`Transaction.type`/`status`** não estão em `required` do OpenAPI (embora sejam obrigatórios na doc
   de produto).
6. **`Transaction.category`/`merchant`** exigem plano **Pro** (enriquecimento) — em conta gratuita voltam
   `null`. O app não deve depender deles para categorizar.
7. **ID do conector de sandbox** não é publicado; obter em `GET /connectors?sandbox=true`.
8. **`GET /v2/items`** é opt-in por contrato, indisponível no Free e em contas MeuPluggy (403).
9. **`GET /transactions` (page-based)** está **deprecated**; `/v2/transactions` é o caminho.
10. **`GET /bills`** não tem filtro por data nem `billId`; sempre por `accountId` + paginação.
