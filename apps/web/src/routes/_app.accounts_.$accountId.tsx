import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useParams, useSearch } from "@tanstack/react-router";
import { Landmark, ReceiptText, Wallet } from "lucide-react";
import { useMemo } from "react";

import { AccountDetailMobile } from "@/components/accounts/account-detail-mobile";
import { AccountBillsCard, AccountDetailsCard } from "@/components/accounts/account-detail-parts";
import { BalanceAreaChart } from "@/components/charts/net-worth-area-chart";
import { ChartCard } from "@/components/domain/chart-card";
import { DemoBadge } from "@/components/domain/demo-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { InstitutionAvatar } from "@/components/domain/institution-avatar";
import { HeaderActionLabel } from "@/components/domain/header-action-label";
import { KpiCard } from "@/components/domain/kpi-card";
import { PageHeader } from "@/components/domain/page-header";
import { PeriodControl } from "@/components/domain/period-control";
import { TransactionList } from "@/components/domain/transaction-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { accountTypeLabel, deriveBalanceSeries, isDemoAccount } from "@/lib/accounts";
import { useMediaQuery } from "@/lib/hooks";
import { periodSelectionFromSearch, resolvePeriod } from "@/lib/period";
import {
  accountTransactionsQueryOptions,
  accountsQueryOptions,
  categoriesQueryOptions,
  connectionsQueryOptions,
  creditCardBillsQueryOptions,
  transactionsSummaryQueryOptions,
} from "@/lib/queries";

export const Route = createFileRoute("/_app/accounts_/$accountId")({
  staticData: { title: "Conta" },
  loader: async ({ context }) => {
    await Promise.allSettled([
      context.queryClient.ensureQueryData(accountsQueryOptions),
      context.queryClient.ensureQueryData(categoriesQueryOptions),
    ]);
  },
  component: AccountDetailPage,
});

function AccountDetailPage() {
  const { accountId } = useParams({ from: "/_app/accounts_/$accountId" });
  const search = useSearch({ from: "/_app" });
  const period = resolvePeriod(periodSelectionFromSearch(search));
  const periodInput = { from: period.from, to: period.to };

  const accountsQuery = useQuery(accountsQueryOptions);
  const connectionsQuery = useQuery(connectionsQueryOptions);
  const categoriesQuery = useQuery(categoriesQueryOptions);
  const transactionsQuery = useQuery(accountTransactionsQueryOptions(accountId, periodInput, 100));
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  // Totais do período em SQL: o mobile mostra entradas e saídas sem depender
  // das 100 linhas exibidas. No desktop a consulta fica desligada.
  const summaryQuery = useQuery({
    ...transactionsSummaryQueryOptions({ ...periodInput, accountId }),
    enabled: isDesktop === false,
  });

  const account = accountsQuery.data?.data.find((item) => item.id === accountId) ?? null;
  const connections = connectionsQuery.data?.data ?? [];
  const connection = connections.find((item) => item.id === account?.connectionId) ?? null;

  const billsQuery = useQuery({
    ...creditCardBillsQueryOptions(accountId),
    enabled: account?.type === "credit_card",
  });

  const transactions = useMemo(() => transactionsQuery.data?.data ?? [], [transactionsQuery.data]);

  const balanceSeries = useMemo(
    () => (account ? deriveBalanceSeries(transactions, account.balanceCents) : []),
    [account, transactions],
  );

  const isLoading = accountsQuery.isPending || transactionsQuery.isPending || isDesktop === null;
  const isError = accountsQuery.isError || transactionsQuery.isError;
  const error = accountsQuery.error ?? transactionsQuery.error;

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="space-y-2" aria-hidden="true">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-lg" />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <div className="space-y-4">
            <Skeleton className="h-64 rounded-lg" />
            <Skeleton className="h-72 rounded-lg" />
          </div>
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <PageHeader title="Conta" />
        <ErrorState
          title="Não foi possível carregar a conta"
          error={error}
          onRetry={() => {
            void accountsQuery.refetch();
            void transactionsQuery.refetch();
          }}
          isRetrying={accountsQuery.isFetching || transactionsQuery.isFetching}
        />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="space-y-4">
        <PageHeader title="Conta" />
        <EmptyState
          icon={Wallet}
          title="Conta não encontrada"
          description="A conta pode ter sido removida com a conexão. Volte para a lista de contas."
          action={
            <Button asChild>
              <Link to="/accounts" search={(previous) => previous}>
                Ver contas
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const isCard = account.type === "credit_card";
  const demo = isDemoAccount(account, connections);
  const institutionName = account.institutionName ?? connection?.institution?.name ?? null;
  const numberMasked = account.numberMasked ?? null;

  if (isDesktop === false) {
    return (
      <AccountDetailMobile
        account={account}
        connection={connection}
        institutionName={institutionName}
        demo={demo}
        periodLabel={period.label}
        transactions={transactions}
        categories={categoriesQuery.data?.data ?? []}
        balanceSeries={balanceSeries}
        billsQuery={billsQuery}
        summary={{
          isPending: summaryQuery.isPending,
          incomeCents: summaryQuery.data?.incomeCents ?? null,
          expensesCents: summaryQuery.data?.expensesCents ?? null,
          totalCount: summaryQuery.data?.totalCount ?? null,
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={account.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {institutionName ? (
              <span className="inline-flex items-center gap-2">
                <InstitutionAvatar
                  name={institutionName}
                  color={connection?.institution?.primaryColor}
                  size="xs"
                />
                {institutionName}
              </span>
            ) : null}
            {institutionName ? (
              <span aria-hidden="true" className="text-subtle-foreground">
                ·
              </span>
            ) : null}
            <span>{accountTypeLabel(account.type, account.subtype)}</span>
            {numberMasked ? (
              <>
                <span aria-hidden="true" className="text-subtle-foreground">
                  ·
                </span>
                <span className="tabular-nums">{numberMasked}</span>
              </>
            ) : null}
            {demo ? <DemoBadge className="ml-0.5" /> : null}
          </span>
        }
        actions={
          <>
            <PeriodControl />
            <Button asChild variant="outline">
              <Link to="/transactions" search={(previous) => ({ ...previous, accountId })}>
                <ReceiptText aria-hidden="true" />
                <HeaderActionLabel label="Ver transações" shortLabel="Ver" />
              </Link>
            </Button>
          </>
        }
      />

      <section aria-label="Resumo da conta" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={isCard ? "Fatura atual" : "Saldo atual"}
          valueCents={account.balanceCents}
          tone="neutral"
          hint={isCard ? "Fatura aberta do cartão" : "Saldo informado pela conexão"}
        />
        <KpiCard
          label={isCard ? "Limite disponível" : "Disponível"}
          valueCents={account.availableCents}
          tone="neutral"
          hint={
            account.availableCents === null
              ? "O provider não informou este valor"
              : isCard
                ? "Limite livre para compras"
                : "Valor disponível para uso"
          }
        />
        <KpiCard
          label="Transações no período"
          format="number"
          value={transactions.length}
          hint={period.label}
        />
        <KpiCard label="Última atualização" format="date" value={account.updatedAt} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div className="min-w-0 space-y-4">
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

          <Card data-slot="account-transactions" className="gap-0">
            <CardHeader className="flex h-11 flex-row items-center justify-between gap-3">
              <CardTitle>Transações da conta</CardTitle>
              <div className="flex min-w-0 items-center gap-2">
                <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                  {period.label} · até 100 lançamentos
                </span>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/transactions" search={(previous) => ({ ...previous, accountId })}>
                    Filtrar
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-2 pt-1 pb-2">
              <TransactionList
                transactions={transactions}
                categories={categoriesQuery.data?.data ?? []}
                empty={
                  <EmptyState
                    icon={ReceiptText}
                    title="Nenhuma transação no período"
                    description="Ajuste o período global para ver outros lançamentos desta conta."
                    compact
                    className="border-0 bg-transparent px-0 py-6"
                  />
                }
              />
            </CardContent>
          </Card>
        </div>

        <aside aria-label="Detalhes da conta" className="min-w-0">
          <AccountDetailsCard
            account={account}
            connection={connection}
            institutionName={institutionName}
          />
        </aside>
      </div>
    </div>
  );
}
