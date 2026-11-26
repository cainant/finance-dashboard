import type { BudgetGroup } from "@fd/contracts";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Valor sentinela: o Radix Select não aceita `""` como valor de item. */
const NONE = "__none__";

export interface BudgetGroupSelectProps {
  groups: readonly BudgetGroup[];
  value: string | null;
  onChange: (groupId: string | null) => void;
  /** Texto do item "sem escolha" (ex.: "Sem grupo" ou "Grupo da categoria (…)"). */
  noneLabel: string;
  disabled?: boolean;
  className?: string;
  "aria-label": string;
}

/** Seletor de grupo de metas com bolinha da cor do grupo. */
export function BudgetGroupSelect({
  groups,
  value,
  onChange,
  noneLabel,
  disabled,
  className,
  "aria-label": ariaLabel,
}: BudgetGroupSelectProps) {
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(next) => onChange(next === NONE ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger aria-label={ariaLabel} className={cn("w-48", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>
          <span className="text-muted-foreground">{noneLabel}</span>
        </SelectItem>
        <SelectSeparator />
        {groups.map((group) => (
          <SelectItem key={group.id} value={group.id}>
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: group.color }}
              />
              {group.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
