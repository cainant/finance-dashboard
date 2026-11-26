import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { ArrowRight, FlaskConical, Plug, ServerCog } from "lucide-react";

import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { StatusDot } from "@/components/domain/status-dot";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { providersQueryOptions } from "@/lib/queries";

import { SettingsCard } from "./settings-section";

/** Status das integrações disponíveis (`GET /api/providers`). */
export function ProvidersSection() {
  const search = useSearch({ from: "/_app" });
  const providersQuery = useQuery(providersQueryOptions);
  const providers = providersQuery.data?.data ?? [];

  return (
    <SettingsCard
      title="Integrações"
      description="O que está disponível para conectar."
      action={
        <Button asChild variant="ghost" size="sm">
          <Link to="/connections" search={search}>
            Gerenciar
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      {providersQuery.isPending ? (
        <ProvidersSkeleton />
      ) : providersQuery.isError ? (
        <div className="p-4">
          <ErrorState
            compact
            className="border-0 bg-transparent px-0"
            title="Não foi possível carregar as integrações"
            error={providersQuery.error}
            onRetry={() => void providersQuery.refetch()}
            isRetrying={providersQuery.isFetching}
          />
        </div>
      ) : providers.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={ServerCog}
            title="Nenhuma integração disponível"
            description="Nada para conectar no momento."
            compact
            className="border-0 bg-transparent px-0 py-6"
          />
        </div>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {providers.map((provider) => (
            <li key={provider.id} className="flex min-h-11 items-center gap-3 px-4 py-2">
              <span
                className="grid size-7 shrink-0 place-items-center rounded-md border border-border-subtle bg-surface-2 text-subtle-foreground"
                aria-hidden="true"
              >
                {provider.id === "demo" ? (
                  <FlaskConical className="size-3.5" />
                ) : (
                  <Plug className="size-3.5" />
                )}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="flex flex-wrap items-center gap-2 text-sm leading-5 font-medium text-foreground">
                  <span className="truncate">{provider.name}</span>
                </p>
                <p className="text-xs leading-4 text-muted-foreground">
                  {provider.description ?? "Sem detalhes."}
                </p>
                {provider.id === "pluggy" && !provider.configured ? (
                  <p className="text-xs leading-4 text-warning">
                    O MeuPluggy ainda não está configurado aqui.
                  </p>
                ) : null}
              </div>
              <StatusDot
                tone={provider.configured ? "success" : "warning"}
                label={provider.configured ? "Configurado" : "Não configurado"}
                className="shrink-0"
              />
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}

function ProvidersSkeleton() {
  return (
    <div className="space-y-4 p-4" aria-hidden="true">
      {Array.from({ length: 2 }).map((_, index) => (
        <div key={index} className="flex items-start gap-3">
          <Skeleton className="size-7 shrink-0 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2.5 w-56" />
          </div>
          <Skeleton className="h-2.5 w-24" />
        </div>
      ))}
    </div>
  );
}
