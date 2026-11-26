import { memo } from "react";

import { formatTransactionsCount } from "@/components/transactions/transactions-utils";
import { Button } from "@/components/ui/button";

/** Andamento do carregamento em segundo plano das páginas seguintes. */
export type TransactionsLoadState = "idle" | "loading" | "error" | "done";

export interface TransactionsFooterProps {
  loaded: number;
  totalCount?: number;
  loadState: TransactionsLoadState;
  onRetry: () => void;
}

/**
 * Rodapé comum à tabela (desktop) e aos cartões (mobile). A lista baixa as
 * páginas seguintes sozinha, então aqui aparece só o andamento: a contagem do
 * filtro inteiro e, se um lote falhar, a opção de tentar de novo.
 */
export const TransactionsFooter = memo(function TransactionsFooter({
  loaded,
  totalCount,
  loadState,
  onRetry,
}: TransactionsFooterProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle px-4 py-2.5 text-[13px] text-muted-foreground">
      <span data-slot="transactions-count" className="tabular-nums">
        {formatTransactionsCount(loaded, totalCount)}
      </span>
      {loadState === "loading" ? (
        <span data-slot="transactions-loading" aria-live="polite">
          Carregando…
        </span>
      ) : loadState === "error" ? (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : loadState === "done" ? (
        <span>Fim da lista</span>
      ) : null}
    </div>
  );
});
