import type { Account, Connection } from "@fd/contracts";
import { ChevronDown, History, PlugZap, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";

import { DemoBadge } from "@/components/domain/demo-badge";
import { InstitutionAvatar } from "@/components/domain/institution-avatar";
import { StatusDot } from "@/components/domain/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { connectionStatusMeta, STATUS_TONE_BADGE_VARIANT } from "@/lib/connections";
import { formatDate } from "@/lib/format";
import { useSyncConnectionMutation } from "@/lib/mutations";
import { cn } from "@/lib/utils";

import {
  consentExpiryLabel,
  connectionLastSyncLabel,
  connectionPrimaryName,
  connectionProviderFreshnessLabel,
  connectionProviderMeta,
  isMeuPluggyConnection,
  syncSliceLabel,
} from "./connection-view";
import { DeleteConnectionDialog } from "./delete-connection-dialog";
import { ReconnectConnectionDialog } from "./reconnect-connection-dialog";
import { SyncRunsPanel } from "./sync-runs-panel";

export interface ConnectionCardProps {
  connection: Connection;
  /** Contas desta conexão (já filtradas pela lista). */
  accounts: readonly Account[];
  /** Enquanto `true`, o título de um item MeuPluggy é esqueleto, não "MeuPluggy". */
  accountsPending: boolean;
  /** Título já desempatado pela lista (dois itens do mesmo banco). */
  title: string;
}

/**
 * Mobile: os botões de ação viram alvos de 44px. "Reconectar" e "Atualizar"
 * dividem a primeira linha; "Histórico" e "Remover" ficam na seguinte.
 */
const MOBILE_HALF = "max-md:min-h-11 max-md:min-w-0 max-md:flex-1 max-md:basis-[calc(50%-0.25rem)]";

/** Card de uma conexão: cabeçalho de 44px com status, metadados e ações. */
export function ConnectionCard({
  connection,
  accounts,
  accountsPending,
  title,
}: ConnectionCardProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reconnectOpen, setReconnectOpen] = useState(false);
  const { mutation: syncMutation, progress } = useSyncConnectionMutation();

  const status = connectionStatusMeta(connection.status);
  const isDemo = connection.provider === "demo";
  const isPluggy = connection.provider === "pluggy";
  const isMeuPluggy = isPluggy && isMeuPluggyConnection(connection);
  const canReconnect =
    isPluggy && ["login_required", "error", "outdated"].includes(connection.status);
  const isSyncing = syncMutation.isPending && syncMutation.variables === connection.id;
  const slice = progress?.connectionId === connection.id ? progress.slice : null;
  const sliceLabel = syncSliceLabel(slice);
  const historyId = `sync-runs-${connection.id}`;
  const consentLabel = consentExpiryLabel(connection.consentExpiresAt);
  const providerFreshnessLabel = connectionProviderFreshnessLabel(connection.providerUpdatedAt);

  // Sem instituição ainda visível (contas carregando), o título do MeuPluggy não
  // pode mostrar o conector: é justamente o nome repetido que este card corrige.
  const titlePending = accountsPending && isMeuPluggy;

  // No MeuPluggy o título já é a instituição do item, então a antiga linha
  // "Contas autorizadas" repetiria o mesmo nome. Nos demais providers ela lista
  // as contas que vieram na conexão.
  const accountLabels =
    isPluggy && !isMeuPluggy
      ? [...new Set(accounts.map((account) => account.institutionName ?? account.name))]
      : [];
  const accountSummary =
    accountLabels.length > 0
      ? `${accountLabels.slice(0, 3).join(" · ")}${accountLabels.length > 3 ? ` +${accountLabels.length - 3}` : ""}`
      : null;

  return (
    <li>
      <Card data-slot="connection-card" className="gap-0">
        <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <InstitutionAvatar
              name={connectionPrimaryName(connection, accounts)}
              color={connection.institution?.primaryColor ?? null}
              size="sm"
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3
                  className="truncate text-sm leading-5 font-medium text-foreground"
                  title={titlePending ? undefined : title}
                >
                  {titlePending ? (
                    <span
                      aria-hidden="true"
                      data-slot="skeleton"
                      className="inline-block h-3.5 w-28 animate-pulse rounded-sm bg-muted/70 align-middle"
                    />
                  ) : (
                    title
                  )}
                </h3>
                {isDemo ? <DemoBadge /> : null}
                <Badge
                  variant={STATUS_TONE_BADGE_VARIANT[status.tone]}
                  title={status.description}
                  data-slot="connection-status"
                >
                  <StatusDot tone={status.tone} pulse={status.pulse} aria-hidden="true" />
                  {status.label}
                </Badge>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {connectionProviderMeta(connection)} ·{" "}
                {connectionLastSyncLabel(connection.lastSyncedAt)} · Criada em{" "}
                {formatDate(connection.createdAt)}
                {connection.statusDetail ? ` · ${connection.statusDetail}` : ""}
              </p>
              {providerFreshnessLabel ? (
                <p
                  className="text-xs leading-5 text-muted-foreground"
                  data-slot="connection-provider-freshness"
                >
                  {providerFreshnessLabel}
                </p>
              ) : null}
              {accountSummary ? (
                <p
                  className="truncate text-xs leading-5 text-muted-foreground"
                  title={accountSummary}
                >
                  Contas: {accountSummary}
                </p>
              ) : null}
              {consentLabel ? (
                <p className="text-xs leading-5 text-muted-foreground">{consentLabel}</p>
              ) : null}
              {sliceLabel ? (
                <p className="text-xs leading-5 text-primary" role="status">
                  {sliceLabel}
                </p>
              ) : null}
            </div>
          </div>

          <div
            className="flex flex-wrap items-center gap-2 md:shrink-0"
            data-slot="connection-actions"
          >
            {canReconnect ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReconnectOpen(true)}
                className={MOBILE_HALF}
              >
                <PlugZap aria-hidden="true" />
                Reconectar
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMutation.mutate(connection.id)}
              disabled={syncMutation.isPending}
              className={MOBILE_HALF}
              aria-label={`${isPluggy ? "Atualizar" : "Sincronizar"} ${title}`}
              title={
                isMeuPluggy
                  ? "Relê os dados já autorizados no MeuPluggy (sem PATCH /items)."
                  : undefined
              }
            >
              <RefreshCw aria-hidden="true" className={cn(isSyncing && "animate-spin")} />
              {sliceLabel
                ? `Importando… fatia ${slice}`
                : isSyncing
                  ? isPluggy
                    ? "Atualizando…"
                    : "Sincronizando…"
                  : isPluggy
                    ? "Atualizar"
                    : "Sincronizar"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHistoryOpen((current) => !current)}
              aria-expanded={historyOpen}
              aria-controls={historyOpen ? historyId : undefined}
              aria-label={`Histórico de ${title}`}
              className="max-md:min-h-11 max-md:min-w-0 max-md:flex-1 max-md:basis-[calc(100%-3.25rem)]"
            >
              <History aria-hidden="true" />
              Histórico
              <ChevronDown
                aria-hidden="true"
                className={cn("transition-transform duration-150", historyOpen && "rotate-180")}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setDeleteOpen(true)}
              aria-label={`Remover conexão ${title}`}
              title="Remover conexão"
              className="text-muted-foreground hover:text-negative max-md:size-11"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        </div>

        {historyOpen ? (
          <div
            id={historyId}
            className="rounded-b-[7px] border-t border-border-subtle bg-background/60 p-3"
          >
            <SyncRunsPanel connectionId={connection.id} />
          </div>
        ) : null}
      </Card>

      <ReconnectConnectionDialog
        connection={connection}
        title={title}
        open={reconnectOpen}
        onOpenChange={setReconnectOpen}
      />
      <DeleteConnectionDialog
        connection={connection}
        title={title}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </li>
  );
}
