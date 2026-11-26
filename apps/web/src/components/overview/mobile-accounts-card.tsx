import { Link } from "@tanstack/react-router";
import { ArrowRight, Wallet } from "lucide-react";

import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { InstitutionAvatar } from "@/components/domain/institution-avatar";
import { MoneyText } from "@/components/domain/money-text";
import { Skeleton } from "@/components/ui/skeleton";
import { accountDisplayCents, accountTypeCaption } from "@/lib/accounts";
import { periodOnlySearch } from "@/lib/overview-links";

import { RowChevron, SrDestination } from "./mobile-parts";
import { MOBILE_ROW_CLASS } from "./mobile-row-class";
import type { OverviewAccountsCardProps } from "./overview-accounts-card";
import { OverviewCard } from "./overview-card";

const MAX_ACCOUNTS = 5;

function AccountsSkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="flex min-h-14 items-center gap-3 px-4 py-2">
          <Skeleton className="size-8 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2.5 w-2/3" />
          </div>
          <Skeleton className="h-3 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Contas: cada linha abre o detalhe da conta (`/accounts/$accountId`). */
export function MobileAccountsCard({
  accounts,
  connections,
  isPending,
  isError,
  error,
  isFetching,
  onRetry,
}: OverviewAccountsCardProps) {
  return (
    <OverviewCard
      data-slot="overview-accounts"
      title="Contas"
      action={
        <Link
          to="/accounts"
          search={(previous) => periodOnlySearch(previous)}
          className="inline-flex min-h-11 items-center gap-1 rounded-sm px-1 text-[13px] font-medium text-muted-foreground active:text-foreground"
        >
          Ver contas
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      }
    >
      {isPending ? (
        <AccountsSkeleton />
      ) : isError ? (
        <ErrorState
          compact
          className="border-0 bg-transparent"
          title="Não foi possível carregar as contas"
          error={error}
          onRetry={onRetry}
          isRetrying={isFetching}
        />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nenhuma conta conectada"
          description="Conecte uma instituição para ver os saldos aqui."
          compact
          className="border-0 bg-transparent"
        />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {accounts.slice(0, MAX_ACCOUNTS).map((account) => {
            const connection = connections.find((item) => item.id === account.connectionId);
            const institutionName =
              account.institutionName ??
              connection?.institution?.name ??
              connection?.provider ??
              account.name;
            const typeCaption = accountTypeCaption(account);

            return (
              <li key={account.id}>
                <Link
                  to="/accounts/$accountId"
                  params={{ accountId: account.id }}
                  search={(previous) => periodOnlySearch(previous)}
                  data-slot="overview-account-row"
                  className={MOBILE_ROW_CLASS}
                >
                  <InstitutionAvatar
                    name={institutionName}
                    color={connection?.institution?.primaryColor ?? null}
                    size="sm"
                    decorative
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm leading-5 font-medium text-foreground">
                      <SrDestination>Abrir conta: </SrDestination>
                      {institutionName}
                    </span>
                    <span className="truncate text-xs leading-4 text-muted-foreground">
                      {account.name}
                      {account.numberMasked ? ` · ${account.numberMasked}` : ""}
                    </span>
                    {typeCaption ? (
                      <span className="truncate text-xs leading-4 text-subtle-foreground">
                        {typeCaption}
                      </span>
                    ) : null}
                  </span>
                  <MoneyText
                    valueCents={accountDisplayCents(account)}
                    size="sm"
                    weight="medium"
                    tone="neutral"
                    className="shrink-0"
                  />
                  <RowChevron />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </OverviewCard>
  );
}
