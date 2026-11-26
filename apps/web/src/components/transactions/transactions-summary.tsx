import type { Category } from "@fd/contracts";
import { useMemo } from "react";

import { MoneyText } from "@/components/domain/money-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { categoryColor } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

/** Mensagem única das duas colunas quando o agregado do filtro falha. */
function SummaryError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs leading-4 text-muted-foreground">Não foi possível calcular o resumo.</p>
      {onRetry ? (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Tentar de novo
        </Button>
      ) : null}
    </div>
  );
}

export interface TransactionsSummaryProps {
  /**
   * Valores do agregado da API. `undefined` (resumo ainda não chegou ou
   * falhou) renderiza "—": nunca zero, que pareceria um total verdadeiro.
   */
  incomeCents?: number;
  /** Positivo, como a API devolve (`GET /api/transactions/summary`). */
  expensesCents?: number;
  resultCents?: number;
  isLoading?: boolean;
  isError?: boolean;
  /** O snapshot é do filtro anterior (ou está sendo revalidado). */
  isUpdating?: boolean;
  onRetry?: () => void;
}

/**
 * Coluna lateral da lista de transações: totais de **todo** o filtro, iguais
 * aos KPIs da visão geral (só efetivadas, sem transferências). O cálculo é da
 * API (uma agregação em SQL), então carregar mais páginas não muda os números.
 */
export function TransactionsSummary({
  incomeCents,
  expensesCents,
  resultCents,
  isLoading = false,
  isError = false,
  isUpdating = false,
  onRetry,
}: TransactionsSummaryProps) {
  // `-0` formata como "-R$ 0,00": normaliza para 0 antes de inverter o sinal.
  const expensesValue =
    expensesCents === undefined ? undefined : expensesCents === 0 ? 0 : -expensesCents;

  return (
    <Card
      data-slot="transactions-summary"
      data-updating={isUpdating || undefined}
      aria-busy={isUpdating || undefined}
      className="min-w-0 p-4"
    >
      <h2 className="text-sm leading-5 font-semibold text-foreground">Resumo do filtro</h2>
      <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
        efetivadas, sem transferências
      </p>

      {isLoading ? (
        <div className="mt-3 space-y-3" aria-hidden="true">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ) : (
        <>
          <dl className="mt-2">
            <SummaryRow label="Receitas" valueCents={incomeCents} tone="positive" />
            <SummaryRow label="Despesas" valueCents={expensesValue} tone="neutral" />
            <SummaryRow
              label="Resultado"
              valueCents={resultCents}
              tone={resultCents !== undefined && resultCents < 0 ? "negative" : "neutral"}
            />
          </dl>
          {isError ? <SummaryError onRetry={onRetry} /> : null}
        </>
      )}
    </Card>
  );
}

function SummaryRow({
  label,
  valueCents,
  tone,
}: {
  label: string;
  valueCents: number | undefined;
  tone: "positive" | "negative" | "neutral" | "auto";
}) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 border-b border-dashed border-border-subtle last:border-b-0">
      <dt className="min-w-0 truncate text-[13px] leading-5 text-muted-foreground">{label}</dt>
      <dd className="shrink-0">
        <MoneyText valueCents={valueCents} tone={tone} size="sm" weight="medium" />
      </dd>
    </div>
  );
}

export interface TransactionsCategoriesProps {
  /**
   * Lançamentos por `categoryId` em todo o filtro (agregado da API).
   * `undefined` = resumo indisponível (carregando ou com erro).
   */
  categoryCounts?: ReadonlyMap<string, number>;
  /** Lançamentos do filtro sem categoria. */
  uncategorizedCount?: number;
  categories: readonly Category[];
  activeCategoryId?: string;
  uncategorized?: boolean;
  onSelectCategory: (categoryId: string) => void;
  onSelectUncategorized: () => void;
  isLoading?: boolean;
  isError?: boolean;
  /** O snapshot é do filtro anterior (ou está sendo revalidado). */
  isUpdating?: boolean;
  onRetry?: () => void;
}

/**
 * Categorias clicáveis: aplicam `categoryId` (ou "Sem categoria") na lista.
 * As contagens vêm do resumo agregado (filtro inteiro, não só a página
 * carregada); a ordem prioriza a categoria mais usada. Sem agregado, a lista
 * fica vazia em vez de mostrar contagens que não são do filtro.
 */
export function TransactionsCategories({
  categoryCounts,
  uncategorizedCount = 0,
  categories,
  activeCategoryId,
  uncategorized = false,
  onSelectCategory,
  onSelectUncategorized,
  isLoading = false,
  isError = false,
  isUpdating = false,
  onRetry,
}: TransactionsCategoriesProps) {
  const ordered = useMemo(() => {
    return [...categories].sort((a, b) => {
      const byUsage = (categoryCounts?.get(b.id) ?? 0) - (categoryCounts?.get(a.id) ?? 0);
      return byUsage !== 0 ? byUsage : a.name.localeCompare(b.name, "pt-BR");
    });
  }, [categories, categoryCounts]);

  // Só entram categorias usadas no recorte; a categoria do filtro ativo fica
  // visível mesmo com contagem zero para o chip fazer sentido.
  const visibleCategories = useMemo(
    () =>
      ordered.filter(
        (category) =>
          (categoryCounts?.get(category.id) ?? 0) > 0 || category.id === activeCategoryId,
      ),
    [activeCategoryId, ordered, categoryCounts],
  );
  const showUncategorized = uncategorizedCount > 0 || uncategorized;

  return (
    <Card
      data-slot="transactions-categories"
      data-updating={isUpdating || undefined}
      aria-busy={isUpdating || undefined}
      className="min-w-0 p-4"
    >
      <h2 className="text-sm leading-5 font-semibold text-foreground">Categorias</h2>
      <p className="mt-0.5 text-xs leading-4 text-muted-foreground">clique para filtrar</p>

      {isLoading ? (
        <div className="mt-3 space-y-2" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-7 w-full" />
          ))}
        </div>
      ) : isError ? (
        <SummaryError onRetry={onRetry} />
      ) : (
        // Altura automática: a lista longa nunca é cortada no fim do card.
        // O card fica mais alto, mas todas as categorias continuam acessíveis
        // sem rolagem escondida.
        <div className="-mx-2 mt-2 space-y-0.5" data-slot="transactions-categories-list">
          {showUncategorized ? (
            <CategoryRow
              label="Sem categoria"
              color={categoryColor(null)}
              count={uncategorizedCount}
              active={uncategorized}
              onClick={onSelectUncategorized}
            />
          ) : null}
          {visibleCategories.map((category) => (
            <CategoryRow
              key={category.id}
              label={category.name}
              color={categoryColor(category.color)}
              count={categoryCounts?.get(category.id) ?? 0}
              active={!uncategorized && activeCategoryId === category.id}
              onClick={() => onSelectCategory(category.id)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function CategoryRow({
  label,
  color,
  count,
  active,
  onClick,
}: {
  label: string;
  color: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Filtrar por ${label}`}
      className={cn(
        "flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-foreground transition-colors duration-150",
        "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
        active && "bg-accent",
      )}
    >
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-[2px]"
        style={{ backgroundColor: color }}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>
    </button>
  );
}
