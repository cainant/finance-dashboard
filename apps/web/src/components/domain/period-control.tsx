import { useNavigate, useSearch } from "@tanstack/react-router";
import { CalendarRange, Check } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDate } from "@/lib/format";
import { useMediaQuery } from "@/lib/hooks";
import {
  PERIOD_OPTIONS,
  periodLabel,
  periodSelectionFromSearch,
  resolvePeriod,
  type Period,
  type PeriodSelection,
} from "@/lib/period";
import { cn } from "@/lib/utils";

/** Presets que cabem no ToggleGroup; o restante vive no menu do calendário. */
const QUICK_PERIODS = ["7d", "30d", "90d", "12m"] as const;

type QuickPeriod = (typeof QUICK_PERIODS)[number];

const CALENDAR_PRESETS = ["mtd", "last-month", "ytd"] as const satisfies readonly Period[];

const QUICK_LABELS: Record<QuickPeriod, string> = {
  "7d": "7D",
  "30d": "30D",
  "90d": "90D",
  "12m": "12M",
};

function isQuickPeriod(period: Period): period is QuickPeriod {
  return (QUICK_PERIODS as readonly Period[]).includes(period);
}

export interface PeriodControlProps {
  className?: string;
}

/**
 * Controle de período do cabeçalho de página.
 *
 * Lê e grava os search params do layout `_app` (fonte da verdade do período),
 * preservando os demais filtros da rota atual. Desktop: ToggleGroup 7D/30D/90D/
 * 12M + menu de calendário (Este mês, Mês passado, Este ano, Personalizado).
 * Mobile: um Select com as mesmas opções; ele encolhe (`min-w-0`/`flex-1`)
 * para dividir a linha do cabeçalho com as demais ações.
 */
export function PeriodControl({ className }: PeriodControlProps) {
  const search = useSearch({ from: "/_app" });
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 639px)");
  const fieldId = useId();
  const [open, setOpen] = useState(false);

  const selection = periodSelectionFromSearch(search);
  const active = resolvePeriod(selection);
  const [draftFrom, setDraftFrom] = useState(selection.from ?? active.from);
  const [draftTo, setDraftTo] = useState(selection.to ?? active.to);

  const customInvalid = !draftFrom || !draftTo || draftFrom > draftTo;

  function apply(next: PeriodSelection) {
    void navigate({
      to: ".",
      search: (previous) => ({
        ...previous,
        period: next.period,
        from: next.period === "custom" ? next.from : undefined,
        to: next.period === "custom" ? next.to : undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  }

  function syncDrafts() {
    setDraftFrom(selection.from ?? active.from);
    setDraftTo(selection.to ?? active.to);
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      syncDrafts();
    }
    setOpen(next);
  }

  function applyPreset(period: Period) {
    apply({ period });
    setOpen(false);
  }

  function applyCustom() {
    if (customInvalid) {
      return;
    }

    apply({ period: "custom", from: draftFrom, to: draftTo });
    setOpen(false);
  }

  function handleSelect(value: string) {
    if (value === "custom") {
      syncDrafts();
      setOpen(true);
      return;
    }

    apply({ period: value as Period });
  }

  const calendarPanel = (
    <>
      <div className="border-b border-border-subtle px-3 py-2.5">
        <p className="text-xs font-medium text-muted-foreground">Período</p>
        <p className="mt-0.5 text-sm font-medium text-foreground">{active.label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatDate(active.from)} – {formatDate(active.to)}
        </p>
      </div>

      <div className="p-1.5" role="group" aria-label="Períodos do calendário">
        {CALENDAR_PRESETS.map((period) => {
          const selected = active.period === period;

          return (
            <button
              key={period}
              type="button"
              aria-pressed={selected}
              onClick={() => applyPreset(period)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-150",
                "hover:bg-accent hover:text-accent-foreground",
                selected ? "bg-accent/60 font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {periodLabel(period)}
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
            <span className="text-[11px] font-medium text-primary">Ativo</span>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label
              htmlFor={`${fieldId}-from`}
              className="text-xs font-normal text-muted-foreground"
            >
              De
            </Label>
            <Input
              id={`${fieldId}-from`}
              type="date"
              value={draftFrom}
              max={draftTo || undefined}
              onChange={(event) => setDraftFrom(event.target.value)}
              className="h-8 px-2 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${fieldId}-to`} className="text-xs font-normal text-muted-foreground">
              Até
            </Label>
            <Input
              id={`${fieldId}-to`}
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
    </>
  );

  if (isMobile) {
    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverAnchor asChild>
          <div
            className={cn("w-full min-w-0 max-w-56 flex-1", className)}
            data-slot="period-control"
          >
            <Select value={active.period} onValueChange={handleSelect}>
              <SelectTrigger
                size="sm"
                className="h-9 w-full text-[13px]"
                aria-label={`Período: ${active.label}`}
              >
                <CalendarRange aria-hidden="true" className="text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {PERIOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </PopoverAnchor>
        <PopoverContent align="start" className="w-72 p-0">
          {calendarPanel}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <div className={cn("flex items-center gap-2", className)} data-slot="period-control">
        <ToggleGroup
          type="single"
          value={isQuickPeriod(active.period) ? active.period : ""}
          onValueChange={(value) => {
            if (value) {
              apply({ period: value as Period });
            }
          }}
          aria-label="Período"
          className="h-8"
        >
          {QUICK_PERIODS.map((period) => (
            <ToggleGroupItem
              key={period}
              value={period}
              aria-label={periodLabel(period)}
              title={periodLabel(period)}
            >
              {QUICK_LABELS[period]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-[13px] font-normal"
            aria-label={`Período: ${active.label}`}
          >
            <CalendarRange aria-hidden="true" className="size-4 text-muted-foreground" />
            {isQuickPeriod(active.period) ? null : <span>{active.label}</span>}
          </Button>
        </PopoverTrigger>
      </div>
      <PopoverContent align="end" className="w-72 p-0">
        {calendarPanel}
      </PopoverContent>
    </Popover>
  );
}
