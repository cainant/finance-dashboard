import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";

import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { StatusDot } from "@/components/domain/status-dot";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_TONE_BADGE_VARIANT, SYNC_RUN_STATUS_META, syncRunSummary } from "@/lib/connections";
import { formatDateTime } from "@/lib/format";
import { syncRunsQueryOptions } from "@/lib/queries";
import { cn } from "@/lib/utils";

import { syncRunDurationLabel } from "./connection-view";

/**
 * Histórico de sincronizações de uma conexão. Só é montado quando o usuário
 * expande o painel, então a primeira consulta acontece sob demanda.
 */
export function SyncRunsPanel({ connectionId }: { connectionId: string }) {
  const query = useQuery(syncRunsQueryOptions(connectionId));
  const runs = query.data?.data ?? [];

  return (
    <div data-slot="sync-runs-panel">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <History aria-hidden="true" className="size-3.5 text-subtle-foreground" />
          Últimas sincronizações
        </p>
        {query.isFetching && !query.isPending ? (
          <span className="text-xs text-muted-foreground" role="status">
            Atualizando…
          </span>
        ) : null}
      </div>

      {query.isPending ? (
        <SyncRunsSkeleton />
      ) : query.isError ? (
        <ErrorState
          compact
          className="border-0 bg-transparent px-0 py-4"
          title="Não foi possível carregar o histórico"
          error={query.error}
          onRetry={() => void query.refetch()}
          isRetrying={query.isFetching}
        />
      ) : runs.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nenhuma sincronização registrada"
          description="O histórico aparece depois do primeiro sync desta conexão."
          compact
          className="border-0 bg-transparent px-0 py-4"
        />
      ) : (
        <ol className="divide-y divide-border-subtle rounded-md border border-border-subtle bg-card">
          {runs.map((run) => {
            const meta = SYNC_RUN_STATUS_META[run.status];
            const duration = syncRunDurationLabel(run.startedAt, run.finishedAt);

            return (
              <li key={run.id} className="px-3 py-2 first:rounded-t-md last:rounded-b-md">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <Badge variant={STATUS_TONE_BADGE_VARIANT[meta.tone]}>
                    <StatusDot tone={meta.tone} aria-hidden="true" />
                    {meta.label}
                  </Badge>
                  <span className="text-muted-foreground">{formatDateTime(run.startedAt)}</span>
                  {duration ? <span className="text-muted-foreground">· {duration}</span> : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{syncRunSummary(run.stats)}</p>
                {run.errorMessage || run.errorCode ? (
                  <p className="mt-1 text-xs break-words text-negative" role="note">
                    {run.errorMessage ?? run.errorCode}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function SyncRunsSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className={cn("space-y-1.5", index > 0 && "border-t border-border-subtle pt-2")}
        >
          <Skeleton className="h-2.5 w-44" />
          <Skeleton className="h-2.5 w-32" />
        </div>
      ))}
    </div>
  );
}
