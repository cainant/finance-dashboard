import { Link } from "@tanstack/react-router";
import { ChevronRight, CreditCard, PiggyBank, Tag, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { MoneyText } from "@/components/domain/money-text";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { dueLabel } from "@/lib/bills";
import { connectionStatusMeta } from "@/lib/connections";
import { formatDate } from "@/lib/format";
import { periodOnlySearch } from "@/lib/overview-links";
import { cn } from "@/lib/utils";

import type { AttentionItem } from "./attention-items";

type AttentionTone = "danger" | "warning" | "neutral";

const ITEM_CLASS =
  "group flex min-h-13 min-w-0 items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-accent/60 max-lg:active:bg-accent";

const ITEM_BORDER_CLASS = cn(
  "border-border-subtle border-t first:border-t-0",
  "sm:border-t-0 sm:border-l sm:first:border-l-0",
  // Com três itens em duas colunas, o terceiro abre a segunda linha.
  "sm:[&:nth-child(3)]:border-t sm:[&:nth-child(3)]:border-l-0",
  "xl:[&:nth-child(3)]:border-t-0 xl:[&:nth-child(3)]:border-l",
);

const ICON_BOX_CLASS: Record<AttentionTone, string> = {
  danger: "border-negative/40 bg-negative/10 text-negative",
  warning: "border-warning/40 bg-warning/10 text-warning",
  neutral: "border-border bg-background text-subtle-foreground",
};

function connectionTitle(item: Extract<AttentionItem, { kind: "connection" }>): string {
  const name = item.connection.institution?.name ?? "Conexão";

  switch (item.connection.status) {
    case "error":
      return `${name} com erro de sincronização`;
    case "outdated":
      return `${name} está desatualizada`;
    default:
      return `${name} precisa reconectar`;
  }
}

function itemTone(item: AttentionItem): AttentionTone {
  if (item.kind === "uncategorized") {
    return "neutral";
  }

  if (item.kind === "bill") {
    return item.bill.daysUntilDue < 0 ? "danger" : "warning";
  }

  if (item.kind === "reserve") {
    return "warning";
  }

  return item.severity === 0 ? "danger" : "warning";
}

function InlineMoney({ cents }: { cents: number }) {
  return <MoneyText valueCents={cents} size="sm" weight="medium" tone="neutral" />;
}

function itemTitle(item: AttentionItem): ReactNode {
  if (item.kind === "reserve") {
    return (
      <>
        Guarde mais <InlineMoney cents={item.reserve.gapCents} /> em {item.reserve.source.name}
      </>
    );
  }

  if (item.kind === "bill") {
    return `Fatura ${item.bill.accountName} ${dueLabel(item.bill.daysUntilDue)}`;
  }

  if (item.kind === "uncategorized") {
    return `${item.count} ${item.count === 1 ? "transação sem categoria" : "transações sem categoria"}`;
  }

  return connectionTitle(item);
}

function itemDescription(item: AttentionItem): ReactNode {
  if (item.kind === "bill") {
    return (
      <>
        <MoneyText
          valueCents={item.bill.totalCents}
          size="sm"
          weight="medium"
          tone="neutral"
          className="text-[13px] text-muted-foreground"
        />{" "}
        · {formatDate(item.bill.dueDate)}
      </>
    );
  }

  if (item.kind === "uncategorized") {
    return "Classifique para afinar as análises";
  }

  if (item.kind === "reserve") {
    const { spentSinceDepositCents, lastDepositDate, reservedCents, neededCents } = item.reserve;
    if (spentSinceDepositCents && lastDepositDate) {
      return (
        <>
          Gastou <InlineMoney cents={spentSinceDepositCents} /> no crédito desde{" "}
          {formatDate(lastDepositDate)}
        </>
      );
    }
    return (
      <>
        <InlineMoney cents={reservedCents} /> guardados de <InlineMoney cents={neededCents} />
      </>
    );
  }

  return connectionStatusMeta(item.connection.status).description;
}

function AttentionIcon({ item }: { item: AttentionItem }) {
  const Icon =
    item.kind === "bill"
      ? CreditCard
      : item.kind === "reserve"
        ? PiggyBank
        : item.kind === "uncategorized"
          ? Tag
          : TriangleAlert;

  return <Icon className="size-4" aria-hidden="true" />;
}

function AttentionContent({ item }: { item: AttentionItem }) {
  return (
    <>
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg border",
          ICON_BOX_CLASS[itemTone(item)],
        )}
        aria-hidden="true"
      >
        <AttentionIcon item={item} />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm leading-5 font-medium text-foreground">
          {itemTitle(item)}
        </span>
        <span className="truncate text-[13px] leading-5 text-muted-foreground">
          {itemDescription(item)}
        </span>
      </span>

      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-subtle-foreground" />
    </>
  );
}

function AttentionRow({ item, mobile }: { item: AttentionItem; mobile: boolean }) {
  if (item.kind === "bill" && mobile) {
    // Mobile: direto ao detalhe do cartão (sem passar pela lista e seu redirect).
    return (
      <Link
        to="/credit-cards/$accountId"
        params={{ accountId: item.bill.accountId }}
        search={(previous) => ({ ...periodOnlySearch(previous), bill: item.bill.id })}
        className={cn(ITEM_CLASS, ITEM_BORDER_CLASS)}
      >
        <AttentionContent item={item} />
      </Link>
    );
  }

  if (item.kind === "bill") {
    return (
      <Link
        to="/credit-cards"
        search={(previous) => ({
          ...periodOnlySearch(previous),
          card: item.bill.accountId,
          bill: item.bill.id,
        })}
        className={cn(ITEM_CLASS, ITEM_BORDER_CLASS)}
      >
        <AttentionContent item={item} />
      </Link>
    );
  }

  if (item.kind === "reserve") {
    return (
      <Link
        to="/credit-cards"
        search={(previous) => periodOnlySearch(previous)}
        className={cn(ITEM_CLASS, ITEM_BORDER_CLASS)}
      >
        <AttentionContent item={item} />
      </Link>
    );
  }

  if (item.kind === "uncategorized") {
    return (
      <Link
        to="/transactions"
        search={(previous) => ({
          ...previous,
          categoryId: undefined,
          uncategorized: true,
        })}
        className={cn(ITEM_CLASS, ITEM_BORDER_CLASS)}
      >
        <AttentionContent item={item} />
      </Link>
    );
  }

  return (
    <Link
      to="/connections"
      search={(previous) => previous}
      className={cn(ITEM_CLASS, ITEM_BORDER_CLASS)}
    >
      <AttentionContent item={item} />
    </Link>
  );
}

export interface AttentionStripProps {
  items: readonly AttentionItem[];
  /** Layout mobile (abaixo de `lg`): faturas abrem o detalhe do cartão. */
  mobile?: boolean;
}

/**
 * Faixa "Requer atenção": até três links lado a lado (empilhados no mobile),
 * ordenados por gravidade. Some por completo quando não há nada a fazer.
 */
export function AttentionStrip({ items, mobile = false }: AttentionStripProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section aria-label="Requer atenção" data-slot="overview-attention">
      <Card
        className={cn(
          "grid min-w-0 grid-cols-1 gap-0",
          items.length > 1 && "sm:grid-cols-2",
          items.length > 2 && "xl:grid-cols-3",
        )}
      >
        {items.map((item) => (
          <AttentionRow key={item.key} item={item} mobile={mobile} />
        ))}
      </Card>
    </section>
  );
}

/** Placeholder da faixa enquanto conexões e faturas carregam. */
export function AttentionStripSkeleton() {
  return (
    <section aria-label="Requer atenção" aria-busy="true" data-slot="overview-attention">
      <Card className="grid min-w-0 grid-cols-1 gap-0 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className={cn(ITEM_CLASS, ITEM_BORDER_CLASS)} aria-hidden="true">
            <Skeleton className="size-8 shrink-0 rounded-lg" />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-2.5 w-1/2" />
            </span>
          </div>
        ))}
      </Card>
    </section>
  );
}
