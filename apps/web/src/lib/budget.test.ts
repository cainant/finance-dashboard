import type { BudgetGroup } from "@fd/contracts";
import { describe, expect, it } from "vitest";

import {
  BUDGET_GROUP_PALETTE,
  budgetUsage,
  bpsForCents,
  bpsToPercent,
  categoryGroupMap,
  centsForBps,
  draftProblem,
  draftsFromBudget,
  draftsToInput,
  effectiveBudgetGroup,
  formatMoneyInput,
  isDraftDirty,
  nextGroupColor,
  parseMoneyInput,
  percentToBps,
  shiftMonth,
  usageFill,
  type BudgetGroupDraft,
} from "./budget";

const saved: BudgetGroup[] = [
  { id: "g1", name: "Custos Fixos", color: "#0a84ff", targetBps: 3000, position: 0 },
  { id: "g2", name: "Prazeres", color: "#ff7a00", targetBps: 1500, position: 1 },
];

function draft(overrides: Partial<BudgetGroupDraft> = {}): BudgetGroupDraft {
  return { key: "k", name: "Grupo", color: "#000000", targetBps: 0, ...overrides };
}

describe("conversões", () => {
  it("percentual ↔ pontos-base, limitado a 0–100%", () => {
    expect(bpsToPercent(2500)).toBe(25);
    expect(percentToBps(25)).toBe(2500);
    expect(percentToBps(12.345)).toBe(1235);
    expect(percentToBps(150)).toBe(10_000);
    expect(percentToBps(-3)).toBe(0);
    expect(percentToBps(Number.NaN)).toBe(0);
  });

  it("valor da meta a partir da renda (imagem: 25% de R$ 6.500 = R$ 1.625)", () => {
    expect(centsForBps(2500, 650_000)).toBe(162_500);
    expect(centsForBps(3000, 650_000)).toBe(195_000);
    expect(centsForBps(3333, 100)).toBe(33);
    expect(centsForBps(2500, null)).toBe(0);
    expect(centsForBps(2500, 0)).toBe(0);
  });

  it("percentual a partir de um valor em reais", () => {
    expect(bpsForCents(162_500, 650_000)).toBe(2500);
    expect(bpsForCents(100_000, 650_000)).toBe(1538);
    expect(bpsForCents(900_000, 650_000)).toBe(10_000);
    expect(bpsForCents(100_000, null)).toBe(0);
  });
});

describe("parseMoneyInput", () => {
  it.each([
    ["6.500,00", 650_000],
    ["6500", 650_000],
    ["R$ 6.500,5", 650_050],
    ["6500.75", 650_075],
    ["6.500", 650_000],
    ["1.234.567,89", 123_456_789],
    ["0,99", 99],
    [" 12 ", 1_200],
  ])("%s → %d centavos", (raw, cents) => {
    expect(parseMoneyInput(raw)).toBe(cents);
  });

  it.each(["", "abc", "-10", "1,2,3", "10,999"])("rejeita %j", (raw) => {
    expect(parseMoneyInput(raw)).toBeNull();
  });

  it("formatMoneyInput é o inverso legível", () => {
    expect(formatMoneyInput(650_000)).toBe("6.500,00");
    expect(parseMoneyInput(formatMoneyInput(123_456_789))).toBe(123_456_789);
  });
});

describe("rascunho dos grupos", () => {
  it("ida e volta sem alteração não fica sujo", () => {
    const drafts = draftsFromBudget(saved);
    expect(isDraftDirty(drafts, saved)).toBe(false);
    expect(draftsToInput(drafts)).toEqual([
      { id: "g1", name: "Custos Fixos", color: "#0a84ff", targetBps: 3000 },
      { id: "g2", name: "Prazeres", color: "#ff7a00", targetBps: 1500 },
    ]);
  });

  it("percentual, nome, ordem e grupo novo deixam o rascunho sujo", () => {
    const drafts = draftsFromBudget(saved);
    expect(isDraftDirty([{ ...drafts[0]!, targetBps: 3100 }, drafts[1]!], saved)).toBe(true);
    expect(isDraftDirty([{ ...drafts[0]!, name: "Fixos" }, drafts[1]!], saved)).toBe(true);
    expect(isDraftDirty([drafts[1]!, drafts[0]!], saved)).toBe(true);
    expect(isDraftDirty([...drafts, draft()], saved)).toBe(true);
    // Espaços nas pontas não contam (a API recebe o nome com trim).
    expect(isDraftDirty([{ ...drafts[0]!, name: " Custos Fixos " }, drafts[1]!], saved)).toBe(
      false,
    );
  });

  it("grupo novo vai sem id e com o nome sem espaços nas pontas", () => {
    expect(draftsToInput([draft({ name: "  Viagens " })])).toEqual([
      { name: "Viagens", color: "#000000", targetBps: 0 },
    ]);
  });

  it("aponta o motivo que impede salvar", () => {
    expect(draftProblem([])).toEqual({ kind: "no-groups" });
    expect(draftProblem([draft({ name: "  " })])).toEqual({ kind: "empty-name" });
    expect(
      draftProblem([draft({ targetBps: 6000 }), draft({ key: "b", targetBps: 4001 })]),
    ).toEqual({ kind: "over-allocated", allocatedBps: 10_001 });
    expect(
      draftProblem(Array.from({ length: 13 }, (_, index) => draft({ key: `${index}` }))),
    ).toEqual({ kind: "too-many-groups" });
    expect(draftProblem([draft({ targetBps: 10_000 })])).toBeNull();
  });

  it("sugere a primeira cor livre da paleta", () => {
    expect(nextGroupColor([])).toBe(BUDGET_GROUP_PALETTE[0]);
    expect(nextGroupColor([{ color: "#6D5BD0" }])).toBe(BUDGET_GROUP_PALETTE[1]);
    const all = BUDGET_GROUP_PALETTE.map((color) => ({ color }));
    expect(BUDGET_GROUP_PALETTE).toContain(nextGroupColor(all));
  });
});

describe("effectiveBudgetGroup", () => {
  const map = categoryGroupMap({ categoryGroups: [{ categoryId: "cat_mercado", groupId: "g1" }] });

  it("exceção da transação vence a categoria", () => {
    expect(effectiveBudgetGroup({ budgetGroupId: "g2", categoryId: "cat_mercado" }, map)).toEqual({
      groupId: "g2",
      source: "transaction",
    });
  });

  it("sem exceção herda da categoria", () => {
    expect(effectiveBudgetGroup({ budgetGroupId: null, categoryId: "cat_mercado" }, map)).toEqual({
      groupId: "g1",
      source: "category",
    });
  });

  it("sem exceção nem vínculo fica sem grupo", () => {
    expect(effectiveBudgetGroup({ budgetGroupId: null, categoryId: "cat_lazer" }, map)).toEqual({
      groupId: null,
      source: "none",
    });
    expect(effectiveBudgetGroup({ budgetGroupId: null, categoryId: null }, map).source).toBe(
      "none",
    );
  });
});

describe("realizado do mês", () => {
  it("shiftMonth atravessa o ano", () => {
    expect(shiftMonth("2026-11", 1)).toBe("2026-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-03", -14)).toBe("2025-01");
  });

  it("budgetUsage classifica o consumo", () => {
    expect(budgetUsage(100, null)).toBe("untracked");
    expect(budgetUsage(0, 0)).toBe("ok");
    expect(budgetUsage(1, 0)).toBe("over");
    expect(budgetUsage(8_499, 10_000)).toBe("ok");
    expect(budgetUsage(8_500, 10_000)).toBe("near");
    expect(budgetUsage(10_000, 10_000)).toBe("near");
    expect(budgetUsage(10_001, 10_000)).toBe("over");
  });

  it("usageFill limita a barra a 100%", () => {
    expect(usageFill(5_000, 10_000)).toBe(0.5);
    expect(usageFill(15_000, 10_000)).toBe(1);
    expect(usageFill(1, 0)).toBe(1);
    expect(usageFill(0, 0)).toBe(0);
    expect(usageFill(-300, 10_000)).toBe(0);
    expect(usageFill(5_000, null)).toBe(0);
  });
});
