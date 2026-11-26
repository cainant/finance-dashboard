// @vitest-environment jsdom
import type { Transaction } from "@fd/contracts";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn();

vi.mock("@/lib/mutations", () => ({
  TRANSACTION_UPDATE_TOAST_ID: "tx-update",
  useUpdateTransactionMutation: () => ({ mutateAsync }),
}));
vi.mock("sonner", () => ({ toast: { dismiss: vi.fn(), success: vi.fn() } }));

import { useTransactionEditing } from "./use-transaction-editing";

function transaction(categoryId: string | null): Transaction {
  return { id: "tx-1", categoryId, notes: null } as Transaction;
}

function setup(initial: string | null) {
  return renderHook(
    ({ tx }: { tx: Transaction }) =>
      useTransactionEditing({
        transaction: tx,
        onCategoryOriginChange: vi.fn(),
        flushNotesRef: { current: () => {} },
        categoryToastMessage: (id) => `Categoria: ${id}`,
        onNotice: vi.fn(),
      }),
    { initialProps: { tx: transaction(initial) } },
  );
}

describe("useTransactionEditing: categoria gravada", () => {
  beforeEach(() => mutateAsync.mockReset());

  it("o refetch que chega com uma troca em andamento não reescreve a categoria já gravada", async () => {
    mutateAsync.mockResolvedValueOnce({});
    const { result, rerender } = setup("a");

    // Troca 1 grava "b"; a prop continua velha ("a") até o refetch.
    await act(() => result.current.changeCategory("b"));

    // Troca 2 fica em andamento e falha depois de um refetch da troca 1 chegar.
    let rejectSecond!: (error: Error) => void;
    mutateAsync.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectSecond = reject;
      }),
    );
    let second!: Promise<void>;
    act(() => {
      second = result.current.changeCategory("c");
    });
    rerender({ tx: transaction("x") });
    await act(async () => {
      rejectSecond(new Error("falhou"));
      await second;
    });

    // O servidor continua em "b". Uma troca para "x" não pode ser ignorada
    // como "igual": o ref ficaria em "x" por causa do refetch durante a troca.
    mutateAsync.mockResolvedValueOnce({});
    await act(() => result.current.changeCategory("x"));
    expect(mutateAsync).toHaveBeenLastCalledWith({ id: "tx-1", categoryId: "x" });
  });

  it("sem troca em andamento, a categoria nova da lista vira a categoria gravada", async () => {
    const { result, rerender } = setup("a");

    rerender({ tx: transaction("b") });

    // "b" já é o valor gravado: não há o que fazer.
    await act(() => result.current.changeCategory("b"));
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
