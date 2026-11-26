import { Info } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatMoneyInput, parseMoneyInput } from "@/lib/budget";
import { useUpdateBudgetMutation } from "@/lib/mutations";

export interface ReferenceIncomeCardProps {
  incomeCents: number | null;
}

/**
 * Renda mensal de referência: só a base de planejamento das metas. Não é
 * receita real e não cria lançamento.
 */
export function ReferenceIncomeCard({ incomeCents }: ReferenceIncomeCardProps) {
  const inputId = useId();
  const hintId = useId();
  const [text, setText] = useState(() =>
    incomeCents === null ? "" : formatMoneyInput(incomeCents),
  );
  const mutation = useUpdateBudgetMutation("Renda de referência salva");

  const parsed = text.trim() === "" ? null : parseMoneyInput(text);
  const invalid = text.trim() !== "" && parsed === null;
  const unchanged = parsed === incomeCents;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invalid || unchanged) return;
    mutation.mutate(
      { referenceIncomeCents: parsed },
      {
        onSuccess: (data) => {
          const saved = data.data.referenceIncomeCents;
          setText(saved === null ? "" : formatMoneyInput(saved));
        },
      },
    );
  }

  return (
    <Card data-slot="reference-income">
      <CardContent className="p-4">
        <form
          onSubmit={submit}
          className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_auto] lg:items-center"
        >
          <div className="space-y-1.5">
            <label
              htmlFor={inputId}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
            >
              Renda de referência mensal
              <span title="Base para distribuir as metas; não é a sua receita real.">
                <Info className="size-3.5" aria-hidden="true" />
              </span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                R$
              </span>
              <Input
                id={inputId}
                inputMode="decimal"
                autoComplete="off"
                value={text}
                onChange={(event) => setText(event.target.value)}
                aria-invalid={invalid || undefined}
                aria-describedby={hintId}
                placeholder="0,00"
                className="h-10 pl-9 text-base font-semibold tabular-nums"
              />
            </div>
            <p id={hintId} className="text-xs text-muted-foreground">
              {invalid
                ? "Digite um valor como 6.500,00."
                : "Ao salvar, os valores em R$ das metas são recalculados."}
            </p>
          </div>

          <p className="text-[13px] leading-5 text-muted-foreground">
            Use este valor como base para planejar e distribuir suas metas. Ele não representa suas
            receitas reais e não cria lançamentos.
          </p>

          <Button
            type="submit"
            disabled={invalid || unchanged || mutation.isPending}
            className="lg:justify-self-end"
          >
            {mutation.isPending ? "Salvando…" : "Salvar renda"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
