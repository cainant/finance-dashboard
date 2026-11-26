# Realizado das metas: data da transação, pendentes incluídas e aplicações atribuídas à mão

- **Data:** 2026-11-18
- **PR:** #85

## Contexto

Terceiro PR das metas por grupo (#83 dados/API, #84 tela). Faltava comparar o gasto do mês com a meta de
cada grupo. A decisão de #83 previa contar a parcela "no mês da fatura, via `bill_id`", mas os dados
mostram que não é preciso: na fixture real do Pluggy a parcela 2/6 vem com `date` 2026-05-01 e
`creditCardMetadata.transactionDateTime` 2023-05-10 (a compra original), e no demo cada parcela
(`CELULAR NOVO 256GB - Parcela 1/8 … 6/8`) já vem datada no ciclo em que cai (20/05, 24/06, 28/07…).

## Decisão

`GET /api/budget/progress?month=YYYY-MM` agrega, numa única query SQL, as saídas do mês pela **data da
transação**, no grupo efetivo `COALESCE(transactions.budget_group_id, budget_category_groups.group_id)`:

- entram `type = 'expense'` com `amount_cents < 0`, **efetivadas e pendentes** (o orçamento quer o
  gasto já feito, mesmo que o cartão ainda não tenha postado);
- entram transferências de saída **só quando atribuídas a um grupo à mão** — é assim que uma aplicação
  ou um Pix para a caixinha conta em "Liberdade Financeira" ou "Metas";
- receitas e estornos (positivos) não abatem o gasto; transferências sem grupo ficam fora;
- `targetCents = round(renda × target_bps / 10.000)` e `null` sem renda de referência;
- o que não tem grupo vem em `unassigned`, para a tela mostrar quanto falta classificar.

O mês default da API é o UTC (`todayIsoDate`); a web sempre envia o mês de São Paulo
(`currentMonthInAppTimeZone`), para não virar o mês às 21h do último dia.

Na tela, cada grupo mostra "gasto de meta", barra na cor do grupo e "Restam …"; a partir de 85% o texto
fica em atenção e acima da meta a barra fica vermelha com "… acima". Gastar qualquer valor num grupo de
meta 0% conta como acima.

## Alternativas descartadas

- **Mês da fatura (`bills.due_date` via `bill_id`):** o ciclo aberto não tem `bill_id`, então a mesma
  compra mudaria de mês quando a fatura fecha; e a data já cai no ciclo certo.
- **Só efetivadas (regra dos KPIs):** a compra de ontem no cartão ainda pendente sumiria do orçamento.
- **Contar toda transferência de saída:** pagamento de fatura e transferência entre contas próprias
  viram `transfer` e contariam duas vezes.

## Consequências

- Uma query por request (+ as leituras de `loadBudget`), sem migration.
- O realizado é invalidado na web quando mudam categoria, exceção de grupo, metas, vínculos ou dados
  sincronizados.
- Se algum banco datar a parcela pela compra original, ela contará no mês da compra; a fixture real
  e o demo não mostram esse caso.
