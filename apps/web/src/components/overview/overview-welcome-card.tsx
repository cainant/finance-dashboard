import { Link } from "@tanstack/react-router";
import { ArrowRight, FlaskConical, Plug, RefreshCw } from "lucide-react";

import { DemoBadge } from "@/components/domain/demo-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { overviewConnectCopy, overviewPrimaryActionLabel } from "@/lib/demo-visibility";

export interface OverviewWelcomeCardProps {
  demoEnabled: boolean;
  isConnecting: boolean;
  /** Texto do passo atual do fluxo demo; `null` quando parado. */
  statusLabel?: string | null;
  onConnect: () => void;
}

/**
 * Estado sem conexões: card de boas-vindas no topo da Visão geral. Mantém a
 * lógica de demonstração (conectar demo quando o provider existe) e o convite
 * ao MeuPluggy em produção.
 */
export function OverviewWelcomeCard({
  demoEnabled,
  isConnecting,
  statusLabel,
  onConnect,
}: OverviewWelcomeCardProps) {
  const copy = overviewConnectCopy(demoEnabled);

  return (
    <Card data-slot="overview-welcome" className="border-primary/25 bg-primary/[0.035]">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary"
            aria-hidden="true"
          >
            {demoEnabled ? <FlaskConical className="size-5" /> : <Plug className="size-5" />}
          </span>

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base leading-6 font-semibold text-foreground">{copy.title}</h2>
              {demoEnabled ? <DemoBadge /> : null}
            </div>
            <p className="max-w-2xl text-sm leading-5 text-muted-foreground">{copy.description}</p>
            {demoEnabled && isConnecting && statusLabel ? (
              <p className="flex items-center gap-2 text-xs text-primary" role="status">
                <RefreshCw aria-hidden="true" className="size-3.5 animate-spin" />
                {statusLabel}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {demoEnabled ? (
            <Button onClick={onConnect} disabled={isConnecting} className="sm:min-w-44">
              {isConnecting ? "Conectando…" : overviewPrimaryActionLabel(true)}
            </Button>
          ) : (
            <Button asChild className="sm:min-w-44">
              <Link to="/connections" search={(previous) => previous}>
                <Plug aria-hidden="true" />
                {overviewPrimaryActionLabel(false)}
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to="/connections" search={(previous) => previous}>
              Ver conexões
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
