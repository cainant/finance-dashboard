import type { Account, Category } from "@fd/contracts";
import { Check, SlidersHorizontal } from "lucide-react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

import { InstitutionAvatar } from "@/components/domain/institution-avatar";
import { hasSheetFilters } from "@/components/transactions/transactions-mobile-model";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTrigger,
} from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { transactionAccountParts, type AccountMeta } from "@/lib/accounts";
import { CategoryIcon } from "@/lib/category-icons";
import type { TransactionSort } from "@/lib/queries";
import type { TransactionsSearch } from "@/lib/search";
import { cn } from "@/lib/utils";

const SORT_OPTIONS: ReadonlyArray<{ value: TransactionSort; label: string }> = [
  { value: "date_desc", label: "Data (mais recente)" },
  { value: "date_asc", label: "Data (mais antiga)" },
  { value: "amount_desc", label: "Valor (maior)" },
  { value: "amount_asc", label: "Valor (menor)" },
];

export interface TransactionsFilterSheetProps {
  search: TransactionsSearch;
  accounts: readonly Account[];
  accountMeta: ReadonlyMap<string, AccountMeta>;
  categories: readonly Category[];
  /** Lançamentos do filtro atual (o agregado da API); `undefined` enquanto não chegou. */
  resultCount?: number;
  onFilterChange: (patch: Partial<TransactionsSearch>) => void;
  /** Aberto ou não: mora na URL (`?filters`), para o voltar do sistema fechar o sheet. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SECTION_TITLE = "mb-2 mt-5 text-xs font-medium text-muted-foreground first:mt-0";
const PILL_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium outline-none active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Gatilho flutuante + sheet de filtros. O botão fica no canto inferior direito,
 * acima da barra de abas (onde o polegar alcança) e ganha um ponto quando há
 * filtro de conta, categoria ou ordenação ativo. Cada toque já aplica o filtro
 * (a lista muda atrás do sheet); "Ver N lançamentos" só fecha.
 *
 * Reúne o que o desktop oferece nos selects: categoria (inclusive "Sem
 * categoria"), conta e ordenação. Tipo e pendentes ficam nos chips da barra.
 */
export function TransactionsFilterSheet({
  search,
  accounts,
  accountMeta,
  categories,
  resultCount,
  onFilterChange,
  open,
  onOpenChange,
}: TransactionsFilterSheetProps) {
  const active = hasSheetFilters(search);
  const sort = search.sort ?? "date_desc";

  const countLabel =
    resultCount === undefined
      ? "Ver lançamentos"
      : `Ver ${resultCount.toLocaleString("pt-BR")} ${resultCount === 1 ? "lançamento" : "lançamentos"}`;

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      {/* Portal no body: o wrapper da página anima `transform` ao montar, e um
          filho `fixed` dele seguiria o wrapper durante a animação. */}
      {createPortal(
        <BottomSheetTrigger asChild>
          <button
            type="button"
            data-slot="filters-trigger"
            aria-label={active ? "Filtros (há filtros ativos)" : "Filtros"}
            className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.5rem)] z-30 inline-flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-lg outline-none active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <SlidersHorizontal aria-hidden="true" className="size-[18px]" />
            Filtros
            {active ? (
              <span
                aria-hidden="true"
                data-slot="filters-active-dot"
                className="size-2 rounded-full bg-primary-foreground"
              />
            ) : null}
          </button>
        </BottomSheetTrigger>,
        document.body,
      )}

      <BottomSheetContent>
        <BottomSheetHeader title="Filtros" />

        <BottomSheetBody>
          <p className={SECTION_TITLE}>Ordenar por</p>
          <div role="group" aria-label="Ordenar por" className="flex flex-wrap gap-2">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={sort === option.value}
                onClick={() => onFilterChange({ sort: option.value })}
                className={cn(
                  PILL_CLASS,
                  sort === option.value
                    ? "border-primary/60 bg-primary/15 text-foreground"
                    : "border-border bg-foreground/[0.04] text-foreground/90",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <p className={SECTION_TITLE}>Categoria</p>
          <div role="group" aria-label="Categoria" className="flex flex-wrap gap-2">
            <FilterPill
              pressed={!search.categoryId && !search.uncategorized}
              onClick={() => onFilterChange({ categoryId: undefined, uncategorized: undefined })}
            >
              Todas
            </FilterPill>
            {categories.map((category) => (
              <FilterPill
                key={category.id}
                pressed={search.categoryId === category.id}
                onClick={() =>
                  onFilterChange({
                    categoryId: search.categoryId === category.id ? undefined : category.id,
                    uncategorized: undefined,
                  })
                }
              >
                <CategoryIcon name={category.icon} color={category.color} className="size-4" />
                {category.name}
              </FilterPill>
            ))}
            <FilterPill
              pressed={Boolean(search.uncategorized)}
              onClick={() =>
                onFilterChange({
                  categoryId: undefined,
                  uncategorized: search.uncategorized ? undefined : true,
                  // Pendentes nunca entram em "sem categoria" (só efetivadas).
                  pending: undefined,
                })
              }
            >
              Sem categoria
            </FilterPill>
          </div>

          <p className={SECTION_TITLE}>Conta</p>
          <div
            role="group"
            aria-label="Conta"
            className="divide-y divide-border-subtle rounded-xl border border-border bg-foreground/[0.03]"
          >
            <AccountRow
              selected={!search.accountId}
              onClick={() => onFilterChange({ accountId: undefined })}
            >
              Todas as contas
            </AccountRow>
            {accounts.map((account) => {
              const meta = accountMeta.get(account.id);
              const parts = transactionAccountParts({
                institutionName: meta?.institutionName ?? null,
                name: meta?.name ?? account.name,
                numberMasked: meta?.numberMasked ?? null,
              });

              return (
                <AccountRow
                  key={account.id}
                  selected={search.accountId === account.id}
                  onClick={() =>
                    onFilterChange({
                      accountId: search.accountId === account.id ? undefined : account.id,
                    })
                  }
                >
                  {parts.institutionName ? (
                    <InstitutionAvatar
                      name={parts.institutionName}
                      size="xs"
                      decorative
                      className="size-5 rounded-[5px] text-[9px]"
                    />
                  ) : null}
                  <span className="min-w-0 truncate">{parts.label || account.name}</span>
                </AccountRow>
              );
            })}
          </div>
        </BottomSheetBody>

        <div
          data-slot="filters-footer"
          className="flex shrink-0 gap-3 border-t border-border-subtle pt-3 pr-[max(1.25rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))]"
        >
          <Button
            type="button"
            variant="outline"
            disabled={!active}
            onClick={() =>
              onFilterChange({
                accountId: undefined,
                categoryId: undefined,
                uncategorized: undefined,
                sort: undefined,
              })
            }
            className="h-11"
          >
            Limpar
          </Button>
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            data-slot="filters-apply"
            className="h-11 flex-1"
          >
            {countLabel}
          </Button>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}

function FilterPill({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        PILL_CLASS,
        pressed
          ? "border-primary/60 bg-primary/15 text-foreground"
          : "border-border bg-foreground/[0.04] text-foreground/90",
      )}
    >
      {children}
    </button>
  );
}

function AccountRow({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="flex min-h-12 w-full items-center gap-2.5 px-3.5 text-left text-[13px] font-medium text-foreground outline-none first:rounded-t-xl last:rounded-b-xl focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2.5">{children}</span>
      {selected ? <Check aria-hidden="true" className="size-4 shrink-0 text-primary" /> : null}
    </button>
  );
}
