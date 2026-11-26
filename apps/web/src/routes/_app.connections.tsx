import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { Plus, RefreshCw, ShieldCheck } from "lucide-react";

import { AddConnectionSection } from "@/components/connections/add-connection-section";
import { meuPluggyNoticePlacement } from "@/components/connections/connection-view";
import { ConnectionsList } from "@/components/connections/connections-list";
import { DemoBadge } from "@/components/domain/demo-badge";
import { HeaderActionLabel } from "@/components/domain/header-action-label";
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { hasLiveConnections } from "@/lib/connections";
import { connectionsPageDescription } from "@/lib/demo-visibility";
import { useConnectDemo, useSyncConnectionMutation } from "@/lib/mutations";
import { isDemoProviderEnabled } from "@/lib/providers";
import { deriveSyncStatus, pickSyncTarget } from "@/lib/sync-status";
import { cn } from "@/lib/utils";
import {
  accountsQueryOptions,
  connectionsQueryOptions,
  providersQueryOptions,
} from "@/lib/queries";

export const Route = createFileRoute("/_app/connections")({
  staticData: { title: "Conexões" },
  component: ConnectionsPage,
});

function ConnectionsPage() {
  const search = useSearch({ from: "/_app" });
  const connectionsQuery = useQuery(connectionsQueryOptions);
  const accountsQuery = useQuery(accountsQueryOptions);
  const providersQuery = useQuery(providersQueryOptions);
  const demo = useConnectDemo();
  const sync = useSyncConnectionMutation();

  const connections = connectionsQuery.data?.data ?? [];
  const providers = providersQuery.data?.data ?? null;
  const demoEnabled = isDemoProviderEnabled(providers);
  // Mesmo critério das outras telas: só desconectadas = nada vivo para
  // reconectar, então adicionar conexão volta a ser a ação primária.
  const connectIsPrimary = connectionsQuery.isSuccess && !hasLiveConnections(connections);
  const hasDemoConnection = connections.some((connection) => connection.provider === "demo");
  const notices = meuPluggyNoticePlacement(connections);
  const syncStatus = deriveSyncStatus(connections);
  const syncTarget = pickSyncTarget(connections);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Conexões"
        badge={hasDemoConnection ? <DemoBadge /> : null}
        description={connectionsPageDescription(demoEnabled)}
        actions={
          <Button asChild variant={connectIsPrimary ? "default" : "outline"}>
            <a href="#adicionar-conexao">
              <Plus aria-hidden="true" />
              <HeaderActionLabel label="Adicionar conexão" shortLabel="Adicionar" />
            </a>
          </Button>
        }
      />

      <ConnectionsList
        connections={connections}
        accounts={accountsQuery.data?.data ?? []}
        accountsPending={accountsQuery.isPending}
        showMeuPluggyNotice={notices.list}
        demoEnabled={demoEnabled}
        isPending={connectionsQuery.isPending}
        isError={connectionsQuery.isError}
        error={connectionsQuery.error}
        isFetching={connectionsQuery.isFetching}
        onRetry={() => void connectionsQuery.refetch()}
        onConnectDemo={() => demo.connect.mutate()}
        demoPending={demo.connect.isPending}
        demoStep={demo.step}
        demoProgress={demo.progress}
        overviewSearch={search}
      />

      {/* Mobile: sincronizar ao alcance do polegar (protótipo D); "Adicionar" já está no cabeçalho. */}
      {connections.length > 0 ? (
        <div data-slot="connections-mobile-actions" className="space-y-2 lg:hidden">
          <p className="text-center text-xs leading-4 text-muted-foreground">{syncStatus.text}</p>
          <Button
            className="min-h-12 w-full"
            disabled={!syncTarget || sync.mutation.isPending}
            onClick={() => {
              if (syncTarget) {
                sync.mutation.mutate(syncTarget.id);
              }
            }}
          >
            <RefreshCw
              aria-hidden="true"
              className={cn(sync.mutation.isPending && "animate-spin")}
            />
            Sincronizar agora
          </Button>
        </div>
      ) : null}

      <AddConnectionSection
        providers={providers}
        demoEnabled={demoEnabled}
        showMeuPluggyNotice={notices.add}
        providersPending={providersQuery.isPending}
        providersError={providersQuery.error}
        providersFetching={providersQuery.isFetching}
        onRetryProviders={() => void providersQuery.refetch()}
        onConnectDemo={() => demo.connect.mutate()}
        demoPending={demo.connect.isPending}
        demoStep={demo.step}
        demoProgress={demo.progress}
      />

      <p className="flex flex-wrap items-center gap-1.5 text-xs leading-5 text-muted-foreground">
        <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0 text-subtle-foreground" />
        Suas senhas bancárias nunca passam pelo Lumen: você autoriza seus bancos no MeuPluggy e o
        Lumen recebe apenas os dados que você liberou.
      </p>
    </div>
  );
}
