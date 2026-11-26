import { MoneyText } from "@/components/domain/money-text";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export interface TransactionsMobileSummaryProps {
  incomeCents?: number;
  expensesCents?: number;
  totalCount?: number;
  /** Filtro de pendentes: pendentes nunca entram em entradas/saídas. */
  pendingOnly?: boolean;
  isLoading: boolean;
  isError: boolean;
  /** O resumo exibido é o do filtro anterior (a requisição nova ainda corre). */
  isUpdating: boolean;
  onRetry: () => void;
}

/**
 * Linha de resumo do resultado filtrado: entradas e saídas de **todo** o
 * filtro (agregado em SQL na API, o mesmo que o card do desktop), não só dos
 * lançamentos já carregados. Respeita "ocultar valores" pelo `MoneyText`.
 * Altura fixa: carregar, atualizar ou falhar não desloca a lista.
 */
export function TransactionsMobileSummary({
  incomeCents,
  expensesCents,
  totalCount,
  pendingOnly = false,
  isLoading,
  isError,
  isUpdating,
  onRetry,
}: TransactionsMobileSummaryProps) {
  return (
    <div
      data-slot="transactions-mobile-summary"
      aria-label="Resumo do resultado filtrado"
      aria-busy={isLoading || isUpdating}
      className="flex min-h-8 items-center justify-between gap-3 text-xs text-muted-foreground"
    >
      {isLoading ? (
        <>
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3.5 w-28" />
        </>
      ) : isError ? (
        <>
          <span>Não foi possível carregar o resumo.</span>
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onRetry}>
            Tentar novamente
          </Button>
        </>
      ) : pendingOnly ? (
        <>
          <span>
            {(totalCount ?? 0).toLocaleString("pt-BR")}{" "}
            {totalCount === 1 ? "lançamento pendente" : "lançamentos pendentes"}
          </span>
          <span>não entram nos totais</span>
        </>
      ) : (
        <>
          <span data-slot="summary-income" className="flex items-baseline gap-1.5">
            Entradas
            <MoneyText
              valueCents={incomeCents}
              tone="positive"
              signDisplay="always"
              size="sm"
              className="text-xs"
            />
          </span>
          <span data-slot="summary-expenses" className="flex items-baseline gap-1.5">
            Saídas
            <MoneyText
              valueCents={expensesCents === undefined ? undefined : -expensesCents || 0}
              signDisplay="always"
              size="sm"
              className="text-xs"
            />
          </span>
        </>
      )}
    </div>
  );
}
