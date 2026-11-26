# ADR 0005 — Dinheiro em centavos e datas ISO 8601

- Status: aceito
- Data: 2026-11-10
- Contexto relacionado: [architecture.md](../architecture.md) (§Convenções de domínio, §Modelo de dados), [pluggy-api-reference.md](../research/pluggy-api-reference.md)

## Contexto

O domínio é financeiro e em BRL: somas de transações, saldos, faturas e patrimônio precisam fechar ao
centavo. Ponto flutuante binário (`number` IEEE 754) não representa valores decimais como `0.1` com
exatidão; acumular esses erros em agregações produz diferenças de centavos que aparecem na UI e
invalidam conciliação.

Os providers externos entregam valores decimais (a Pluggy usa `amount`, `balance`, `totalAmount` em
reais) e timestamps em UTC; o banco é D1 (SQLite), sem tipo decimal nativo.

## Decisão

- **Dinheiro**: sempre inteiro em centavos, `amountCents: number`, moeda `currency: "BRL"` (ISO 4217).
  Nunca float em domínio, API ou banco. Colunas do D1 são `integer` (`amount_cents`, `balance_cents`,
  `limit_cents`, `total_cents`).
- **Sinal**: `amountCents` positivo = entrada (receita), negativo = saída (despesa). O campo
  `type: "income" | "expense" | "transfer"` é derivado, não a fonte da verdade do valor.
- **Conversão de provider**: arredondamento explícito na normalização —
  `Math.round(Math.abs(tx.amount) * 100)` — com o sinal vindo do `amount` (conta corrente) ou da
  convenção detectada por conta de cartão, nunca do `type` isolado no cartão.
- **Datas**: ISO 8601 string na API. `YYYY-MM-DD` para datas civis e
  `YYYY-MM-DDTHH:mm:ss.sssZ` (UTC) para instantes. No D1, coluna `text` com ISO.
- **IDs**: strings (`crypto.randomUUID()`), sem numérico auto-incremental.
- **Formatação**: só na borda, com `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })`
  e `Intl.DateTimeFormat("pt-BR")`. O núcleo nunca formata nem faz parsing de moeda.

## Consequências

- Positivas: somas e comparações exatas; agregações em SQL (`SUM(amount_cents)`) sem drift; o mesmo valor
  trafega intacto entre provider, D1, API e UI. `integer` no SQLite é compacto e indexável, e datas em
  `text` ISO ordenam lexicograficamente.
- Negativas / custos: todo ponto de entrada de valor precisa converter e arredondar explicitamente; um
  campo novo em reais que escape da normalização gera bug silencioso de fator 100.
- Negativas / custos: cálculos que naturalmente produzem fração (rateio, juros, percentual) precisam de
  regra de arredondamento documentada no ponto de uso, não de arredondamento implícito.
- Negativas / custos: timestamps da Pluggy vêm em UTC e o dia civil brasileiro é GMT-3; truncar
  `date.slice(0, 10)` erra o dia entre 00:00 e 02:59 UTC — converter antes de extrair `YYYY-MM-DD`.
- Alternativas descartadas: `number` em reais (erro de arredondamento), `decimal`/string decimal
  (SQLite não tem tipo nativo, e a API ficaria hostil ao frontend), biblioteca de money com objeto
  próprio (complexidade e serialização desnecessárias para uma moeda só).
