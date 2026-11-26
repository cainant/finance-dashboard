import type { Account, Category } from "@fd/contracts";
import { ArrowDownWideNarrow, FilterX, Loader2, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { categoryColor } from "@/lib/category-icons";
import type { TransactionSort } from "@/lib/queries";
import type { TransactionsSearch } from "@/lib/search";

const ALL = "all";
/** Valor sentinela do Select de categoria para o filtro "Sem categoria". */
const UNCATEGORIZED = "__uncategorized__";

export interface TransactionFiltersProps {
  search: TransactionsSearch;
  accounts: readonly Account[];
  categories: readonly Category[];
  /** Texto do campo de busca (controlado pela página para debounce). */
  query: string;
  onQueryChange: (value: string) => void;
  onFilterChange: (patch: Partial<TransactionsSearch>) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
  /** Nova busca em andamento com a lista anterior ainda na tela. */
  isRefreshing?: boolean;
}

const SORT_OPTIONS: ReadonlyArray<{ value: TransactionSort; label: string }> = [
  { value: "date_desc", label: "Data (mais recente)" },
  { value: "date_asc", label: "Data (mais antiga)" },
  { value: "amount_desc", label: "Valor (maior)" },
  { value: "amount_asc", label: "Valor (menor)" },
];

const TYPE_LABELS: Record<NonNullable<TransactionsSearch["type"]>, string> = {
  income: "Entradas",
  expense: "Saídas",
  transfer: "Transferências",
};

interface FilterChip {
  key: string;
  label: string;
  /** Cor da categoria, para o chip reproduzir o ponto da lista. */
  color?: string;
  onRemove: () => void;
}

/**
 * Barra de filtros da lista de transações no padrão novo: busca de 36px,
 * alternância Todas/Entradas/Saídas e selects de conta, categoria, "Sem
 * categoria" e ordenação. Os filtros ativos viram chips removíveis.
 */
export function TransactionFilters({
  search,
  accounts,
  categories,
  query,
  onQueryChange,
  onFilterChange,
  onClear,
  hasActiveFilters,
  isRefreshing = false,
}: TransactionFiltersProps) {
  const sort = search.sort ?? "date_desc";
  // `transfer` (link antigo) não tem item no grupo: nenhum fica marcado.
  const typeValue = search.type ?? ALL;
  const categoryValue = search.uncategorized ? UNCATEGORIZED : (search.categoryId ?? ALL);

  const chips: FilterChip[] = [];

  if (search.q) {
    chips.push({
      key: "q",
      label: `Busca: ${search.q}`,
      onRemove: () => onFilterChange({ q: undefined }),
    });
  }

  if (search.accountId) {
    const account = accounts.find((item) => item.id === search.accountId);
    chips.push({
      key: "account",
      label: account?.name ?? "Conta",
      onRemove: () => onFilterChange({ accountId: undefined }),
    });
  }

  if (search.categoryId) {
    const category = categories.find((item) => item.id === search.categoryId);
    chips.push({
      key: "category",
      label: category?.name ?? "Categoria",
      color: category ? categoryColor(category.color) : undefined,
      onRemove: () => onFilterChange({ categoryId: undefined }),
    });
  }

  if (search.uncategorized) {
    chips.push({
      key: "uncategorized",
      label: "Sem categoria",
      color: categoryColor(null),
      onRemove: () => onFilterChange({ uncategorized: undefined }),
    });
  }

  if (search.pending) {
    chips.push({
      key: "pending",
      label: "Pendentes",
      onRemove: () => onFilterChange({ pending: undefined }),
    });
  }

  if (search.type) {
    chips.push({
      key: "type",
      label: TYPE_LABELS[search.type],
      onRemove: () => onFilterChange({ type: undefined }),
    });
  }

  function handleTypeChange(value: string) {
    if (value === "income" || value === "expense") {
      onFilterChange({ type: value });
      return;
    }

    onFilterChange({ type: undefined });
  }

  function handleCategoryChange(value: string) {
    if (value === UNCATEGORIZED) {
      onFilterChange({ categoryId: undefined, uncategorized: true });
      return;
    }

    if (value === ALL) {
      onFilterChange({ categoryId: undefined, uncategorized: undefined });
      return;
    }

    onFilterChange({ categoryId: value, uncategorized: undefined });
  }

  return (
    <div data-slot="transaction-filters" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full min-w-0 sm:w-auto sm:min-w-56 sm:flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar descrição ou estabelecimento"
            aria-label="Buscar transações"
            className="h-9 pr-9 pl-9"
          />
          {/* Atualização discreta: a lista anterior fica na tela, então o único
              sinal de carregamento novo é este indicador (sem skeleton nem
              deslocamento de layout). O texto vive num live region sempre
              montado — um `role="status"` que nasce junto com o conteúdo não é
              anunciado por leitores de tela. */}
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-primary">
            {isRefreshing ? (
              <Loader2
                aria-hidden="true"
                data-slot="transactions-refreshing"
                className="size-3.5 animate-spin motion-reduce:animate-none"
              />
            ) : null}
          </span>
          <span role="status" className="sr-only">
            {isRefreshing ? "Atualizando transações" : ""}
          </span>
        </div>

        <ToggleGroup
          type="single"
          value={typeValue}
          onValueChange={handleTypeChange}
          aria-label="Filtrar por tipo"
          className="h-9 shrink-0"
        >
          <ToggleGroupItem value={ALL} size="lg">
            Todas
          </ToggleGroupItem>
          <ToggleGroupItem value="income" size="lg">
            Entradas
          </ToggleGroupItem>
          <ToggleGroupItem value="expense" size="lg">
            Saídas
          </ToggleGroupItem>
        </ToggleGroup>

        <Select
          value={search.accountId ?? ALL}
          onValueChange={(value) =>
            onFilterChange({ accountId: value === ALL ? undefined : value })
          }
        >
          <SelectTrigger aria-label="Filtrar por conta" className="min-w-36">
            <SelectValue placeholder="Conta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as contas</SelectItem>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoryValue} onValueChange={handleCategoryChange}>
          <SelectTrigger aria-label="Filtrar por categoria" className="min-w-36">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as categorias</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
            <SelectItem value={UNCATEGORIZED}>Sem categoria</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={sort}
          onValueChange={(value) => onFilterChange({ sort: value as TransactionSort })}
        >
          <SelectTrigger aria-label="Ordenar transações" className="min-w-40">
            <ArrowDownWideNarrow aria-hidden="true" className="text-muted-foreground" />
            <SelectValue placeholder="Ordenação" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted-foreground">Filtros:</span>
          {chips.map((chip) => (
            <span
              key={chip.key}
              data-slot="filter-chip"
              className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-border bg-muted pr-1 pl-2.5 text-[13px] font-medium text-foreground"
            >
              {chip.color ? (
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: chip.color }}
                />
              ) : null}
              <span className="min-w-0 truncate">{chip.label}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={`Remover filtro ${chip.label}`}
                className="grid size-5 shrink-0 place-items-center rounded-full text-subtle-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </span>
          ))}
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onClear}>
            <FilterX aria-hidden="true" />
            Limpar filtros
          </Button>
        </div>
      ) : null}
    </div>
  );
}
