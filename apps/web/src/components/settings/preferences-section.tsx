import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Check } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERIOD_OPTIONS, type Period } from "@/lib/period";

import { SettingsCard, SettingsRow } from "./settings-section";
import {
  DEFAULT_PERIOD_STORAGE_KEY,
  defaultPeriodLabel,
  parseDefaultPeriod,
  resolveDefaultPeriod,
} from "./settings-view";

function readStoredDefaultPeriod(): string | null {
  try {
    return window.localStorage.getItem(DEFAULT_PERIOD_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Período padrão local: o contrato de settings não expõe esse campo. */
export function PreferencesSection() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>(() =>
    resolveDefaultPeriod(readStoredDefaultPeriod()),
  );
  const [status, setStatus] = useState<string | null>(null);

  function changePeriod(value: string) {
    const next = parseDefaultPeriod(value);
    if (!next) {
      return;
    }

    setPeriod(next);
    try {
      window.localStorage.setItem(DEFAULT_PERIOD_STORAGE_KEY, next);
      setStatus(`Preferência salva neste navegador: ${defaultPeriodLabel(next)}.`);
    } catch {
      setStatus("Não foi possível salvar neste navegador (armazenamento indisponível).");
    }
  }

  return (
    <SettingsCard
      title="Preferências"
      description="Com qual período o painel abre neste navegador."
    >
      <SettingsRow
        label="Período padrão"
        description="Vale só neste navegador quando você abre o painel."
        control={
          <Select value={period} onValueChange={changePeriod}>
            <SelectTrigger id="default-period" aria-label="Período padrão" className="w-48">
              <SelectValue placeholder="Escolha um período" />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.filter((option) => option.value !== "custom").map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <SettingsRow
        description="Abre a Visão geral com o período escolhido; você pode trocar depois por lá."
        control={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigate({ to: "/", search: (previous) => ({ ...previous, period }) });
            }}
          >
            <ArrowUpRight aria-hidden="true" />
            Ver no painel
          </Button>
        }
      >
        {status ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            <Check aria-hidden="true" className="size-3.5 text-positive" />
            {status}
          </p>
        ) : null}
      </SettingsRow>
    </SettingsCard>
  );
}
