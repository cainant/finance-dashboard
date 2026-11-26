/**
 * Regras puras da tela de Metas: conversões entre percentual (pontos-base),
 * reais (centavos) e a renda de referência, rascunho editável dos grupos e o
 * grupo efetivo de uma transação.
 */
import {
  BUDGET_MAX_GROUPS,
  BUDGET_TOTAL_BPS,
  type Budget,
  type BudgetGroup,
  type BudgetGroupInput,
  type Transaction,
} from "@fd/contracts";

/** Como a tela edita as metas: percentual da renda ou valor mensal em reais. */
export type BudgetInputMode = "percent" | "value";

/** Grupo em edição: `id` ausente = grupo novo, ainda não salvo. */
export interface BudgetGroupDraft {
  key: string;
  id?: string;
  name: string;
  color: string;
  targetBps: number;
}

/** Cores sugeridas para grupos novos, na ordem. */
export const BUDGET_GROUP_PALETTE = [
  "#6d5bd0",
  "#0a84ff",
  "#ff66b2",
  "#8e1a8e",
  "#ff7a00",
  "#facc15",
  "#14b8a6",
  "#22c55e",
  "#ef4444",
  "#64748b",
  "#a855f7",
  "#0ea5e9",
] as const;

export function clampBps(bps: number): number {
  if (!Number.isFinite(bps)) return 0;
  return Math.min(BUDGET_TOTAL_BPS, Math.max(0, Math.round(bps)));
}

/** `2500` → `25` (percentual com até 2 casas). */
export function bpsToPercent(bps: number): number {
  return bps / 100;
}

/** `25` → `2500`, limitado a 0–100%. */
export function percentToBps(percent: number): number {
  return clampBps(percent * 100);
}

/** Valor mensal da meta em centavos (arredondado ao centavo). */
export function centsForBps(bps: number, incomeCents: number | null): number {
  if (incomeCents === null || incomeCents <= 0) return 0;
  return Math.round((incomeCents * bps) / BUDGET_TOTAL_BPS);
}

/** Percentual (pontos-base) equivalente a um valor; sem renda não há base. */
export function bpsForCents(cents: number, incomeCents: number | null): number {
  if (incomeCents === null || incomeCents <= 0) return 0;
  return clampBps((cents * BUDGET_TOTAL_BPS) / incomeCents);
}

export function allocatedBps(groups: readonly Pick<BudgetGroupDraft, "targetBps">[]): number {
  return groups.reduce((total, group) => total + group.targetBps, 0);
}

/**
 * Converte texto digitado em pt-BR para centavos: "6.500,00", "6500", "R$ 6.500,5"
 * e "6500.75" são aceitos. Devolve `null` quando não há número válido.
 */
export function parseMoneyInput(raw: string): number | null {
  // `\s` já cobre o espaço não separável (U+00A0) do `Intl.NumberFormat`.
  const cleaned = raw.replace(/[R$\s]/g, "");
  if (cleaned === "" || !/^[\d.,]+$/.test(cleaned)) return null;
  // Mais de uma vírgula não tem leitura certa ("1,2,3").
  if (cleaned.indexOf(",") !== cleaned.lastIndexOf(",")) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0) {
    // Vírgula é o separador decimal; pontos são milhar.
    normalized = `${cleaned.slice(0, lastComma).replace(/\./g, "")}.${cleaned.slice(lastComma + 1)}`;
  } else if (
    lastDot >= 0 &&
    cleaned.length - lastDot - 1 <= 2 &&
    cleaned.indexOf(".") === lastDot
  ) {
    // Um único ponto seguido de 1–2 dígitos: decimal ("6500.75").
    normalized = cleaned;
  } else {
    normalized = cleaned.replace(/\./g, "");
  }

  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

/** Centavos → texto editável ("6.500,00"), sem símbolo de moeda. */
export function formatMoneyInput(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function draftsFromBudget(groups: readonly BudgetGroup[]): BudgetGroupDraft[] {
  return groups.map((group) => ({
    key: group.id,
    id: group.id,
    name: group.name,
    color: group.color,
    targetBps: group.targetBps,
  }));
}

export function draftsToInput(drafts: readonly BudgetGroupDraft[]): BudgetGroupInput[] {
  return drafts.map((draft) => ({
    ...(draft.id ? { id: draft.id } : {}),
    name: draft.name.trim(),
    color: draft.color,
    targetBps: draft.targetBps,
  }));
}

/** `true` quando o rascunho difere do que está salvo (ordem incluída). */
export function isDraftDirty(
  drafts: readonly BudgetGroupDraft[],
  saved: readonly BudgetGroup[],
): boolean {
  if (drafts.length !== saved.length) return true;
  return drafts.some((draft, index) => {
    const group = saved[index];
    return (
      !group ||
      draft.id !== group.id ||
      draft.name.trim() !== group.name ||
      draft.color !== group.color ||
      draft.targetBps !== group.targetBps
    );
  });
}

export type DraftProblem =
  | { kind: "over-allocated"; allocatedBps: number }
  | { kind: "empty-name" }
  | { kind: "no-groups" }
  | { kind: "too-many-groups" };

/** O primeiro motivo que impede salvar, ou `null`. Espelha `updateBudgetBody`. */
export function draftProblem(drafts: readonly BudgetGroupDraft[]): DraftProblem | null {
  if (drafts.length === 0) return { kind: "no-groups" };
  if (drafts.length > BUDGET_MAX_GROUPS) return { kind: "too-many-groups" };
  if (drafts.some((draft) => draft.name.trim() === "")) return { kind: "empty-name" };
  const allocated = allocatedBps(drafts);
  if (allocated > BUDGET_TOTAL_BPS) return { kind: "over-allocated", allocatedBps: allocated };
  return null;
}

/** Primeira cor da paleta ainda não usada (ou a próxima na rotação). */
export function nextGroupColor(drafts: readonly Pick<BudgetGroupDraft, "color">[]): string {
  const used = new Set(drafts.map((draft) => draft.color.toLowerCase()));
  const free = BUDGET_GROUP_PALETTE.find((color) => !used.has(color));
  return free ?? BUDGET_GROUP_PALETTE[drafts.length % BUDGET_GROUP_PALETTE.length]!;
}

/** Mapa `categoryId → groupId` a partir da resposta da API. */
export function categoryGroupMap(budget: Pick<Budget, "categoryGroups">): Map<string, string> {
  return new Map(budget.categoryGroups.map((link) => [link.categoryId, link.groupId]));
}

export interface EffectiveBudgetGroup {
  groupId: string | null;
  /** `transaction` = exceção manual; `category` = herdado da categoria. */
  source: "transaction" | "category" | "none";
}

/** Grupo efetivo: exceção da transação → grupo da categoria → sem grupo. */
export function effectiveBudgetGroup(
  transaction: Pick<Transaction, "budgetGroupId" | "categoryId">,
  categoryGroups: ReadonlyMap<string, string>,
): EffectiveBudgetGroup {
  if (transaction.budgetGroupId) {
    return { groupId: transaction.budgetGroupId, source: "transaction" };
  }
  const fromCategory = transaction.categoryId ? categoryGroups.get(transaction.categoryId) : null;
  return fromCategory
    ? { groupId: fromCategory, source: "category" }
    : { groupId: null, source: "none" };
}

/** `2026-11` + 1 → `2026-12`; atravessa o ano nos dois sentidos. */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, monthNumber! - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

/** Faixa de consumo da meta no mês. */
export type BudgetUsage = "untracked" | "ok" | "near" | "over";

/** A partir deste consumo a meta entra em atenção. */
export const BUDGET_NEAR_RATIO = 0.85;

/**
 * `untracked` sem meta em R$ (sem renda de referência); `over` acima da meta
 * (inclui gastar qualquer valor numa meta de 0%); `near` a partir de 85%.
 */
export function budgetUsage(spentCents: number, targetCents: number | null): BudgetUsage {
  if (targetCents === null) return "untracked";
  if (spentCents > targetCents) return "over";
  if (targetCents > 0 && spentCents >= targetCents * BUDGET_NEAR_RATIO) return "near";
  return "ok";
}

/** Fração da barra preenchida (0–1); acima da meta a barra fica cheia. */
export function usageFill(spentCents: number, targetCents: number | null): number {
  if (targetCents === null || spentCents <= 0) return 0;
  if (targetCents === 0) return 1;
  return Math.min(1, spentCents / targetCents);
}
