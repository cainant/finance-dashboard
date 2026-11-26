import { keepPreviousData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  queryKeys,
  transactionsSummaryQueryOptions,
  uncategorizedCountQueryOptions,
} from "./queries";

const period = { from: "2026-11-01", to: "2026-11-11" };

describe("queryKeys.transactions", () => {
  it("separa a listagem filtrada por sem categoria da listagem completa", () => {
    expect(queryKeys.transactions({ ...period, uncategorized: true })).not.toEqual(
      queryKeys.transactions(period),
    );
    expect(queryKeys.transactions({ ...period, uncategorized: false })).toEqual(
      queryKeys.transactions(period),
    );
  });
});

describe("uncategorizedCountQueryOptions", () => {
  it("usa chave própria sob transações e staleTime de 60s", () => {
    expect(uncategorizedCountQueryOptions.queryKey).toEqual([
      "transactions",
      "uncategorized-count",
    ]);
    expect(uncategorizedCountQueryOptions.staleTime).toBe(60_000);
  });
});

describe("transactionsSummaryQueryOptions", () => {
  it("mantém o resumo anterior enquanto o novo filtro carrega", () => {
    const options = transactionsSummaryQueryOptions(period);

    expect(options.placeholderData).toBe(keepPreviousData);
  });

  it("não repete cursor/limite/ordenação na chave: carregar mais não refaz a agregação", () => {
    const a = queryKeys.transactionsSummary({ ...period, sort: "date_desc" });
    const b = queryKeys.transactionsSummary({ ...period, sort: "amount_asc" });

    expect(a).toEqual(b);
    expect(a).toContain("summary");
  });
});
