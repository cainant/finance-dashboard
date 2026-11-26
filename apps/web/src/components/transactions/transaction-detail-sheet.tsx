import type { Category, Transaction } from "@fd/contracts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useRef, type ReactNode, type RefObject } from "react";

import { TransactionBudgetGroupField } from "@/components/budget/transaction-budget-group-field";
import { InstitutionAvatar } from "@/components/domain/institution-avatar";
import { MoneyText } from "@/components/domain/money-text";
import { CategoryPicker } from "@/components/transactions/category-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { transactionAccountParts } from "@/lib/accounts";
import { formatDate } from "@/lib/format";
import { useMediaQuery } from "@/lib/hooks";

import { TransactionDetailMobile, type Page as MobilePage } from "./transaction-detail-mobile";
import { useTransactionEditing } from "./use-transaction-editing";

import { installmentLabel, MOVEMENT_HINT, TYPE_LABELS } from "./transaction-detail-labels";

export interface TransactionDetailSheetProps {
  transaction: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Percorre a lista carregada sem fechar o painel. */
  onPrevious?: () => void;
  onNext?: () => void;
  categories: readonly Category[];
  /** Categoria de outra natureza a fixar no seletor (ver `CategoryPicker`). */
  categoryOrigins: ReadonlyMap<string, Category>;
  /** Registra a categoria de origem da transação antes de gravar a troca. */
  onCategoryOriginChange: (transaction: Transaction) => void;
  /** Conta resolvida pela página (instituição · nome). */
  accountLabel?: string | null;
  /** Mobile: "Ver lançamentos parecidos" leva a Transações com esta busca. */
  onViewSimilar?: (query: string) => void;
  /** Mobile: "category" abre o sheet direto na grade de categorias (deslizar na lista). */
  mobileInitialPage?: MobilePage;
}

/** Abaixo deste breakpoint (`lg`) o detalhe vira bottom sheet. */
const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * Detalhe da transação. Em `lg` ou mais, painel lateral (Sheet de 420px);
 * abaixo disso, bottom sheet (`TransactionDetailMobile`). O estado vive na URL
 * (`?tx`) e a página controla `open`. Categoria e anotação salvam na hora, com
 * toast "Desfazer". O foco volta para o item que abriu o detalhe.
 */
export function TransactionDetailSheet({
  transaction,
  open,
  onOpenChange,
  onPrevious,
  onNext,
  categories,
  categoryOrigins,
  onCategoryOriginChange,
  accountLabel,
  onViewSimilar,
  mobileInitialPage,
}: TransactionDetailSheetProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const openerRef = useRef<HTMLElement | null>(null);
  // Id da linha que abriu o painel: a tabela virtualizada remonta (troca
  // tabela↔cartões, refetch) e o nó salvo fica solto.
  const openerTxRef = useRef<string | null>(null);
  // O conteúdo registra aqui como salvar a nota pendente ao fechar (Esc/overlay).
  const flushNotesRef = useRef<() => void>(() => {});

  function handleOpenChange(next: boolean) {
    if (!next) {
      flushNotesRef.current();
    }

    onOpenChange(next);
  }

  /** Botão da descrição da linha `txId`, na tabela ou no cartão do mobile. */
  function findRowButton(txId: string | null): HTMLElement | null {
    if (!txId) {
      return null;
    }

    return document.querySelector<HTMLElement>(
      `[data-tx="${CSS.escape(txId)}"] button[aria-label^="Ver detalhes de"]`,
    );
  }

  const focusHandlers = {
    onOpenAutoFocus: () => {
      const opener = document.activeElement as HTMLElement | null;

      // Trocar painel ↔ sheet com o detalhe aberto (resize) remonta o
      // diálogo sem foco útil: mantém o gatilho original.
      if (!opener || opener === document.body) {
        return;
      }

      openerRef.current = opener;
      openerTxRef.current = opener.closest<HTMLElement>("[data-tx]")?.dataset.tx ?? null;
    },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault();

      if (openerRef.current?.isConnected) {
        openerRef.current.focus();
        return;
      }

      // A linha remontou enquanto o painel estava aberto: refoca pela
      // linha atual em vez do nó solto (o foco cairia no body).
      const button = findRowButton(openerTxRef.current);
      openerRef.current = button;
      button?.focus();
    },
  };

  // Até medir o viewport (primeiro render) não monta nenhum dos dois.
  if (isDesktop === null) {
    return null;
  }

  if (!isDesktop) {
    return (
      <TransactionDetailMobile
        transaction={transaction}
        open={open}
        onOpenChange={handleOpenChange}
        categories={categories}
        categoryOrigins={categoryOrigins}
        onCategoryOriginChange={onCategoryOriginChange}
        accountLabel={accountLabel}
        onViewSimilar={onViewSimilar}
        flushNotesRef={flushNotesRef}
        initialPage={mobileInitialPage}
        focusHandlers={focusHandlers}
      />
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full max-w-[420px] gap-0 p-0" {...focusHandlers}>
        {transaction ? (
          <TransactionDetailContent
            key={transaction.id}
            transaction={transaction}
            categories={categories}
            origin={categoryOrigins.get(transaction.id) ?? null}
            onCategoryOriginChange={onCategoryOriginChange}
            accountLabel={accountLabel}
            onPrevious={onPrevious}
            onNext={onNext}
            flushNotesRef={flushNotesRef}
            onRequestClose={() => handleOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

interface TransactionDetailContentProps {
  transaction: Transaction;
  categories: readonly Category[];
  /** Categoria de outra natureza a fixar no seletor (ver `CategoryPicker`). */
  origin: Category | null;
  onCategoryOriginChange: (transaction: Transaction) => void;
  accountLabel?: string | null;
  onPrevious?: () => void;
  onNext?: () => void;
  onRequestClose: () => void;
  flushNotesRef: RefObject<() => void>;
}

function TransactionDetailContent({
  transaction,
  categories,
  origin,
  onCategoryOriginChange,
  accountLabel,
  onPrevious,
  onNext,
  onRequestClose,
  flushNotesRef,
}: TransactionDetailContentProps) {
  const notesId = useId();
  const { noteDraft, setNoteDraft, commitDraft, isSavingCategory, changeCategory } =
    useTransactionEditing({
      transaction,
      onCategoryOriginChange,
      flushNotesRef,
      categoryToastMessage: () => "Categoria atualizada",
    });

  function goTo(direction: "previous" | "next") {
    commitDraft();

    if (direction === "previous") {
      onPrevious?.();
    } else {
      onNext?.();
    }
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
      <SheetHeader>
        <SheetTitle>Transação</SheetTitle>
        <SheetDescription className="sr-only">
          Detalhes, categoria e anotação do lançamento.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <h2 className="text-lg leading-6 font-semibold text-foreground">
          {transaction.description}
        </h2>
        {transaction.merchant ? (
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            {transaction.merchant}
          </p>
        ) : null}

        <MoneyText
          valueCents={transaction.amountCents}
          tone={transaction.amountCents > 0 ? "positive" : "neutral"}
          signDisplay="always"
          size="2xl"
          weight="semibold"
          className="mt-1 block"
        />
        {transaction.status === "pending" ? (
          <Badge variant="warning" className="mt-2">
            Pendente
          </Badge>
        ) : null}

        <dl className="mt-4">
          <DetailRow label="Data">{formatDate(transaction.date, "long")}</DetailRow>
          <DetailRow label="Conta">
            <span className="inline-flex max-w-full items-center justify-end gap-1.5">
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
          </DetailRow>
          {/*
           * `type` é a classificação da movimentação vinda do provedor — não a
           * nossa categoria, por isso não se chama "Tipo". Um "Resgate - Cdb"
           * pode ser "Transferência (entre contas)" e estar em Rendimentos.
           */}
          <DetailRow label="Movimentação" hint={MOVEMENT_HINT}>
            {TYPE_LABELS[transaction.type]}
          </DetailRow>
          {installmentLabel(transaction) ? (
            <DetailRow label="Parcela">{installmentLabel(transaction)}</DetailRow>
          ) : null}
        </dl>

        <div className="mt-5 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Categoria</p>
          <CategoryPicker
            transaction={transaction}
            categories={categories}
            origin={origin}
            disabled={isSavingCategory}
            onSelect={(categoryId) => void changeCategory(categoryId)}
            fullWidth
            className="border border-border bg-card px-2.5 text-[13px]"
          />
        </div>

        <TransactionBudgetGroupField
          transaction={transaction}
          className="mt-5"
          triggerClassName="text-[13px]"
        />

        <div className="mt-5 space-y-2">
          <Label htmlFor={notesId} className="text-xs font-medium text-muted-foreground">
            Anotação
          </Label>
          <Textarea
            id={notesId}
            value={noteDraft}
            maxLength={2000}
            onChange={(event) => setNoteDraft(event.target.value)}
            onBlur={commitDraft}
            placeholder="Adicionar uma nota…"
          />
          <p className="text-xs text-muted-foreground">Salva ao sair do campo.</p>
        </div>
      </div>

      <SheetFooter className="flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => goTo("previous")}
            disabled={!onPrevious}
          >
            <ChevronLeft aria-hidden="true" />
            Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => goTo("next")}
            disabled={!onNext}
          >
            Próxima
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <Button type="button" size="sm" onClick={onRequestClose}>
          Fechar
        </Button>
      </SheetFooter>
    </>
  );
}

function DetailRow({
  label,
  hint,
  children,
}: {
  label: string;
  /** Explicação do campo em `title` (tooltip nativo). */
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 border-b border-dashed border-border-subtle last:border-b-0">
      <dt className="shrink-0 text-[13px] text-muted-foreground" title={hint}>
        {label}
      </dt>
      <dd className="min-w-0 truncate text-right text-[13px] font-medium text-foreground">
        {children}
      </dd>
    </div>
  );
}
