import type { Category, Transaction } from "@fd/contracts";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { Undo2 } from "lucide-react";

import { TransactionBudgetGroupField } from "@/components/budget/transaction-budget-group-field";
import { InstitutionAvatar } from "@/components/domain/institution-avatar";
import { MoneyText } from "@/components/domain/money-text";
import { Badge } from "@/components/ui/badge";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetHeader,
} from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { transactionAccountParts } from "@/lib/accounts";
import { CategoryIcon } from "@/lib/category-icons";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { CategoryGrid } from "./category-grid";
import { installmentLabel, MOVEMENT_HINT, TYPE_LABELS } from "./transaction-detail-labels";
import { useTransactionEditing, type EditNotice } from "./use-transaction-editing";

/** Tempo que o aviso fica no sheet (mais que o toast: há um botão para alcançar). */
const NOTICE_MS = 8000;

export interface TransactionDetailMobileProps {
  transaction: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: readonly Category[];
  categoryOrigins: ReadonlyMap<string, Category>;
  onCategoryOriginChange: (transaction: Transaction) => void;
  accountLabel?: string | null;
  onViewSimilar?: (query: string) => void;
  flushNotesRef: RefObject<() => void>;
  /** Página inicial do sheet: "category" abre direto a grade (deslizar na lista). */
  initialPage?: Page;
  focusHandlers: {
    onOpenAutoFocus: () => void;
    onCloseAutoFocus: (event: Event) => void;
  };
}

/**
 * Detalhe da transação como bottom sheet (abaixo de `lg`). O estado de
 * abertura vem da URL (`?tx`), então o "voltar" do navegador o fecha; a
 * seleção de categoria é uma página filha do próprio sheet. Os botões
 * Anterior/Próxima do painel desktop não existem aqui.
 */
export function TransactionDetailMobile({
  transaction,
  open,
  onOpenChange,
  categories,
  categoryOrigins,
  onCategoryOriginChange,
  accountLabel,
  onViewSimilar,
  flushNotesRef,
  initialPage = "detail",
  focusHandlers,
}: TransactionDetailMobileProps) {
  // Ao sair (voltar do navegador zera `?tx` antes da animação), o sheet segue
  // mostrando o último lançamento até terminar de descer.
  const [lastTransaction, setLastTransaction] = useState<Transaction | null>(transaction);
  if (transaction && transaction !== lastTransaction) {
    setLastTransaction(transaction);
  }
  const shown = transaction ?? lastTransaction;

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent {...focusHandlers}>
        {shown ? (
          <MobileContent
            key={shown.id}
            transaction={shown}
            categories={categories}
            origin={categoryOrigins.get(shown.id) ?? null}
            onCategoryOriginChange={onCategoryOriginChange}
            accountLabel={accountLabel}
            onViewSimilar={onViewSimilar}
            flushNotesRef={flushNotesRef}
            initialPage={initialPage}
          />
        ) : null}
      </BottomSheetContent>
    </BottomSheet>
  );
}

export type Page = "detail" | "category";

interface Notice {
  message: string;
  undo: (() => void) | null;
  /** Rótulo do botão de ação (padrão "Desfazer"). */
  actionLabel?: string;
  tone?: "error";
}

interface MobileContentProps {
  transaction: Transaction;
  categories: readonly Category[];
  origin: Category | null;
  onCategoryOriginChange: (transaction: Transaction) => void;
  accountLabel?: string | null;
  onViewSimilar?: (query: string) => void;
  flushNotesRef: RefObject<() => void>;
  initialPage: Page;
}

function MobileContent({
  transaction,
  categories,
  origin,
  onCategoryOriginChange,
  accountLabel,
  onViewSimilar,
  flushNotesRef,
  initialPage,
}: MobileContentProps) {
  const navigate = useNavigate();
  const notesId = useId();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState<Page>(initialPage);
  const previousPage = useRef<Page>(initialPage);
  const pageRef = useRef<Page>(page);
  pageRef.current = page;
  const [notice, setNotice] = useState<Notice | null>(null);
  const undoing = useRef(false);

  /** Devolve o foco à linha "Categoria" depois que o botão "Desfazer" sai da tela. */
  function restoreFocus() {
    if (pageRef.current !== "detail") {
      // A página da grade não tem a linha: o efeito de troca de página foca o destino.
      setPage("detail");
      return;
    }

    bodyRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
  }

  // O aviso só confirma "Alteração desfeita" depois de a API aceitar; na falha o
  // erro fica dentro do sheet (o toast de erro fica `aria-hidden` com o sheet aberto).
  async function runUndo(undo: EditNotice["undo"]) {
    if (undoing.current) {
      return;
    }

    undoing.current = true;
    try {
      await undo();
      setNotice({ message: "Alteração desfeita", undo: null });
      restoreFocus();
    } catch {
      setNotice({
        message: "Não foi possível desfazer a alteração.",
        tone: "error",
        actionLabel: "Tentar de novo",
        undo: () => void runUndo(undo),
      });
    } finally {
      undoing.current = false;
    }
  }

  const { noteDraft, setNoteDraft, commitDraft, isSavingCategory, changeCategory } =
    useTransactionEditing({
      transaction,
      onCategoryOriginChange,
      flushNotesRef,
      categoryToastMessage: (categoryId) => {
        if (!categoryId) {
          return "Categoria removida";
        }

        const name = categories.find((category) => category.id === categoryId)?.name;

        return name ? `Categoria: ${name}` : "Categoria atualizada";
      },
      onNotice: ({ message, undo }: EditNotice) =>
        setNotice({ message, undo: () => void runUndo(undo) }),
    });

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);

    return () => window.clearTimeout(timer);
  }, [notice]);

  const category =
    transaction.category ??
    categories.find((candidate) => candidate.id === transaction.categoryId) ??
    null;

  // O botão que abriu a página some ao trocar: leva o foco para o destino
  // (grade → categoria atual; detalhe → linha "Categoria").
  useEffect(() => {
    if (previousPage.current === page) {
      return;
    }

    previousPage.current = page;
    const target = bodyRef.current?.querySelector<HTMLElement>("[data-autofocus]");
    target?.focus({ preventScroll: true });
  }, [page]);

  function handlePickCategory(categoryId: string | null) {
    setPage("detail");
    void changeCategory(categoryId);
  }

  function handleOpenAccount() {
    commitDraft();
    void navigate({ to: "/accounts/$accountId", params: { accountId: transaction.accountId } });
  }

  function handleViewSimilar() {
    commitDraft();
    onViewSimilar?.(transaction.merchant?.trim() || transaction.description);
  }

  const resolvedAccount =
    accountLabel ??
    transactionAccountParts({
      institutionName: transaction.account?.institutionName ?? null,
      name: transaction.account?.name ?? null,
      numberMasked: transaction.account?.numberMasked ?? null,
    }).label ??
    "";

  return (
    <>
      <BottomSheetHeader
        title={page === "detail" ? "Transação" : "Categoria"}
        onBack={page === "category" ? () => setPage("detail") : undefined}
        backLabel="Voltar para a transação"
      />

      <BottomSheetBody ref={bodyRef}>
        {page === "detail" ? (
          <div className="animate-in duration-200 fade-in-0">
            <div className="flex flex-col items-center gap-1 pb-4 text-center">
              <span
                aria-hidden="true"
                className="mb-1 grid size-14 place-items-center rounded-2xl bg-foreground/[0.06]"
              >
                <CategoryIcon name={category?.icon} color={category?.color} className="size-7" />
              </span>
              <MoneyText
                valueCents={transaction.amountCents}
                tone={transaction.amountCents > 0 ? "positive" : "neutral"}
                signDisplay="always"
                size="2xl"
                weight="semibold"
                className="tabular-nums"
              />
              <h2 className="text-base leading-6 font-semibold break-words text-foreground">
                {transaction.description}
              </h2>
              {transaction.merchant ? (
                <p className="text-[13px] break-words text-muted-foreground">
                  {transaction.merchant}
                </p>
              ) : null}
              {transaction.status === "pending" ? (
                <Badge variant="warning" className="mt-1">
                  Pendente
                </Badge>
              ) : null}
            </div>

            <div
              data-slot="detail-rows"
              className="divide-y divide-dashed divide-border-subtle rounded-xl border border-border bg-foreground/[0.03] px-3.5"
            >
              <KeyValueRow
                label="Categoria"
                onClick={() => setPage("category")}
                disabled={isSavingCategory}
                autoFocus
              >
                {category?.name ?? "Escolher"}
              </KeyValueRow>
              <KeyValueRow label="Conta" onClick={handleOpenAccount}>
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  {transaction.account?.institutionName ? (
                    <InstitutionAvatar
                      name={transaction.account.institutionName}
                      size="xs"
                      decorative
                      className="size-4 rounded-[4px] text-[8px]"
                    />
                  ) : null}
                  <span className="truncate">{resolvedAccount || "—"}</span>
                </span>
              </KeyValueRow>
              <KeyValueRow label="Data">{formatDate(transaction.date, "long")}</KeyValueRow>
              {/* `type` é a classificação do provedor, não a nossa categoria. */}
              <KeyValueRow label="Movimentação">{TYPE_LABELS[transaction.type]}</KeyValueRow>
              {installmentLabel(transaction) ? (
                <KeyValueRow label="Parcela">{installmentLabel(transaction)}</KeyValueRow>
              ) : null}
            </div>
            <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{MOVEMENT_HINT}</p>

            {/* 16px no gatilho: abaixo disso o Safari iOS dá zoom. */}
            <TransactionBudgetGroupField
              transaction={transaction}
              className="mt-4"
              triggerClassName="h-11 text-base"
            />

            <div className="mt-4 space-y-2">
              <Label htmlFor={notesId} className="text-xs font-medium text-muted-foreground">
                Anotação
              </Label>
              {/* 16px: abaixo disso o Safari iOS dá zoom ao focar o campo. */}
              <Textarea
                id={notesId}
                value={noteDraft}
                maxLength={2000}
                rows={2}
                onChange={(event) => setNoteDraft(event.target.value)}
                onBlur={commitDraft}
                placeholder="Adicionar uma nota…"
                className="min-h-16 resize-none text-base"
              />
              <p className="text-xs text-muted-foreground">Salva ao sair do campo.</p>
            </div>

            {onViewSimilar ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleViewSimilar}
                className="mt-4 h-11 w-full"
              >
                <Search aria-hidden="true" />
                Ver lançamentos parecidos
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="animate-in duration-200 fade-in-0 slide-in-from-right-4">
            <CategoryGrid
              transaction={transaction}
              categories={categories}
              origin={origin}
              disabled={isSavingCategory}
              onSelect={handlePickCategory}
            />
          </div>
        )}
      </BottomSheetBody>

      {/*
        Aviso dentro do sheet: o Radix deixa o toast do sonner (irmão do portal)
        com `aria-hidden` enquanto o diálogo está aberto, então a troca de
        categoria é anunciada aqui e o "Desfazer" fica no foco do diálogo. A
        região viva existe sempre para o leitor de tela anunciar o conteúdo novo.
      */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-slot="bottom-sheet-notice"
        className={
          notice
            ? "shrink-0 pr-[max(1.25rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))]"
            : "sr-only"
        }
      >
        {notice ? (
          <div
            className={cn(
              "flex min-h-11 items-center justify-between gap-3 rounded-xl border bg-popover px-3.5 text-[13px] font-medium shadow-popover",
              notice.tone === "error"
                ? "border-destructive/50 text-destructive"
                : "border-border text-popover-foreground",
            )}
          >
            <span className="min-w-0 break-words">{notice.message}</span>
            {notice.undo ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={notice.undo}
                className="h-9 shrink-0 text-primary"
              >
                <Undo2 aria-hidden="true" />
                {notice.actionLabel ?? "Desfazer"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

function KeyValueRow({
  label,
  children,
  onClick,
  disabled,
  autoFocus,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** Marca o destino do foco ao voltar da página filha. */
  autoFocus?: boolean;
}) {
  const content = (
    <>
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center justify-end gap-1 text-[13px] font-medium text-foreground">
        <span className="min-w-0 truncate">{children}</span>
        {onClick ? (
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-subtle-foreground" />
        ) : null}
      </span>
    </>
  );

  if (!onClick) {
    return <div className="flex min-h-11 items-center justify-between gap-3">{content}</div>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        data-autofocus={autoFocus ? "" : undefined}
        className="-mx-3.5 flex min-h-11 w-[calc(100%+1.75rem)] items-center justify-between gap-3 rounded-lg px-3.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
      >
        {content}
      </button>
    </div>
  );
}
