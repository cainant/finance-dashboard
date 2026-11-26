import type { Category, Transaction } from "@fd/contracts";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { Tag } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { MoneyText } from "@/components/domain/money-text";
import {
  buildMobileListItems,
  type MobileListItem,
} from "@/components/transactions/transactions-mobile-model";
import {
  TransactionsFooter,
  type TransactionsLoadState,
} from "@/components/transactions/transactions-footer";
import { useSwipeToAct } from "@/components/transactions/use-swipe-to-act";
import { Skeleton } from "@/components/ui/skeleton";
import { transactionAccountParts, type AccountMeta } from "@/lib/accounts";
import { CategoryIcon } from "@/lib/category-icons";
import { formatDayLabel } from "@/lib/format";

/**
 * Alturas fixas (px): sem `measureElement` não há leitura de layout por linha
 * durante a rolagem (mesma regra da tabela, #78) e o skeleton pode ocupar
 * exatamente o mesmo espaço da lista real. Mantenha em sincronia com `h-16`
 * e `h-9` nas classes abaixo.
 */
export const MOBILE_ROW_HEIGHT = 64;
export const MOBILE_DAY_HEIGHT = 36;

const ROW_CLASS = "absolute top-0 left-0 h-16 w-full";
const DAY_CLASS = "absolute top-0 left-0 h-9 w-full";
const DAY_ROW_CLASS =
  "flex h-9 items-end justify-between gap-3 pb-1.5 text-xs text-muted-foreground";

export interface TransactionsMobileListProps {
  transactions: Transaction[];
  categories: readonly Category[];
  accountMeta: ReadonlyMap<string, AccountMeta>;
  /** Cabeçalhos de dia só na ordem cronológica (por valor a lista é plana). */
  grouped: boolean;
  /** Há lotes por carregar: o total do último dia ainda não é definitivo. */
  hasMore: boolean;
  onOpenTransaction: (transaction: Transaction) => void;
  /** Deslizar (ou ←) abre direto a grade de categorias da transação. */
  onCategorize: (transaction: Transaction) => void;
  loadState: TransactionsLoadState;
  onRetryLoadMore: () => void;
  totalCount?: number;
}

/**
 * Lista de transações abaixo de `md`: agrupada por dia, virtualizada com a
 * **janela** como contêiner de rolagem (a página rola inteira, a barra de
 * busca fica fixa e o cabeçalho do dia gruda sob ela).
 *
 * Por que o cabeçalho "sticky" é um elemento à parte: as linhas virtuais são
 * `position: absolute`, o que impede `position: sticky` nelas. Um único
 * cabeçalho fixo (`StickyDayHeader`) cobre o cabeçalho real do dia atual e só
 * troca o texto quando a rolagem cruza um dia, sem montar nem medir nada por
 * linha. O custo por evento de rolagem é uma busca binária.
 */
export function TransactionsMobileList({
  transactions,
  categories,
  accountMeta,
  grouped,
  hasMore,
  onOpenTransaction,
  onCategorize,
  loadState,
  onRetryLoadMore,
  totalCount,
}: TransactionsMobileListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  const items = useMemo(
    () => buildMobileListItems(transactions, { grouped, hasMore }),
    [grouped, hasMore, transactions],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  // Posição de cada item dentro da lista (alturas fixas) e dos cabeçalhos de dia.
  const layout = useMemo(() => {
    const starts = new Float64Array(items.length);
    const days: Array<{ index: number; start: number }> = [];
    let offset = 0;

    items.forEach((item, index) => {
      starts[index] = offset;
      if (item.kind === "day") {
        days.push({ index, start: offset });
        offset += MOBILE_DAY_HEIGHT;
      } else {
        offset += MOBILE_ROW_HEIGHT;
      }
    });

    return { starts, days, total: offset };
  }, [items]);

  // Distância da lista ao topo do documento: tudo que está acima dela (título,
  // busca, resumo) muda de altura com filtros e carregamentos.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }

    const measure = () => {
      const top = Math.round(list.getBoundingClientRect().top + window.scrollY);
      setScrollMargin((previous) => (previous === top ? previous : top));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: (index) => (items[index]?.kind === "day" ? MOBILE_DAY_HEIGHT : MOBILE_ROW_HEIGHT),
    getItemKey: (index) => items[index]?.key ?? index,
    scrollMargin,
    overscan: 8,
  });

  const swipe = useSwipeToAct(
    useCallback(
      (index: number) => {
        const item = items[index];
        if (item?.kind === "transaction") {
          onCategorize(item.transaction);
        }
      },
      [items, onCategorize],
    ),
  );

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div data-slot="transactions-cards" className="w-full">
      <div className="relative">
        {grouped ? (
          <StickyDayHeader items={items} days={layout.days} scrollMargin={scrollMargin} />
        ) : null}

        <ul
          ref={listRef}
          role="list"
          aria-label="Transações do período"
          className="relative m-0 list-none p-0"
          style={{ height: `${layout.total}px` }}
          {...swipe}
        >
          {virtualItems.map((virtualItem) => {
            const item = items[virtualItem.index];
            if (!item) {
              return null;
            }

            const style = { transform: `translateY(${layout.starts[virtualItem.index]}px)` };

            if (item.kind === "day") {
              return (
                <li
                  key={item.key}
                  data-index={virtualItem.index}
                  data-slot="day-header"
                  className={DAY_CLASS}
                  style={style}
                >
                  <DayHeaderContent date={item.date} totalCents={item.totalCents} heading />
                </li>
              );
            }

            const transaction = item.transaction;
            const category =
              transaction.category ?? categoriesById.get(transaction.categoryId ?? "") ?? null;

            return (
              <li
                key={item.key}
                data-swipe=""
                data-index={virtualItem.index}
                data-tx={transaction.id}
                className={`group ${ROW_CLASS}`}
                style={style}
              >
                <TransactionRow
                  transaction={transaction}
                  category={category}
                  meta={accountMeta.get(transaction.accountId)}
                  onOpen={onOpenTransaction}
                />
              </li>
            );
          })}
        </ul>
      </div>

      <TransactionsFooter
        loaded={transactions.length}
        totalCount={totalCount}
        loadState={loadState}
        onRetry={onRetryLoadMore}
      />
    </div>
  );
}

/**
 * `heading`: o dia real da lista é um `<h3>` (leitor de tela navega por dias);
 * o total fica fora dele para não entrar no nome do cabeçalho. O cabeçalho fixo
 * é decorativo e usa só texto.
 */
function DayHeaderContent({
  date,
  totalCents,
  heading = false,
}: {
  date: string;
  totalCents: number | null;
  heading?: boolean;
}) {
  const label = formatDayLabel(date);

  return (
    <div className={DAY_ROW_CLASS + " w-full"}>
      {heading ? (
        <h3 className="m-0 min-w-0 truncate text-xs font-normal">{label}</h3>
      ) : (
        <span className="min-w-0 truncate">{label}</span>
      )}
      {totalCents !== null ? (
        <MoneyText
          valueCents={totalCents}
          signDisplay="always"
          size="sm"
          weight="normal"
          className="shrink-0 text-xs text-muted-foreground"
        />
      ) : null}
    </div>
  );
}

/**
 * Cabeçalho do dia que acompanha a rolagem abaixo da barra de busca. Cobre o
 * cabeçalho real do dia em vigor (mesma posição, mesmo conteúdo) e é decorativo
 * para leitores de tela (o cabeçalho real, na lista, é o que eles leem).
 *
 * O dia em vigor é recalculado num listener passivo de rolagem (busca binária
 * nas posições dos cabeçalhos); só chama `setState` quando o dia muda.
 */
function StickyDayHeader({
  items,
  days,
  scrollMargin,
}: {
  items: readonly MobileListItem[];
  days: ReadonlyArray<{ index: number; start: number }>;
  scrollMargin: number;
}) {
  const [active, setActive] = useState(0);
  const stickyTop = useRef(0);

  useEffect(() => {
    const measure = () => {
      const toolbar = document.querySelector<HTMLElement>('[data-slot="tx-toolbar"]');
      stickyTop.current = toolbar
        ? Number.parseFloat(getComputedStyle(toolbar).top) + toolbar.offsetHeight
        : 0;
    };
    const update = () => {
      const line = window.scrollY + stickyTop.current - scrollMargin;
      let low = 0;
      let high = days.length - 1;
      let found = 0;

      while (low <= high) {
        const mid = (low + high) >> 1;
        if (days[mid]!.start <= line) {
          found = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      setActive(found);
    };
    const onResize = () => {
      measure();
      update();
    };

    measure();
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", onResize);
    };
  }, [days, scrollMargin]);

  const day = days[Math.min(active, days.length - 1)];
  const item = day ? items[day.index] : undefined;
  if (!item || item.kind !== "day") {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      data-slot="sticky-day-header"
      className="sticky z-10 -mb-9 h-9 border-b border-border-subtle bg-background"
      style={{ top: "calc(var(--tx-topbar) + var(--tx-toolbar-h))" }}
    >
      <DayHeaderContent date={item.date} totalCents={item.totalCents} />
    </div>
  );
}

interface TransactionRowProps {
  transaction: Transaction;
  category: Category | null;
  meta: AccountMeta | undefined;
  onOpen: (transaction: Transaction) => void;
}

/**
 * Linha: ícone da categoria, descrição, categoria · conta e valor. O botão
 * inteiro abre o detalhe; atrás dele fica a ação "Categoria" do deslizar.
 * Memoizada: rolar só monta/desmonta as linhas das bordas.
 */
const TransactionRow = memo(function TransactionRow({
  transaction,
  category,
  meta,
  onOpen,
}: TransactionRowProps) {
  const detailsId = useId();
  const parts = transactionAccountParts({
    institutionName: meta?.institutionName ?? transaction.account?.institutionName ?? null,
    name: meta?.name ?? transaction.account?.name ?? null,
    numberMasked: meta?.numberMasked ?? transaction.account?.numberMasked ?? null,
  });

  return (
    <div className="relative h-16 overflow-hidden">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 right-0 flex w-full items-center justify-end gap-2 bg-secondary pr-5 text-xs font-medium text-muted-foreground group-data-[armed=true]:bg-primary group-data-[armed=true]:text-primary-foreground"
      >
        <Tag className="size-[18px]" />
        Categoria
      </span>

      <button
        type="button"
        data-swipe-fg=""
        aria-label={`Ver detalhes de ${transaction.description}`}
        aria-describedby={detailsId}
        aria-keyshortcuts="ArrowLeft"
        onClick={() => onOpen(transaction)}
        className="relative flex h-16 w-full touch-pan-y items-center gap-3 bg-background text-left outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset active:bg-accent"
      >
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-foreground/[0.06]"
        >
          <CategoryIcon name={category?.icon} color={category?.color} className="size-[18px]" />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            data-slot="transaction-description"
            className="truncate text-[15px] leading-5 font-medium text-foreground"
          >
            {transaction.description}
          </span>
          <span
            id={detailsId}
            className="flex min-w-0 items-center gap-1 text-xs leading-4 text-muted-foreground"
          >
            {transaction.status === "pending" ? (
              <>
                <span className="shrink-0 font-medium text-warning">Pendente</span>
                <span aria-hidden="true">·</span>
              </>
            ) : null}
            {category ? (
              <span data-slot="transaction-category" className="min-w-0 shrink truncate">
                {category.name}
              </span>
            ) : (
              <span data-slot="transaction-category" className="shrink-0 font-medium text-warning">
                Sem categoria
              </span>
            )}
            {parts.label ? (
              <>
                <span aria-hidden="true">·</span>
                <span data-slot="transaction-account" className="min-w-0 flex-1 truncate">
                  {parts.label}
                </span>
              </>
            ) : null}
          </span>
        </span>

        <MoneyText
          valueCents={transaction.amountCents}
          tone={transaction.amountCents > 0 ? "positive" : "neutral"}
          signDisplay="always"
          weight="semibold"
          className="shrink-0 text-[15px] whitespace-nowrap"
        />

        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-0 bottom-0 left-12 h-px bg-border-subtle"
        />
      </button>
    </div>
  );
});

/** Esqueleto com as mesmas alturas da lista real: nada salta quando os dados chegam. */
export function TransactionsMobileSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div data-slot="transactions-mobile-skeleton" aria-hidden="true">
      <div className="flex h-9 items-end pb-1.5">
        <Skeleton className="h-3.5 w-40" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex h-16 items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}
