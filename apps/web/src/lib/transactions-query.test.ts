import type { TransactionsResponse } from "@fd/contracts";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { transactionsInfiniteQueryOptions } from "./queries";

const { transactions } = vi.hoisted(() => ({ transactions: vi.fn() }));

vi.mock("./api", () => ({
  ApiError: class ApiError extends Error {},
  api: { transactions },
}));

function page(
  descriptions: readonly string[],
  nextCursor: string | null = null,
): TransactionsResponse {
  return {
    data: descriptions.map((description, index) => ({
      id: `t${index}`,
      userId: "u1",
      accountId: "a1",
      connectionId: "c1",
      externalId: `ext-${index}`,
      date: "2026-11-05",
      description,
      amountCents: -1_000,
      currency: "BRL",
      type: "expense",
      categoryId: null,
      status: "posted",
      billId: null,
      merchant: null,
      notes: null,
      installmentNumber: null,
      totalInstallments: null,
      budgetGroupId: null,
      createdAt: "2026-11-05T12:00:00.000Z",
      updatedAt: "2026-11-05T12:00:00.000Z",
      category: null,
      account: null,
    })),
    page: { cursor: null, nextCursor },
  };
}

const PERIOD = { from: "2026-10-13", to: "2026-11-11" };

/**
 * `useInfiniteQuery` reaproveita o mesmo observer quando a query key muda, e é
 * ele que guarda a última página com dados. O teste faz o mesmo: um observer
 * só, trocando as opções a cada busca.
 */
describe("transactionsInfiniteQueryOptions", () => {
  it("mantém a lista anterior visível enquanto a nova busca carrega", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    transactions.mockResolvedValueOnce(page(["UBER TRIP", "99 FOOD"], "c1"));
    const observer = new InfiniteQueryObserver(
      client,
      transactionsInfiniteQueryOptions({ ...PERIOD, q: "uber" }),
    );
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().data?.pages[0]?.data[0]?.description).toBe("UBER TRIP"),
    );
    expect(observer.getCurrentResult().hasNextPage).toBe(true);

    // Nova busca com a resposta pendente: a lista anterior continua na tela e
    // o esqueleto não volta (isPending false), só o indicador de carregando.
    let resolveNext: (value: TransactionsResponse) => void = () => {};
    transactions.mockImplementationOnce(
      () =>
        new Promise<TransactionsResponse>((resolve) => {
          resolveNext = resolve;
        }),
    );

    observer.setOptions(transactionsInfiniteQueryOptions({ ...PERIOD, q: "uber trip" }));
    const pending = observer.getCurrentResult();

    expect(pending.isFetching).toBe(true);
    expect(pending.isPending).toBe(false);
    expect(pending.isPlaceholderData).toBe(true);
    expect(pending.data?.pages[0]?.data[0]?.description).toBe("UBER TRIP");
    // `hasNextPage` vem do estado real do cache (não do placeholder): a página
    // anterior tem `nextCursor`, mas o cursor do recorte antigo não é oferecido
    // enquanto o recorte novo está em voo.
    expect(pending.hasNextPage).toBe(false);

    // Quando a resposta chega, a lista é trocada pelo resultado novo.
    resolveNext(page(["UBER TRIP HELP.U"]));
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().data?.pages[0]?.data[0]?.description).toBe(
        "UBER TRIP HELP.U",
      ),
    );
    expect(observer.getCurrentResult().isPlaceholderData).toBe(false);

    unsubscribe();
  });

  it("primeira página pequena e próximas no lote máximo da API", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    transactions
      .mockResolvedValueOnce(page(["UBER TRIP"], "c1"))
      .mockResolvedValueOnce(page(["99 FOOD"]));

    const observer = new InfiniteQueryObserver(
      client,
      transactionsInfiniteQueryOptions({ ...PERIOD, q: "uber" }),
    );
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(observer.getCurrentResult().data?.pages).toHaveLength(1));

    await observer.fetchNextPage();
    await vi.waitFor(() => expect(observer.getCurrentResult().data?.pages).toHaveLength(2));

    // A primeira página pinta rápido; as seguintes vêm em lotes maiores para o
    // carregamento de fundo gastar menos requests.
    expect(transactions.mock.calls[0]?.[0]).toMatchObject({ limit: 50 });
    expect(transactions.mock.calls[1]?.[0]).toMatchObject({ cursor: "c1", limit: 200 });

    unsubscribe();
  });

  it("sem dados anteriores, a primeira carga continua pendente (esqueleto)", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    transactions.mockImplementationOnce(() => new Promise<TransactionsResponse>(() => {}));

    const observer = new InfiniteQueryObserver(
      client,
      transactionsInfiniteQueryOptions({ ...PERIOD, q: "uber" }),
    );
    const unsubscribe = observer.subscribe(() => {});

    expect(observer.getCurrentResult().isPending).toBe(true);
    expect(observer.getCurrentResult().isPlaceholderData).toBe(false);
    expect(observer.getCurrentResult().data).toBeUndefined();

    unsubscribe();
  });
});
