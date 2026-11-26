import type * as React from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface OverviewCardProps extends Omit<React.ComponentProps<"div">, "title"> {
  title: string;
  /** Ação à direita do título (link "Ver …"). */
  action?: React.ReactNode;
  /** Texto auxiliar à direita quando não há ação. */
  hint?: React.ReactNode;
  contentClassName?: string;
  children: React.ReactNode;
}

/**
 * Card secundário da Visão geral (coluna lateral e transações recentes):
 * cabeçalho de 44px com título 14px/500 e divisória, corpo sem padding próprio
 * para as listas ocuparem a largura toda.
 */
export function OverviewCard({
  title,
  action,
  hint,
  contentClassName,
  className,
  children,
  ...props
}: OverviewCardProps) {
  return (
    <Card data-slot="overview-card" className={cn("min-w-0 gap-0", className)} {...props}>
      <div className="flex h-11 items-center justify-between gap-3 border-b border-border-subtle px-4">
        <h2 className="min-w-0 truncate text-sm leading-5 font-medium text-foreground">{title}</h2>
        {action ? (
          <div className="flex shrink-0 items-center">{action}</div>
        ) : hint ? (
          <span className="shrink-0 text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      <div className={cn("min-w-0", contentClassName)}>{children}</div>
    </Card>
  );
}
