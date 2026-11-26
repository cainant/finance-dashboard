import type { Category, Transaction } from "@fd/contracts";
import { Check, Tag } from "lucide-react";
import { useId, useMemo } from "react";

import { MoneyText } from "@/components/domain/money-text";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

import { buildCategoryOptions, CATEGORY_KIND_LABEL, kindForType } from "./category-picker-options";

export interface CategoryGridProps {
  transaction: Transaction;
  categories: readonly Category[];
  /** Categoria de outra natureza que a linha tinha antes da troca (ver `CategoryPicker`). */
  origin: Category | null;
  disabled?: boolean;
  /** `null` remove a categoria. */
  onSelect: (categoryId: string | null) => void;
}

/**
 * Seletor de categoria em grade (3 colunas, ícone + nome) para a página filha
 * do bottom sheet. Mesma lista do `CategoryPicker` (`buildCategoryOptions`):
 * categoria de outra natureza (a atual ou a de origem) fica fixada no começo,
 * com a natureza indicada, para a troca continuar reversível.
 */
export function CategoryGrid({
  transaction,
  categories,
  origin,
  disabled = false,
  onSelect,
}: CategoryGridProps) {
  const pinnedHintId = useId();
  const current =
    transaction.category ??
    categories.find((category) => category.id === transaction.categoryId) ??
    null;

  const { pinned, options } = useMemo(
    () => buildCategoryOptions({ categories, current, origin, type: transaction.type }),
    [categories, current, origin, transaction.type],
  );

  const cells = pinned ? [pinned, ...options] : options;
  const pinnedHint = pinned
    ? `Categoria de ${CATEGORY_KIND_LABEL[pinned.kind].toLowerCase()} fora da natureza deste lançamento (${CATEGORY_KIND_LABEL[kindForType(transaction.type)].toLowerCase()}).`
    : "";

  return (
    <div data-slot="category-grid">
      <p className="mb-3 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{transaction.description}</span>
        <MoneyText
          valueCents={transaction.amountCents}
          tone={transaction.amountCents > 0 ? "positive" : "neutral"}
          signDisplay="always"
          size="sm"
          weight="medium"
          className="shrink-0"
        />
      </p>

      <div role="group" aria-label="Categorias" className="grid grid-cols-3 gap-2">
        {cells.map((category) => {
          const selected = current?.id === category.id;
          const isPinned = pinned?.id === category.id;

          return (
            <button
              key={category.id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={isPinned ? category.name : undefined}
              aria-describedby={isPinned ? pinnedHintId : undefined}
              data-slot={isPinned ? "pinned-category" : "category-cell"}
              data-autofocus={selected ? "" : undefined}
              onClick={() => onSelect(category.id)}
              className={cn(
                "relative flex min-h-[74px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg border px-1 py-2 text-center text-xs leading-4 font-medium",
                "transition-transform duration-100 ease-out active:scale-95 disabled:opacity-50",
                "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                selected
                  ? "border-primary/60 bg-primary/15 text-foreground"
                  : "border-foreground/10 bg-foreground/[0.04] text-foreground/90",
              )}
            >
              <CategoryIcon name={category.icon} color={category.color} className="size-5" />
              <span className="line-clamp-2 w-full break-words">{category.name}</span>
              {isPinned ? (
                <span
                  aria-hidden="true"
                  className="text-[10px] leading-3 font-normal text-muted-foreground"
                >
                  {CATEGORY_KIND_LABEL[category.kind]}
                </span>
              ) : null}
              {selected ? (
                <Check
                  aria-hidden="true"
                  className="absolute top-1 right-1 size-3.5 text-primary"
                />
              ) : null}
            </button>
          );
        })}
      </div>
      {pinned ? (
        <span id={pinnedHintId} className="sr-only">
          {pinnedHint}
        </span>
      ) : null}

      {cells.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Nenhuma categoria disponível.
        </p>
      ) : null}

      {current ? (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => onSelect(null)}
          className="mt-4 h-11 w-full"
        >
          <Tag aria-hidden="true" />
          Remover categoria
        </Button>
      ) : null}
    </div>
  );
}
