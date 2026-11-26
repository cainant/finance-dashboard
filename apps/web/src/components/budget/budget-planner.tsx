import { BUDGET_MAX_GROUPS, BUDGET_TOTAL_BPS, type BudgetGroup } from "@fd/contracts";
import { DollarSign, Percent, Plus, Trash2 } from "lucide-react";
import { useId, useState, type CSSProperties } from "react";

import { useMoneyFormatter } from "@/components/privacy/privacy-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  allocatedBps,
  bpsForCents,
  bpsToPercent,
  centsForBps,
  draftProblem,
  draftsFromBudget,
  draftsToInput,
  formatMoneyInput,
  isDraftDirty,
  nextGroupColor,
  parseMoneyInput,
  percentToBps,
  type BudgetGroupDraft,
  type BudgetInputMode,
  type DraftProblem,
} from "@/lib/budget";
import { formatPercent } from "@/lib/format";
import { useUpdateBudgetMutation } from "@/lib/mutations";
import { cn } from "@/lib/utils";

import { AllocationDonut } from "./allocation-donut";

export interface BudgetPlannerProps {
  groups: readonly BudgetGroup[];
  incomeCents: number | null;
}

/**
 * Distribuição da renda entre os grupos. Edita um rascunho local e grava a
 * lista inteira em "Salvar metas" (`PUT /api/budget`); a página remonta o
 * componente quando a resposta chega, então o rascunho recomeça do salvo.
 */
export function BudgetPlanner({ groups, incomeCents }: BudgetPlannerProps) {
  const [drafts, setDrafts] = useState<BudgetGroupDraft[]>(() => draftsFromBudget(groups));
  const [mode, setMode] = useState<BudgetInputMode>("percent");
  const mutation = useUpdateBudgetMutation("Metas salvas");
  const hasIncome = incomeCents !== null && incomeCents > 0;
  const effectiveMode: BudgetInputMode = hasIncome ? mode : "percent";

  const dirty = isDraftDirty(drafts, groups);
  const problem = draftProblem(drafts);
  const allocated = allocatedBps(drafts);

  function update(key: string, change: Partial<BudgetGroupDraft>) {
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...change } : draft)),
    );
  }

  function addGroup() {
    setDrafts((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        name: "Novo grupo",
        color: nextGroupColor(current),
        targetBps: 0,
      },
    ]);
  }

  function removeGroup(key: string) {
    setDrafts((current) => current.filter((draft) => draft.key !== key));
  }

  function save() {
    if (problem || !dirty) return;
    mutation.mutate({ groups: draftsToInput(drafts) });
  }

  return (
    <div className="space-y-4">
      <ToggleGroup
        type="single"
        value={effectiveMode}
        onValueChange={(value) => {
          if (value === "percent" || value === "value") setMode(value);
        }}
        aria-label="Editar metas por"
      >
        <ToggleGroupItem value="percent" size="lg">
          <Percent aria-hidden="true" />
          Porcentagem
        </ToggleGroupItem>
        <ToggleGroupItem
          value="value"
          size="lg"
          disabled={!hasIncome}
          title={hasIncome ? undefined : "Defina a renda de referência para editar em reais."}
        >
          <DollarSign aria-hidden="true" />
          Valor (R$)
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Visualização de uso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <AllocationDonut drafts={drafts} incomeCents={incomeCents} mode={effectiveMode} />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={!dirty || mutation.isPending}
              onClick={() => setDrafts(draftsFromBudget(groups))}
            >
              Desfazer alterações
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Controle de orçamento</CardTitle>
            <CardDescription>
              {effectiveMode === "percent"
                ? "% da renda de referência — o valor é recalculado"
                : "R$ por mês — o percentual é recalculado"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border-subtle">
              {drafts.map((draft) => (
                <GroupControl
                  key={draft.key}
                  draft={draft}
                  mode={effectiveMode}
                  incomeCents={incomeCents}
                  canRemove={drafts.length > 1}
                  onChange={(change) => update(draft.key, change)}
                  onRemove={() => removeGroup(draft.key)}
                />
              ))}
            </ul>

            <div className="space-y-3 border-t border-border-subtle p-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addGroup}
                disabled={drafts.length >= BUDGET_MAX_GROUPS}
              >
                <Plus aria-hidden="true" />
                Adicionar grupo
              </Button>

              <AllocatedRow allocatedBps={allocated} incomeCents={incomeCents} />

              {problem && dirty ? (
                <p role="alert" className="text-[13px] text-negative">
                  {problemMessage(problem)}
                </p>
              ) : null}

              <Button
                type="button"
                className="w-full"
                onClick={save}
                disabled={!dirty || problem !== null || mutation.isPending}
              >
                {mutation.isPending ? "Salvando…" : "Salvar metas"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function problemMessage(problem: DraftProblem): string {
  switch (problem.kind) {
    case "over-allocated":
      return `As metas somam ${formatPercent(problem.allocatedBps / BUDGET_TOTAL_BPS, {
        maximumFractionDigits: 2,
      })}; o máximo é 100%.`;
    case "empty-name":
      return "Dê um nome a todos os grupos.";
    case "no-groups":
      return "Mantenha ao menos um grupo.";
    case "too-many-groups":
      return `Use no máximo ${BUDGET_MAX_GROUPS} grupos.`;
  }
}

function AllocatedRow({
  allocatedBps: allocated,
  incomeCents,
}: {
  allocatedBps: number;
  incomeCents: number | null;
}) {
  const money = useMoneyFormatter();
  const over = allocated > BUDGET_TOTAL_BPS;
  const free = BUDGET_TOTAL_BPS - allocated;
  const percent = (bps: number) =>
    formatPercent(bps / BUDGET_TOTAL_BPS, { maximumFractionDigits: 2 });

  return (
    <div
      data-slot="budget-allocated"
      className="flex items-center justify-between gap-3 text-[13px]"
    >
      <span className="text-muted-foreground">Alocado</span>
      <span className="text-right tabular-nums">
        <span className={cn("font-semibold", over ? "text-negative" : "text-foreground")}>
          {percent(allocated)} / 100%
        </span>
        {free > 0 ? (
          <span className="block text-xs text-muted-foreground">
            Livre: {percent(free)}
            {incomeCents ? ` · ${money.formatCurrency(centsForBps(free, incomeCents))}` : ""}
          </span>
        ) : null}
      </span>
    </div>
  );
}

interface GroupControlProps {
  draft: BudgetGroupDraft;
  mode: BudgetInputMode;
  incomeCents: number | null;
  canRemove: boolean;
  onChange: (change: Partial<BudgetGroupDraft>) => void;
  onRemove: () => void;
}

function GroupControl({
  draft,
  mode,
  incomeCents,
  canRemove,
  onChange,
  onRemove,
}: GroupControlProps) {
  const money = useMoneyFormatter();
  const sliderId = useId();
  const valueCents = centsForBps(draft.targetBps, incomeCents);
  const percentLabel = formatPercent(draft.targetBps / BUDGET_TOTAL_BPS, {
    maximumFractionDigits: 2,
  });

  return (
    <li data-slot="budget-group" className="space-y-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={draft.color}
          onChange={(event) => onChange({ color: event.target.value })}
          aria-label={`Cor de ${draft.name || "grupo"}`}
          className="size-6 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
        />
        <Input
          value={draft.name}
          maxLength={40}
          onChange={(event) => onChange({ name: event.target.value })}
          aria-label="Nome do grupo"
          className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1.5 text-sm font-semibold shadow-none hover:border-border focus-visible:border-primary"
        />
        {mode === "percent" ? (
          <DraftNumberInput
            label={`Percentual de ${draft.name}`}
            text={formatPlain(bpsToPercent(draft.targetBps))}
            parse={(raw) => {
              const value = Number(raw.replace(",", "."));
              return raw.trim() === "" || !Number.isFinite(value) ? null : percentToBps(value);
            }}
            onCommit={(bps) => onChange({ targetBps: bps })}
            suffix="%"
          />
        ) : (
          <DraftNumberInput
            label={`Valor mensal de ${draft.name}`}
            text={formatMoneyInput(valueCents)}
            parse={(raw) => {
              const cents = parseMoneyInput(raw);
              return cents === null ? null : bpsForCents(cents, incomeCents);
            }}
            onCommit={(bps) => onChange({ targetBps: bps })}
            prefix="R$"
            wide
          />
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={`Remover ${draft.name || "grupo"}`}
          title="Remover grupo (as categorias dele ficam sem grupo)"
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>

      <input
        id={sliderId}
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(bpsToPercent(draft.targetBps))}
        onChange={(event) => onChange({ targetBps: percentToBps(Number(event.target.value)) })}
        aria-label={`Meta de ${draft.name}`}
        aria-valuetext={percentLabel}
        className="budget-range block w-full"
        style={
          {
            "--range-color": draft.color,
            "--range-fill": `${bpsToPercent(draft.targetBps)}%`,
          } as CSSProperties
        }
      />

      <p className="text-right text-xs text-muted-foreground tabular-nums">
        {mode === "percent"
          ? incomeCents
            ? `≈ ${money.formatCurrency(valueCents)} por mês`
            : "Defina a renda para ver o valor"
          : `≈ ${percentLabel} da renda`}
      </p>
    </li>
  );
}

/** `25` → "25", `12.5` → "12,5". */
function formatPlain(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

interface DraftNumberInputProps {
  label: string;
  /** Texto formatado do valor atual (fonte da verdade fora do foco). */
  text: string;
  /** Texto digitado → pontos-base, ou `null` se inválido. */
  parse: (raw: string) => number | null;
  onCommit: (bps: number) => void;
  prefix?: string;
  suffix?: string;
  wide?: boolean;
}

/**
 * Campo numérico com rascunho local: enquanto focado, o texto é livre; ao sair
 * (ou Enter) o valor é interpretado e gravado. Inválido volta ao último valor.
 */
function DraftNumberInput({
  label,
  text,
  parse,
  onCommit,
  prefix,
  suffix,
  wide = false,
}: DraftNumberInputProps) {
  const [editing, setEditing] = useState<string | null>(null);

  function commit() {
    if (editing === null) return;
    const parsed = parse(editing);
    if (parsed !== null) onCommit(parsed);
    setEditing(null);
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      {prefix ? <span className="text-xs text-muted-foreground">{prefix}</span> : null}
      <Input
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        value={editing ?? text}
        onFocus={(event) => {
          setEditing(text);
          event.currentTarget.select();
        }}
        onChange={(event) => setEditing(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setEditing(null);
        }}
        className={cn("h-8 text-right tabular-nums", wide ? "w-28" : "w-16")}
      />
      {suffix ? <span className="w-3 text-xs text-muted-foreground">{suffix}</span> : null}
    </div>
  );
}
