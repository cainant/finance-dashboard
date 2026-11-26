import type { Transaction } from "@fd/contracts";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeftRight, Download, Plus, ReceiptText } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { DemoBadge } from "@/components/domain/demo-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { HeaderActionLabel } from "@/components/domain/header-action-label";
import { PageHeader } from "@/components/domain/page-header";
import { PeriodControl } from "@/components/domain/period-control";
import { useCategoryOrigins } from "@/components/transactions/category-origins";
import { TransactionDetailSheet } from "@/components/transactions/transaction-detail-sheet";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { TransactionsFilterSheet } from "@/components/transactions/transactions-filter-sheet";
import {
  TransactionsMobileList,
  TransactionsMobileSkeleton,
} from "@/components/transactions/transactions-mobile-list";
import { TransactionsMobileSummary } from "@/components/transactions/transactions-mobile-summary";
import { TransactionsMobileToolbar } from "@/components/transactions/transactions-mobile-toolbar";
import {
  TransactionsCategories,
  TransactionsSummary,
} from "@/components/transactions/transactions-summary";
import {
  TransactionsTable,
  TransactionsTableSkeleton,
} from "@/components/transactions/transactions-table";
import {
  resolveTransactionPanel,
  withUncategorizedFilter,
} from "@/components/transactions/transactions-utils";
import type { TransactionsLoadState } from "@/components/transactions/transactions-footer";
import type { Page as DetailPage } from "@/components/transactions/transaction-detail-mobile";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { buildAccountMetaIndex, transactionAccountParts } from "@/lib/accounts";
import { api, errorMessage } from "@/lib/api";
import { hasLiveConnections } from "@/lib/connections";
import { transactionsEmptyDescription } from "@/lib/demo-visibility";
import {
  collectAllTransactions,
  downloadCsv,
  EXPORT_PAGE_LIMIT,
  transactionsCsvFilename,
  transactionsToCsv,
} from "@/lib/export";
import { formatDate } from "@/lib/format";
import { useDebouncedValue, useMediaQuery, usePageVisible } from "@/lib/hooks";
import { useUpdateTransactionMutation } from "@/lib/mutations";
import { periodSelectionFromSearch, resolvePeriod } from "@/lib/period";
import { useDemoProviderEnabled } from "@/lib/providers";
import {
  accountsQueryOptions,
  categoriesQueryOptions,
  connectionsQueryOptions,
  transactionsInfiniteQueryOptions,
  transactionsSummaryQueryOptions,
  type TransactionSort,
} from "@/lib/queries";
import {
  closeTransactionPanel,
  hasActiveTransactionFilters,
  openTransactionPanel,
  pickSheetFilters,
  sameSheetFilters,
  transactionsSearchSchema,
  type SheetFilters,
  type TransactionsSearch,
} from "@/lib/search";

/**
 * Intervalo entre lotes do carregamento em segundo plano. Curto o bastante
 * para a lista ficar completa em segundos e longo o bastante para a leva
 * anterior pintar antes do próximo request.
 */
const AUTO_LOAD_DELAY_MS = 300;

export const Route = createFileRoute("/_app/transactions")({
  staticData: { title: "Transações" },
  validateSearch: (search) => transactionsSearchSchema.parse(search),
  loader: ({ context }) => {
    // Dados de referência dos filtros; falhas caem nos estados da própria
    // página. O prefetch não bloqueia a navegação: se o loader aguardasse a
    // rede, a URL mudaria com o cabeçalho da página anterior ainda interativo
    // (o menu de período abria e sumia quando a rota nova montava). A página
    // já renderiza esqueletos enquanto as queries resolvem.
    void context.queryClient.prefetchQuery(accountsQueryOptions);
    void context.queryClient.prefetchQuery(categoriesQueryOptions);
  },
  component: TransactionsPage,
});

/**
 * Filtros do sheet enquanto ele está aberto, quando foi esta tela que empilhou a entrada dele.
 *
 * Trocar filtro dentro do sheet escreve na URL com `replace` (a entrada do sheet), mas o voltar
 * do sistema leva à entrada anterior, que ainda tem os filtros de antes de abrir. Sem isto a
 * tela renderizava (e buscava) esses filtros antigos por um quadro, até um `replace` reaplicar
 * os novos. Aqui `base` é o que a entrada anterior tem e `current` o que o sheet deixou:
 * enquanto a URL volta a `base` sem `filters`, a search efetiva já usa `current` no mesmo
 * render, e um efeito grava `current` na URL. Se a URL passou a ter outra combinação (navegação
 * legítima), não há o que reaplicar e o estado é descartado.
 */
interface SheetEdit {
  base: SheetFilters;
  current: SheetFilters;
}

function isRestoringSheetFilters(urlSearch: TransactionsSearch, edit: SheetEdit | null): boolean {
  return Boolean(
    edit &&
    !urlSearch.filters &&
    sameSheetFilters(pickSheetFilters(urlSearch), edit.base) &&
    !sameSheetFilters(edit.base, edit.current),
  );
}

function TransactionsPage() {
  const urlSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  // Filtros do sheet em edição, para o voltar do sistema não piscar o filtro antigo (abaixo).
  const [sheetEdit, setSheetEdit] = useState<SheetEdit | null>(null);
  // Sheet fora da URL e nada a reaplicar (já gravado, outra combinação, ou sem mudança): descarta.
  // Estado ajustado no render, sem efeito (o React re-renderiza antes de pintar).
  if (sheetEdit && !urlSearch.filters && !isRestoringSheetFilters(urlSearch, sheetEdit)) {
    setSheetEdit(null);
  }
  const restoringSheetFilters = isRestoringSheetFilters(urlSearch, sheetEdit);
  // A search efetiva: a da URL, salvo no instante em que o voltar do sistema fecha o sheet
  // (ver `SheetEdit`).
  const search = useMemo<TransactionsSearch>(
    () => (restoringSheetFilters && sheetEdit ? { ...urlSearch, ...sheetEdit.current } : urlSearch),
    [restoringSheetFilters, sheetEdit, urlSearch],
  );
  const demoEnabled = useDemoProviderEnabled();

  const period = resolvePeriod(periodSelectionFromSearch(search));
  const sort = search.sort ?? "date_desc";
  // A linha de data só faz sentido na ordem cronológica; por valor, a lista é plana.
  const grouped = sort === "date_desc" || sort === "date_asc";

  const filters = useMemo(
    () =>
      withUncategorizedFilter(
        {
          from: period.from,
          to: period.to,
          q: search.q,
          accountId: search.accountId,
          categoryId: search.categoryId,
          type: search.type,
          sort,
        },
        search.uncategorized,
        search.pending,
      ),
    [
      period.from,
      period.to,
      search.accountId,
      search.categoryId,
      search.q,
      search.type,
      search.uncategorized,
      search.pending,
      sort,
    ],
  );

  const transactionsQuery = useInfiniteQuery(transactionsInfiniteQueryOptions(filters));
  const { fetchNextPage } = transactionsQuery;
  // Resumo agregado na API para o filtro inteiro: os totais não dependem de
  // quantas páginas já foram carregadas.
  const summaryQuery = useQuery(transactionsSummaryQueryOptions(filters));
  // A exportação baixa o período inteiro por conta própria; enquanto isso os
  // lotes de fundo ficam pausados para não disputar requests.
  const [isExporting, setIsExporting] = useState(false);
  const pageVisible = usePageVisible();
  const accountsQuery = useQuery(accountsQueryOptions);
  const categoriesQuery = useQuery(categoriesQueryOptions);
  const connectionsQuery = useQuery(connectionsQueryOptions);
  const updateMutation = useUpdateTransactionMutation();
  // Identidade estável: as colunas da tabela são remontadas quando este array
  // muda, e as células do seletor de categoria perderiam o estado da busca.
  const categories = useMemo(() => categoriesQuery.data?.data ?? [], [categoriesQuery.data]);

  // Abaixo de `md` (768px) a tabela dá lugar aos cartões. O estado é `null` no
  // primeiro render (servidor/teste) até o `matchMedia` medir no cliente, para
  // nunca montar as duas virtualizações ao mesmo tempo.
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const isMobile = isDesktop === false;

  // Busca com debounce: o input responde na hora e a URL acompanha depois.
  // 250 ms: abaixo disso cada tecla vira request; acima, a lista demora a
  // acompanhar o que foi digitado.
  const [query, setQuery] = useState(search.q ?? "");
  const debouncedQuery = useDebouncedValue(query, 250);

  useEffect(() => {
    const current = search.q ?? "";
    if (current === debouncedQuery) {
      return;
    }

    void navigate({
      search: (previous) => ({ ...previous, q: debouncedQuery || undefined }),
      replace: true,
      resetScroll: false,
    });
  }, [debouncedQuery, navigate, search.q]);

  const updateFilters = useCallback(
    (patch: Partial<TransactionsSearch>) => {
      void navigate({
        search: (previous) => ({ ...previous, ...patch }),
        replace: true,
        resetScroll: false,
      });
    },
    [navigate],
  );

  const handleClearFilters = useCallback(() => {
    setQuery("");
    void navigate({
      search: (previous) => ({
        ...previous,
        q: undefined,
        accountId: undefined,
        categoryId: undefined,
        type: undefined,
        uncategorized: undefined,
        pending: undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  }, [navigate]);

  const handleSortChange = useCallback(
    (next: TransactionSort) => {
      updateFilters({ sort: next });
    },
    [updateFilters],
  );

  const { mutate } = updateMutation;

  const transactions = useMemo(
    () => transactionsQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [transactionsQuery.data],
  );

  // Categoria de outra natureza que cada linha tinha antes de uma troca (ver
  // `useCategoryOrigins`); o seletor a fixa no topo para a troca ser reversível.
  const { origins: categoryOrigins, remember: rememberCategoryOrigin } =
    useCategoryOrigins(categories);

  /**
   * Recebe a transação inteira: o callback entra no memo de colunas da tabela,
   * então precisa de identidade estável. Ler `transactions` ou `categories` aqui
   * dentro o recriaria a cada refetch/nova página — e cada recálculo remonta as
   * células, fechando o popover de categoria no meio do uso.
   */
  const handleCategoryChange = useCallback(
    (transaction: Transaction, categoryId: string | null) => {
      rememberCategoryOrigin(transaction);
      mutate({ id: transaction.id, categoryId });
    },
    [mutate, rememberCategoryOrigin],
  );

  const summary = summaryQuery.data;
  // O resumo usa `placeholderData: keepPreviousData`: enquanto o novo filtro
  // carrega, `summary` é o snapshot anterior (o mesmo que a lista mostra, e
  // marcado com `aria-busy`). O rodapé lê este snapshot — nunca
  // `transactions.length`, que é só quantas linhas já foram carregadas.
  const totalCount = summary?.totalCount;
  const summaryUpdating = summaryQuery.isFetching && !summaryQuery.isPending;

  const categoryCounts = useMemo(() => {
    if (!summary) {
      return undefined;
    }

    const counts = new Map<string, number>();
    let uncategorizedCount = 0;

    for (const entry of summary.categories) {
      if (entry.categoryId === null) {
        uncategorizedCount = entry.count;
        continue;
      }
      counts.set(entry.categoryId, entry.count);
    }

    return { counts, uncategorizedCount };
  }, [summary]);

  const accountMeta = useMemo(
    () => buildAccountMetaIndex(accountsQuery.data?.data ?? [], connectionsQuery.data?.data ?? []),
    [accountsQuery.data, connectionsQuery.data],
  );

  const hasDemoConnection = Boolean(
    connectionsQuery.data?.data.some((connection) => connection.provider === "demo"),
  );
  // Conectar só é a ação primária quando ainda não há instituição conectada;
  // com dados na tela quem manda é a ação da própria página (Exportar).
  // Enquanto `/api/connections` não responde (F5) ou falha, o CTA fica
  // secundário: nunca pisca azul por um instante nem fica errado para sempre.
  const connectIsPrimary =
    connectionsQuery.isSuccess && !hasLiveConnections(connectionsQuery.data?.data ?? []);
  const hasFilters = hasActiveTransactionFilters(search);
  const isLoading = transactionsQuery.isPending;
  const isError = transactionsQuery.isError;
  // Busca nova em andamento com a lista anterior ainda na tela: mostra um
  // indicador discreto em vez de derrubar tudo para o esqueleto. A primeira
  // carga (isPending) continua só com o esqueleto, sem spinner duplicado.
  const isPlaceholderData = transactionsQuery.isPlaceholderData;
  const isRefreshing =
    transactionsQuery.isFetching &&
    !transactionsQuery.isPending &&
    !transactionsQuery.isFetchingNextPage;
  // Enquanto a lista exibida é a anterior (placeholder), o carregamento de
  // fundo usaria o cursor do filtro antigo no filtro novo. O TanStack já
  // devolve `hasNextPage = false` nesse estado (ele lê o cache real, não o
  // placeholder; coberto em `transactions-query.test.ts`), mas a guarda mantém
  // a intenção explícita caso esse comportamento mude.
  const hasNextPage = transactionsQuery.hasNextPage && !isPlaceholderData;
  // Lote que falhou depois dos retries: parar de insistir e deixar o rodapé
  // oferecer "Tentar novamente" (um loop de retry martelaria a API).
  const autoLoadFailed =
    transactionsQuery.isFetchNextPageError && !transactionsQuery.isFetchingNextPage;

  /**
   * Baixa as páginas seguintes em lotes, uma por vez, enquanto a página de
   * transações estiver aberta e visível: a lista não depende de um botão
   * "Carregar mais" nem de o usuário chegar ao fim da rolagem.
   */
  useEffect(() => {
    if (
      !hasNextPage ||
      autoLoadFailed ||
      isExporting ||
      isRefreshing ||
      transactionsQuery.isFetchingNextPage ||
      !pageVisible
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      // O erro fica no estado da query; rejeitar aqui só sujaria o console.
      void fetchNextPage().catch(() => {});
    }, AUTO_LOAD_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [
    autoLoadFailed,
    fetchNextPage,
    hasNextPage,
    isExporting,
    isRefreshing,
    pageVisible,
    transactionsQuery.isFetchingNextPage,
  ]);

  const loadState: TransactionsLoadState =
    isPlaceholderData || transactionsQuery.isFetchingNextPage
      ? "loading"
      : autoLoadFailed
        ? "error"
        : hasNextPage
          ? "idle"
          : "done";

  // Painel lateral: o estado mora na URL (`?tx=<id>`), então o link é
  // compartilhável, o recarregamento mantém o painel aberto e o "voltar" do
  // navegador o fecha. A transação é lida da lista atual, então edições
  // (categoria/nota) aparecem assim que a query é invalidada.
  const router = useRouter();
  const panel = useMemo(
    () => resolveTransactionPanel(transactions, search.tx),
    [search.tx, transactions],
  );
  const selectedTransaction = panel.transaction;
  const previousTransaction = panel.previous;
  const nextTransaction = panel.next;
  // Id que esta página empilhou no histórico ao abrir. Só esse caso fecha com
  // `back()`; painel aberto por link (ou recarregado) fecha com `replace`, para
  // não pular uma entrada de navegação.
  const pushedTxRef = useRef<string | null>(null);
  // Idem para o sheet de filtros (`?filters=true`): só fecha com `back()` se
  // foi esta página que empilhou a entrada.
  const pushedFiltersRef = useRef(false);
  // Filtros da entrada de antes de abrir o sheet (só quando fomos nós que a empilhamos).
  const sheetBaseRef = useRef<SheetFilters | null>(null);

  // Mobile: página em que o sheet abre. Deslizar a linha abre direto a grade de
  // categorias; tocar nela abre o detalhe.
  const [sheetIntent, setSheetIntent] = useState<{ id: string; page: DetailPage } | null>(null);
  const sheetPage: DetailPage =
    sheetIntent && sheetIntent.id === search.tx ? sheetIntent.page : "detail";

  const openTransaction = useCallback(
    (transaction: Transaction, page: DetailPage) => {
      pushedTxRef.current = transaction.id;
      // Sheet de filtros e detalhe nunca ficam abertos juntos (link com os dois
      // params): abrir o detalhe tira o `filters`, a entrada nova é a do detalhe.
      pushedFiltersRef.current = false;
      setSheetIntent({ id: transaction.id, page });
      void navigate({
        search: (previous) => ({
          ...openTransactionPanel(previous, transaction.id),
          filters: undefined,
        }),
        resetScroll: false,
      });
    },
    [navigate],
  );

  const handleOpenTransaction = useCallback(
    (transaction: Transaction) => openTransaction(transaction, "detail"),
    [openTransaction],
  );
  const handleCategorizeTransaction = useCallback(
    (transaction: Transaction) => openTransaction(transaction, "category"),
    [openTransaction],
  );
  const handleRetryLoadMore = useCallback(
    () => void fetchNextPage().catch(() => {}),
    [fetchNextPage],
  );

  // Anterior/Próxima trocam o id da URL sem criar entradas: um único "voltar"
  // continua fechando o painel.
  const handleNavigatePanel = useCallback(
    (id: string) => {
      pushedTxRef.current = pushedTxRef.current ? id : null;
      void navigate({
        search: (previous) => openTransactionPanel(previous, id),
        replace: true,
        resetScroll: false,
      });
    },
    [navigate],
  );

  const closePanel = useCallback(() => {
    // Volta à entrada sem `tx`: o painel fecha e o foco retorna à linha.
    if (pushedTxRef.current && pushedTxRef.current === search.tx) {
      pushedTxRef.current = null;
      router.history.back();
      return;
    }

    // Aberto direto pela URL (ou já desempilhado): não há entrada própria.
    void navigate({ search: closeTransactionPanel, replace: true, resetScroll: false });
  }, [navigate, router, search.tx]);

  // Mobile ("Ver lançamentos parecidos"): fecha o detalhe e preenche a busca.
  // O `q` da URL segue o campo pelo debounce acima (escrever aqui também
  // brigaria com ele); os demais filtros saem para a busca não ficar vazia.
  const handleViewSimilar = useCallback(
    (term: string) => {
      pushedTxRef.current = null;
      setQuery(term);
      void navigate({
        search: (previous) => ({
          ...closeTransactionPanel(previous),
          filters: undefined,
          accountId: undefined,
          categoryId: undefined,
          type: undefined,
          uncategorized: undefined,
          pending: undefined,
        }),
        replace: true,
        resetScroll: false,
      });
    },
    [navigate],
  );

  const handleSheetOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        closePanel();
      }
    },
    [closePanel],
  );

  // Link com `?tx` e `?filters` juntos: o schema já descarta o `filters` (o detalhe vence).
  const filtersOpen = Boolean(urlSearch.filters) && isMobile;
  const handleFiltersOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        pushedFiltersRef.current = true;
        sheetBaseRef.current = pickSheetFilters(urlSearch);
        setSheetEdit(null);
        void navigate({
          search: (previous) => ({ ...previous, filters: true }),
          resetScroll: false,
        });
        return;
      }

      // Esc, scrim, arrasto e "Ver N lançamentos": volta à entrada sem `filters`
      // quando fomos nós que a empilhamos; aberto por link, só tira o param.
      if (pushedFiltersRef.current) {
        pushedFiltersRef.current = false;
        router.history.back();
        return;
      }
      void navigate({
        search: (previous) => ({ ...previous, filters: undefined }),
        replace: true,
        resetScroll: false,
      });
    },
    [navigate, router, urlSearch],
  );

  // Troca de filtro dentro do sheet: a URL (replace) e o rascunho que o voltar do sistema usa.
  const handleSheetFilterChange = useCallback(
    (patch: Partial<TransactionsSearch>) => {
      const trackedBase = pushedFiltersRef.current ? sheetBaseRef.current : null;
      setSheetEdit((edit) => {
        const base = edit?.base ?? trackedBase;
        if (!base) {
          return edit;
        }
        const current = { ...(edit?.current ?? base) };
        for (const key of Object.keys(patch) as Array<keyof SheetFilters>) {
          if (key in current) {
            // A ordenação padrão não vai para a URL (o schema a normaliza para `undefined`).
            (current as Record<string, unknown>)[key] =
              key === "sort" && patch.sort === "date_desc" ? undefined : patch[key];
          }
        }
        return { base, current };
      });
      updateFilters(patch);
    },
    [updateFilters],
  );

  useEffect(() => {
    if (urlSearch.filters) {
      return;
    }

    // O sheet saiu da URL: a entrada empilhada por nós deixou de existir, então o próximo
    // fechar não pode dar `back()` de novo.
    pushedFiltersRef.current = false;
    if (restoringSheetFilters && sheetEdit) {
      // O voltar do sistema (ou o nosso `back()`) caiu na entrada de antes de abrir: grava nela o
      // que o sheet deixou. A search efetiva já é essa, então nada piscou.
      void navigate({
        search: (previous) => ({ ...previous, ...sheetEdit.current }),
        replace: true,
        resetScroll: false,
      });
    }
  }, [navigate, restoringSheetFilters, sheetEdit, urlSearch.filters]);

  // O painel saiu da URL (voltar, Fechar, link): a entrada empilhada por nós
  // deixou de existir, então o próximo fechar não pode dar `back()` de novo.
  useEffect(() => {
    if (!search.tx) {
      pushedTxRef.current = null;
    }
  }, [search.tx]);

  // `?tx=` que não está no recorte (id inexistente, lançamento fora do
  // período/filtros ou que saiu da lista ao ser categorizado): com a lista
  // completa e estável, a URL volta a ficar limpa em vez de guardar um id
  // morto. `isPlaceholderData` fica de fora: offline o fetch pausa com
  // `isFetching` falso e a lista é o placeholder vazio — limpar aí mataria um
  // link válido antes da resposta chegar. `hasNextPage` também: o
  // carregamento em segundo plano tem pausas entre lotes, e um id da página
  // seguinte ainda não chegou — só dá para dizer que ele não existe no filtro
  // com todas as páginas carregadas.
  const isListSettled =
    transactionsQuery.isSuccess &&
    !transactionsQuery.isFetching &&
    !transactionsQuery.isPlaceholderData &&
    !hasNextPage;
  useEffect(() => {
    if (!search.tx || !isListSettled) {
      return;
    }
    if (transactions.some((transaction) => transaction.id === search.tx)) {
      return;
    }

    pushedTxRef.current = null;
    void navigate({ search: closeTransactionPanel, replace: true, resetScroll: false });
  }, [isListSettled, navigate, search.tx, transactions]);

  const selectedAccount = selectedTransaction
    ? accountMeta.get(selectedTransaction.accountId)
    : undefined;
  const selectedAccountLabel = selectedTransaction
    ? transactionAccountParts({
        institutionName:
          selectedAccount?.institutionName ?? selectedTransaction.account?.institutionName ?? null,
        name: selectedAccount?.name ?? selectedTransaction.account?.name ?? null,
        numberMasked:
          selectedAccount?.numberMasked ?? selectedTransaction.account?.numberMasked ?? null,
      }).label
    : null;

  async function handleExport() {
    if (isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      // Independente do que já está na tela: percorre todas as páginas do
      // filtro atual (12 meses ≈ poucos lotes de 200) e só então gera o CSV.
      const rows = await collectAllTransactions((cursor) =>
        api.transactions({
          ...filters,
          cursor: cursor ?? undefined,
          limit: EXPORT_PAGE_LIMIT,
        }),
      );

      if (rows.length === 0) {
        toast.info("Nenhum lançamento no período para exportar");
        return;
      }

      downloadCsv(transactionsCsvFilename(period.from, period.to), transactionsToCsv(rows));
      toast.success(`${rows.length.toLocaleString("pt-BR")} lançamentos exportados`);
    } catch (error) {
      toast.error("Não foi possível exportar os lançamentos", {
        description: errorMessage(error),
      });
    } finally {
      setIsExporting(false);
    }
  }

  function handleSelectCategory(categoryId: string) {
    updateFilters({
      categoryId: search.categoryId === categoryId ? undefined : categoryId,
      uncategorized: undefined,
    });
  }

  function handleSelectUncategorized() {
    updateFilters({
      categoryId: undefined,
      uncategorized: search.uncategorized ? undefined : true,
    });
  }

  const mobileTotalCount = totalCount;
  const mobileBody = isLoading ? (
    <TransactionsMobileSkeleton />
  ) : isError ? (
    <ErrorState
      title="Não foi possível carregar as transações"
      error={transactionsQuery.error}
      onRetry={() => void transactionsQuery.refetch()}
      isRetrying={transactionsQuery.isFetching}
    />
  ) : transactions.length === 0 ? (
    <EmptyState
      icon={hasFilters ? ReceiptText : ArrowLeftRight}
      title={hasFilters ? "Nenhuma transação com esses filtros" : "Nenhuma transação no período"}
      description={
        hasFilters
          ? "Ajuste a busca, a conta, a categoria ou o tipo para ver outros lançamentos."
          : transactionsEmptyDescription(demoEnabled)
      }
      action={
        hasFilters ? (
          <Button variant="outline" size="sm" onClick={handleClearFilters}>
            Limpar filtros
          </Button>
        ) : (
          <Button asChild size="sm">
            <Link to="/connections" search={(previous) => previous}>
              Conectar conta
            </Link>
          </Button>
        )
      }
    />
  ) : (
    <div
      className={
        isPlaceholderData
          ? "opacity-60 transition-opacity duration-150"
          : "transition-opacity duration-150"
      }
      aria-busy={isPlaceholderData}
    >
      <TransactionsMobileList
        transactions={transactions}
        categories={categories}
        accountMeta={accountMeta}
        grouped={grouped}
        hasMore={Boolean(hasNextPage)}
        onOpenTransaction={handleOpenTransaction}
        onCategorize={handleCategorizeTransaction}
        loadState={loadState}
        onRetryLoadMore={handleRetryLoadMore}
        totalCount={mobileTotalCount}
      />
    </div>
  );

  return (
    <div className={isMobile ? "tx-mobile space-y-3 pb-20" : "space-y-4"}>
      <PageHeader
        title="Transações"
        badge={hasDemoConnection ? <DemoBadge /> : null}
        description={`${period.label} · ${formatDate(period.from)} a ${formatDate(period.to)}`}
        actions={
          <>
            <PeriodControl />
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={isExporting}
              aria-busy={isExporting}
              title="Baixa em CSV todos os lançamentos do período"
            >
              <Download aria-hidden="true" />
              {isExporting ? "Exportando…" : "Exportar"}
            </Button>
            <Button asChild variant={connectIsPrimary ? "default" : "outline"}>
              <Link to="/connections" search={(previous) => previous}>
                <Plus aria-hidden="true" />
                <HeaderActionLabel label="Conectar conta" shortLabel="Conectar" />
              </Link>
            </Button>
          </>
        }
      />

      {isMobile ? (
        <>
          <TransactionsMobileToolbar
            search={search}
            accounts={accountsQuery.data?.data ?? []}
            categories={categories}
            query={query}
            onQueryChange={setQuery}
            onFilterChange={updateFilters}
            totalCount={totalCount}
            isRefreshing={isRefreshing}
          />
          <TransactionsMobileSummary
            incomeCents={summary?.incomeCents}
            expensesCents={summary?.expensesCents}
            totalCount={totalCount}
            pendingOnly={Boolean(search.pending)}
            isLoading={summaryQuery.isPending}
            isError={summaryQuery.isError}
            isUpdating={summaryUpdating}
            onRetry={() => void summaryQuery.refetch()}
          />
          {mobileBody}
          <TransactionsFilterSheet
            search={search}
            accounts={accountsQuery.data?.data ?? []}
            accountMeta={accountMeta}
            categories={categories}
            resultCount={totalCount}
            onFilterChange={handleSheetFilterChange}
            open={filtersOpen}
            onOpenChange={handleFiltersOpenChange}
          />
        </>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <div className="min-w-0 space-y-4">
            <TransactionFilters
              search={search}
              accounts={accountsQuery.data?.data ?? []}
              categories={categories}
              query={query}
              onQueryChange={setQuery}
              onFilterChange={updateFilters}
              onClear={handleClearFilters}
              hasActiveFilters={hasFilters}
              isRefreshing={isRefreshing}
            />

            {isLoading ? (
              <Card className="min-w-0">
                <TransactionsTableSkeleton />
              </Card>
            ) : isError ? (
              <ErrorState
                title="Não foi possível carregar as transações"
                error={transactionsQuery.error}
                onRetry={() => void transactionsQuery.refetch()}
                isRetrying={transactionsQuery.isFetching}
              />
            ) : transactions.length === 0 ? (
              <EmptyState
                icon={hasFilters ? ReceiptText : ArrowLeftRight}
                title={
                  hasFilters
                    ? "Nenhuma transação com esses filtros"
                    : "Nenhuma transação no período"
                }
                description={
                  hasFilters
                    ? "Ajuste a busca, a conta, a categoria ou o tipo para ver outros lançamentos."
                    : transactionsEmptyDescription(demoEnabled)
                }
                action={
                  hasFilters ? (
                    <Button variant="outline" size="sm" onClick={handleClearFilters}>
                      Limpar filtros
                    </Button>
                  ) : (
                    <Button asChild size="sm">
                      <Link to="/connections" search={(previous) => previous}>
                        Conectar conta
                      </Link>
                    </Button>
                  )
                }
              />
            ) : isDesktop === null ? (
              <Card className="min-w-0">
                <TransactionsTableSkeleton />
              </Card>
            ) : (
              <Card
                className={
                  isPlaceholderData
                    ? "min-w-0 opacity-60 transition-opacity duration-150"
                    : "min-w-0 transition-opacity duration-150"
                }
                aria-busy={isPlaceholderData}
              >
                {
                  <TransactionsTable
                    transactions={transactions}
                    categories={categories}
                    categoryOrigins={categoryOrigins}
                    accountMeta={accountMeta}
                    sort={sort}
                    grouped={grouped}
                    onSortChange={handleSortChange}
                    onCategoryChange={handleCategoryChange}
                    onOpenTransaction={handleOpenTransaction}
                    loadState={loadState}
                    onRetryLoadMore={() => void fetchNextPage().catch(() => {})}
                    totalCount={totalCount}
                    isMutating={updateMutation.isPending}
                  />
                }
              </Card>
            )}
          </div>

          <aside aria-label="Resumo das transações" className="min-w-0 space-y-4">
            <TransactionsSummary
              incomeCents={summary?.incomeCents}
              expensesCents={summary?.expensesCents}
              resultCents={summary?.resultCents}
              isLoading={summaryQuery.isPending}
              isError={summaryQuery.isError}
              isUpdating={summaryUpdating}
              onRetry={() => void summaryQuery.refetch()}
            />
            <TransactionsCategories
              categoryCounts={categoryCounts?.counts}
              uncategorizedCount={categoryCounts?.uncategorizedCount}
              categories={categories}
              activeCategoryId={search.categoryId}
              uncategorized={search.uncategorized}
              onSelectCategory={handleSelectCategory}
              onSelectUncategorized={handleSelectUncategorized}
              isLoading={summaryQuery.isPending}
              isError={summaryQuery.isError}
              isUpdating={summaryUpdating}
              onRetry={() => void summaryQuery.refetch()}
            />
          </aside>
        </div>
      )}

      <TransactionDetailSheet
        transaction={selectedTransaction}
        open={selectedTransaction !== null}
        onOpenChange={handleSheetOpenChange}
        onPrevious={
          previousTransaction ? () => handleNavigatePanel(previousTransaction.id) : undefined
        }
        onNext={nextTransaction ? () => handleNavigatePanel(nextTransaction.id) : undefined}
        categories={categories}
        categoryOrigins={categoryOrigins}
        onCategoryOriginChange={rememberCategoryOrigin}
        accountLabel={selectedAccountLabel}
        onViewSimilar={handleViewSimilar}
        mobileInitialPage={sheetPage}
      />
    </div>
  );
}
