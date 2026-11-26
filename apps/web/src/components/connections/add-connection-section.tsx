import type { ProviderInfo } from "@fd/contracts";
import { FlaskConical, Plug, RefreshCw } from "lucide-react";

import { DemoBadge } from "@/components/domain/demo-badge";
import { StatusDot } from "@/components/domain/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { connectionsIntro } from "@/lib/demo-visibility";
import type { ConnectDemoProgress, ConnectDemoStep } from "@/lib/mutations";
import { findProvider } from "@/lib/pluggy-connect";

import { demoConnectProgressLabel, demoConnectStatusLabel } from "./connection-view";
import { PluggyConnectPanel } from "./pluggy-connect-panel";

export interface AddConnectionSectionProps {
  providers: readonly ProviderInfo[] | null;
  /** `false` em produção: nenhum cartão, CTA ou texto de demonstração. */
  demoEnabled: boolean;
  /**
   * Sem nenhuma conexão MeuPluggy ainda: o aviso das 24h aparece aqui também,
   * porque quem conecta pela primeira vez precisa saber (o topo da lista só
   * mostra o aviso quando já existe conexão).
   */
  showMeuPluggyNotice: boolean;
  providersPending: boolean;
  providersError: unknown;
  providersFetching: boolean;
  onRetryProviders: () => void;
  onConnectDemo: () => void;
  demoPending: boolean;
  demoStep: ConnectDemoStep;
  demoProgress: ConnectDemoProgress | null;
}

/** Cartões de "Adicionar conexão": demonstração (quando habilitada) e MeuPluggy. */
export function AddConnectionSection({
  providers,
  demoEnabled,
  showMeuPluggyNotice,
  providersPending,
  providersError,
  providersFetching,
  onRetryProviders,
  onConnectDemo,
  demoPending,
  demoStep,
  demoProgress,
}: AddConnectionSectionProps) {
  const pluggyProvider = findProvider(providers, "pluggy");
  const pluggyConfigured = Boolean(pluggyProvider?.configured);

  return (
    <section
      id="adicionar-conexao"
      aria-label="Adicionar conexão"
      data-slot="add-connection-section"
      className="scroll-mt-20 space-y-4"
    >
      <div className="space-y-1">
        <h2 className="text-sm leading-5 font-semibold text-foreground">Adicionar conexão</h2>
        <p className="max-w-2xl text-[13px] leading-5 text-muted-foreground">
          {connectionsIntro(demoEnabled)}
        </p>
      </div>

      <div className={demoEnabled ? "grid gap-4 xl:grid-cols-2" : "grid gap-4"}>
        {demoEnabled ? (
          <Card data-slot="demo-connect-card" className="gap-0">
            <CardHeader className="flex h-11 flex-row items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-md border border-warning/40 bg-card text-warning"
                  aria-hidden="true"
                >
                  <FlaskConical className="size-4" />
                </span>
                <CardTitle className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate">Provider demo</span>
                  <DemoBadge />
                </CardTitle>
              </div>
              <Badge variant="positive">
                <StatusDot tone="success" aria-hidden="true" />
                Disponível
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-[13px] leading-5 text-muted-foreground">
                3 instituições fictícias · ~12 meses de transações
              </p>
              <p className="text-[13px] leading-5 text-muted-foreground">
                Dados determinísticos para explorar contas, cartões, faturas e categorias sem
                conectar nada. Todo lançamento do demo aparece com o selo Demonstração.
              </p>
              <div className="space-y-2">
                <Button onClick={onConnectDemo} disabled={demoPending}>
                  <FlaskConical aria-hidden="true" />
                  {demoPending
                    ? demoConnectProgressLabel(demoStep, demoProgress)
                    : "Conectar demonstração"}
                </Button>
                {demoPending ? (
                  <p className="flex items-center gap-2 text-xs text-primary" role="status">
                    <RefreshCw aria-hidden="true" className="size-3.5 animate-spin" />
                    {demoConnectStatusLabel(demoStep, demoProgress)}
                  </p>
                ) : null}
                {!demoPending && demoStep === "done" ? (
                  <p className="text-xs text-positive" role="status">
                    Demonstração conectada. A conexão aparece na lista acima.
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card data-slot="pluggy-connect-card" className="gap-0">
          <CardHeader className="flex h-11 flex-row items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="grid size-8 shrink-0 place-items-center rounded-md border border-info/40 bg-card text-info"
                aria-hidden="true"
              >
                <Plug className="size-4" />
              </span>
              <CardTitle className="truncate">MeuPluggy · Open Finance</CardTitle>
            </div>
            {providersPending ? (
              <Skeleton className="h-5 w-24 rounded-full" />
            ) : providersError ? (
              <Badge variant="secondary">
                <StatusDot tone="neutral" aria-hidden="true" />
                Indisponível
              </Badge>
            ) : (
              <Badge variant={pluggyConfigured ? "positive" : "warning"}>
                <StatusDot tone={pluggyConfigured ? "success" : "warning"} aria-hidden="true" />
                {pluggyConfigured ? "Configurado" : "Não configurado"}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-[13px] leading-5 text-muted-foreground">
              Leia suas contas reais autorizadas em meu.pluggy.ai
            </p>
            <PluggyConnectPanel
              provider={pluggyProvider}
              isPending={providersPending}
              isError={Boolean(providersError)}
              error={providersError}
              isFetching={providersFetching}
              onRetry={onRetryProviders}
              showRefreshNotice={showMeuPluggyNotice}
            />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
