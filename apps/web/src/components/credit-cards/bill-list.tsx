import { todayIsoDate, type Bill } from "@fd/contracts";
import { ReceiptText } from "lucide-react";

import { EmptyState } from "@/components/domain/empty-state";
import { MoneyText } from "@/components/domain/money-text";
import { Badge } from "@/components/ui/badge";
import { billDueLabel, billStatusForDisplay } from "@/lib/bills";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Data de referência para "vence em X dias" (avaliada uma vez por carga). */
const TODAY_ISO = todayIsoDate();

export interface BillListProps {
  bills: readonly Bill[];
  selectedBillId: string | null;
  onSelect: (billId: string) => void;
}

/** Faturas do cartão selecionado; cada linha de 44px é um botão com `aria-pressed`. */
export function BillList({ bills, selectedBillId, onSelect }: BillListProps) {
  if (bills.length === 0) {
    return (
      <EmptyState
        icon={ReceiptText}
        title="Nenhuma fatura sincronizada"
        description="As faturas aparecem depois que o cartão for sincronizado pela conexão."
        compact
        className="border-0 bg-transparent px-0 py-6"
      />
    );
  }

  return (
    <ul className="divide-y divide-border-subtle">
      {bills.map((bill, index) => {
        const status = billStatusForDisplay(bill, TODAY_ISO);
        const selected = bill.id === selectedBillId;
        const isLast = index === bills.length - 1;

        return (
          <li key={bill.id}>
            <button
              type="button"
              data-slot="bill-row"
              aria-pressed={selected}
              aria-label={`Fatura com vencimento em ${formatDate(bill.dueDate)} — ${status.label}`}
              onClick={() => onSelect(bill.id)}
              className={cn(
                "flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-left",
                "transition-colors duration-150 hover:bg-accent/60",
                "focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none",
                selected && "bg-accent/60",
                isLast && "rounded-b-[7px]",
              )}
            >
              <ReceiptText aria-hidden="true" className="size-4 shrink-0 text-subtle-foreground" />

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm leading-5 font-medium text-foreground">
                  Vencimento {formatDate(bill.dueDate)}
                </span>
                <span className="block truncate text-xs leading-4 text-muted-foreground">
                  {bill.closingDate ? `Fecha em ${formatDate(bill.closingDate)} · ` : ""}
                  {billDueLabel(bill, TODAY_ISO)}
                  {bill.minimumPaymentCents !== null ? (
                    <>
                      {" · mínimo "}
                      <MoneyText
                        valueCents={bill.minimumPaymentCents}
                        tone="neutral"
                        size="sm"
                        className="text-xs"
                      />
                    </>
                  ) : null}
                </span>
              </span>

              <Badge variant={status.variant}>{status.label}</Badge>
              <MoneyText
                valueCents={bill.totalCents}
                size="sm"
                tone="neutral"
                className="shrink-0"
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
