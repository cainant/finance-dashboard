import type { ProviderInfo } from "@fd/contracts";
import { useQuery } from "@tanstack/react-query";

import { providersQueryOptions } from "./queries";

type ProviderLike = Pick<ProviderInfo, "id" | "configured">;

/**
 * O modo demonstração só existe quando a API o lista como provider configurado.
 * Em produção `ENABLE_DEMO_PROVIDER=false`, então `/api/providers` não devolve
 * `demo` e nenhuma tela pode oferecer CTA, painel ou selo de demonstração.
 */
export function isDemoProviderEnabled(
  providers: ReadonlyArray<ProviderLike> | null | undefined,
): boolean {
  return providers?.some((provider) => provider.id === "demo" && provider.configured) ?? false;
}

/** Versão reativa sobre `GET /api/providers` (a query é compartilhada/cacheada). */
export function useDemoProviderEnabled(): boolean {
  const providersQuery = useQuery(providersQueryOptions);
  return isDemoProviderEnabled(providersQuery.data?.data);
}

export function isPluggyConfigured(
  providers: ReadonlyArray<ProviderLike> | null | undefined,
): boolean {
  return providers?.some((provider) => provider.id === "pluggy" && provider.configured) ?? false;
}
