import type { Account, Connection } from "@fd/contracts";
import { Link } from "@tanstack/react-router";
import { FlaskConical, Link2, Plug } from "lucide-react";

import { DemoBadge } from "@/components/domain/demo-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { connectionsEmptyDescription } from "@/lib/demo-visibility";
import type { ConnectDemoProgress, ConnectDemoStep } from "@/lib/mutations";
import type { PeriodSearch } from "@/lib/period";

import { ConnectionCard } from "./connection-card";
import {
  connectionTitles,
  demoConnectProgressLabel,
  MEU_PLUGGY_REFRESH_NOTICE,
} from "./connection-view";

export interface ConnectionsListProps {
  connections: readonly Connection[];
  /** Contas do usuário: alimentam o título (instituição autorizada) de cada card. */
  accounts: readonly Account[];
  accountsPending: boolean;
  /** Aviso das 24h no topo da lista (`meuPluggyNoticePlacement().list`). */
  showMeuPluggyNotice: boolean;
  /** `false` em produção: o empty state só oferece o MeuPluggy. */
  demoEnabled: boolean;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  onRetry: () => void;
  onConnectDemo: () => void;
  demoPending: boolean;
  demoStep: ConnectDemoStep;
  demoProgress: ConnectDemoProgress | null;
  overviewSearch: PeriodSearch;
}

/** Lista principal de conexões: um card por instituição, com empty state e histórico. */
export function ConnectionsList({
  connections,
  accounts,
  accountsPending,
  showMeuPluggyNotice,
  demoEnabled,
  isPending,
  isError,
  error,
  isFetching,
  onRetry,
  onConnectDemo,
  demoPending,
  demoStep,
  demoProgress,
  overviewSearch,
}: ConnectionsListProps) {
  const titles = connectionTitles(connections, accounts);

  return (
    <section aria-label="Suas conexões" data-slot="connections-list" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-sm leading-5 font-semibold text-foreground">Suas conexões</h2>
          <p className="max-w-2xl text-[13px] leading-5 text-muted-foreground">
            {demoEnabled
              ? "Instituições que alimentam o painel."
              : "Instituições que alimentam o painel com dados reais do MeuPluggy."}
          </p>
          {showMeuPluggyNotice ? (
            <p
              className="max-w-2xl text-xs leading-5 text-muted-foreground"
              data-slot="meupluggy-refresh-notice"
            >
              {MEU_PLUGGY_REFRESH_NOTICE}
            </p>
          ) : null}
        </div>
        {!isPending && !isError ? (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {connections.length} {connections.length === 1 ? "conexão" : "conexões"}
          </span>
        ) : null}
      </div>

      {isPending ? (
        <ConnectionsSkeleton />
      ) : isError ? (
        <ErrorState
          title="Não foi possível carregar as conexões"
          error={error}
          onRetry={onRetry}
          isRetrying={isFetching}
        />
      ) : connections.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="Nenhuma conexão ativa"
          description={
            demoEnabled ? (
              <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
                {connectionsEmptyDescription(true)}
                <DemoBadge />
              </span>
            ) : (
              connectionsEmptyDescription(false)
            )
          }
          action={
            <>
              {demoEnabled ? (
                <Button onClick={onConnectDemo} disabled={demoPending}>
                  <FlaskConical aria-hidden="true" />
                  {demoPending
                    ? demoConnectProgressLabel(demoStep, demoProgress)
                    : "Conectar demonstração"}
                </Button>
              ) : null}
              <Button asChild variant={demoEnabled ? "outline" : "default"}>
                <a href="#adicionar-conexao">
                  <Plug aria-hidden="true" />
                  Conectar MeuPluggy
                </a>
              </Button>
              <Button asChild variant="ghost">
                <Link to="/" search={overviewSearch}>
                  Ver visão geral
                </Link>
              </Button>
            </>
          }
        />
      ) : (
        <ul className="space-y-4">
          {connections.map((connection) => (
            <ConnectionCard
              key={connection.id}
              connection={connection}
              accounts={accounts.filter((account) => account.connectionId === connection.id)}
              accountsPending={accountsPending}
              title={titles.get(connection.id) ?? connection.id}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ConnectionsSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: 2 }).map((_, index) => (
        <Card key={index} className="gap-0">
          <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Skeleton className="size-8 rounded-md" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-2.5 w-64" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-24 rounded-lg" />
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
