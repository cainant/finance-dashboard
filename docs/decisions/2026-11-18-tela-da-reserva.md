# Tela da reserva para faturas: onde configurar e onde avisar

- **Data:** 2026-11-18
- **PR:** #87

## Contexto

A API da reserva (#86, `docs/decisions/2026-11-18-reserva-para-faturas.md`) devolve, por reserva, o
que as faturas vão cobrar, o guardado, quanto falta e o gasto desde o último depósito. Faltava onde
escolher o modo do cartão e onde o aviso aparece.

## Decisão

- **Configuração no cartão**: card "Como você paga este cartão" no detalhe mobile
  (`/credit-cards/$accountId`) e, no desktop, na coluna lateral de `/credit-cards` para o cartão
  selecionado. A alternância "No vencimento" / "Guardando" e a escolha da reserva (contas que não são
  cartão e investimentos) salvam na hora. Os nomes acessíveis ficam completos ("Pagar no vencimento",
  "Guardar a cada compra"); os rótulos são curtos para caber na coluna de 320px e no celular.
- **Situação em Cartões**: card "Reserva para faturas" abaixo dos cartões, um bloco por reserva
  (guardado de a cobrar, barra, "Guarde mais R$ X" ou "A reserva cobre as faturas", gasto desde o
  último depósito e os cartões dela). Ele some quando nenhum cartão está no modo guardar, e um
  cartão em modo guardar sem reserva ganha o link "Escolher reserva".
- **Aviso na Visão geral**: a faixa "Requer atenção" ganha "Guarde mais R$ X em <reserva>", com o gasto
  desde o último depósito na segunda linha. A gravidade é a mesma das faturas, e o item entra depois
  delas (vencimento é prazo) e antes de "transações sem categoria"; com várias reservas, a maior falta
  vem primeiro. Reserva coberta não vira aviso. Se `/api/card-reserves` falhar ou ainda estiver
  carregando, a faixa segue sem o item, sem bloquear.

## Alternativas descartadas

- **Configurar em Metas:** a escolha é do cartão e de como a fatura é paga, não do orçamento.
- **Aviso com gravidade maior que fatura vencendo:** a fatura tem data; a reserva é um hábito.

## Consequências

- `invalidateFinancialData` também invalida `card-reserves`: o sync muda saldos e faturas.
- O e2e da Visão geral simula `/api/card-reserves`, porque as contas do demo têm saldo alto e não
  garantem falta. O cálculo real fica em `apps/api/test/card-reserves.test.ts`.
