import type { Account, Category } from "@fd/contracts";
import { Loader2, Search, X } from "lucide-react";

import {
  activeFilterChips,
  activeQuickKind,
  QUICK_KINDS,
  quickKindPatch,
  type QuickKind,
} from "@/components/transactions/transactions-mobile-model";
import { categoryColor } from "@/lib/category-icons";
import type { TransactionsSearch } from "@/lib/search";
import { cn } from "@/lib/utils";

export interface TransactionsMobileToolbarProps {
  search: TransactionsSearch;
  accounts: readonly Account[];
  categories: readonly Category[];
  /** Texto do campo (controlado pela página, que aplica o debounce na URL). */
  query: string;
  onQueryChange: (value: string) => void;
  onFilterChange: (patch: Partial<TransactionsSearch>) => void;
  /** Total do filtro atual: só o chip rápido ativo mostra a contagem. */
  totalCount?: number;
  /** Nova busca em andamento com a lista anterior ainda na tela. */
  isRefreshing?: boolean;
}

const CHIP_BASE =
  "relative inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/60 " +
  // Alvo de toque de 44px sem engordar o chip: 5px para fora da borda de cada lado; o inset conta a partir da borda interna (1px), daí 6px.
  "before:absolute before:-inset-y-[6px] before:inset-x-0 before:content-['']";

/**
 * Barra fixa abaixo da barra superior: campo de busca e uma linha rolável de
 * chips (filtros ativos de conta/categoria, depois Todas / Saídas / Entradas /
 * Sem categoria / Pendentes). Fundo sólido e altura fixa (`--tx-toolbar-h`): o
 * cabeçalho do dia gruda logo abaixo dela. Não há `backdrop-filter` aqui.
 *
 * Mapeia direto para os search params da rota (`quickKindPatch`); não existe um
 * segundo estado de filtro.
 */
export function TransactionsMobileToolbar({
  search,
  accounts,
  categories,
  query,
  onQueryChange,
  onFilterChange,
  totalCount,
  isRefreshing = false,
}: TransactionsMobileToolbarProps) {
  const activeKind = activeQuickKind(search);
  const removable = activeFilterChips(search, accounts, categories);

  return (
    <div
      data-slot="tx-toolbar"
      className="bleed-x sticky z-20 bg-background pt-2 pb-1"
      style={{ top: "var(--tx-topbar)", height: "var(--tx-toolbar-h)" }}
    >
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted-foreground"
        />
        {/* 16px: abaixo disso o Safari iOS dá zoom ao focar o campo. */}
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Buscar lançamentos"
          aria-label="Buscar transações"
          autoComplete="off"
          spellCheck={false}
          className="h-11 w-full min-w-0 appearance-none rounded-xl border border-input bg-card pr-11 pl-10 text-base outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/25 [&::-webkit-search-cancel-button]:hidden"
        />
        <span className="absolute top-0 right-0 grid size-11 place-items-center">
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Limpar busca"
              className="grid size-11 place-items-center rounded-full text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : isRefreshing ? (
            <Loader2
              aria-hidden="true"
              data-slot="transactions-refreshing"
              className="size-4 animate-spin text-primary motion-reduce:animate-none"
            />
          ) : null}
        </span>
        <span role="status" className="sr-only">
          {isRefreshing ? "Atualizando transações" : ""}
        </span>
      </div>

      <div
        role="group"
        aria-label="Filtros de transações"
        className="bleed-x no-scrollbar mt-1 flex h-11 touch-pan-x items-center gap-2 overflow-x-auto"
      >
        {removable.map((chip) => (
          <button
            key={chip.key}
            type="button"
            data-slot="filter-chip"
            onClick={() => onFilterChange(chip.clear)}
            aria-label={`Remover filtro ${chip.label}`}
            className={cn(
              CHIP_BASE,
              "max-w-[12rem] border-primary/55 bg-primary/15 text-foreground",
            )}
          >
            {chip.color ? (
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: categoryColor(chip.color) }}
              />
            ) : null}
            <span className="min-w-0 truncate">{chip.label}</span>
            <X aria-hidden="true" className="size-3.5 shrink-0" />
          </button>
        ))}

        {QUICK_KINDS.map(({ kind, label }) => {
          const pressed = activeKind === kind;

          return (
            <button
              key={kind}
              type="button"
              data-slot="quick-chip"
              data-kind={kind}
              aria-pressed={pressed}
              onClick={() => onFilterChange(quickKindPatch(kind as QuickKind))}
              className={cn(
                CHIP_BASE,
                "active:scale-[0.97]",
                pressed
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground",
              )}
            >
              {label}
              {pressed && totalCount !== undefined ? (
                <span
                  data-slot="chip-count"
                  className="text-[11px] font-normal tabular-nums opacity-70"
                >
                  {totalCount.toLocaleString("pt-BR")}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
