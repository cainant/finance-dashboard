import { BUDGET_TOTAL_BPS } from "@fd/contracts";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { useMoneyFormatter } from "@/components/privacy/privacy-context";
import {
  allocatedBps,
  centsForBps,
  type BudgetGroupDraft,
  type BudgetInputMode,
} from "@/lib/budget";
import { formatPercent } from "@/lib/format";

/** Fatia "livre" (renda ainda não distribuída): token neutro, não cor de grupo. */
const FREE_SLICE_COLOR = "var(--muted)";

export interface AllocationDonutProps {
  drafts: readonly BudgetGroupDraft[];
  incomeCents: number | null;
  mode: BudgetInputMode;
}

/** Donut da distribuição planejada + legenda com o percentual (ou valor) de cada grupo. */
export function AllocationDonut({ drafts, incomeCents, mode }: AllocationDonutProps) {
  const money = useMoneyFormatter();
  const allocated = allocatedBps(drafts);
  const free = Math.max(0, BUDGET_TOTAL_BPS - allocated);
  const percent = (bps: number) =>
    formatPercent(bps / BUDGET_TOTAL_BPS, { maximumFractionDigits: 2 });

  const slices = [
    ...drafts
      .filter((draft) => draft.targetBps > 0)
      .map((draft) => ({ key: draft.key, value: draft.targetBps, color: draft.color })),
    ...(free > 0 ? [{ key: "__free__", value: free, color: FREE_SLICE_COLOR }] : []),
  ];

  return (
    <div className="space-y-5">
      <div
        className="relative mx-auto aspect-square w-full max-w-[260px]"
        role="img"
        aria-label={`Distribuição das metas: ${percent(allocated)} alocado`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="key"
              innerRadius="68%"
              outerRadius="98%"
              paddingAngle={slices.length > 1 ? 1.5 : 0}
              stroke="none"
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
            >
              {slices.map((slice) => (
                <Cell key={slice.key} fill={slice.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-foreground tabular-nums">
            {mode === "value" && incomeCents
              ? money.formatCurrency(centsForBps(allocated, incomeCents))
              : percent(allocated)}
          </span>
          <span className="text-xs text-muted-foreground">Total</span>
        </div>
      </div>

      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {drafts.map((draft) => (
          <li key={draft.key} className="flex min-h-6 items-center gap-2 text-[13px]">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: draft.color }}
            />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
              {draft.name || "Sem nome"}
            </span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {mode === "value" && incomeCents
                ? money.formatCurrency(centsForBps(draft.targetBps, incomeCents))
                : percent(draft.targetBps)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
