import { CalendarRange, Check, ChevronDown } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/format";
import {
  PERIOD_OPTIONS,
  resolvePeriod,
  type PeriodSelection,
  type ResolvedPeriod,
} from "@/lib/period";
import { cn } from "@/lib/utils";

export interface PeriodFilterProps {
  value: PeriodSelection;
  onChange: (next: PeriodSelection) => void;
  /** Intervalo já resolvido (opcional; recalcula a partir de `value`). */
  resolved?: ResolvedPeriod;
  className?: string;
  align?: "start" | "center" | "end";
}

const PRESETS = PERIOD_OPTIONS.filter((option) => option.value !== "custom");

/**
 * Seletor de período com presets e intervalo personalizado. É controlado:
 * a página/rota decide onde persistir (search params), mantendo o componente
 * reutilizável e testável.
 */
export function PeriodFilter({
  value,
  onChange,
  resolved,
  className,
  align = "end",
}: PeriodFilterProps) {
  const [open, setOpen] = useState(false);
  const active = resolved ?? resolvePeriod(value);
  const initialFrom = value.from ?? active.from;
  const initialTo = value.to ?? active.to;
  const [draftFrom, setDraftFrom] = useState(initialFrom);
  const [draftTo, setDraftTo] = useState(initialTo);

  const customInvalid = !draftFrom || !draftTo || draftFrom > draftTo;
  const currentShort =
    PERIOD_OPTIONS.find((option) => option.value === active.period)?.shortLabel ?? "30d";

  function handleOpenChange(next: boolean) {
    if (next) {
      setDraftFrom(value.from ?? active.from);
      setDraftTo(value.to ?? active.to);
    }
    setOpen(next);
  }

  function applyPreset(period: PeriodSelection["period"]) {
    onChange({ period });
    setOpen(false);
  }

  function applyCustom() {
    if (customInvalid) {
      return;
    }

    onChange({ period: "custom", from: draftFrom, to: draftTo });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-2 font-normal", className)}
          aria-label={`Período: ${active.label}`}
        >
          <CalendarRange aria-hidden="true" className="text-muted-foreground" />
          <span className="hidden sm:inline">{active.label}</span>
          <span className="sm:hidden">{currentShort}</span>
          <ChevronDown aria-hidden="true" className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-72 p-0">
        <div className="border-b border-border/70 px-3 py-2.5">
          <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Período
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(active.from)} – {formatDate(active.to)}
          </p>
        </div>

        <div className="p-1.5" role="group" aria-label="Períodos predefinidos">
          {PRESETS.map((option) => {
            const selected = active.period === option.value;

            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => applyPreset(option.value)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-150",
                  "hover:bg-accent hover:text-accent-foreground",
                  selected ? "bg-accent/60 font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {option.label}
                {selected ? <Check aria-hidden="true" className="size-4 text-primary" /> : null}
              </button>
            );
          })}
        </div>

        <Separator />

        <div className="space-y-2.5 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-foreground">Intervalo personalizado</p>
            {active.period === "custom" ? (
              <span className="text-[11px] text-primary">Ativo</span>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="period-from" className="text-xs font-normal text-muted-foreground">
                De
              </Label>
              <Input
                id="period-from"
                type="date"
                value={draftFrom}
                max={draftTo || undefined}
                onChange={(event) => setDraftFrom(event.target.value)}
                className="h-8 px-2 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="period-to" className="text-xs font-normal text-muted-foreground">
                Até
              </Label>
              <Input
                id="period-to"
                type="date"
                value={draftTo}
                min={draftFrom || undefined}
                onChange={(event) => setDraftTo(event.target.value)}
                className="h-8 px-2 text-xs"
              />
            </div>
          </div>
          {customInvalid && draftFrom && draftTo ? (
            <p className="text-xs text-negative" role="alert">
              A data inicial deve ser anterior à final.
            </p>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={applyCustom}
            disabled={customInvalid}
          >
            Aplicar período
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
