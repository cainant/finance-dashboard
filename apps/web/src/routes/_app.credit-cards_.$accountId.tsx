import { todayIsoDate } from "@fd/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";

import { BillList } from "@/components/credit-cards/bill-list";
import { BillTransactionsPanel } from "@/components/credit-cards/bill-transactions";
import { CardPaymentPlanCard } from "@/components/credit-cards/card-payment-plan-card";
import { DemoBadge } from "@/components/domain/demo-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { InstitutionAvatar } from "@/components/domain/institution-avatar";
import { MoneyText } from "@/components/domain/money-text";
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DetailRow } from "@/components/accounts/account-detail-parts";
import { dueLabel, UPCOMING_BILLS_WINDOW_DAYS } from "@/lib/bills";
import {
  creditCardProductLabel,
  isDueSoon,
  limitUsage,
  nextBillForCard,
  selectInitialBillId,
} from "@/lib/credit-cards";
import { formatDate, formatPercent } from "@/lib/format";
import { daysBetweenIso } from "@/lib/period";
import {
  creditCardBillsQueryOptions,
  creditCardsQueryOptions,
  upcomingBillsQueryOptions,
} from "@/lib/queries";
import { cardDetailSearchSchema } from "@/lib/search";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/credit-cards_/$accountId")({
  staticData: { title: "Cartão" },
  validateSearch: (search) => cardDetailSearchSchema.parse(search),
  loader: async ({ context }) => {
    await Promise.allSettled([context.queryClient.ensureQueryData(creditCardsQueryOptions)]);
  },
  component: CreditCardDetailPage,
});

/**
 * Detalhe do cartão/fatura (mobile e deep link): fatura atual, vencimento,
 * limite, as faturas do cartão e os lançamentos da fatura escolhida. A fatura
 * escolhida vive em `?bill=`; sem ela vale a aberta (ou a mais recente).
 * Reaproveita `/api/credit-cards`, `/api/credit-cards/:id/bills` e
 * `/api/bills/:id/transactions`: nenhum contrato novo.
 */
function CreditCardDetailPage() {
  const { accountId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const cardsQuery = useQuery(creditCardsQueryOptions);
  const billsQuery = useQuery(creditCardBillsQueryOptions(accountId));
  const upcomingQuery = useQuery(
    upcomingBillsQueryOptions({ days: UPCOMING_BILLS_WINDOW_DAYS, limit: 5 }),
  );

  const card = cardsQuery.data?.data.find((item) => item.accountId === accountId) ?? null;
  const bills = billsQuery.data?.data ?? [];
  const activeBillId =
    search.bill !== undefined && bills.some((bill) => bill.id === search.bill)
      ? search.bill
      : selectInitialBillId(bills);
  const activeBill = bills.find((bill) => bill.id === activeBillId) ?? null;
  const nextBill = nextBillForCard(upcomingQuery.data?.data ?? [], accountId);

  if (cardsQuery.isPending) {
    return <CardDetailSkeleton />;
  }

  if (cardsQuery.isError) {
    return (
      <div className="space-y-4">
        <PageHeader title="Cartão" />
        <ErrorState
          title="Não foi possível carregar o cartão"
          error={cardsQuery.error}
          onRetry={() => void cardsQuery.refetch()}
          isRetrying={cardsQuery.isFetching}
        />
      </div>
    );
  }

  if (!card) {
    return (
      <div className="space-y-4">
        <PageHeader title="Cartão" />
        <EmptyState
          icon={CreditCard}
          title="Cartão não encontrado"
          description="O cartão pode ter sido removido com a conexão. Volte para a lista de cartões."
          action={
            <Button asChild>
              <Link to="/credit-cards" search={(previous) => previous}>
                Ver cartões
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const institution = card.account.institutionName ?? card.account.name;
  const product = creditCardProductLabel(card);
  const caption = [product, card.account.numberMasked].filter(Boolean).join(" · ");
  const usage = limitUsage(card);
  const ratio = usage?.ratio ?? null;
  const soon = nextBill ? isDueSoon(nextBill.daysUntilDue) : false;
  const today = todayIsoDate();
  // Sem fatura futura na janela, usa o vencimento da fatura exibida (se ainda
  // não venceu) para o destaque; senão, só o dia do cadastro.
  const dueDays =
    nextBill?.daysUntilDue ?? (activeBill ? daysBetweenIso(today, activeBill.dueDate) : null);

  return (
    <div className="space-y-4" data-slot="credit-card-detail">
      <header className="flex items-center gap-3">
        <InstitutionAvatar name={institution} size="lg" decorative />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 text-xl leading-7 font-semibold tracking-[-0.015em] text-foreground">
              {card.account.name}
            </h1>
            {card.account.provider === "demo" ? <DemoBadge /> : null}
          </div>
          <p className="truncate text-sm leading-5 text-muted-foreground">
            {institution} · {caption}
          </p>
        </div>
      </header>

      <Card data-slot="card-hero" className="gap-0 p-4">
        <p className="text-xs leading-4 font-medium text-muted-foreground">Fatura atual</p>
        <MoneyText
          valueCents={card.account.balanceCents}
          tone="neutral"
          size="2xl"
          weight="semibold"
          className="mt-0.5 block tracking-[-0.02em]"
        />
        <p
          data-slot="card-due"
          data-due-soon={soon || undefined}
          className={cn(
            "mt-1 text-xs leading-4",
            soon ? "font-medium text-warning" : "text-muted-foreground",
          )}
        >
          {nextBill
            ? `Vence ${formatDate(nextBill.dueDate)} · ${dueLabel(nextBill.daysUntilDue)}`
            : dueDays !== null && activeBill
              ? `Vence ${formatDate(activeBill.dueDate)} · ${dueLabel(dueDays)}`
              : card.dueDay
                ? `Vence todo dia ${card.dueDay}`
                : "Vencimento não informado"}
        </p>

        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Uso do limite</span>
            <span className="font-medium text-foreground tabular-nums">
              {ratio === null
                ? "Limite não informado"
                : formatPercent(ratio, { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={`Uso do limite do cartão ${card.account.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={ratio === null ? undefined : Math.round(ratio * 100)}
            aria-valuetext={
              ratio === null
                ? "Limite não informado"
                : `${formatPercent(ratio, { maximumFractionDigits: 0 })} do limite usado`
            }
            className="h-1 w-full overflow-hidden rounded-full bg-border-subtle"
          >
            <div
              className={cn(
                "h-full rounded-full",
                ratio !== null && ratio >= 0.8 ? "bg-warning" : "bg-primary",
              )}
              style={{ width: `${(ratio ?? 0) * 100}%` }}
            />
          </div>
        </div>
      </Card>

      <Card data-slot="card-facts" className="gap-0 px-4">
        <dl>
          <DetailRow label="Fechamento">
            {activeBill?.closingDate
              ? formatDate(activeBill.closingDate)
              : card.closingDay
                ? `Todo dia ${card.closingDay}`
                : "—"}
          </DetailRow>
          <DetailRow label="Vencimento">
            {activeBill
              ? formatDate(activeBill.dueDate)
              : card.dueDay
                ? `Todo dia ${card.dueDay}`
                : "—"}
          </DetailRow>
          <DetailRow label="Limite total">
            <MoneyText valueCents={card.limitCents} tone="neutral" size="sm" weight="medium" />
          </DetailRow>
          <DetailRow label="Limite disponível">
            <MoneyText
              valueCents={card.availableLimitCents}
              tone="neutral"
              size="sm"
              weight="medium"
            />
          </DetailRow>
        </dl>
      </Card>

      <CardPaymentPlanCard accountId={card.account.id} />

      <Card data-slot="bills-card" className="gap-0">
        <CardHeader className="flex h-11 flex-row items-center justify-between gap-3">
          <CardTitle>Faturas</CardTitle>
          <span className="truncate text-xs text-muted-foreground">
            Toque para ver os lançamentos
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {billsQuery.isPending ? (
            <div className="space-y-3 px-4 py-4" aria-hidden="true">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-9 w-full" />
              ))}
            </div>
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
              onSelect={(billId) =>
                void navigate({
                  search: (previous) => ({ ...previous, bill: billId }),
                  replace: true,
                  resetScroll: false,
                })
              }
            />
          )}
        </CardContent>
      </Card>

      <BillTransactionsPanel
        billId={activeBillId}
        billLabel={activeBill ? formatDate(activeBill.dueDate) : undefined}
      />
    </div>
  );
}

function CardDetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="flex items-center gap-3" aria-hidden="true">
        <Skeleton className="size-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
      </div>
      <Skeleton className="h-36 rounded-lg" aria-hidden="true" />
      <Skeleton className="h-40 rounded-lg" aria-hidden="true" />
      <Skeleton className="h-48 rounded-lg" aria-hidden="true" />
    </div>
  );
}
