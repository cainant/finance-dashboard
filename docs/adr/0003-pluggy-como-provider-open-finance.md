# ADR 0003 — Pluggy como provider de Open Finance

- Status: aceito
- Data: 2026-11-10
- Contexto relacionado: [architecture.md](../architecture.md) (§Providers financeiros), [open-finance-providers.md](../research/open-finance-providers.md), [pluggy-api-reference.md](../research/pluggy-api-reference.md)

## Contexto

O dashboard precisa de contas, transações, cartões/faturas, investimentos e saldos de instituições
brasileiras. Integrar Open Finance direto é inviável para pessoa física: exige ser instituição
autorizada pelo BCB, certificado ICP-Brasil, Software Statement ID e fluxo completo de consentimento.
Um agregador terceirizado é obrigatório — e precisa rodar com `fetch` puro, sem SDK Node, no Worker.

## Decisão

Adotar a **Pluggy** atrás da interface `FinancialProvider`, em dois modos:

- **Sandbox (dev/demo)**: conector "Pluggy Bank", gratuito, resolvido em runtime por
  `GET /connectors?sandbox=true` (o id não é publicado e nunca deve ser hardcoded).
- **Uso real**: conector **MeuPluggy** (id 200), gratuito para uso pessoal, até 5 conexões por titular e
  consentimento de 1 ano em `Item.consentExpiresAt`. O item nasce no Meu Pluggy, não no widget, e
  `GET /v2/items` responde 403 — os `itemId`s vêm por configuração.
- **Transporte**: REST `https://api.pluggy.ai` com `fetch` puro; `POST /auth` devolve `apiKey` com TTL de
  2h, cacheada em memória do isolate com margem de renovação, enviada como `X-API-KEY`.
- **Transações**: `GET /v2/transactions` (`accountId`, `dateFrom`, `dateTo`, cursor `after`); o
  `/transactions` v1 está deprecated.
- **Sinal (atualizado após teste real)**: conta corrente usa o sinal de `amount`. Cartão não é
  confiável por `type` nem por sinal isolado — o sandbox devolve compras negativas com `type: "CREDIT"`;
  o provider detecta a convenção por conta (`accounts.amount_sign_convention`), com sinais fortes de
  pagamento/estorno e sinal dominante (amostra ≥ 5), e mapeia compra = despesa, pagamento = transferência
  e estorno = receita.
- **Webhook sem HMAC**: exigir o header secreto `x-webhook-secret` (configurado em `POST /webhooks`),
  conferir `clientId`, responder 2xx rápido e sempre re-buscar o recurso no provider.
- **Erros**: mapeados para `ProviderError`; retry com backoff só em 429/5xx, respeitando `Retry-After`.

## Consequências

- Positivas: um único contrato cobre sandbox e dados reais sem custo, com API REST simples e sem SDK; o
  `DemoProvider` continua sendo o default offline e determinístico, e a interface normalizada isola o
  resto do app — trocar de agregador afeta só `@fd/financial-providers`.
- Negativas / custos: dependência de terceiro para todo dado real, com limites de 360 req/min por
  endpoint e 20/min em `PATCH /items`; o sandbox não é determinístico (transações renovadas
  semanalmente, item inativo apagado em 30 dias), então nunca serve de fixture de teste.
- Negativas / custos: itens MeuPluggy não aceitam `PATCH /items`, logo "sincronizar agora" é no-op para
  eles; leitura vazia com consentimento vencido vira `login_required`, não "sem transações".
- Alternativas descartadas: **Belvo** (sandbox bom, mas produção só B2B a partir de R$ 1.500/mês e uso
  pessoal explicitamente não atendido); **Klavi** (B2B, sem sandbox self-serve confirmado); **Open
  Finance Brasil direto** (barreira regulatória, não técnica).
