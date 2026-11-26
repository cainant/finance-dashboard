import type { LucideIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps extends React.ComponentProps<"div"> {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
}

/** Estado vazio plano: ícone discreto, explicação e uma ação primária. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-6 text-center",
        compact ? "py-8" : "py-12",
        className,
      )}
      {...props}
    >
      {Icon ? (
        <span
          className="grid size-8 place-items-center rounded-lg border border-border bg-surface-2 text-subtle-foreground"
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </span>
      ) : null}
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="text-[13px] leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}
