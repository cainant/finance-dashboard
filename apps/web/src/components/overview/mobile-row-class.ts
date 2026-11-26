import { cn } from "@/lib/utils";

/**
 * Linha tocável das listas da Visão geral no mobile: alvo ≥ 56px (acima dos
 * 44px mínimos), estado pressionado por cor (sem transform/sombra) e anel de
 * foco por dentro, para não ser cortado pela borda do card.
 */
export const MOBILE_ROW_CLASS = cn(
  "flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left",
  "transition-colors duration-150 active:bg-accent",
  "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none focus-visible:ring-inset",
);
