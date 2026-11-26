import type { CardPaymentMode } from "@fd/contracts";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, PiggyBank } from "lucide-react";
import { useMemo } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUpdateCardPaymentPlanMutation } from "@/lib/mutations";
import {
  accountsQueryOptions,
  cardReservesQueryOptions,
  investmentsQueryOptions,
} from "@/lib/queries";

import { ReserveStatusView } from "./reserve-status";

/** Valor do Select: o Radix só aceita string; `kind:id` identifica a fonte. */
type SourceValue = `account:${string}` | `investment:${string}`;

export interface CardPaymentPlanCardProps {
  accountId: string;
}

/**
 * "Como você paga este cartão": no vencimento (padrão) ou guardando o valor
 * das compras numa reserva conectada (conta ou investimento). Salva na hora.
 */
export function CardPaymentPlanCard({ accountId }: CardPaymentPlanCardProps) {
  const reservesQuery = useQuery(cardReservesQueryOptions);
  const accountsQuery = useQuery(accountsQueryOptions);
  const investmentsQuery = useQuery(investmentsQueryOptions);
  const mutation = useUpdateCardPaymentPlanMutation();

  const data = reservesQuery.data?.data;
  const plan = data?.plans.find((item) => item.accountId === accountId);
  const mode: CardPaymentMode = plan?.mode ?? "pay_on_due";
  const sourceValue: SourceValue | undefined = plan?.reserveAccountId
    ? `account:${plan.reserveAccountId}`
    : plan?.reserveInvestmentId
      ? `investment:${plan.reserveInvestmentId}`
      : undefined;
  const reserve = data?.reserves.find((item) =>
    item.cards.some((card) => card.accountId === accountId),
  );

  const sourceAccounts = useMemo(
    () => (accountsQuery.data?.data ?? []).filter((account) => account.type !== "credit_card"),
    [accountsQuery.data],
  );
  const sourceInvestments = investmentsQuery.data?.data ?? [];

  function save(nextMode: CardPaymentMode, nextSource: SourceValue | undefined) {
    // Só o primeiro ":" separa: o id pode conter ":" (ex.: ids determinísticos).
    const separator = nextSource ? nextSource.indexOf(":") : -1;
    const kind = nextSource ? nextSource.slice(0, separator) : null;
    const id = nextSource ? nextSource.slice(separator + 1) : null;
    mutation.mutate({
      accountId,
      mode: nextMode,
      reserveAccountId: kind === "account" ? id : null,
      reserveInvestmentId: kind === "investment" ? id : null,
    });
  }

  return (
    <Card data-slot="card-payment-plan" className="gap-0">
      <CardHeader>
        <CardTitle>Como você paga este cartão</CardTitle>
        <CardDescription>
          Guardando a cada compra, o app compara o saldo da reserva com o que as faturas vão cobrar
          (só a parcela do ciclo, não o total parcelado).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {!data ? (
          <Skeleton className="h-8 w-80 max-w-full" />
        ) : (
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(value) => {
              if (value !== "pay_on_due" && value !== "reserve") return;
              if (value === mode) return;
              save(value, value === "reserve" ? sourceValue : undefined);
            }}
            disabled={mutation.isPending}
            aria-label="Forma de pagamento do cartão"
            className="grid w-full grid-cols-2"
          >
            <ToggleGroupItem
              value="pay_on_due"
              size="lg"
              aria-label="Pagar no vencimento"
              className="w-full min-w-0"
            >
              <CalendarClock aria-hidden="true" />
              No vencimento
            </ToggleGroupItem>
            <ToggleGroupItem
              value="reserve"
              size="lg"
              aria-label="Guardar a cada compra"
              className="w-full min-w-0"
            >
              <PiggyBank aria-hidden="true" />
              Guardando
            </ToggleGroupItem>
          </ToggleGroup>
        )}

        {mode === "reserve" ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Onde você guarda</p>
            <Select
              value={sourceValue ?? ""}
              onValueChange={(value) => save("reserve", value as SourceValue)}
              disabled={mutation.isPending}
            >
              <SelectTrigger aria-label="Reserva do cartão" className="w-full">
                <SelectValue placeholder="Escolha a conta ou caixinha da reserva" />
              </SelectTrigger>
              <SelectContent>
                {sourceAccounts.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel>Contas</SelectLabel>
                    {sourceAccounts.map((account) => (
                      <SelectItem key={account.id} value={`account:${account.id}`}>
                        {[account.name, account.institutionName].filter(Boolean).join(" · ")}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
                {sourceInvestments.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel>Investimentos</SelectLabel>
                    {sourceInvestments.map((investment) => (
                      <SelectItem key={investment.id} value={`investment:${investment.id}`}>
                        {[investment.name, investment.institution?.name]
                          .filter(Boolean)
                          .join(" · ")}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
              </SelectContent>
            </Select>
            {sourceValue ? null : (
              <p className="text-xs text-warning">
                Escolha a reserva para o app calcular quanto falta guardar.
              </p>
            )}
          </div>
        ) : null}

        {mode === "reserve" && reserve ? (
          <ReserveStatusView reserve={reserve} className="border-t border-border-subtle pt-4" />
        ) : null}
      </CardContent>
    </Card>
  );
}
