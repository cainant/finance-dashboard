import type { CreditCard } from "@fd/contracts";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cardReservesQueryOptions } from "@/lib/queries";

import { ReserveStatusView } from "./reserve-status";

export interface CardReservesCardProps {
  cards: readonly CreditCard[];
}

/**
 * Reservas dos cartões no modo "guardar a cada compra". Some quando nenhum
 * cartão usa reserva; erro ou carregamento também não ocupam espaço (a página
 * é sobre os cartões, a reserva é um complemento).
 */
export function CardReservesCard({ cards }: CardReservesCardProps) {
  const query = useQuery(cardReservesQueryOptions);
  const data = query.data?.data;
  if (!data || (data.reserves.length === 0 && data.unconfiguredCardIds.length === 0)) {
    return null;
  }

  const unconfigured = cards.filter((card) => data.unconfiguredCardIds.includes(card.account.id));

  return (
    <Card data-slot="card-reserves" className="gap-0">
      <CardHeader>
        <CardTitle>Reserva para faturas</CardTitle>
        <CardDescription>
          O que já está guardado contra o que as faturas vão cobrar, pelo último sync.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-border-subtle p-0">
        {data.reserves.map((reserve) => (
          <ReserveStatusView
            key={`${reserve.source.kind}:${reserve.source.id}`}
            reserve={reserve}
            showCards
            className="p-4"
          />
        ))}
        {unconfigured.map((card) => (
          <p key={card.account.id} className="p-4 text-[13px] text-warning">
            {card.account.name} está no modo guardar sem reserva.{" "}
            <Link
              to="/credit-cards/$accountId"
              params={{ accountId: card.account.id }}
              search={(previous) => previous}
              className="font-medium underline underline-offset-4"
            >
              Escolher reserva
            </Link>
          </p>
        ))}
      </CardContent>
    </Card>
  );
}
