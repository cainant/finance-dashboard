import type { Category, TransactionType } from "@fd/contracts";
import { describe, expect, it } from "vitest";

import { buildCategoryOptions, CATEGORY_KIND_LABEL, kindForType } from "./category-picker-options";

function category(overrides: Pick<Category, "id" | "name" | "kind"> & Partial<Category>): Category {
  return {
    userId: null,
    slug: overrides.id,
    icon: "Tag",
    color: "#8b8b8b",
    parentId: null,
    ...overrides,
  };
}

const mercado = category({ id: "cat_mercado", name: "Mercado", kind: "expense" });
const lazer = category({ id: "cat_lazer", name: "Lazer", kind: "expense" });
const transferencias = category({
  id: "cat_transferencias",
  name: "Transferências",
  kind: "transfer",
});
const salario = category({ id: "cat_salario", name: "Salário", kind: "income" });

const categories = [mercado, lazer, transferencias, salario];

describe("buildCategoryOptions", () => {
  it("filtra as demais opções pela natureza do lançamento", () => {
    const { options } = buildCategoryOptions({ categories, current: null, type: "expense" });

    expect(options.map((option) => option.name)).toEqual(["Lazer", "Mercado"]);
  });

  it("fixa no topo a categoria atual de outra natureza", () => {
    // Cenário do bug: Pix enviado a terceiro é `expense` mas recebe a categoria
    // de sistema "Transferências" (`kind: transfer`). O filtro por natureza a
    // escondia e o usuário não conseguia voltar depois de trocar.
    const { pinned, options } = buildCategoryOptions({
      categories,
      current: transferencias,
      type: "expense",
    });

    expect(pinned?.id).toBe(transferencias.id);
    expect(options.map((option) => option.name)).toEqual(["Lazer", "Mercado"]);
    expect(options.some((option) => option.id === transferencias.id)).toBe(false);
  });

  it("fixa a categoria atual no topo também para receita e transferência", () => {
    const income = buildCategoryOptions({ categories, current: mercado, type: "income" });
    expect(income.pinned?.id).toBe(mercado.id);
    expect(income.options.map((option) => option.name)).toEqual(["Salário"]);

    const transfer = buildCategoryOptions({ categories, current: salario, type: "transfer" });
    expect(transfer.pinned?.id).toBe(salario.id);
    expect(transfer.options.map((option) => option.name)).toEqual(["Transferências"]);
  });

  it("não repete a categoria atual quando ela já é da mesma natureza", () => {
    const { pinned, options } = buildCategoryOptions({
      categories,
      current: mercado,
      type: "expense",
    });

    expect(pinned).toBeNull();
    expect(options.map((option) => option.name)).toEqual(["Lazer", "Mercado"]);
  });

  it("sem categoria atual não há nada fixado", () => {
    const { pinned } = buildCategoryOptions({ categories, current: null, type: "expense" });

    expect(pinned).toBeNull();
  });

  it("mantém a categoria de origem no topo depois de trocar por uma de mesma natureza", () => {
    // Depois de trocar de categoria a linha deixa de ter a de outra natureza,
    // mas a troca precisa ser reversível: a origem continua fixada (sem marca).
    const { pinned, options } = buildCategoryOptions({
      categories,
      current: mercado,
      origin: transferencias,
      type: "expense",
    });

    expect(pinned?.id).toBe(transferencias.id);
    expect(options.map((option) => option.name)).toEqual(["Lazer", "Mercado"]);
  });

  it("mantém a origem fixada mesmo quando a linha fica sem categoria", () => {
    const { pinned } = buildCategoryOptions({
      categories,
      current: null,
      origin: transferencias,
      type: "expense",
    });

    expect(pinned?.id).toBe(transferencias.id);
  });

  it("a categoria atual vence a de origem", () => {
    const { pinned } = buildCategoryOptions({
      categories,
      current: transferencias,
      origin: salario,
      type: "expense",
    });

    expect(pinned?.id).toBe(transferencias.id);
  });

  it("ignora a origem quando ela é da mesma natureza do lançamento", () => {
    // Não há o que fixar: a categoria já está na lista normal.
    const { pinned } = buildCategoryOptions({
      categories,
      current: null,
      origin: mercado,
      type: "expense",
    });

    expect(pinned).toBeNull();
  });

  it("mantém a categoria fixada visível enquanto a busca filtra as demais", () => {
    // A busca restringe as opções da natureza, não a categoria atual: ela fica
    // sempre alcançável para o usuário poder voltar.
    const { pinned, options } = buildCategoryOptions({
      categories,
      current: transferencias,
      type: "expense",
      query: "  laz  ",
    });

    expect(pinned?.id).toBe(transferencias.id);
    expect(options.map((option) => option.name)).toEqual(["Lazer"]);
  });

  it("busca sem resultado zera as opções e mantém só a fixada", () => {
    const { pinned, options } = buildCategoryOptions({
      categories,
      current: transferencias,
      type: "expense",
      query: "inexistente",
    });

    expect(pinned?.id).toBe(transferencias.id);
    expect(options).toEqual([]);
  });

  it("ordena as opções em pt-BR", () => {
    const acentos = [
      category({ id: "cat_saude", name: "Saúde", kind: "expense" }),
      category({ id: "cat_assinaturas", name: "Assinaturas", kind: "expense" }),
      category({ id: "cat_educacao", name: "Educação", kind: "expense" }),
    ];

    const { options } = buildCategoryOptions({
      categories: acentos,
      current: null,
      type: "expense",
    });

    expect(options.map((option) => option.name)).toEqual(["Assinaturas", "Educação", "Saúde"]);
  });
});

describe("kindForType", () => {
  const cases: Array<[TransactionType, Category["kind"]]> = [
    ["income", "income"],
    ["expense", "expense"],
    ["transfer", "transfer"],
  ];

  it.each(cases)("mapeia %s para %s", (type, expected) => {
    expect(kindForType(type)).toBe(expected);
  });
});

describe("CATEGORY_KIND_LABEL", () => {
  it("rotula as naturezas em pt-BR para a indicação discreta", () => {
    expect(CATEGORY_KIND_LABEL).toEqual({
      income: "Receita",
      expense: "Despesa",
      transfer: "Transferência",
    });
  });
});
