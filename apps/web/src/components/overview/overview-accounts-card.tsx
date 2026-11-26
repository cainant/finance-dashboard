import type { Account, Connection } from "@fd/contracts";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Wallet } from "lucide-react";

import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { InstitutionAvatar } from "@/components/domain/institution-avatar";
import { MoneyText } from "@/components/domain/money-text";
import { Skeleton } from "@/components/ui/skeleton";
import { accountDisplayCents, accountTypeCaption } from "@/lib/accounts";

import { OverviewCard } from "./overview-card";

const MAX_ACCOUNTS = 5;

export interface OverviewAccountsCardProps {
  accounts: readonly Account[];
  connections: readonly Connection[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  onRetry: () => void;
}

function AccountsSkeleton() {
  return (
    <div className="space-y-1 px-4 py-2" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="flex min-h-11 items-center gap-3">
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

/** Coluna lateral: contas conectadas com avatar da instituição e saldo. */
export function OverviewAccountsCard({
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
          search={(previous) => previous}
          className="inline-flex items-center gap-1 rounded-sm text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
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
              <li key={account.id} className="flex min-h-11 items-center gap-3 px-4 py-2">
                <InstitutionAvatar
                  name={institutionName}
                  color={connection?.institution?.primaryColor ?? null}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm leading-5 font-medium text-foreground">
                    {institutionName}
                  </p>
                  <p className="truncate text-xs leading-4 text-muted-foreground">
                    {account.name}
                    {account.numberMasked ? ` · ${account.numberMasked}` : ""}
                  </p>
                  {typeCaption ? (
                    <p className="truncate text-xs leading-4 text-subtle-foreground">
                      {typeCaption}
                    </p>
                  ) : null}
                </div>
                <MoneyText
                  valueCents={accountDisplayCents(account)}
                  size="sm"
                  weight="medium"
                  tone="neutral"
                  className="shrink-0"
                />
              </li>
            );
          })}
        </ul>
      )}
    </OverviewCard>
  );
}
