# Provedores de Open Finance para uso pessoal no Brasil

Pesquisa feita em **2026-11-10** contra documentação oficial (docs.pluggy.ai, developers.belvo.com,
openfinancebrasil.org.br) e arquivos OpenAPI publicados. Onde algo não pôde ser confirmado em fonte
oficial, está marcado como **não confirmado**.

Contexto: dashboard pessoal de finanças (single-user), Cloudflare Workers, BRL, pt-BR. O provider
precisa entregar contas, transações, cartões/faturas, investimentos e saldos, com sandbox utilizável
sem custo durante o desenvolvimento.

---

## 1. Pluggy

### 1.1 Modelo e ambientes

- **Base URL única de produção:** `https://api.pluggy.ai`. Não existe host separado de sandbox: sandbox
  é um conjunto de **conectores** disponíveis no mesmo ambiente
  ([environments](https://docs.pluggy.ai/en/docs/connect-widget/environments)).
- O widget roda em `https://connect.pluggy.ai` (também único, serve Live + Sandbox).
- Entidades: **Item** (conexão com uma instituição) → **Accounts** (BANK/CREDIT) → **Transactions**;
  produtos separados: **Bills** (faturas), **Investments**, **Loans**, **Identity**.

### 1.2 Sandbox: conector "Pluggy Bank"

O conector de sandbox é chamado **Pluggy Bank** e devolve dados sintéticos com a mesma estrutura de
campos da produção ([sandbox](https://docs.pluggy.ai/en/docs/guides/sandbox)).

**Credenciais de teste (documentadas publicamente):**

| Campo | Valor |
|---|---|
| Usuário | `user-ok` |
| Senha | `password-ok` |
| Token MFA (quando pedido) | `123456` |

Qualquer outro usuário resulta em `INVALID_CREDENTIALS`, **exceto** os usuários de cenário, que são
mapeados para `executionStatus` específicos:

| executionStatus | usuário |
|---|---|
| `SUCCESS` | `user-ok` |
| `ALREADY_LOGGED_IN` | `user-logged` |
| `ACCOUNT_LOCKED` | `user-locked` |
| `UNEXPECTED_ERROR` | `user-error` |
| `SITE_NOT_AVAILABLE` | `user-unavailable` |
| `ACCOUNT_NEEDS_ACTION` | `user-account-need-actions` |
| `CONNECTION_ERROR` | `user-connection-error` |
| `INVALID_CREDENTIALS` | qualquer outro |
| `PARTIAL_SUCCESS` | `user-ok-account-error` |
| `SUCCESS` com warnings | `user-ok-account-warning` |
| `ACCOUNT_CREDENTIALS_RESET` | `user-account-credentials-reset` |
| `USER_NOT_SUPPORTED` | `user-not-supported` |
| `SUCCESS` com 2 contas correntes | `user-ok-two-checking-accounts` |
| `USER_AUTHORIZATION_PENDING` → `SUCCESS` | `user-ok-auth-pending` |

Também existem `user-ok-perf` e `user-ok-perf-<N>x` para gerar volume (N até 5000), fluxos de MFA
1-step/2-step (`user-ok-img`, `user-ok-select`, `user-ok-phone`, `user-ok-multi-company`), conta
conjunta Bradesco (MFA mock `000000`), QR login e Open Finance mock com CPFs fixos
(`761.092.776-73` básico; `238.242.640-30` múltipla alçada aprovada; `051.177.670-55` rejeitada;
`002.502.737-99` autenticação lenta; `163.511.711-99` erro forçado).

**Como habilitar o sandbox:**

- No widget: `includeSandbox: true` em `new PluggyConnect(...)` (não é campo de `POST /connect_token`).
- Sem widget: `GET /connectors?sandbox=true` (o parâmetro existe no OpenAPI; `sandbox` é boolean).

**ID numérico do conector de sandbox: não confirmado.** A documentação manda descobrir via
`GET /connectors?sandbox=true` em vez de publicar o ID. Não fixe esse número no código; resolva por
`isSandbox === true` ou pelo nome retornado.

**Formato dos dados de sandbox** (útil para fixtures realistas): sempre retorna ao menos 1 conta
`BANK/CHECKING_ACCOUNT` e 1 `CREDIT/CREDIT_CARD`. O extrato de conta corrente simula boleto, débitos
recorrentes (telecom, energia, condomínio), salário e pagamento de fatura — **não** simula Pix, TED nem
transferências entre contas. No cartão, todas as 9 transações são compras (sem estorno, disputa ou
saque). Investimentos: 8 posições cobrindo `SECURITY/PGBL`, `SECURITY/RETIREMENT`,
`MUTUAL_FUND/INVESTMENT_FUND`, `FIXED_INCOME/CDB`, `ETF/ETF` e `EQUITY/REAL_ESTATE_FUND`. Empréstimos:
apenas consignado.

**Retenção:** itens de sandbox sem atualização por **30 dias são apagados** definitivamente; as
transações do sandbox são renovadas semanalmente e podem mudar diariamente (não use como alvo de teste
determinístico).

### 1.3 MeuPluggy — o caminho gratuito para uso pessoal (decisivo para este projeto)

Existe um conector **MeuPluggy (id 200)** que é um **proxy** das conexões que a própria pessoa já
autorizou no **Meu Pluggy** (meu.pluggy.ai). Para um indivíduo lendo os próprios dados, este é o
caminho suportado e **gratuito** — sem assinatura, sem due diligence e **sem vencimento do trial**
([guia oficial](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use),
[api-guide](https://meu.pluggy.ai/api-guide)).

Regras que impactam a arquitetura:

| Regra | Detalhe |
|---|---|
| Limite | **até 5 conexões** por titular, uso pessoal (sem uso comercial) |
| Autorização | 1 ano, por aplicação; exposta em `Item.consentExpiresAt` |
| Expiração | leituras voltam **vazias**; o próximo update vira `LOGIN_ERROR` com `USER_AUTHORIZATION_EXPIRED` e dispara `item/error` |
| Sync | a conexão **original** no Meu Pluggy atualiza a cada **24h**; o item proxy **não** roda auto-sync e **não pode ser atualizado** via API (`nextAutoSyncAt` vem `null`, o que não é erro) |
| Listagem | `GET /v2/items` responde **403** para contas Meu Pluggy; é preciso guardar o `itemId` |
| Item por banco | cada banco conectado no Meu Pluggy vira um **item separado** no app; um banco novo exige nova autorização |
| Webhooks | funcionam normalmente nos itens proxy |

Isso é o oposto do fluxo "widget cria o item e o app descobre o id pelo `onSuccess`": com MeuPluggy os
itens nascem no Dashboard e o app precisa **conhecer os `itemId`s de antemão** (env/settings). Ver
recomendação na seção 6.

### 1.4 Free tier, trial e preços

| Item | Valor | Fonte |
|---|---|---|
| Trial do Dashboard | **15 dias**, sem cartão, ambiente de produção | [preços](https://pluggy.ai/precos) |
| Plano comercial "Dados" | a partir de **R$ 2.500/mês** (até 500 conexões ativas) | idem |
| Ambiente Development | **limite de 100 itens** | [FAQ](https://docs.pluggy.ai/en/docs/get-started/faq) |
| Sandbox | gratuito; itens inativos > 30 dias são apagados | [sandbox](https://docs.pluggy.ai/en/docs/guides/sandbox) |
| Uso pessoal via MeuPluggy | **gratuito**, até 5 conexões | [guia](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use) |
| Após o trial | conexões com contas reais pausam; dados ficam 30 dias | [preços](https://pluggy.ai/precos) |

### 1.5 Autenticação

```
POST https://api.pluggy.ai/auth
Content-Type: application/json
{ "clientId": "<uuid>", "clientSecret": "<secret>" }
→ 200 { "apiKey": "..." }            // TTL 2 horas
```

```
POST https://api.pluggy.ai/connect_token
X-API-KEY: <apiKey>
{ "itemId"?: "<uuid>", "options": { "clientUserId"?, "webhookUrl"?, "oauthRedirectUri"?, "avoidDuplicates"?, "products"? } }
→ 200 { "accessToken": "..." }       // TTL 30 minutos, 1 por conexão
```

- `apiKey` dá acesso total; **expira em 2h** → cachear em memória/isolate e renovar com margem
  (ex.: reautenticar se restarem < 5 min). Nunca por request.
- `connectToken` tem escopo reduzido: só o Item criado com ele e `GET /accounts?itemId=`; qualquer
  outro endpoint de produto com ele retorna **403**.
- **Armadilha documentada:** `clientUserId`/`webhookUrl` no **root** do body de `/connect_token` são
  **descartados silenciosamente** (200 OK, valor `null`). Sempre dentro de `options`.
- `clientSecret` só é exibido uma vez no Dashboard; se perder, gere outro.
- No widget, o token vai para o browser; `clientId`/`clientSecret` **nunca**.

### 1.6 Endpoints usados pelo dashboard

Todos com header `X-API-KEY`. Paginação clássica `{ total, totalPages, page, results }` (exceto
transações v2, por cursor).

| Produto | Endpoint | Parâmetros | Paginação |
|---|---|---|---|
| Item | `GET /items/{id}` | path `id` | — |
| Item (lista) | `GET /v2/items` | cursor `after`; filtros `clientUserId`, `connectorId` (opt-in, 403 no Free/MeuPluggy) | `{ results, next }` |
| Accounts | `GET /accounts` | `itemId` (**obrigatório**), `type` (`BANK`\|`CREDIT`) | page |
| Account | `GET /accounts/{id}` | — | — |
| Saldo real-time | `GET /accounts/{id}/balance` | — (só API key) | — |
| Transactions | `GET /v2/transactions` | `accountId` (obrigatório), `dateFrom`, `dateTo`, `ids` (máx. 500), `createdAtFrom`, `after` | `{ results, next }` |
| Transactions (legado) | `GET /transactions` | `accountId`, `from`, `to`, `page`, `pageSize` (≤500), `ids`, `billId`, `createdAtFrom` | page — **deprecated** |
| Bills | `GET /bills` | `accountId` (obrigatório), `page`, `pageSize` (≤500) | page |
| Investments | `GET /investments` | `itemId` (obrigatório), `type`, `page`, `pageSize` | page |
| Webhooks | `GET/POST/PATCH/DELETE /webhooks` | — | page (list) |

Observações relevantes:

- **`GET /transactions` está marcado como deprecated** no OpenAPI em favor de `GET /v2/transactions`
  (cursor). Os nomes dos filtros também mudaram: `from`/`to` → **`dateFrom`/`dateTo`**; o cursor é
  `after` e o `next` da resposta é uma query string pronta para concatenar.
- `pageSize` acima de 500 retorna **400** (não é truncado silenciosamente).
- `GET /accounts` retorna **array paginado**, não array puro.
- `GET /investments` é por **item**, não por conta: não existe "conta investimento" no Pluggy.
- `GET /accounts/{id}/balance` busca saldo direto na instituição sem sync completo — bom para o
  snapshot diário sem disparar update.

### 1.7 Status de Item e `executionStatus`

**`Item.status`** ([item-lifecycle](https://docs.pluggy.ai/en/docs/connections/item-lifecycle)):

| status | significado |
|---|---|
| `UPDATING` | sincronização em andamento |
| `LOGIN_ERROR` | falha de credencial; **não** é re-tentado pelo auto-sync até nova autenticação |
| `OUTDATED` | credenciais válidas, mas a última execução falhou; pode ser re-tentado |
| `WAITING_USER_INPUT` | precisa de MFA/entrada do usuário |
| `UPDATED` | última sincronização concluída com sucesso |

**`Item.executionStatus`** — transitórios: `CREATED`, `LOGIN_IN_PROGRESS`,
`LOGIN_MFA_IN_PROGRESS`, `ACCOUNTS_IN_PROGRESS`, `CREDITCARDS_IN_PROGRESS`,
`TRANSACTIONS_IN_PROGRESS`, `INVESTMENT_TRANSACTIONS_IN_PROGRESS`, `PAYMENT_DATA_IN_PROGRESS`,
`IDENTITY_IN_PROGRESS`, `MERGING`.

Finais de sucesso: `SUCCESS`, `PARTIAL_SUCCESS` (algum produto falhou; ver `statusDetail`).

Finais de erro: `ERROR`, `MERGE_ERROR`, `INVALID_CREDENTIALS`, `ALREADY_LOGGED_IN`,
`SITE_NOT_AVAILABLE`, `INVALID_CREDENTIALS_MFA`, `USER_INPUT_TIMEOUT`, `ACCOUNT_LOCKED`,
`ACCOUNT_NEEDS_ACTION`, `USER_NOT_SUPPORTED`, `ACCOUNT_CREDENTIALS_RESET`, `CONNECTION_ERROR`,
`USER_AUTHORIZATION_NOT_GRANTED`, `USER_AUTHORIZATION_REVOKED`.

Intermediários: `WAITING_USER_INPUT`, `USER_AUTHORIZATION_PENDING`.

Campos correlatos no Item: `error { code, message, providerMessage?, attributes? }`, `statusDetail`,
`nextAutoSyncAt`, `consentExpiresAt`, `lastUpdatedAt`, `consecutiveFailedLoginAttempts`, `products[]`.

**Auto-sync** (produção): 6/8/12/24/30/48/96h ou até 4 horários fixos, configurado pela Pluggy —
não é algo que o app liga sozinho. Erro de login não é re-tentado; outros erros são re-tentados de
hora em hora até 5 vezes.

### 1.8 Webhooks

**Eventos de dados** (lista do [OpenAPI](https://docs.pluggy.ai/openapi/pluggy-api.json) +
[referência](https://docs.pluggy.ai/en/docs/developer-tools/webhooks-ref)):

`item/created`, `item/updated`, `item/error`, `item/deleted`, `item/waiting_user_input`,
`item/waiting_user_action`, `item/login_succeeded`, `connector/status_updated`,
`transactions/created`, `transactions/updated`, `transactions/deleted`.
(Há também eventos de pagamentos/boleto, fora do escopo.)

**Payload** — campos comuns: `event`, `eventId`, `clientId`, `triggeredBy`
(`USER|CLIENT|SYNC|INTERNAL`), mais a entidade (`itemId`, `connectorId`, `transactionIds`).
`clientUserId` vem **apenas** em eventos `item/*`; nunca em `transactions/*`.

```json
{
  "event": "item/updated",
  "eventId": "d876fd7c-e9bd-4c4c-bd46-cc96c62aac29",
  "itemId": "a5c763cb-0952-457b-9936-630f79c5b016",
  "triggeredBy": "SYNC",
  "clientUserId": "cainan"
}
```

```json
{
  "event": "transactions/created",
  "eventId": "4e69d62d-b7c8-4f01-b591-a1d8a94710b9",
  "itemId": "de7bbf5a-abf2-47e4-94b1-586b36758423",
  "accountId": "0d5a0de2-9c82-4ea2-af50-31643a632a33",
  "transactionsCount": 332,
  "transactionsMinDate": "2025-02-12T15:00:01.000Z",
  "transactionsCreatedAtFrom": "2025-02-13T17:21:53.719Z",
  "createdTransactionsLink": "https://api.pluggy.ai/transactions?accountId=...&createdAtFrom=..."
}
```

**Validação — não existe assinatura HMAC.** O que a doc manda fazer:

1. **Segredo em header**: criar o webhook via `POST /webhooks` com `headers: { "X-...": "<segredo>" }`
   e responder `401` a quem não trouxer. Isso **só funciona** para webhooks criados em `/webhooks`:
   `webhookUrl` em Item/Connect Token **não envia headers customizados**.
2. **Conferir `clientId`** (filtra webhooks de outras contas, mas não autentica).
3. **Não confiar no payload**: responder `2XX` em < 10s e então buscar `GET /items/{id}` (para
   `item/*`) ou `GET /v2/transactions` (para `transactions/*`).
4. Opcional: whitelist de IP `52.67.145.81` (a doc avisa que IP sozinho não prova nada).

Retries: até 3 tentativas (imediata, ~15 min, ~2 h). `400/401/403/404/405` **não** são re-tentados;
`5XX`, `429`, timeout e erro de conexão são. `item/waiting_user_input` e `item/login_succeeded` têm
janela curta (3 tentativas ~6 min). Não segue redirect; `3XX` conta como falha.

Para `transactions/created` a doc recomenda consumir `createdTransactionsLink`; para
`transactions/updated`, buscar por `ids`; para `transactions/deleted`, apagar por `transactionIds`
(podendo reaparecer depois — tratar como idempotente).

### 1.9 Rate limits

| Endpoint | Limite |
|---|---|
| `POST /auth` | 360/min por IP |
| `GET /accounts[...]` | 360/min |
| `GET /transactions[...]` | 360/min |
| `GET /investments[...]` | 360/min |
| `PATCH /items` | **20/min** |

Resposta 429: `{ "message": "...", "code": 429 }` + headers `RateLimit-Limit`, `RateLimit-Reset`,
`Retry-After`.

### 1.10 Erros

Shape global: `{ code: number, message: string, codeDescription?: string, data?: object }`.
Criação de item: `{ code, codeDescription, message, errors[], details[], errorId }`.
Códigos: 400, 401, 403, 404, 405, 406, 409, 429, 500, 503. Toda resposta traz `x-request-id` (logar
junto com o erro).

---

## 2. Belvo

**O que é:** agregador de Open Finance para América Latina (BR/MX/CL), com sandbox e produção.

| Aspecto | Situação |
|---|---|
| Sandbox | **Gratuito e self-serve**, com dados dummy; cobre agregação e enriquecimento (iniciação de pagamento **não** está no sandbox) |
| Base URL sandbox | `https://sandbox.belvo.com` |
| Auth | **HTTP Basic**: `secretId` como usuário, `secretPassword` como senha, Base64 no header `Authorization` |
| Recursos BR | `GET/POST /api/institutions/`, `/api/links/`, `/api/accounts/`, `/api/transactions/`, `/api/bills/`, `/api/br/balances/`, `/api/br/investments/`, `/api/br/investment-transactions/`, `/api/owners/`, `/api/consents/` |
| Paginação | `page` + `page_size` (default 100, máx. 1000) |
| Webhooks | Sim (eventos de link, `historical_update`, etc.) |
| Produção | Requer **reunião comercial + certificação** com engenheiro; base `https://api.belvo.com` |
| Preço produção | **Launch R$ 1.500/mês** (US$ 1.000/mês na versão EN) ou Growth sob consulta |
| Uso pessoal | **Não atendido**: o próprio texto do plano diz que Launch é exclusivo para "instituições de crédito, bancos, pagamentos e fintechs, proptech e mercado imobiliário e telecom" e que "demais segmentos e **uso pessoal não são atendidos**" |
| Histórico | até 24 meses de transações |

Fontes: [autenticação/visão geral](https://developers.belvo.com/reference/authentication),
[planos e preços (pt-BR)](https://belvo.com/pt-br/planos-precos/),
[planos e preços (EN)](https://belvo.com/plans-and-pricing/).

**Conclusão:** sandbox excelente para prototipar (grátis, dados dummy, API limpa, basic auth trivial de
implementar com `fetch`), mas **inviável para produção pessoal** pelo preço e pela restrição explícita
de segmento. Não serve nem como fallback gratuito.

---

## 3. Klavi

- Empresa brasileira de Open Finance com API própria ("Conecte", além de klaaS/Monitore/Analise);
  documentação pública em [docs.klavi.ai](https://docs.klavi.ai/).
- Posicionamento claramente **B2B** (crédito e risco, inteligência de mercado, pagamentos). O portal
  tem uma área "Gerencie seus dados" para pessoa física, mas é um produto de consumidor, não uma API
  self-serve.
- **Não confirmado**: existência de sandbox gratuito self-serve, preços públicos, ou plano de uso
  pessoal. Toda a contratação aparenta ser via vendas.
- Não recomendo avaliar a fundo: o esforço de integração é o mesmo do Pluggy e o custo/atendimento é
  empresarial.

---

## 4. Open Finance Brasil direto (como TPP)

**Por que é inviável para um indivíduo** — e não é questão de esforço de engenharia:

1. **Só participante autorizado pelo BCB entra.** "Somente as instituições financeiras e demais
   instituições autorizadas a funcionar pelo Banco Central podem participar do Open Finance"
   ([openfinancebrasil.org.br](https://openfinancebrasil.org.br/)). O onboarding exige comprovação de
   autorização para funcionar (Art. 6º da Resolução Conjunta nº 1/2020) enviada para
   `cadastro@openfinancebrasil.org.br`
   ([onboarding](https://openfinancebrasil.org.br/onboarding)).
2. **Cadastro no Diretório de Participantes** é pré-requisito para publicar APIs e obter
   `Software Statement ID`.
3. **mTLS com certificados ICP-Brasil** emitidos por AC credenciada, com atributos Open Finance
   (`organizationIdentifier`, `UID` = Software Statement ID, `commonName`), além de **JWS** para
   assinatura de mensagens entre participantes
   ([Padrão de Certificados](https://openfinancebrasil.atlassian.net/wiki/spaces/OF/pages/245694518)).
4. **Fluxo completo de consentimento**: DCR (dynamic client registration) na transmissora, ciclo de
   vida do consentimento, renovação, revogação, webhooks assinados — e ainda as regras de custeio da
   estrutura de governança.

Ou seja: "ser TPP" é uma condição **regulatória e contratual** (CNPJ autorizado, certificado, acordo de
participação), não uma biblioteca que se instala. Para uso pessoal, o caminho direto só existe via
**APIs do próprio banco** (alguns oferecem, com contrato PJ e escopo limitado), o que não é Open
Finance e não é portável entre instituições.

Consequência prática: **agregador terceirizado é obrigatório** para um app pessoal.

---

## 5. Comparação

| Critério | **Pluggy** | Belvo | Klavi | OF Brasil direto |
|---|---|---|---|---|
| Sandbox gratuito | Sim (conector Pluggy Bank no ambiente de produção) | Sim, self-serve | Não confirmado | Sim (diretório de sandbox), mas só para participantes |
| Dados simulados | Sim, ricos (contas, cartão, 8 investimentos, empréstimo, 13+ cenários de erro) | Sim (dummy) | Não confirmado | Mock do diretório |
| Credenciais de teste públicas | Sim (`user-ok`/`password-ok`, MFA `123456`) | Sim (dados dummy, links de teste) | — | — |
| Limites | Dev: 100 itens; sandbox: apaga item inativo em 30d; rate 360/min por endpoint | 100–1000 por página; rate limits por recurso | — | Limites operacionais da rede (por CPF/produto/instituição) |
| Auth | `POST /auth` (clientId/secret → apiKey 2h) + `X-API-KEY`; connect token 30 min | HTTP Basic (secretId/secretPassword) | Provavelmente OAuth/chave (não confirmado) | OAuth2 mTLS + JWS + DCR |
| Webhooks | Sim; **sem assinatura** (header secreto + `clientId` + re-fetch) | Sim | Sim | Sim, assinados |
| Sync | Auto-sync no servidor (6–96h ou horários fixos); manual via `PATCH /items` (20/min) | Links `single`/`recurrent` + `POST /api/links/{id}/refresh/` (cooldown 10 min) | Desconhecido | Por consentimento, com janelas regulatórias |
| Uso pessoal | **Sim e grátis** (MeuPluggy, 5 conexões, 1 ano) | **Não** (produção só B2B, R$1.500/mês) | Não confirmado | **Não** (exige ser instituição autorizada) |
| Custo produção | R$ 2.500/mês (ou R$ 0 via MeuPluggy) | R$ 1.500/mês | Vendas | Custeio da estrutura + compliance |
| Esforço de integração | Baixo (REST + fetch) | Baixo | Médio | Altíssimo/inviável |

---

## 6. Recomendação

**Manter Pluggy** (como já registrado em `docs/architecture.md`), com uma distinção explícita de modos:

1. **Desenvolvimento e demo — conector Pluggy Bank (sandbox).**
   Widget com `includeSandbox: true`, credenciais `user-ok`/`password-ok`, erros simulados pelos
   `user-*`. É o único modo que exercita o fluxo completo de "criar conexão pelo app" sem custo e sem
   dado real. O `DemoProvider` continua sendo o default offline/determinístico.

2. **Uso real (dados do próprio Cainan) — conector MeuPluggy, não o conector do banco.**
   Gratuito, sem trial vencendo, com sync de 24h do lado do Meu Pluggy. Consequências a aceitar:
   - o item nasce no **Dashboard** da Pluggy, não no widget do app → o app precisa receber os `itemId`s
     por configuração (`PLUGGY_ITEM_IDS` em `.dev.vars`/`settings`), porque `GET /v2/items` dá 403;
   - item proxy **não** aceita `PATCH /items/{id}` → o botão "sincronizar agora" deve ser no-op/
     desabilitado para essas conexões (ou mostrar "atualizado pelo Meu Pluggy a cada 24h");
   - `consentExpiresAt` precisa ser exibido e alertado (1 ano);
   - o app deve tratar "leituras vazias + consentimento vencido" como `login_required`, não como
     "sem transações".

3. **Nunca** prometer no produto que o usuário conecta o banco direto pelo app em produção sem passar
   por um dos dois modos acima. O conector do banco no widget é o que exige CPF + aprovação no app do
   banco **a cada conexão** e não é o caminho de uso pessoal.

**Belvo** fica como alternativa apenas de sandbox para comparação técnica (e para validar que o
`PluggyProvider` não vazou detalhes do fornecedor). **Klavi** e **OF direto** estão descartados.

### Riscos e pontos de atenção

- **Sem assinatura de webhook no Pluggy** → o endpoint `/api/webhooks/pluggy` precisa de segredo em
  header (webhook criado via `POST /webhooks`) ou token na query string, além de checar `clientId` e
  **sempre** re-buscar o recurso. A arquitetura fala em "validação de origem/assinatura": não há
  assinatura; ajustar a implementação e a documentação.
- **`GET /transactions` está deprecated** → implementar contra `/v2/transactions` (cursor `after`),
  com `dateFrom`/`dateTo`, e manter o legado só se precisar de `billId`.
- **Investimentos não são contas** → o Pluggy devolve `/investments?itemId=`; o modelo atual
  (`accounts.type = 'investment'`) não tem onde guardar isso. Precisa de conta sintética por item ou
  de uma tabela `investments`.
- **Sandbox não é determinístico** (muda diariamente/semanalmente e expira em 30 dias) → nunca usar o
  sandbox como fixture de teste de integração; usar o `DemoProvider` ou gravar respostas.

---

## 7. URLs consultadas

- https://docs.pluggy.ai/en/docs/authentication
- https://docs.pluggy.ai/en/docs/guides/sandbox
- https://docs.pluggy.ai/en/docs/connect-widget/environments
- https://docs.pluggy.ai/en/docs/connect-widget/introduction
- https://docs.pluggy.ai/en/docs/connect-widget/authentication
- https://docs.pluggy.ai/en/docs/connections/item
- https://docs.pluggy.ai/en/docs/connections/item-lifecycle
- https://docs.pluggy.ai/en/docs/connections/connectors-coverage
- https://docs.pluggy.ai/en/docs/products/accounts
- https://docs.pluggy.ai/en/docs/products/transactions
- https://docs.pluggy.ai/en/docs/products/credit-card-bills
- https://docs.pluggy.ai/en/docs/developer-tools/basic-concepts
- https://docs.pluggy.ai/en/docs/developer-tools/rate-limits
- https://docs.pluggy.ai/en/docs/developer-tools/error-codes
- https://docs.pluggy.ai/en/docs/developer-tools/webhooks-ref
- https://docs.pluggy.ai/en/docs/get-started/faq
- https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use
- https://meu.pluggy.ai/api-guide
- https://pluggy.ai/precos
- https://docs.pluggy.ai/openapi/pluggy-api.json
- https://developers.belvo.com/reference/authentication
- https://belvo.com/plans-and-pricing/
- https://belvo.com/pt-br/planos-precos/
- https://docs.klavi.ai/
- https://openfinancebrasil.org.br/
- https://openfinancebrasil.org.br/onboarding
- https://openfinancebrasil.org.br/modelo-de-participacao
- https://openfinancebrasil.atlassian.net/wiki/spaces/OF/pages/245694518
