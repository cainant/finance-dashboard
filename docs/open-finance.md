# Open Finance no Lumen Finance

Como o app lê dados financeiros, quais modos existem e o que cada um garante.

A fonte da verdade é [architecture.md](architecture.md). A pesquisa que embasa as decisões está em
[research/open-finance-providers.md](research/open-finance-providers.md) e
[research/pluggy-api-reference.md](research/pluggy-api-reference.md).

## 1. Os modos

| Modo | `provider` da conexão | Origem do dado | Onde pode rodar | Determinístico | Uso |
|---|---|---|---|---|---|
| Demonstração | `"demo"` | `DemoProvider`, 100% offline | **Somente dev/teste** (`ENABLE_DEMO_PROVIDER=true`) | Sim (seed fixa) | Desenvolvimento, testes, e2e |
| Sandbox Pluggy | `"pluggy"` | Conector **Pluggy Bank**, dados sintéticos | Dev/teste | Não | Testar o fluxo do provider sem custo |
| MeuPluggy | `"pluggy"` | Conector **MeuPluggy (200)**, proxy das conexões autorizadas em `meu.pluggy.ai` | **Produção** | Não se aplica (dado real) | Dados reais do próprio titular |

**Produção usa somente MeuPluggy.** O ambiente `production` de `apps/api/wrangler.jsonc` tem
`ENABLE_DEMO_PROVIDER=false`: `POST /api/connections { provider: "demo" }` responde `400`,
`GET /api/providers` não lista demo e a UI não exibe nenhum CTA, painel ou selo de demonstração.
O demo continua disponível em desenvolvimento/testes (o e2e depende dele) e uma migration remove
conexões demo antigas (`0003_remove_demo_connections.sql`).

Sandbox e MeuPluggy compartilham o mesmo `provider` (`"pluggy"`); o que distingue os dois é o
conector do item. O botão do app é restrito ao conector MeuPluggy; o sandbox permanece para testes
do provider e para ambientes de desenvolvimento que ajustem o filtro de conectores.

## 2. Demonstração (dev/teste)

Fluxo:

1. `POST /api/connections` com `{ "provider": "demo" }` cria três conexões fictícias
   (Banco Aurora, Nuvem Bank, Cooperativa Horizonte).
2. `POST /api/connections/:id/sync` importa contas, cartões, faturas, investimentos e ~12 meses de
   transações em fatias, com retomada por cursor.
3. A UI repete o sync enquanto `statusDetail = "PARTIAL_SYNC"` e invalida os dados no fim.

O `DemoProvider` (`packages/financial-providers/src/demo/`) tem seed fixa e não faz chamada de
rede. Ele só é registrado quando `ENABLE_DEMO_PROVIDER=true` (var de topo do `wrangler.jsonc`,
sobrescrevível no `.dev.vars`). Dados demo são **sempre** rotulados como **Demonstração**.

## 3. Sandbox Pluggy (dev/teste)

### Requisitos

No `.dev.vars` local (copie de `apps/api/.dev.vars.example`; o arquivo real é gitignored):

```dotenv
PLUGGY_CLIENT_ID=
PLUGGY_CLIENT_SECRET=
PLUGGY_WEBHOOK_SECRET=
```

O provider Pluggy só é registrado quando `PLUGGY_CLIENT_ID` **e** `PLUGGY_CLIENT_SECRET` existem.
`GET /api/providers` marca `configured: false` quando faltam credenciais.

### Credenciais de teste

| Campo | Valor |
|---|---|
| Usuário | `user-ok` |
| Senha | `password-ok` |
| Token MFA (quando pedido) | `123456` |

Qualquer outro usuário resulta em `INVALID_CREDENTIALS`, exceto os usuários de cenário
(`user-logged`, `user-locked`, `user-error`, `user-unavailable`, `user-ok-account-error`,
`user-ok-auth-pending`, ...). A lista completa está em
[research/open-finance-providers.md](research/open-finance-providers.md#12-sandbox-conector-pluggy-bank).

### O id do conector não é fixo

Nunca hardcode o id do conector de sandbox. Resolva em runtime com
`GET /connectors?sandbox=true` (com `X-API-KEY`) e filtre por `isSandbox === true`. O id do
MeuPluggy (200) é outro conector e não serve para sandbox.

### Sandbox não é determinístico

- As transações do sandbox são renovadas semanalmente e podem mudar diariamente.
- Itens de sandbox sem atualização por **30 dias** são apagados.
- Use o `DemoProvider` ou uma **fixture gravada e sanitizada** para asserções; nunca consulte o sandbox ao vivo dentro do teste.

## 4. MeuPluggy: dados reais pessoais (produção)

O MeuPluggy é o caminho gratuito e suportado para uma pessoa ler os próprios dados. O conector 200
é um **proxy** das conexões que o titular autorizou em `meu.pluggy.ai`.

### Passo a passo

1. Crie a conta em <https://meu.pluggy.ai>.
2. Conecte cada banco no Meu Pluggy. Cada banco é autorizado separadamente (CPF, app do banco,
   aprovação) e vira um **item** na aplicação Pluggy.
3. No [Dashboard da Pluggy](https://dashboard.pluggy.ai), entre com a **mesma conta** do Meu Pluggy.
   Em **Customization → Connectors**, confirme que o conector **MeuPluggy** está habilitado
   (aba **Direct Connectors** do grupo *Personal*).
4. No Lumen, abra **Conexões → Conectar MeuPluggy** e entre com a conta do Meu Pluggy. O widget é
   restrito ao conector MeuPluggy; o app recebe os `itemId`s, registra as conexões e sincroniza.
5. Alternativa avançada: em **Conexões**, abra "Opção avançada: já tem um itemId do MeuPluggy?" e
   cole o id copiado do Dashboard. O itemId não é credencial de acesso.

O item pode trazer contas de bancos diferentes. O app deriva a instituição de cada conta do COMPE
em `bankData.transferNumber` (ex.: `341/...` → Itaú) ou do nome do cartão; quando não há dado
suficiente, mostra o nome da conta. O nome oficial da conta continua vindo do Pluggy.

### Consentimento e renovação

- A autorização do MeuPluggy dura **1 ano** por aplicação e vem em `Item.consentExpiresAt`; o app
  persiste e exibe a data na conexão.
- Quando expira, as leituras voltam vazias e o próximo update vira `LOGIN_ERROR` com
  `USER_AUTHORIZATION_EXPIRED` (`item/error`).
- **Reconectar** abre o widget no item existente (`updateItem`); entre de novo no Meu Pluggy para
  renovar. Se o Pluggy criar um item novo, o app registra a nova conexão — o histórico antigo
  permanece na conexão anterior e não há dedupe automático entre itens.
- `login_required`, `error` e `outdated` têm ações de reconexão/atualização na UI.

### Limites e comportamento

| Limite | Efeito no app |
|---|---|
| Até **5 conexões** por titular | Uso pessoal; não é caminho para multiusuário comercial |
| Autorização de **1 ano** por aplicação | `consentExpiresAt` na conexão; alerta de expiração |
| Sync do Meu Pluggy a cada **24h** | O dado pode ter até 24h de atraso; não prometa tempo real |
| Item proxy **não** roda auto-sync | `nextAutoSyncAt` vem `null`; isso não é erro |
| Item proxy **não** aceita `PATCH /items` | "Atualizar" apenas relê os dados; não força o banco |
| `GET /v2/items` → **403** | O itemId tem de ser conhecido de antemão (widget ou cadastro) |

### Remoção

Remover a conexão no Lumen chama `DELETE /items/:id` no Pluggy (revoga o item) e só então apaga o
histórico local em cascade. Se o item já não existir (404), a remoção local continua; erros reais
de rede/autorização abortam para permitir nova tentativa.

## 5. Webhooks

Endpoint público do app: `POST /api/webhooks/pluggy`.

O webhook usado em produção é o **global**, criado por `POST /webhooks` com `event: "all"` e
header secreto. Ele assina todos os itens da aplicação. O `webhookUrl` de Item/Connect Token não
envia headers customizados; por isso o connect token **não** define `webhookUrl` (evita eventos
duplicados e permite validar o segredo).

### Registro idempotente

O script `apps/api/scripts/register-pluggy-webhook.mjs` lê `PLUGGY_CLIENT_ID`,
`PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_SECRET` e a URL (`PLUGGY_WEBHOOK_URL` ou `APP_URL`), lista
os webhooks existentes, procura a mesma URL e faz `PATCH`; se não existir, cria com `POST`. Ele
nunca imprime segredos.

```bash
cd apps/api
node --env-file=.dev.vars scripts/register-pluggy-webhook.mjs
# produção: exporte as variáveis no shell e rode o mesmo script
```

```jsonc
// corpo enviado ao Pluggy
{
  "url": "https://<dominio>/api/webhooks/pluggy",
  "event": "all",
  "headers": { "X-Webhook-Secret": "<PLUGGY_WEBHOOK_SECRET>" }
}
```

### Validação

1. **Header secreto:** comparar `x-webhook-secret` com `PLUGGY_WEBHOOK_SECRET`. Ausente ou diferente
   → `401` (a Pluggy não re-tenta `401`).
2. **`clientId`:** conferir se é o da aplicação.
3. **Nunca confiar no payload:** re-buscar o recurso com a API key — `GET /items/{id}` para
   `item/*`, sincronização incremental para `transactions/*`.
4. **Responder `2XX` rápido** (menos de 10 s) e processar em background com `ctx.waitUntil`.

### Eventos tratados

| Evento | Ação |
|---|---|
| `item/created`, `item/updated`, `item/login_succeeded` | Sincroniza o item (re-lendo o recurso) |
| `item/error`, `item/waiting_user_input`, `item/waiting_user_action` | Sincroniza e mapeia o status (`login_required`/`error`/`outdated`) |
| `item/deleted` | Confirma 404 no provider e marca a conexão como `disconnected` |
| `transactions/created`, `transactions/updated` | Sincroniza o item/conta |
| `transactions/deleted` | Apaga localmente os `transactionIds` da conexão (idempotente; um sync posterior recria se reaparecer) |
| `connector/status_updated` | Ignorado (não altera dados financeiros) |

A Pluggy **não assina webhooks com HMAC**. O segredo em header só existe para webhooks criados via
`POST /webhooks`; a defesa é `clientId` + re-busca obrigatória. Retentativas: até 3 (imediata,
~15 min, ~2 h); `400/401/403/404/405` não são re-tentados.

## 6. Limitações e riscos

| Tema | Limite / risco | O que fazer |
|---|---|---|
| Rate limit | 360 req/min por endpoint; `PATCH /items` só **20/min** | Retry com backoff + jitter apenas em `429`/`5xx`, respeitando `Retry-After`/`RateLimit-Reset`; nunca em `400/401/403/404/409` |
| Sinal da transação | No cartão, a convenção varia por conector: o sandbox devolve compras com `amount` negativo + `type: "CREDIT"`; a documentação/Open Finance usa compras positivas | Conta corrente: usar o sinal do `amount`. Cartão: detectar a convenção por conta (pagamento/estorno por sinais fortes + sinal dominante com ≥ 5 lançamentos), persistir e mapear compra = despesa negativa, pagamento = transferência, estorno = receita |
| Transações | `/transactions` v1 está deprecated; `/v2/transactions` usa cursor `after` | Paginar com `next`; converter `date` para GMT-3 antes de extrair `yyyy-mm-dd` |
| Categoria e merchant | Podem vir `null` no plano gratuito (enriquecimento é Pro) | Não depender deles; usar `categoryHint` e permitir categorização manual |
| Faturas | A Bill não tem `status` | Derivar de `dueDate`, `billClosingDate` e `payments`; vencidas há > 90 dias ficam `closed` (histórico), não `overdue` para sempre |
| Investimentos | São por **item**, não por conta | Persistir na tabela `investments`; não criar "conta investimento" artificial |
| Workers Free | 10 ms de CPU e 50 subrequests por request | Paginação com orçamento (defaults do provider: 10 páginas / 45 subrequests), agregação em SQL, sync incremental |
| Sync | O primeiro sync precisa do histórico completo (365 dias); depois, janela desde `last_synced_at − 7 dias`; pode não caber em uma execução | Conta nova busca o histórico até `history_synced_at`; persistir `nextCursor` e continuar no próximo cron/loop da UI. `last_synced_at` só é gravado quando todas as contas completaram |
| Conexões de saída | No máximo 6 simultâneas no Worker | Limitar concorrência |
| Item com erro | `LOGIN_ERROR` não é re-tentado pelo auto-sync | Mapear para `login_required` e pedir nova autenticação |
| Identidade da transação | A Pluggy pode apagar e recriar com novo `id` quando os dados mudam muito | Reconciliar por `providerCode`/`providerId`; tratar delete como idempotente |
| Snapshots | Pluggy não fornece histórico; o primeiro sync grava o saldo de hoje | A evolução patrimonial começa no primeiro sync, sem fabricar histórico |

Normalização de sinal e de valores:

```text
Conta corrente: amountCents = amount >= 0 ? +cents : -cents
Cartão, convenção purchase_negative (sandbox): compra = -|cents|; pagamento/estorno = +|cents|
Cartão, convenção purchase_positive (docs):     compra = -|cents|; pagamento/estorno = +|cents|
Pagamento de fatura = transfer; estorno = income; compra = expense
```

A convenção é detectada por conta: sinais fortes (`PAGAMENTO`, `PAGTO`, `PAYMENT`,
`ESTORNO`, categoria `Credit card payment`/`Transfer…`) identificam o lado
pagamento/estorno; sem eles, o sinal dominante entre ≥ 5 lançamentos é a compra.
Uma amostra menor (ex.: um único pagamento em sync incremental) nunca inverte a
convenção já persistida em `accounts.amount_sign_convention`.

Faturas, sem `status` no provider:

```text
paga      -> pagamentos cobrem o total (regra oficial considera o ciclo seguinte)
atrasada  -> dueDate < hoje (até 90 dias) e não paga
fechada   -> billClosingDate <= hoje e não paga, ou dueDate < hoje - 90 dias
aberta    -> billClosingDate > hoje (ou ausente)
```

## 7. Como adicionar outro provider

O contrato está em `packages/financial-providers/src/types.ts`.

1. **Implemente `FinancialProvider`**: `getConnection`, `getAccounts`, `getTransactions`,
   `getCreditCards`, `getBills`, `getBalances`, `getInvestments` e declare `capabilities`.
   Implemente `getTransactionsPage` se o fornecedor paginar, `refreshConnection` se houver
   "sincronizar agora" e `deleteConnection` se houver revogação remota.
2. **Respeite os tipos normalizados**: dinheiro em centavos inteiros, moeda ISO 4217, datas
   `YYYY-MM-DD` / ISO-8601 UTC, sinal positivo = entrada e negativo = saída, `status`
   `posted|pending`, status de conexão do domínio (inclui `outdated`).
3. **Erros**: lance `ProviderError` com um dos códigos `unavailable`, `auth_failed`,
   `login_required`, `rate_limited`, `not_found`, `invalid_response` e o `retryable` correto.
4. **`capabilities`**: diga a verdade sobre refresh manual, webhooks, cartões e investimentos.
5. **Paginação**: `getTransactionsPage` devolve `transactions`, `nextCursor` opaco, `partial` e
   `requestCount`; respeite `maxPages` e `requestBudget`.
6. **Registry**: registre em `packages/financial-providers/src/registry.ts`.
7. **Testes**: use fixtures gravadas e sanitizadas; nunca sandbox ao vivo nem dado real.
8. **Documente** os secrets/vars em `apps/api/.dev.vars.example` e registre a decisão em
   `docs/decisions/` (um arquivo por decisão).

## 8. Checklist para não vazar dado real

- [ ] Produção com `ENABLE_DEMO_PROVIDER=false`; nenhum CTA/selo demo.
- [ ] Toda conexão demo (em dev/teste) e seus dados aparecem com o badge **"Demonstração"**.
- [ ] Logs sem valores, descrições de transação, números de conta, CPF, e-mail ou tokens.
- [ ] Secrets só em `.dev.vars`/secrets do Worker. `.dev.vars.example` só tem nomes.
- [ ] Webhook só em HTTPS, com `x-webhook-secret`, checagem de `clientId`, re-busca do recurso e
      resposta `2XX` rápida.
- [ ] Fixtures de teste gravadas e sanitizadas (sem CPF, e-mail, nome ou número de conta); o sandbox ao vivo nunca é alvo de asserção determinística.
- [ ] Consentimento MeuPluggy vencido vira `login_required` com ação de renovação, não estado vazio.
