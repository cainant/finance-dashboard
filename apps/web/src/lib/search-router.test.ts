import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { periodSearchSchema } from "./period";
import {
  accountsSearchSchema,
  cardDetailSearchSchema,
  creditCardsSearchSchema,
  transactionsSearchSchema,
} from "./search";

/**
 * Monta as rotas reais (layout `_app` com o período global + rotas filhas com os schemas de
 * search) e lê a search que o router entrega a `useSearch`. Só assim aparece o merge
 * `{ ...searchDoPai, ...searchValidada }`, que `schema.parse` direto não exercita: a search do
 * pai ainda carrega o query string bruto.
 */
async function searchAt(url: string) {
  const root = createRootRoute();
  const app = createRoute({
    getParentRoute: () => root,
    id: "_app",
    validateSearch: (search) => periodSearchSchema.parse(search),
  });
  const filho = (path: string, schema: { parse: (search: unknown) => unknown }) =>
    createRoute({
      getParentRoute: () => app,
      path,
      validateSearch: (search) => schema.parse(search) as Record<string, unknown>,
    });
  const router = createRouter({
    routeTree: root.addChildren([
      app.addChildren([
        filho("/transactions", transactionsSearchSchema),
        filho("/accounts", accountsSearchSchema),
        filho("/credit-cards", creditCardsSearchSchema),
        filho("/cards/$id", cardDetailSearchSchema),
      ]),
    ]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  await router.load();

  const leaf = router.matchRoutes(router.latestLocation).at(-1);

  return {
    search: leaf?.search as Record<string, unknown>,
    router,
  };
}

/** Só as chaves com valor: `undefined` explícito equivale a "ausente" para quem lê. */
function defined(search: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(search).filter(([, value]) => value !== undefined));
}

describe("search entregue pelo router (merge com a search do pai)", () => {
  it("o filtro especial 'sem categoria' vence a categoria", async () => {
    const { search } = await searchAt("/transactions?uncategorized=true&categoryId=X");

    expect(defined(search)).toEqual({ uncategorized: true });
  });

  it("?tx vence ?filters: o sheet de filtros não chega à tela", async () => {
    const { search } = await searchAt("/transactions?tx=t1&filters=true");

    expect(defined(search)).toEqual({ tx: "t1" });
  });

  it("valores inválidos não voltam crus", async () => {
    const { search } = await searchAt(
      "/transactions?pending=lixo&filters=lixo&sort=zzz&accountId=&period=ontem&from=x",
    );

    expect(defined(search)).toEqual({});
  });

  it("filtros válidos continuam passando", async () => {
    const { search } = await searchAt(
      "/transactions?q=cafe&type=expense&sort=amount_desc&period=90d&pending=true",
    );

    expect(defined(search)).toEqual({
      q: "cafe",
      type: "expense",
      sort: "amount_desc",
      period: "90d",
      pending: true,
    });
  });

  it("período não custom descarta from/to crus", async () => {
    const { search } = await searchAt("/transactions?period=7d&from=2026-01-01&to=2026-01-31");

    expect(defined(search)).toEqual({ period: "7d" });
  });

  it("custom sem as duas datas cai no padrão", async () => {
    const { search } = await searchAt("/accounts?period=custom&from=2026-01-01");

    expect(defined(search)).toEqual({});
  });

  it("a navegação a partir da search atual não ressuscita chaves descartadas", async () => {
    const { router } = await searchAt("/transactions?uncategorized=true&categoryId=X&pending=lixo");

    const next = router.buildLocation({
      to: "/transactions",
      search: (previous: Record<string, unknown>) => ({ ...previous, q: "oi" }),
    });

    expect(next.href).toBe("/transactions?uncategorized=true&q=oi");
  });

  it("Contas, Cartões e detalhe do cartão também não deixam valores crus", async () => {
    expect(defined((await searchAt("/accounts?connection=&institution=%20")).search)).toEqual({});
    expect(defined((await searchAt("/credit-cards?card=&bill=&filters=x")).search)).toEqual({
      filters: "x",
    });
    expect(defined((await searchAt("/cards/a?bill=")).search)).toEqual({});
    expect(defined((await searchAt("/cards/a?bill=b1&period=lixo")).search)).toEqual({
      bill: "b1",
    });
  });
});
