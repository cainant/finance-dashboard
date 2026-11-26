# Reserva para faturas: cartão pago no vencimento ou guardando a cada compra

- **Data:** 2026-11-18
- **PR:** #86

## Contexto

O usuário quer escolher, por cartão, entre pagar a fatura no vencimento (como hoje) ou guardar o valor
das compras ao longo do ciclo, com avisos do tipo "você gastou mais R$ 150 no crédito desde a última
vez que guardou, guarde mais R$ 150". As contas estão conectadas, então o dinheiro guardado aparece
no saldo de uma conta (poupança) ou de um investimento (caixinha) sincronizado. Compra parcelada pede
só a parcela do ciclo, não o total.

## Decisão

- **`card_payment_plans`** guarda o modo por cartão (`pay_on_due` | `reserve`) e no máximo uma fonte:
  `reserve_account_id` (qualquer conta que não seja cartão) **ou** `reserve_investment_id`. Sem linha =
  `pay_on_due`. Voltar a `pay_on_due` grava as fontes como `null`. `reserve` sem fonte é aceito e a
  API devolve o cartão em `unconfiguredCardIds`, para a tela pedir a escolha.
- **A cobrar** (por cartão) = faturas não pagas pelo status efetivo na data (mesma janela de 90 dias de
  `GET /api/bills/upcoming`) + **fatura corrente derivada** (`derivedOpenBillRow`, a mesma regra de
  "Faturas a vencer"). Parcelas futuras não entram, porque só a parcela que já caiu no ciclo faz parte
  da fatura. A consulta de agregados por cartão saiu de `routes/bills.ts` para
  `domain/open-bill-cards.ts`, e as duas rotas usam a mesma função.
- **Guardado** = saldo atual da fonte. Cartões que apontam para a mesma fonte somam o "a cobrar".
- **Falta guardar** = `max(0, a cobrar − guardado)`.
- **Desde o último depósito**: o último depósito é a maior data de transação positiva na conta reserva;
  o gasto é a soma das compras líquidas (despesas − estornos) nos cartões dessa reserva **depois**
  desse dia. O próprio dia fica fora, porque não dá para saber se a compra veio antes ou depois do
  depósito, e o "falta guardar" é o número que manda. Investimento não tem extrato: data e gasto vêm
  `null`.

## Alternativas descartadas

- **Registro manual "guardei R$ X":** o usuário escolheu usar as contas conectadas; o saldo da
  reserva já mostra o que foi guardado, inclusive depois de pagar a fatura com ele.
- **Saldo devedor do cartão como "a cobrar":** inclui parcelas futuras, o que contraria a escolha de
  guardar só a parcela do ciclo.
- **Uma reserva global para todos os cartões:** cada cartão escolhe a sua; se dois escolhem a mesma,
  somam.

## Consequências

- Migration `0008_card_payment_plans.sql`.
- O saldo da reserva é o do último sync. Uma transferência feita agora só aparece depois da próxima
  sincronização.
- A fonte pode ter dinheiro guardado para outras coisas; o app trata o saldo inteiro como reserva.
  Por isso uma conta separada (poupança ou caixinha) é o uso recomendado.
- A tela (escolha do modo no cartão e avisos) vem no PR seguinte.
