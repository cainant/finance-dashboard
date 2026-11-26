import { RotateCw, TriangleAlert } from "lucide-react";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ErrorStateProps extends React.ComponentProps<"div"> {
  title?: string;
  description?: React.ReactNode;
  error?: unknown;
  onRetry?: () => void;
  isRetrying?: boolean;
  retryLabel?: string;
  compact?: boolean;
}

function describeError(error: unknown): string | null {
  if (!error) {
    return null;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return null;
}

/** Falha recuperável: explica o problema e oferece "Tentar novamente". */
export function ErrorState({
  title = "Não foi possível carregar",
  description,
  error,
  onRetry,
  isRetrying = false,
  retryLabel = "Tentar novamente",
  compact = false,
  className,
  ...props
}: ErrorStateProps) {
  const detail = describeError(error);

  return (
    <div
      data-slot="error-state"
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-negative/30 bg-card px-6 text-center",
        compact ? "py-8" : "py-12",
        className,
      )}
      {...props}
    >
      <span
        className="grid size-8 place-items-center rounded-lg border border-negative/30 bg-negative/10 text-negative"
        aria-hidden="true"
      >
        <TriangleAlert className="size-4" />
      </span>
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="text-[13px] leading-5 text-muted-foreground">{description}</p>
        ) : null}
        {detail ? (
          <p className="mt-1 rounded-md border border-border-subtle bg-surface-2 px-2 py-1 text-xs break-words text-muted-foreground">
            {detail}
          </p>
        ) : null}
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>
          <RotateCw aria-hidden="true" className={cn(isRetrying && "animate-spin")} />
          {isRetrying ? "Tentando…" : retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
