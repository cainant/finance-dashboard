import type { Transaction } from "@fd/contracts";

export const TYPE_LABELS: Record<Transaction["type"], string> = {
  income: "Receita",
  expense: "Despesa",
  transfer: "Transferência (entre contas)",
};

/** Tooltip do rótulo: o campo é a classificação do sync, não a categoria. */
export const MOVEMENT_HINT =
  "Classificação da movimentação vinda do provedor. Transferências entre contas não entram em receitas nem despesas.";

/** "3 de 10" para compra parcelada; `null` à vista ou sem informação do provedor. */
export function installmentLabel(
  transaction: Pick<Transaction, "installmentNumber" | "totalInstallments">,
): string | null {
  const { installmentNumber, totalInstallments } = transaction;
  if (installmentNumber === null || totalInstallments === null || totalInstallments < 2) {
    return null;
  }
  return `${installmentNumber} de ${totalInstallments}`;
}
