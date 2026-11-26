import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CreditCard, Plus } from "lucide-react";
import { useState } from "react";

import { BillList } from "@/components/credit-cards/bill-list";
import { BillTransactionsPanel } from "@/components/credit-cards/bill-transactions";
import { CardPaymentPlanCard } from "@/components/credit-cards/card-payment-plan-card";
import { CardReservesCard } from "@/components/credit-cards/card-reserves-card";
import { CreditCardRow } from "@/components/credit-cards/credit-card-row";
import { CreditCardTile } from "@/components/credit-cards/credit-card-tile";
import { UpcomingBillsCard } from "@/components/credit-cards/upcoming-bills";
import { DemoBadge } from "@/components/domain/demo-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { HeaderActionLabel } from "@/components/domain/header-action-label";
import { KpiCard } from "@/components/domain/kpi-card";
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { dueLabel, UPCOMING_BILLS_WINDOW_DAYS } from "@/lib/bills";
import { hasLiveConnections } from "@/lib/connections";
import {
  creditCardTotals,
  nextBillForCard,
  nextDueBill,
  selectInitialBillId,
} from "@/lib/credit-cards";
import { creditCardsEmptyDescription } from "@/lib/demo-visibility";
import { formatDate } from "@/lib/format";
import { useMediaQuery } from "@/lib/hooks";
import { periodOnlySearch } from "@/lib/overview-links";
import { useDemoProviderEnabled } from "@/lib/providers";
import {
  connectionsQueryOptions,
  creditCardBillsQueryOptions,
  creditCardsQueryOptions,
  upcomingBillsQueryOptions,
} from "@/lib/queries";
import { creditCardsSearchSchema } from "@/lib/search";

const MOBILE_QUERY = "(max-width: 1023.98px)";

export const Route = createFileRoute("/_app/credit-cards")({
  staticData: { title: "Cartões" },
  validateSearch: (search) => creditCardsSearchSchema.parse(search),
  // Abaixo de `lg` o cartão tem tela própria: links antigos e favoritos com
  // `?card=&bill=` abrem o detalhe (substituindo a entrada, sem piscar a lista).
  // `card` inexistente (ou falha ao carregar) cai na lista, sem erro.
  beforeLoad: async ({ context, search }) => {
    if (!search.card || !window.matchMedia(MOBILE_QUERY).matches) {
      return;
    }

    const cards = await context.queryClient
      .ensureQueryData(creditCardsQueryOptions)
      .then((response) => response.data)
      .catch(() => []);

    if (!cards.some((card) => card.accountId === search.card)) {
      return;
    }

    throw redirect({
      to: "/credit-cards/$accountId",
      params: { accountId: search.card },
      search: { ...periodOnlySearch(search), ...(search.bill ? { bill: search.bill } : {}) },
      replace: true,
    });
  },
  component: CreditCardsPage,
});

function CreditCardsPage() {
  const search = Route.useSearch();
  const cardsQuery = useQuery(creditCardsQueryOptions);
  const upcomingQuery = useQuery(
    upcomingBillsQueryOptions({ days: UPCOMING_BILLS_WINDOW_DAYS, limit: 5 }),
  );
  const connectionsQuery = useQuery(connectionsQueryOptions);
  const demoEnabled = useDemoProviderEnabled();
  // Abaixo de `lg` cada cartão é uma linha que abre o detalhe (`/credit-cards/$id`);
  // seleção de cartão e fatura na própria página é do desktop. `null` (primeira
  // medição) conta como desktop para não atrasar as consultas dele.
  const isMobile = useMediaQuery(MOBILE_QUERY) === true;

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);

  const cards = cardsQuery.data?.data ?? [];
  // `?card=` (link da Visão geral) só vale se o cartão existe; a escolha na tela vence.
  const requestedCardId = cards.find((card) => card.accountId === search.card)?.accountId ?? null;
  const activeCardId = selectedCardId ?? requestedCardId ?? cards[0]?.accountId ?? null;
  const activeCard = cards.find((card) => card.accountId === activeCardId) ?? null;

  const billsQuery = useQuery({
    ...creditCardBillsQueryOptions(activeCardId ?? ""),
    enabled: Boolean(activeCardId) && !isMobile,
  });

  const bills = billsQuery.data?.data ?? [];
  // A fatura da URL (`?bill=`) só vale para o cartão que a contém.
  const requestedBillId = selectedBillId ?? search.bill ?? null;
  const activeBillId =
    requestedBillId !== null && bills.some((bill) => bill.id === requestedBillId)
      ? requestedBillId
      : selectInitialBillId(bills);
  const activeBill = bills.find((bill) => bill.id === activeBillId) ?? null;

  const totals = creditCardTotals(cards);
  const upcomingBills = upcomingQuery.data?.data ?? [];
  const nextBill = nextDueBill(upcomingBills);
  const hasDemoCard = cards.some((card) => card.account.provider === "demo");
  // Cartões demo não contam com o provider desligado; `null` enquanto carrega
  // para o vazio não afirmar que não há cartão.
  const hasCreditCards = cardsQuery.isSuccess
    ? cards.some((card) => demoEnabled || card.account.provider !== "demo")
    : null;
  // Sem instituição viva, adicionar cartão é o convite primário; com uma
  // conexão ativa vira atalho secundário do cabeçalho. Enquanto a consulta não
  // resolve (ou falha), fica secundário em vez de piscar azul no F5.
  const connectIsPrimary =
    connectionsQuery.isSuccess && !hasLiveConnections(connectionsQuery.data?.data ?? []);

  const upcomingCard = (
    <UpcomingBillsCard
      bills={upcomingBills}
      hasCreditCards={hasCreditCards}
      days={UPCOMING_BILLS_WINDOW_DAYS}
      isPending={upcomingQuery.isPending}
      isError={upcomingQuery.isError}
      error={upcomingQuery.error}
      isFetching={upcomingQuery.isFetching}
      onRetry={() => void upcomingQuery.refetch()}
    />
  );

  // No mobile os cartões vêm primeiro (são o conteúdo da tela); o resumo desce.
  const summarySection = (
    <section aria-label="Resumo dos cartões" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Limite total"
        valueCents={totals.limitCents}
        tone="neutral"
        hint={
          totals.cards === 0
            ? "Nenhum cartão conectado"
            : `${totals.cardsWithLimit} de ${totals.cards} ${
                totals.cards === 1 ? "cartão" : "cartões"
              } com limite`
        }
        isLoading={cardsQuery.isPending}
      />
      <KpiCard
        label="Limite disponível"
        valueCents={totals.availableCents}
        tone="neutral"
        hint={
          totals.availableCents === null
            ? "Aguardando limite dos cartões"
            : "Soma do limite disponível informado"
        }
        isLoading={cardsQuery.isPending}
      />
      <KpiCard
        label="Fatura atual"
        valueCents={totals.usedCents}
        tone="neutral"
        hint={totals.cards === 0 ? "Sem fatura aberta" : "Soma das faturas abertas dos cartões"}
        isLoading={cardsQuery.isPending}
      />
      <KpiCard
        label="Próximo vencimento"
        format="date"
        value={nextBill?.dueDate ?? null}
        hint={
          nextBill
            ? `${dueLabel(nextBill.daysUntilDue)} · ${nextBill.accountName}`
            : "Nenhuma fatura futura"
        }
        isLoading={upcomingQuery.isPending}
      />
    </section>
  );

  function handleSelectCard(accountId: string) {
    setSelectedCardId(accountId);
    setSelectedBillId(null);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cartões"
        badge={hasDemoCard ? <DemoBadge /> : null}
        description="Limites, faturas abertas e vencimentos dos cartões de crédito."
        actions={
          <Button asChild variant={connectIsPrimary ? "default" : "outline"}>
            <Link to="/connections" search={(previous) => previous}>
              <Plus aria-hidden="true" />
              <HeaderActionLabel label="Adicionar cartão" shortLabel="Adicionar" />
            </Link>
          </Button>
        }
      />

      {isMobile ? null : summarySection}

      {cardsQuery.isError ? (
        <ErrorState
          title="Não foi possível carregar os cartões"
          error={cardsQuery.error}
          onRetry={() => void cardsQuery.refetch()}
          isRetrying={cardsQuery.isFetching}
        />
      ) : cardsQuery.isPending ? (
        <CreditCardsSkeleton />
      ) : cards.length === 0 ? (
        <Card className="gap-0">
          <CardContent className="p-4 sm:p-6">
            <EmptyState
              icon={CreditCard}
              title="Nenhum cartão conectado"
              description={creditCardsEmptyDescription(demoEnabled)}
              className="border-0 bg-transparent"
              action={
                <Button asChild>
                  <Link to="/connections" search={(previous) => previous}>
                    <Plus aria-hidden="true" />
                    Conectar instituição
                  </Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : isMobile ? (
        <>
          <section aria-label="Seus cartões" className="space-y-3">
            {cards.map((card) => (
              <CreditCardRow
                key={card.accountId}
                card={card}
                nextBill={nextBillForCard(upcomingBills, card.accountId)}
              />
            ))}
          </section>
          <CardReservesCard cards={cards} />
          {upcomingCard}
        </>
      ) : (
        <>
          <section aria-label="Seus cartões" className="grid gap-4 md:grid-cols-2">
            {cards.map((card) => (
              <CreditCardTile
                key={card.accountId}
                card={card}
                selected={card.accountId === activeCardId}
                onSelect={handleSelectCard}
              />
            ))}
          </section>

          <CardReservesCard cards={cards} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
            <Card data-slot="bills-card" className="min-w-0 gap-0">
              <CardHeader className="flex h-11 flex-row items-center justify-between gap-3">
                <CardTitle>Faturas</CardTitle>
                <span className="truncate text-xs text-muted-foreground">
                  {activeCard ? activeCard.account.name : "Nenhum cartão selecionado"}
                </span>
              </CardHeader>

              <CardContent className="p-0">
                {billsQuery.isPending ? (
                  <BillsSkeleton />
                ) : billsQuery.isError ? (
                  <ErrorState
                    compact
                    className="border-0 bg-transparent px-0"
                    title="Não foi possível carregar as faturas"
                    error={billsQuery.error}
                    onRetry={() => void billsQuery.refetch()}
                    isRetrying={billsQuery.isFetching}
                  />
                ) : (
                  <BillList
                    bills={bills}
                    selectedBillId={activeBillId}
                    onSelect={setSelectedBillId}
                  />
                )}
              </CardContent>
            </Card>

            <div className="min-w-0 space-y-4">
              {upcomingCard}
              {activeCard ? (
                <CardPaymentPlanCard key={activeCard.accountId} accountId={activeCard.accountId} />
              ) : null}
            </div>
          </div>

          <BillTransactionsPanel
            billId={activeBillId}
            billLabel={activeBill ? formatDate(activeBill.dueDate) : undefined}
          />
        </>
      )}
      {isMobile ? summarySection : null}
    </div>
  );
}

function CreditCardsSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index} className="gap-0">
            <div className="flex h-11 items-center gap-2.5 border-b border-border-subtle px-4">
              <Skeleton className="size-8 rounded-md" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2.5 w-24" />
              </div>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-3 gap-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
              <Skeleton className="h-1 w-full rounded-full" />
            </div>
            <div className="flex h-10 items-center gap-2 rounded-b-[7px] border-t border-border bg-background px-4">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <Card className="gap-0">
          <div className="flex h-11 items-center border-b border-border-subtle px-4">
            <Skeleton className="h-4 w-32" />
          </div>
          <BillsSkeleton />
        </Card>
        <Card className="gap-0">
          <div className="flex h-11 items-center border-b border-border-subtle px-4">
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="space-y-3 p-4">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function BillsSkeleton() {
  return (
    <div className="space-y-3 px-4 py-4" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-4 rounded-sm" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-2.5 w-28" />
          </div>
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
