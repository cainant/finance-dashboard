import {
  QueryClient,
  replaceEqualDeep,
  type InfiniteData,
  type Query,
  type QueryFunction,
} from "@tanstack/react-query";

/**
 * Refaz os dados ativos para "Atualizar" (puxar para atualizar, botão de foco).
 *
 * `refetchQueries` numa query infinita busca de novo **todas** as páginas já
 * carregadas, em sequência (a lista de Transações chega a dezenas de lotes, um
 * request ao Worker do plano gratuito cada). Aqui uma query infinita com mais
 * de uma página custa uma só: busca-se a primeira página e
 * - se ela não mudou, o cache fica como está (as demais páginas continuam
 *   válidas: a rolagem e a lista não se mexem);
 * - se mudou (há dado novo), o cache vira essa página, que é um estado
 *   consistente (cursores novos); o resto volta pelo carregamento normal da
 *   lista, não por este gesto.
 * As demais queries ativas são refeitas normalmente.
 */
export async function refreshActiveQueries(queryClient: QueryClient): Promise<void> {
  const active = queryClient.getQueryCache().findAll({ type: "active" });
  const multiPage = new Set(active.filter(hasManyPages));

  await Promise.all([
    queryClient.refetchQueries(
      { type: "active", predicate: (query) => !multiPage.has(query) },
      { throwOnError: true },
    ),
    ...[...multiPage].map((query) => refreshFirstPage(queryClient, query)),
  ]);
}

function hasManyPages(query: Query): boolean {
  const data = query.state.data as Partial<InfiniteData<unknown>> | undefined;

  return (
    Array.isArray(data?.pages) && Array.isArray(data?.pageParams) && (data?.pages?.length ?? 0) > 1
  );
}

interface InfiniteQueryOptionsLike {
  queryFn?: QueryFunction<unknown, readonly unknown[], unknown>;
  initialPageParam?: unknown;
  getNextPageParam?: (...args: never[]) => unknown;
}

async function refreshFirstPage(queryClient: QueryClient, query: Query): Promise<void> {
  // Já há um fetch em andamento (carregando mais, ou refetch de foco): ele
  // mesmo atualiza o cache; não soma uma segunda requisição.
  if (query.state.fetchStatus === "fetching") {
    return;
  }

  const options = query.options as unknown as InfiniteQueryOptionsLike;
  const cached = query.state.data as InfiniteData<unknown>;

  // Cliente descartável: `fetchInfiniteQuery({ pages: 1 })` busca só a primeira
  // página sem tocar o cache (e a lista) enquanto não sabemos se ela mudou.
  const scratch = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });

  try {
    const fresh = await scratch.fetchInfiniteQuery({
      queryKey: query.queryKey,
      queryFn: options.queryFn as never,
      initialPageParam: cached.pageParams[0] ?? options.initialPageParam,
      getNextPageParam: options.getNextPageParam as never,
      pages: 1,
    });

    // O cache mudou enquanto buscávamos (outro lote, outra troca de filtro): deixa.
    if (query.state.data !== cached) {
      return;
    }

    if (replaceEqualDeep(cached.pages[0], fresh.pages[0]) === cached.pages[0]) {
      // Nada novo: só carimba como atualizado, sem trocar a referência dos dados.
      queryClient.setQueryData(query.queryKey, cached);
      return;
    }

    queryClient.setQueryData(query.queryKey, fresh);
  } finally {
    scratch.clear();
  }
}
