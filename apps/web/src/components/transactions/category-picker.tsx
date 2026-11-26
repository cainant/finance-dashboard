import type { Category, Transaction } from "@fd/contracts";
import { Check, ChevronDown, Search, Tag } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CategoryIcon, categoryColor } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

import { buildCategoryOptions, CATEGORY_KIND_LABEL, kindForType } from "./category-picker-options";

export interface CategoryPickerProps {
  transaction: Transaction;
  categories: readonly Category[];
  /**
   * Categoria de outra natureza que a linha tinha antes da última troca. Fica
   * fixada no topo (sem marca) para a troca ser reversível — o estado mora na
   * página porque as células da tabela são remontadas quando as colunas mudam.
   */
  origin?: Category | null;
  onSelect: (categoryId: string | null) => void;
  disabled?: boolean;
  /** Ocupa a largura do contêiner com o rótulo alinhado à esquerda. */
  fullWidth?: boolean;
  /** Ajusta o gatilho (ex.: pill compacta no mobile, botão largo no painel). */
  className?: string;
}

/**
 * Seletor inline de categoria (popover com busca). A lista é filtrada pela
 * natureza da transação para evitar classificar receita como despesa — mas uma
 * categoria de outra natureza nunca fica inalcançável: a atual (Pix enviado
 * categorizado como "Transferências", por exemplo) e a que a linha tinha antes
 * de uma troca aparecem fixas no topo, com a natureza indicada.
 */
export function CategoryPicker({
  transaction,
  categories,
  origin = null,
  onSelect,
  disabled = false,
  fullWidth = false,
  className,
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Mantém as opções montadas só enquanto o popover abre/fecha. Montá-las
  // sempre custava caro: cada linha da tabela criava ~20 botões (com ícones)
  // mesmo fechada, e a rolagem paga essa conta a cada linha nova.
  const [closing, setClosing] = useState(false);
  const pinnedHintId = useId();

  useEffect(() => {
    if (!closing) {
      return;
    }

    // Tempo da animação de saída do Radix; depois disso o conteúdo pode sumir.
    const timeout = window.setTimeout(() => setClosing(false), 200);
    return () => window.clearTimeout(timeout);
  }, [closing]);

  const contentMounted = open || closing;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    setClosing(!nextOpen);
  }

  const current =
    transaction.category ??
    categories.find((category) => category.id === transaction.categoryId) ??
    null;

  const { pinned, options } = useMemo(
    () =>
      buildCategoryOptions({
        categories,
        current,
        origin,
        type: transaction.type,
        query,
      }),
    [categories, current, origin, query, transaction.type],
  );

  const pinnedSelected = Boolean(pinned && current?.id === pinned.id);

  /** "Categoria de transferência fora da natureza deste lançamento (despesa)." */
  const pinnedHint = pinned
    ? `Categoria de ${CATEGORY_KIND_LABEL[pinned.kind].toLowerCase()} fora da natureza deste lançamento (${CATEGORY_KIND_LABEL[kindForType(transaction.type)].toLowerCase()}).`
    : "";

  function handleSelect(categoryId: string | null) {
    handleOpenChange(false);
    setQuery("");
    if (categoryId !== transaction.categoryId) {
      onSelect(categoryId);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label={`Alterar categoria de ${transaction.description}`}
          // A coluna é estreita: nomes longos truncam e o title mostra o nome inteiro.
          title={current?.name ?? "Sem categoria"}
          className={cn(
            "h-8 max-w-full justify-start gap-1.5 px-2 font-normal",
            fullWidth && "w-full",
            !current && "text-muted-foreground",
            className,
          )}
        >
          {current ? (
            <CategoryIcon name={current.icon} color={current.color} />
          ) : (
            <Tag aria-hidden="true" className="text-muted-foreground" />
          )}
          <span className={cn("truncate", fullWidth && "min-w-0 flex-1 text-left")}>
            {current?.name ?? "Sem categoria"}
          </span>
          <ChevronDown aria-hidden="true" className="ml-0.5 size-3 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        {contentMounted ? (
          <>
            <div className="border-b border-border/70 p-2">
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar categoria"
                  aria-label="Buscar categoria"
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto p-1.5" role="listbox" aria-label="Categorias">
              <button
                type="button"
                role="option"
                aria-selected={!current}
                onClick={() => handleSelect(null)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground"
              >
                <Tag aria-hidden="true" className="size-4" />
                <span className="truncate">Sem categoria</span>
                {!current ? (
                  <Check aria-hidden="true" className="ml-auto size-4 text-primary" />
                ) : null}
              </button>

              {pinned ? (
                <>
                  {/*
                    A categoria de outra natureza vive aqui mesmo com o filtro
                    ligado: sem ela a lista não teria nenhuma opção marcada (e trocar
                    de categoria seria uma via de mão única). O nome acessível
                    continua sendo só o nome, igual às demais opções; o contexto da
                    natureza vai na descrição.
                  */}
                  <button
                    type="button"
                    role="option"
                    aria-selected={pinnedSelected}
                    aria-label={pinned.name}
                    aria-describedby={pinnedHintId}
                    data-slot="pinned-category"
                    onClick={() => handleSelect(pinned.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors duration-150",
                      "hover:bg-accent hover:text-accent-foreground",
                      pinnedSelected
                        ? "bg-accent/60 font-medium text-foreground"
                        : "text-foreground/85",
                    )}
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: categoryColor(pinned.color) }}
                      aria-hidden="true"
                    />
                    <CategoryIcon name={pinned.icon} color={pinned.color} />
                    <span className="truncate">{pinned.name}</span>
                    <span
                      aria-hidden="true"
                      title={pinnedHint}
                      className="ml-auto shrink-0 rounded-full border border-border/70 px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground"
                    >
                      {CATEGORY_KIND_LABEL[pinned.kind]}
                    </span>
                    <span id={pinnedHintId} className="sr-only">
                      {pinnedHint}
                    </span>
                    {pinnedSelected ? (
                      <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />
                    ) : null}
                  </button>
                  <div aria-hidden="true" className="mx-2 my-1 h-px bg-border/70" />
                </>
              ) : null}

              {options.map((category) => {
                const selected = current?.id === category.id;

                return (
                  <button
                    key={category.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => handleSelect(category.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors duration-150",
                      "hover:bg-accent hover:text-accent-foreground",
                      selected ? "bg-accent/60 font-medium text-foreground" : "text-foreground/85",
                    )}
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: categoryColor(category.color) }}
                      aria-hidden="true"
                    />
                    <CategoryIcon name={category.icon} color={category.color} />
                    <span className="truncate">{category.name}</span>
                    {selected ? (
                      <Check aria-hidden="true" className="ml-auto size-4 text-primary" />
                    ) : null}
                  </button>
                );
              })}

              {/* Com a fixada na tela a busca sem resultado não é uma lista vazia:
                  a mensagem só entra quando não há nada além de "Sem categoria". */}
              {options.length === 0 && !pinned ? (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  Nenhuma categoria encontrada.
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
