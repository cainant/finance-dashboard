import type { Category, Transaction } from "@fd/contracts";
import {
  createColumnHelper,
  functionalUpdate,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown, Clock, StickyNote } from "lucide-react";
import { memo, useCallback, useMemo, useRef } from "react";

import { InstitutionAvatar } from "@/components/domain/institution-avatar";
import { MoneyText } from "@/components/domain/money-text";
import { CategoryPicker } from "@/components/transactions/category-picker";
import {
  buildTransactionsListItems,
  DAY_HEADER_HEIGHT,
  isTextSelectionClick,
  shouldIgnoreRowClick,
  TRANSACTION_ROW_HEIGHT,
} from "@/components/transactions/transactions-utils";
import {
  TransactionsFooter,
  type TransactionsLoadState,
} from "@/components/transactions/transactions-footer";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { transactionAccountParts, type AccountMeta } from "@/lib/accounts";
import { formatDate } from "@/lib/format";
import type { TransactionSort } from "@/lib/queries";
import { cn } from "@/lib/utils";

const features = tableFeatures({ rowSortingFeature });
const helper = createColumnHelper<typeof features, Transaction>();

/**
 * Colunas iguais no cabeçalho e nas linhas virtuais. Abaixo de `lg` a conta e
 * o status somem (a tabela só existe a partir de `md`); a data vem no
 * cabeçalho do dia quando a lista está agrupada e inline quando não está.
 * A categoria precisa de 184px para "Contas & Serviços"/"Impostos & Taxas"
 * caberem com ícone e chevron. Entre `xl` e `2xl` o aside de 320px espreme a
 * tabela: o status sai de cena nesse intervalo (volta em `2xl`) para a
 * categoria caber sem comer a descrição.
 */
const GRID_CLASS =
  "grid grid-cols-[minmax(0,1fr)_184px_112px] items-center gap-1.5 lg:grid-cols-[minmax(0,1fr)_184px_96px_68px_112px] xl:grid-cols-[minmax(0,1fr)_184px_96px_112px] 2xl:grid-cols-[minmax(0,1fr)_184px_96px_68px_112px]";

/**
 * Classes resolvidas uma vez. Elas não dependem de props, e `cn`/tailwind-merge
 * no caminho da rolagem custava caro: a tabela re-renderiza a cada frame
 * enquanto o usuário rola.
 */
const TRANSACTION_ROW_CLASS = cn(
  GRID_CLASS,
  // Sem `transition-colors`: durante a rolagem o cursor passa por várias linhas
  // e cada troca de hover animava 150 ms de pintura. O realce agora é imediato.
  "absolute top-0 left-0 h-11 w-full cursor-pointer border-b border-border-subtle px-4 hover:bg-accent",
);
const DAY_ROW_CLASS =
  "absolute top-0 left-0 grid h-8 w-full grid-cols-1 border-b border-border-subtle bg-background px-4";
const DAY_CELL_CLASS =
  "flex h-full items-center px-1 text-xs font-medium text-muted-foreground tabular-nums";

/** Classes estáveis de cada célula, na mesma ordem dos argumentos do grid. */
const CELL_CLASS = {
  description: "min-w-0 px-1",
  category: "min-w-0 px-1",
  account: "hidden min-w-0 px-1 lg:block",
  status: "hidden min-w-0 px-1 lg:block xl:hidden 2xl:block",
  amount: "min-w-0 px-0 text-right",
} as const;

function sortToState(sort: TransactionSort): SortingState {
  switch (sort) {
    case "amount_desc":
      return [{ id: "amountCents", desc: true }];
    case "amount_asc":
      return [{ id: "amountCents", desc: false }];
    case "date_asc":
    case "date_desc":
    default:
      // A ordem por data é a ordem natural da lista agrupada (servidor).
      return [];
  }
}

function stateToSort(state: SortingState): TransactionSort {
  const first = state[0];
  if (!first) {
    return "date_desc";
  }

  if (first.id === "amountCents") {
    return first.desc ? "amount_desc" : "amount_asc";
  }

  return first.desc ? "date_desc" : "date_asc";
}

interface SortHeaderProps {
  label: string;
  column: {
    getIsSorted: () => false | "asc" | "desc";
    getToggleSortingHandler: () => undefined | ((event: unknown) => void);
  };
  align?: "left" | "right";
}

function SortHeader({ label, column, align = "left" }: SortHeaderProps) {
  const sorted = column.getIsSorted();
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      aria-label={`Ordenar por ${label}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
        align === "right" && "justify-end",
      )}
    >
      {label}
      <Icon aria-hidden="true" className={cn("size-3.5", sorted ? "text-primary" : "opacity-50")} />
    </button>
  );
}

interface TransactionRowContentProps {
  transaction: Transaction;
  categories: readonly Category[];
  /** Categoria de outra natureza antes da última troca (ver `CategoryPicker`). */
  origin: Category | null;
  accountMeta: ReadonlyMap<string, AccountMeta>;
  /** A data vem inline na descrição quando a lista não está agrupada. */
  grouped: boolean;
  isMutating: boolean;
  onCategoryChange: (transaction: Transaction, categoryId: string | null) => void;
  onOpenTransaction: (transaction: Transaction) => void;
}

/**
 * Conteúdo das células de uma transação, separado da `<tr>` que carrega a
 * posição virtual. A cada frame de rolagem só a posição muda; com o conteúdo
 * memoizado, os componentes caros da linha (seletor de categoria com as opções,
 * valores formatados, ícones) não são reconciliados de novo.
 *
 * A ordem das células acompanha `GRID_CLASS`/`columns`: descrição, categoria,
 * conta, status e valor.
 */
const TransactionRowContent = memo(function TransactionRowContent({
  transaction,
  categories,
  origin,
  accountMeta,
  grouped,
  isMutating,
  onCategoryChange,
  onOpenTransaction,
}: TransactionRowContentProps) {
  const meta = accountMeta.get(transaction.accountId);
  const accountParts = transactionAccountParts({
    institutionName: meta?.institutionName ?? transaction.account?.institutionName ?? null,
    name: meta?.name ?? transaction.account?.name ?? null,
    numberMasked: meta?.numberMasked ?? transaction.account?.numberMasked ?? null,
  });

  return (
    <>
      <td className={CELL_CLASS.description}>
        <div className="flex min-w-0 items-center gap-2">
          {!grouped ? (
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatDate(transaction.date)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={(event) => {
              // Arrastar sobre a descrição seleciona o texto: não abre.
              if (isTextSelectionClick(event.currentTarget)) {
                return;
              }

              onOpenTransaction(transaction);
            }}
            aria-label={`Ver detalhes de ${transaction.description}`}
            title={transaction.description}
            className="min-w-0 flex-1 truncate rounded-sm text-left text-sm font-medium text-foreground transition-colors duration-150 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          >
            {transaction.description}
          </button>
          {transaction.notes ? (
            <>
              <StickyNote aria-hidden="true" className="size-3.5 shrink-0 text-subtle-foreground" />
              <span className="sr-only">Tem anotação</span>
            </>
          ) : null}
          {transaction.status === "pending" ? (
            // A coluna Status some entre `xl` e `2xl`; aqui fica a pista
            // do lançamento pendente nesse intervalo (fora dele o badge
            // da própria coluna já diz o mesmo).
            <span
              data-slot="pending-indicator"
              title="Pendente"
              className="hidden shrink-0 items-center text-warning xl:inline-flex 2xl:hidden"
            >
              <Clock aria-hidden="true" className="size-3.5" />
              <span className="sr-only">Pendente</span>
            </span>
          ) : null}
        </div>
      </td>

      <td className={CELL_CLASS.category}>
        <CategoryPicker
          transaction={transaction}
          categories={categories}
          origin={origin}
          disabled={isMutating}
          onSelect={(categoryId) => onCategoryChange(transaction, categoryId)}
        />
      </td>

      <td className={CELL_CLASS.account}>
        <div className="hidden min-w-0 items-center gap-2 lg:flex">
          {accountParts.institutionName ? (
            <InstitutionAvatar name={accountParts.institutionName} size="xs" decorative />
          ) : null}
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] leading-4 text-foreground">
              {accountParts.institutionName ?? "—"}
            </span>
            <span
              className="truncate text-xs leading-4 text-muted-foreground"
              title={accountParts.accountName ?? accountParts.numberMasked ?? undefined}
            >
              {accountParts.accountName ?? accountParts.numberMasked ?? ""}
            </span>
          </div>
        </div>
      </td>

      <td className={CELL_CLASS.status}>
        <div className="hidden lg:flex">
          {transaction.status === "pending" ? (
            <Badge variant="warning">Pendente</Badge>
          ) : (
            <span className="text-[13px] text-muted-foreground">Efetivada</span>
          )}
        </div>
      </td>

      <td className={CELL_CLASS.amount}>
        <div className="flex justify-end">
          <MoneyText
            valueCents={transaction.amountCents}
            tone={transaction.amountCents > 0 ? "positive" : "neutral"}
            signDisplay="always"
            weight="medium"
            className="text-sm whitespace-nowrap"
          />
        </div>
      </td>
    </>
  );
});

interface TransactionRowProps extends TransactionRowContentProps {
  /** Posição do item na lista (não muda com o scroll). */
  start: number;
}

/**
 * A linha inteira é memoizada porque a posição virtual (`start`) de um item é
 * fixa enquanto ele está na janela: rolar só monta/desmonta as linhas das
 * bordas e desloca o contêiner. Sem isso, cada frame reconciliava as 21 linhas
 * visíveis (5 células cada) e os componentes internos de todas elas.
 */
const TransactionRow = memo(function TransactionRow({
  start,
  transaction,
  ...contentProps
}: TransactionRowProps) {
  return (
    <tr
      data-tx={transaction.id}
      // A linha inteira abre o painel. O único alvo focável é o botão da
      // descrição (teclado/leitor de tela); controles internos — categoria,
      // links — seguem com o próprio clique, e arrastar para selecionar texto
      // não abre nada.
      onClick={(event) => {
        if (shouldIgnoreRowClick(event.target, event.currentTarget)) {
          return;
        }

        contentProps.onOpenTransaction(transaction);
      }}
      className={TRANSACTION_ROW_CLASS}
      style={{ transform: `translateY(${start}px)` }}
    >
      <TransactionRowContent transaction={transaction} {...contentProps} />
    </tr>
  );
});

interface DayRowProps {
  date: string;
  start: number;
}

const DayRow = memo(function DayRow({ date, start }: DayRowProps) {
  return (
    <tr data-day={date} className={DAY_ROW_CLASS} style={{ transform: `translateY(${start}px)` }}>
      <td colSpan={5} className={DAY_CELL_CLASS}>
        {formatDate(date)}
      </td>
    </tr>
  );
});

export interface TransactionsTableProps {
  transactions: Transaction[];
  categories: readonly Category[];
  /**
   * Categoria de outra natureza que cada linha tinha antes da última troca
   * (`transactionId` -> categoria), fixada no seletor para a troca ser
   * reversível. Vive na página porque as células são remontadas quando as
   * colunas mudam.
   */
  categoryOrigins: ReadonlyMap<string, Category>;
  accountMeta: ReadonlyMap<string, AccountMeta>;
  sort: TransactionSort;
  /** Agrupa por dia (ordenação por data); ordenação por valor fica plana. */
  grouped: boolean;
  onSortChange: (sort: TransactionSort) => void;
  /**
   * Recebe a transação inteira (não só o id) para a página registrar a
   * categoria de origem sem depender da lista — o callback precisa ficar
   * estável, porque ele entra no memo das colunas e uma identidade nova
   * remonta as células (fechando o popover) a cada refetch.
   */
  onCategoryChange: (transaction: Transaction, categoryId: string | null) => void;
  onOpenTransaction: (transaction: Transaction) => void;
  /** Andamento do carregamento automático das páginas seguintes (ver a página). */
  loadState: TransactionsLoadState;
  onRetryLoadMore: () => void;
  /**
   * Total de lançamentos do filtro inteiro (agregado da API). `undefined`
   * enquanto o resumo não chegou: o rodapé cai no texto antigo, sem inventar N.
   */
  totalCount?: number;
  isMutating?: boolean;
}

/**
 * Tabela de transações com TanStack Table v9 (headless) + TanStack Virtual.
 * A ordenação é feita no servidor: o estado da tabela é derivado do search
 * param `sort`, então a URL é a fonte da verdade. Agrupada por dia, cada
 * cabeçalho de data é um item próprio da virtualização.
 *
 * As linhas têm altura fixa (`DAY_HEADER_HEIGHT`/`TRANSACTION_ROW_HEIGHT`) e
 * não usam `measureElement`: medir cada linha recalculava as medidas da lista
 * inteira e lia o layout a cada frame, o que engasgava a rolagem com milhares
 * de lançamentos. O conteúdo de cada linha é memoizado para a rolagem só
 * atualizar a posição das linhas visíveis.
 */
export function TransactionsTable({
  transactions,
  categories,
  categoryOrigins,
  accountMeta,
  sort,
  grouped,
  onSortChange,
  onCategoryChange,
  onOpenTransaction,
  loadState,
  onRetryLoadMore,
  totalCount,
  isMutating = false,
}: TransactionsTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sorting = useMemo(() => sortToState(sort), [sort]);

  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: "description",
          header: () => (
            <span className="text-[13px] font-medium text-muted-foreground">Descrição</span>
          ),
        }),
        helper.display({
          id: "category",
          header: () => (
            <span className="text-[13px] font-medium text-muted-foreground">Categoria</span>
          ),
        }),
        helper.display({
          id: "account",
          header: () => (
            <span className="text-[13px] font-medium text-muted-foreground">Conta</span>
          ),
        }),
        helper.display({
          id: "status",
          header: () => (
            <span className="text-[13px] font-medium text-muted-foreground">Status</span>
          ),
        }),
        helper.accessor("amountCents", {
          id: "amountCents",
          header: ({ column }) => <SortHeader label="Valor" column={column} align="right" />,
        }),
      ]),
    [],
  );

  const table = useTable({
    features,
    columns,
    data: transactions,
    getRowId: (row) => row.id,
    manualSorting: true,
    enableSortingRemoval: false,
    enableMultiSort: false,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = functionalUpdate(updater, sorting);
      onSortChange(stateToSort(next));
    },
  });

  const items = useMemo(
    () => buildTransactionsListItems(transactions, grouped),
    [transactions, grouped],
  );

  // Identidades estáveis: o virtualizador invalida a lista inteira de medidas
  // quando qualquer uma delas muda. Antes, uma arrow nova a cada render fazia
  // `getMeasurements()` percorrer todos os itens em todo frame de rolagem.
  const getItemKey = useCallback((index: number) => items[index]?.key ?? index, [items]);
  const estimateSize = useCallback(
    (index: number) => (items[index]?.kind === "day" ? DAY_HEADER_HEIGHT : TRANSACTION_ROW_HEIGHT),
    [items],
  );
  const getScrollElement = useCallback(() => scrollRef.current, []);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement,
    estimateSize,
    getItemKey,
    // Com altura fixa, `measureElement` só adicionava leitura de layout e
    // recálculo das medidas a cada linha que entrava na janela.
    overscan: 8,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div data-slot="transactions-table" className="w-full min-w-0">
      <div
        ref={scrollRef}
        className="max-h-[min(62vh,560px)] min-h-40 overflow-auto overscroll-contain rounded-t-lg"
      >
        <table className="w-full caption-bottom text-sm">
          <caption className="sr-only">
            Transações do período agrupadas por dia, com descrição, categoria, conta, status e valor
          </caption>
          <thead className="sticky top-0 z-10 border-b border-border bg-background">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className={cn(GRID_CLASS, "h-10 px-4")}>
                {headerGroup.headers.map((header) => {
                  const isAmount = header.column.id === "amountCents";
                  const isAccount = header.column.id === "account";
                  const isStatus = header.column.id === "status";

                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className={cn(
                        "min-w-0 px-1 text-left font-medium",
                        isAmount && "px-0 text-right",
                        isAccount && "hidden lg:block",
                        // Status só onde sobra espaço: some entre `xl` e `2xl` (1280–1535),
                        // quando o aside de 320px está na tela.
                        isStatus && "hidden lg:block xl:hidden 2xl:block",
                      )}
                    >
                      {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody
            style={{
              display: "grid",
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            {virtualItems.map((virtualItem) => {
              const item = items[virtualItem.index];
              if (!item) {
                return null;
              }

              if (item.kind === "day") {
                return <DayRow key={item.key} date={item.date} start={virtualItem.start} />;
              }

              const transaction = item.transaction;

              return (
                <TransactionRow
                  key={item.key}
                  transaction={transaction}
                  categories={categories}
                  origin={categoryOrigins.get(transaction.id) ?? null}
                  accountMeta={accountMeta}
                  grouped={grouped}
                  isMutating={isMutating}
                  onCategoryChange={onCategoryChange}
                  onOpenTransaction={onOpenTransaction}
                  start={virtualItem.start}
                />
              );
            })}
          </tbody>
        </table>
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

/** Esqueleto da tabela enquanto a primeira página não chega. */
export function TransactionsTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="w-full" aria-hidden="true">
      <div className="h-10 border-b border-border bg-background" />
      <div className="divide-y divide-border-subtle">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className={cn(GRID_CLASS, "h-11 px-4")}>
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="ml-auto h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
