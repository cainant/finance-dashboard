import type { Account, Bill, Category, Connection, Transaction } from "@fd/contracts";
import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Landmark, ReceiptText } from "lucide-react";
import type { ReactNode } from "react";

import {
  AccountBillsCard,
  AccountDetailsCard,
  DetailRow,
} from "@/components/accounts/account-detail-parts";
import { BalanceAreaChart } from "@/components/charts/net-worth-area-chart";
import { ChartCard } from "@/components/domain/chart-card";
import { DemoBadge } from "@/components/domain/demo-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { InstitutionAvatar } from "@/components/domain/institution-avatar";
import { MoneyText } from "@/components/domain/money-text";
import { PeriodControl } from "@/components/domain/period-control";
import { TransactionList } from "@/components/domain/transaction-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { accountTypeLabel, type deriveBalanceSeries } from "@/lib/accounts";
import { formatDate, formatNumber } from "@/lib/format";

export interface AccountDetailMobileProps {
  account: Account;
  connection: Connection | null;
  institutionName: string | null;
  demo: boolean;
  periodLabel: string;
  transactions: readonly Transaction[];
  categories: readonly Category[];
  balanceSeries: ReturnType<typeof deriveBalanceSeries>;
  billsQuery: UseQueryResult<{ data: Bill[] }>;
  /** Totais do período aplicados em SQL (não limitados às 100 linhas exibidas). */
  summary: {
    isPending: boolean;
    incomeCents: number | null;
    expensesCents: number | null;
    totalCount: number | null;
  };
}

/**
 * Detalhe da conta no mobile (protótipo D): cabeçalho com avatar, saldo em
 * destaque, entradas e saídas do período e os lançamentos da conta. Tudo o que
 * o desktop mostra continua aqui (disponível, última atualização, evolução do
 * saldo ou faturas, detalhes da conexão), reorganizado em uma coluna.
 */
export function AccountDetailMobile({
  account,
  connection,
  institutionName,
  demo,
  periodLabel,
  transactions,
  categories,
  balanceSeries,
  billsQuery,
  summary,
}: AccountDetailMobileProps) {
  const isCard = account.type === "credit_card";
  const typeLabel = accountTypeLabel(account.type, account.subtype);
  const caption = [typeLabel, account.numberMasked].filter(Boolean).join(" · ");
  const shown = institutionName ?? account.name;

  return (
    <div className="space-y-4" data-slot="account-detail-mobile">
      <header className="flex items-center gap-3">
        <InstitutionAvatar
          name={shown}
          color={connection?.institution?.primaryColor}
          size="lg"
          decorative
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 text-xl leading-7 font-semibold tracking-[-0.015em] text-foreground">
              {account.name}
            </h1>
            {demo ? <DemoBadge /> : null}
          </div>
          <p className="truncate text-sm leading-5 text-muted-foreground">
            {institutionName ? `${institutionName} · ` : ""}
            {caption}
          </p>
        </div>
      </header>

      <PeriodControl />

      <Card data-slot="account-hero" className="gap-0 p-4">
        <p className="text-xs leading-4 font-medium text-muted-foreground">
          {isCard ? "Fatura atual" : "Saldo atual"}
        </p>
        <MoneyText
          valueCents={account.balanceCents}
          tone="neutral"
          size="2xl"
          weight="semibold"
          className="mt-0.5 block tracking-[-0.02em]"
        />
        <p className="mt-1 text-xs leading-4 text-muted-foreground">
          {isCard ? "Fatura aberta do cartão" : "Saldo informado pela conexão"}
          {" · atualizado em "}
          {formatDate(account.updatedAt)}
        </p>
      </Card>

      <Card
        data-slot="account-flow"
        className="grid grid-cols-2 gap-0 divide-x divide-border-subtle"
      >
        <FlowCell
          label="Entradas no período"
          isPending={summary.isPending}
          cents={summary.incomeCents}
          tone="positive"
        />
        <FlowCell
          label="Saídas no período"
          isPending={summary.isPending}
          cents={summary.expensesCents === null ? null : -summary.expensesCents}
          tone="neutral"
        />
      </Card>

      <Card data-slot="account-transactions" className="gap-0">
        <CardHeader className="flex h-11 flex-row items-center justify-between gap-3">
          <CardTitle>Transações da conta</CardTitle>
          <span className="truncate text-xs text-muted-foreground">{periodLabel}</span>
        </CardHeader>
        <CardContent className="px-2 pt-1 pb-2">
          <TransactionList
            transactions={transactions}
            categories={categories}
            empty={
              <EmptyState
                icon={ReceiptText}
                title="Nenhuma transação no período"
                description="Ajuste o período para ver outros lançamentos desta conta."
                compact
                className="border-0 bg-transparent px-0 py-6"
              />
            }
          />
        </CardContent>
        <div className="border-t border-border-subtle p-2">
          <Link
            to="/transactions"
            search={(previous) => ({ ...previous, accountId: account.id })}
            data-slot="account-transactions-link"
            className="flex min-h-11 items-center justify-between gap-2 rounded-md px-2 text-sm font-medium text-primary-ink transition-colors duration-150 active:bg-accent"
          >
            <span className="flex min-w-0 items-center gap-2">
              <ReceiptText aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">
                Ver todas em Transações
                {summary.totalCount !== null && summary.totalCount > transactions.length
                  ? ` (${formatNumber(summary.totalCount)})`
                  : ""}
              </span>
            </span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-subtle-foreground" />
          </Link>
        </div>
      </Card>

      {isCard ? (
        <AccountBillsCard billsQuery={billsQuery} />
      ) : (
        <ChartCard
          title="Evolução do saldo"
          description="Reconstruída a partir do saldo atual e das transações do período."
          isEmpty={balanceSeries.length < 2}
          empty={
            <EmptyState
              icon={Landmark}
              title="Sem histórico suficiente"
              description="São necessárias ao menos duas datas com movimentação para desenhar a evolução."
              compact
              className="border-0 bg-transparent"
            />
          }
        >
          <BalanceAreaChart data={balanceSeries} />
        </ChartCard>
      )}

      <AccountDetailsCard
        account={account}
        connection={connection}
        institutionName={institutionName}
        extraRows={
          <>
            <DetailRow label={isCard ? "Limite disponível" : "Disponível"}>
              {account.availableCents === null ? (
                <span className="text-muted-foreground">Não informado</span>
              ) : (
                <MoneyText valueCents={account.availableCents} tone="neutral" size="sm" />
              )}
            </DetailRow>
            <DetailRow label="Transações no período">
              {formatNumber(summary.totalCount ?? transactions.length)}
            </DetailRow>
          </>
        }
      />
    </div>
  );
}

function FlowCell({
  label,
  isPending,
  cents,
  tone,
}: {
  label: string;
  isPending: boolean;
  cents: number | null;
  tone: "positive" | "neutral";
}): ReactNode {
  return (
    <div className="min-w-0 p-4">
      <p className="truncate text-xs leading-4 font-medium text-muted-foreground">{label}</p>
      {isPending ? (
        <Skeleton className="mt-1.5 h-5 w-24" />
      ) : (
        <MoneyText
          valueCents={cents}
          tone={tone}
          size="md"
          weight="semibold"
          className="mt-0.5 block truncate"
        />
      )}
    </div>
  );
}
