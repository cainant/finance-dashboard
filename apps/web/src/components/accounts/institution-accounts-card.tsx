import type { Account, Connection } from "@fd/contracts";
import { Link } from "@tanstack/react-router";
import {
  ChevronRight,
  CreditCard,
  Link2,
  MoreHorizontal,
  ReceiptText,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { ComponentType } from "react";

import { DemoBadge } from "@/components/domain/demo-badge";
import { InstitutionAvatar } from "@/components/domain/institution-avatar";
import { MoneyText } from "@/components/domain/money-text";
import { StatusDot } from "@/components/domain/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  accountDisplayCents,
  accountTypeCaption,
  groupDisplayCents,
  groupHasCardDebt,
  type AccountGroup,
} from "@/lib/accounts";
import {
  connectionStatusMeta,
  formatRelativeTime,
  STATUS_TONE_BADGE_VARIANT,
} from "@/lib/connections";
import { useSyncConnectionMutation } from "@/lib/mutations";
import { cn } from "@/lib/utils";

const ACCOUNT_ICON: Partial<Record<Account["type"], ComponentType<{ className?: string }>>> = {
  credit_card: CreditCard,
  investment: TrendingUp,
};

function accountIcon(type: Account["type"]) {
  return ACCOUNT_ICON[type] ?? Wallet;
}

function lastSyncLabel(connection: Connection | null): string {
  if (!connection) {
    return "Sem conexão sincronizada";
  }

  if (!connection.lastSyncedAt) {
    return "Nunca sincronizada";
  }

  return `Sincronizada ${formatRelativeTime(connection.lastSyncedAt)}`;
}

export interface InstitutionAccountsCardProps {
  group: AccountGroup;
  connection: Connection | null;
}

/**
 * Card de uma instituição no estilo da lista "Workers & Pages": cabeçalho com
 * avatar, contagem e status, uma linha-link de 44px por conta e rodapé de
 * 40px com a última sincronização.
 */
export function InstitutionAccountsCard({ group, connection }: InstitutionAccountsCardProps) {
  const { mutation: syncMutation } = useSyncConnectionMutation();
  const status = connection ? connectionStatusMeta(connection.status) : null;
  const needsAttention = status ? status.tone === "warning" || status.tone === "danger" : false;
  const hasCardDebt = groupHasCardDebt(group);
  const displayCents = groupDisplayCents(group);
  const providerSuffix = group.provider === "pluggy" ? " · via Pluggy" : "";
  const countLabel = `${group.accounts.length} ${
    group.accounts.length === 1 ? "conta" : "contas"
  }${providerSuffix}`;
  const primaryAccountId = group.accounts[0]?.id ?? null;
  const isSyncing = syncMutation.isPending && syncMutation.variables === connection?.id;

  return (
    <Card data-slot="institution-card" className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-subtle px-4 py-2.5">
        <InstitutionAvatar name={group.institutionName} color={group.institutionColor} size="sm" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="truncate text-sm leading-5 font-medium text-foreground">
              {group.institutionName}
            </h2>
            {group.provider === "demo" ? <DemoBadge /> : null}
            {status ? (
              <Badge
                variant={STATUS_TONE_BADGE_VARIANT[status.tone]}
                title={status.description}
                data-slot="connection-status"
              >
                <StatusDot tone={status.tone} pulse={status.pulse} aria-hidden="true" />
                {status.label}
              </Badge>
            ) : null}
          </div>
          <p className="truncate text-xs leading-4 text-muted-foreground">{countLabel}</p>
        </div>

        <div className="ml-auto flex w-full items-center justify-between gap-1.5 sm:w-auto sm:justify-end">
          <div className="text-right">
            <p className="text-xs leading-4 font-medium text-muted-foreground">
              {hasCardDebt ? "Total líquido" : "Total"}
            </p>
            <MoneyText
              valueCents={displayCents}
              tone={displayCents < 0 ? "negative" : "neutral"}
              size="sm"
              weight="semibold"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Mais ações de ${group.institutionName}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={!connection || syncMutation.isPending}
                onSelect={() => {
                  if (connection) {
                    syncMutation.mutate(connection.id);
                  }
                }}
              >
                <RefreshCw aria-hidden="true" className={cn(isSyncing && "animate-spin")} />
                Sincronizar agora
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/connections" search={(previous) => previous}>
                  <Link2 aria-hidden="true" />
                  Ver conexão
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  to="/transactions"
                  search={(previous) =>
                    primaryAccountId ? { ...previous, accountId: primaryAccountId } : previous
                  }
                >
                  <ReceiptText aria-hidden="true" />
                  Ver transações
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ul>
        {group.accounts.map((account) => {
          const isCard = account.type === "credit_card";
          const Icon = accountIcon(account.type);
          const typeCaption = accountTypeCaption(account);

          return (
            <li key={account.id} className="border-t border-border-subtle first:border-t-0">
              <Link
                to="/accounts/$accountId"
                params={{ accountId: account.id }}
                search={(previous) => previous}
                data-slot="account-row"
                className={cn(
                  "relative flex h-11 items-center gap-3 px-4 text-sm",
                  "transition-colors duration-150 hover:bg-accent/60 active:bg-accent lg:active:bg-accent/60",
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-foreground">
                    {account.name}
                    {account.numberMasked ? (
                      <span className="text-muted-foreground"> · {account.numberMasked}</span>
                    ) : null}
                  </span>
                  {typeCaption ? (
                    <span className="block truncate text-xs leading-4 text-muted-foreground sm:hidden">
                      {typeCaption}
                    </span>
                  ) : null}
                </span>
                {typeCaption ? (
                  <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">
                    {typeCaption}
                  </Badge>
                ) : null}
                <MoneyText
                  valueCents={accountDisplayCents(account)}
                  tone="neutral"
                  size="sm"
                  weight="medium"
                  className="shrink-0"
                  aria-label={
                    isCard ? `Fatura aberta de ${account.name}` : `Saldo de ${account.name}`
                  }
                />
                {/* Seta de "abre o detalhe": só no mobile, onde a linha é um toque. */}
                <ChevronRight
                  aria-hidden="true"
                  className="-mr-1 size-4 shrink-0 text-subtle-foreground lg:hidden"
                />
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="flex h-10 items-center gap-2 rounded-b-[7px] border-t border-border bg-background px-4 text-xs text-muted-foreground">
        <StatusDot
          tone={status?.tone ?? "neutral"}
          pulse={status?.pulse}
          srLabel={status?.label ?? "Sem conexão"}
        />
        <span
          className={cn("min-w-0 truncate", needsAttention && "text-warning")}
          title={needsAttention ? status?.description : undefined}
        >
          {needsAttention && status
            ? `${lastSyncLabel(connection)} · ${status.description}`
            : lastSyncLabel(connection)}
        </span>
        {needsAttention ? (
          <Link
            to="/connections"
            search={(previous) => previous}
            className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-sm font-medium text-warning transition-colors duration-150 hover:text-foreground"
          >
            Ver conexão
            <ChevronRight aria-hidden="true" className="size-3" />
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
