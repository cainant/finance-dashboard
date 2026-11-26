import { todayIsoDate, type Account, type Bill, type Connection } from "@fd/contracts";
import type { UseQueryResult } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { InstitutionAvatar } from "@/components/domain/institution-avatar";
import { MoneyText } from "@/components/domain/money-text";
import { StatusDot } from "@/components/domain/status-dot";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { accountTypeLabel } from "@/lib/accounts";
import { billDueLabel, billStatusForDisplay } from "@/lib/bills";
import { connectionStatusMeta, STATUS_TONE_BADGE_VARIANT } from "@/lib/connections";
import { formatDate } from "@/lib/format";

/** Data de referência para "vence em X dias" (avaliada uma vez por carga). */
const TODAY_ISO = todayIsoDate();

/** Faturas do cartão (histórico), usadas no detalhe da conta de cartão. */
export function AccountBillsCard({ billsQuery }: { billsQuery: UseQueryResult<{ data: Bill[] }> }) {
  return (
    <Card data-slot="account-bills" className="gap-0">
      <CardHeader className="flex h-11 flex-row items-center justify-between gap-3">
        <CardTitle>Faturas</CardTitle>
        <span className="text-xs text-muted-foreground">Histórico do cartão</span>
      </CardHeader>
      <CardContent className="p-0">
        {billsQuery.isPending ? (
          <div className="space-y-3 px-4 py-4" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex items-center justify-between gap-3">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : billsQuery.isError ? (
          <ErrorState
            compact
            className="border-0 bg-transparent px-0"
            error={billsQuery.error}
            onRetry={() => void billsQuery.refetch()}
            isRetrying={billsQuery.isFetching}
          />
        ) : (billsQuery.data?.data.length ?? 0) === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="Sem faturas"
            description="As faturas aparecem depois que o cartão for sincronizado."
            compact
            className="border-0 bg-transparent px-0"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {billsQuery.data?.data.map((bill) => {
              const billStatus = billStatusForDisplay(bill, TODAY_ISO);

              return (
                <li
                  key={bill.id}
                  data-slot="bill-row"
                  className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm leading-5 font-medium text-foreground">
                      Vencimento {formatDate(bill.dueDate)}
                    </p>
                    <p className="truncate text-xs leading-4 text-muted-foreground">
                      {bill.closingDate ? `Fecha em ${formatDate(bill.closingDate)} · ` : ""}
                      {billDueLabel(bill, TODAY_ISO)}
                    </p>
                  </div>
                  <Badge variant={billStatus.variant}>{billStatus.label}</Badge>
                  <MoneyText
                    valueCents={bill.totalCents}
                    size="sm"
                    tone="neutral"
                    className="ml-auto"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 border-b border-dashed border-border-subtle last:border-b-0">
      <dt className="min-w-0 shrink-0 text-[13px] leading-5 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[13px] leading-5 font-medium text-foreground">
        {children}
      </dd>
    </div>
  );
}

export interface AccountDetailsCardProps {
  account: Account;
  connection: Connection | null;
  institutionName: string | null;
  /** Linhas extras (ex.: limite disponível, última atualização no mobile). */
  extraRows?: ReactNode;
}

/** Card "Detalhes da conta": instituição, tipo, número, atualização e conexão. */
export function AccountDetailsCard({
  account,
  connection,
  institutionName,
  extraRows,
}: AccountDetailsCardProps) {
  const status = connection ? connectionStatusMeta(connection.status) : null;
  const numberMasked = account.numberMasked ?? null;

  return (
    <Card data-slot="account-details" className="gap-0 p-4">
      <h2 className="text-sm leading-5 font-semibold text-foreground">Detalhes da conta</h2>
      <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
        Informações recebidas pela conexão.
      </p>

      <dl className="mt-3">
        {extraRows}
        <DetailRow label="Instituição">
          {institutionName ? (
            <span className="inline-flex items-center gap-2">
              <InstitutionAvatar
                name={institutionName}
                color={connection?.institution?.primaryColor}
                size="xs"
              />
              <span className="truncate">{institutionName}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </DetailRow>
        <DetailRow label="Tipo">{accountTypeLabel(account.type, account.subtype)}</DetailRow>
        <DetailRow label="Número">
          {numberMasked ? (
            <span className="tabular-nums">{numberMasked}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </DetailRow>
        <DetailRow label="Atualizada em">{formatDate(account.updatedAt)}</DetailRow>
        <DetailRow label="Conexão">
          {status ? (
            <Badge variant={STATUS_TONE_BADGE_VARIANT[status.tone]} title={status.description}>
              <StatusDot tone={status.tone} pulse={status.pulse} aria-hidden="true" />
              {status.label}
            </Badge>
          ) : (
            <span className="text-muted-foreground">Sem conexão</span>
          )}
        </DetailRow>
      </dl>
    </Card>
  );
}
