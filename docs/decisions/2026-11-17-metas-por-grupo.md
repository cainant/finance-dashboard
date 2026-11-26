# Metas por grupo: renda de referência, grupos, categoria → grupo e parcelas gravadas

- **Data:** 2026-11-17
- **PR:** #83

## Contexto

O usuário quer distribuir uma renda mensal de referência entre grupos de metas ("Liberdade
Financeira", "Custos Fixos", "Conforto", "Metas", "Prazeres", "Conhecimento") e, depois, comparar o
gasto real de cada grupo com a meta. Não havia nada de orçamento no sistema. As parcelas do cartão
já chegavam do Pluggy (`creditCardMetadata.installmentNumber/totalInstallments`, mapeadas em
`ProviderTransaction`), mas o sync descartava esses campos.

Este é o primeiro de quatro PRs: base de dados e API (este), tela de metas, acompanhamento
realizado × meta e modo "guardar para a fatura" no cartão.

## Decisão

- **Meta em percentual, em pontos-base** (`budget_groups.target_bps`, `2500` = 25%). O valor em R$
  é derivado da renda de referência, então mudar a renda recalcula todas as metas sem reescrever
  os grupos. A soma das metas é validada em `≤ 100%` no contrato (`updateBudgetBody`).
- **Renda de referência** mora em `settings` com a chave `budgetReferenceIncomeCents` (inteiro em
  centavos). É só base de planejamento: não é receita, não entra nos KPIs e não cria lançamento.
  `/api/settings` não a expõe (o `settingsSchema` descarta chaves desconhecidas).
- **Atribuição em duas camadas**: a categoria aponta para um grupo (`budget_category_groups`, por
  usuário, porque as categorias de sistema são compartilhadas) e a transação pode ter uma
  exceção manual (`transactions.budget_group_id`). Grupo efetivo =
  `budget_group_id ?? grupo da categoria ?? sem grupo`. O sync nunca escreve
  `budget_group_id` (fica fora do `ON CONFLICT ... SET`).
- **Grupos padrão no primeiro `GET /api/budget`**, com ids determinísticos
  (`<userId>:<slug>`) e `INSERT OR IGNORE`: dois GETs simultâneos não duplicam. Os vínculos padrão
  usam `INSERT ... SELECT` sobre as categorias de sistema existentes, para não quebrar a FK num
  banco sem elas. Vínculos padrão: Custos Fixos ← Moradia, Contas & Serviços, Mercado, Transporte,
  Saúde, Impostos & Taxas; Conforto ← Compras, Assinaturas, Pets; Prazeres ← Restaurantes, Lazer,
  Viagem; Conhecimento ← Educação. "Liberdade Financeira" e "Metas" começam sem categoria: são
  dinheiro guardado/investido, não despesa.
- **`PUT /api/budget` substitui a lista inteira de grupos** (a tela salva tudo com um botão):
  grupo com `id` é atualizado, sem `id` é criado, ausente é removido; a ordem do array vira
  `position`. Tudo num `db.batch()` (uma query no D1 Free, atômico). Remover um grupo apaga os
  vínculos de categoria (`ON DELETE CASCADE`) e zera as exceções das transações
  (`ON DELETE SET NULL`). A lista exige ao menos um grupo e no máximo 12.
- **Parcelas gravadas** em `transactions.installment_number/total_installments`. Com duas colunas
  a mais (21 no total), o lote do upsert de transações caiu de 5 para 4 linhas (84 variáveis, abaixo
  do limite de 100 do D1).

## Alternativas descartadas

- **Meta em R$ fixo:** mudar a renda deixaria as metas inconsistentes com o percentual mostrado; a
  tela pede explicitamente que os valores "sejam recalculados".
- **Grupo só por transação:** exigiria classificar à mão cada lançamento sincronizado.
- **Grupo só por categoria:** obrigaria a mudar a categoria de uma compra para mudar o grupo dela
  (ex.: um livro em "Compras" que é "Conhecimento").
- **Coluna `budget_group_id` em `categories`:** as categorias de sistema são compartilhadas entre
  usuários (`user_id IS NULL`).
- **Tabela própria para a renda:** uma linha por usuário cabe em `settings`, que já existe para isso.

## Consequências

- Migration `0007_budget_groups_installments.sql` (duas tabelas e três colunas em `transactions`).
- Transações antigas ficam com parcelas `NULL` até o sync revisitar a janela (~7 dias). Para
  regravar o histórico: `UPDATE accounts SET history_synced_at = NULL` + sync completo (365 dias).
- O DTO de transação passa a ter `installmentNumber`, `totalInstallments` e `budgetGroupId`
  (exceção, não o grupo efetivo: a web resolve o efetivo com `Budget.categoryGroups`).
- Fica para os próximos PRs: tela de metas, realizado × meta (a parcela conta no mês da fatura em
  que cai, via `bill_id`) e o modo "guardar para a fatura" com conta reserva.
