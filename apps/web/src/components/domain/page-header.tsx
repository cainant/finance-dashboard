import type * as React from "react";

import { cn } from "@/lib/utils";

export interface PageHeaderProps extends React.ComponentProps<"header"> {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  /** Aceito por compatibilidade; renderizado como linha de apoio, sem caixa alta. */
  eyebrow?: string;
}

/** Cabeçalho padrão das páginas autenticadas (h1 único por tela). */
export function PageHeader({
  title,
  description,
  actions,
  badge,
  eyebrow,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6",
        className,
      )}
      {...props}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow ? <p className="text-xs font-medium text-muted-foreground">{eyebrow}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl leading-7 font-semibold tracking-[-0.015em] text-foreground">
            {title}
          </h1>
          {badge}
        </div>
        {description ? (
          <p className="max-w-2xl text-sm leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div
          data-slot="page-header-actions"
          /* Mobile: uma linha só — o controle de período encolhe e as ações
             mantêm o rótulo curto. Desktop: quebra quando precisar. */
          className="flex min-w-0 flex-nowrap items-center gap-2 max-sm:w-full sm:w-auto sm:flex-wrap sm:justify-end"
        >
          {actions}
        </div>
      ) : null}
    </header>
  );
}
