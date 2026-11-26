import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";

import { buildAttentionItems } from "@/components/overview/attention-items";
import { savingsRate } from "@/lib/analytics";
import { UPCOMING_BILLS_WINDOW_DAYS } from "@/lib/bills";
import { hasLiveConnections } from "@/lib/connections";
import { useConnectDemo } from "@/lib/mutations";
import { periodSelectionFromSearch, resolvePeriod } from "@/lib/period";
import { useDemoProviderEnabled } from "@/lib/providers";
import {
  accountsQueryOptions,
  cardReservesQueryOptions,
  categoriesQueryOptions,
  categoryBreakdownQueryOptions,
  connectionsQueryOptions,
  monthlyQueryOptions,
  netWorthQueryOptions,
  overviewQueryOptions,
  recentTransactionsQueryOptions,
  uncategorizedCountQueryOptions,
  upcomingBillsQueryOptions,
} from "@/lib/queries";

/**
 * Dados da Visão geral, compartilhados pelo layout desktop e pelo mobile: as
 * mesmas consultas (filtro global de período) e as mesmas regras derivadas.
 */
export function useOverviewData() {
  const search = useSearch({ from: "/_app" });
  const period = resolvePeriod(periodSelectionFromSearch(search));
  const periodInput = { from: period.from, to: period.to };

  const overviewQuery = useQuery(overviewQueryOptions(periodInput));
  const netWorthQuery = useQuery(netWorthQueryOptions(periodInput));
  const monthlyQuery = useQuery(monthlyQueryOptions(12));
  const breakdownQuery = useQuery(categoryBreakdownQueryOptions(periodInput, "expense"));
  const recentQuery = useQuery(recentTransactionsQueryOptions(periodInput, 6));
  const connectionsQuery = useQuery(connectionsQueryOptions);
  const accountsQuery = useQuery(accountsQueryOptions);
  const billsQuery = useQuery(
    upcomingBillsQueryOptions({ days: UPCOMING_BILLS_WINDOW_DAYS, limit: 5 }),
  );
  const categoriesQuery = useQuery(categoriesQueryOptions);
  const uncategorizedQuery = useQuery(uncategorizedCountQueryOptions);
  const reservesQuery = useQuery(cardReservesQueryOptions);

  const { connect, step, progress } = useConnectDemo();
  const demoEnabled = useDemoProviderEnabled();

  const connections = connectionsQuery.data?.data ?? [];
  const bills = billsQuery.data?.data ?? [];
  const accounts = accountsQuery.data?.data ?? [];
  const monthly = monthlyQuery.data?.data ?? [];
  // Cartões de demonstração não contam quando o provider demo está desligado
  // (mesma regra da sidebar). `null` enquanto as contas carregam: o vazio das
  // próximas faturas fica neutro em vez de pedir para conectar um cartão.
  const hasCreditCards = accountsQuery.isSuccess
    ? accounts.some(
        (account) => account.type === "credit_card" && (demoEnabled || account.provider !== "demo"),
      )
    : null;
  const connectionsLoaded = connectionsQuery.isSuccess;
  // Uma única regra para o cabeçalho e para o convite de boas-vindas: só há
  // estado vazio quando nenhuma conexão está viva (todas desconectadas).
  const hasLiveConnection = hasLiveConnections(connections);
  // Conectar só é primária sem instituição viva; com dados na tela o cabeçalho
  // não repete um CTA azul que compete com o período. Enquanto a consulta não
  // resolve (ou falha), fica secundário em vez de piscar azul no F5.
  const connectIsPrimary = connectionsLoaded && !hasLiveConnection;
  const hasDemoConnection = connections.some((connection) => connection.provider === "demo");

  const kpis = overviewQuery.data?.kpis;
  const breakdown = breakdownQuery.data?.data ?? [];
  const recent = recentQuery.data?.data ?? [];
  const categories = categoriesQuery.data?.data ?? [];
  const netWorth = netWorthQuery.data?.data ?? [];

  const savingsRateValue = savingsRate(
    kpis?.income.currentCents ?? 0,
    kpis?.result.currentCents ?? 0,
  );

  const incomeSeries = monthly.map((month) => month.incomeCents);
  const expenseSeries = monthly.map((month) => Math.abs(month.expenseCents));
  const resultSeries = monthly.map((month) => month.netCents);
  const netWorthSeries = netWorth.map((point) => point.netWorthCents);

  // A contagem sem categoria é opcional: enquanto carrega ou em erro, a faixa
  // não mostra o item (e o link só existe quando há o que classificar).
  const uncategorizedCount = uncategorizedQuery.isSuccess
    ? (uncategorizedQuery.data?.count ?? 0)
    : null;
  // Reservas são opcionais na faixa: erro ou carregando = sem item (não bloqueia).
  const reserves = reservesQuery.data?.data.reserves ?? [];
  const attentionItems = buildAttentionItems({
    connections,
    bills,
    uncategorizedCount,
    reserves,
  });
  const attentionLoading =
    connectionsQuery.isPending || billsQuery.isPending || uncategorizedQuery.isPending;

  return {
    period,
    overviewQuery,
    netWorthQuery,
    monthlyQuery,
    breakdownQuery,
    recentQuery,
    connectionsQuery,
    accountsQuery,
    billsQuery,
    categoriesQuery,
    connect,
    step,
    progress,
    demoEnabled,
    connections,
    bills,
    accounts,
    monthly,
    hasCreditCards,
    connectionsLoaded,
    hasLiveConnection,
    connectIsPrimary,
    hasDemoConnection,
    kpis,
    breakdown,
    recent,
    categories,
    netWorth,
    savingsRateValue,
    incomeSeries,
    expenseSeries,
    resultSeries,
    netWorthSeries,
    attentionItems,
    attentionLoading,
  };
}

export type OverviewData = ReturnType<typeof useOverviewData>;
