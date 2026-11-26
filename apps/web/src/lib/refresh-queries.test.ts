import { InfiniteQueryObserver, QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { refreshActiveQueries } from "./refresh-queries";

interface Page {
  items: string[];
  next: number | null;
}

/** Servidor falso paginado por cursor numérico: 4 lotes de 2 itens. */
function setup(version: { value: string }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const pageFn = vi.fn(async ({ pageParam }: { pageParam: number }): Promise<Page> => ({
    items: [`${version.value}-${pageParam}a`, `${version.value}-${pageParam}b`],
    next: pageParam < 3 ? pageParam + 1 : null,
  }));
  const observer = new InfiniteQueryObserver(client, {
    queryKey: ["transactions"],
    queryFn: ({ pageParam }) => pageFn({ pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last: Page) => last.next,
  });
  const unsubscribe = observer.subscribe(() => {});

  return { client, observer, pageFn, unsubscribe };
}

async function loadAllPages(observer: ReturnType<typeof setup>["observer"]) {
  await vi.waitFor(() => expect(observer.getCurrentResult().data?.pages.length).toBe(1));
  for (let page = 2; page <= 4; page += 1) {
    await observer.fetchNextPage();
  }
  expect(observer.getCurrentResult().data?.pages).toHaveLength(4);
}

describe("refreshActiveQueries", () => {
  it("query infinita com 4 lotes custa uma requisição e preserva os lotes se nada mudou", async () => {
    const { client, observer, pageFn, unsubscribe } = setup({ value: "v1" });
    await loadAllPages(observer);
    const before = observer.getCurrentResult().data;
    pageFn.mockClear();

    await refreshActiveQueries(client);

    expect(pageFn).toHaveBeenCalledTimes(1);
    expect(pageFn).toHaveBeenCalledWith({ pageParam: 0 });
    // Mesma referência: a lista (e a rolagem) não se mexem.
    expect(observer.getCurrentResult().data).toBe(before);
    expect(observer.getCurrentResult().data?.pages).toHaveLength(4);
    unsubscribe();
  });

  it("se a primeira página mudou, o cache vira só ela (consistente), com uma requisição", async () => {
    const version = { value: "v1" };
    const { client, observer, pageFn, unsubscribe } = setup(version);
    await loadAllPages(observer);
    pageFn.mockClear();
    version.value = "v2";

    await refreshActiveQueries(client);

    expect(pageFn).toHaveBeenCalledTimes(1);
    const data = observer.getCurrentResult().data;
    expect(data?.pages).toEqual([{ items: ["v2-0a", "v2-0b"], next: 1 }]);
    expect(data?.pageParams).toEqual([0]);
    expect(observer.getCurrentResult().hasNextPage).toBe(true);
    unsubscribe();
  });

  it("as demais queries ativas continuam sendo refeitas", async () => {
    const { client, observer, pageFn, unsubscribe } = setup({ value: "v1" });
    await loadAllPages(observer);
    const accounts = vi.fn(async () => ["conta"]);
    const other = new QueryObserver(client, { queryKey: ["accounts"], queryFn: accounts });
    const stop = other.subscribe(() => {});
    await vi.waitFor(() => expect(other.getCurrentResult().isSuccess).toBe(true));
    pageFn.mockClear();

    await refreshActiveQueries(client);

    expect(accounts).toHaveBeenCalledTimes(2);
    expect(pageFn).toHaveBeenCalledTimes(1);
    stop();
    unsubscribe();
  });

  it("com uma página só, usa o refetch normal (uma requisição)", async () => {
    const { client, observer, pageFn, unsubscribe } = setup({ value: "v1" });
    await vi.waitFor(() => expect(observer.getCurrentResult().data?.pages.length).toBe(1));
    pageFn.mockClear();

    await refreshActiveQueries(client);

    expect(pageFn).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("falha na primeira página rejeita (vira aviso) e mantém os lotes em cache", async () => {
    const { client, observer, pageFn, unsubscribe } = setup({ value: "v1" });
    await loadAllPages(observer);
    pageFn.mockRejectedValueOnce(new Error("offline"));

    await expect(refreshActiveQueries(client)).rejects.toThrow("offline");
    expect(observer.getCurrentResult().data?.pages).toHaveLength(4);
    unsubscribe();
  });
});
