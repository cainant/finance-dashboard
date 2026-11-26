import type * as React from "react";

import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE_CLASS: Record<StatusTone, { dot: string; text: string }> = {
  success: { dot: "bg-positive", text: "text-positive" },
  warning: { dot: "bg-warning", text: "text-warning" },
  danger: { dot: "bg-negative", text: "text-negative" },
  info: { dot: "bg-info", text: "text-info" },
  neutral: { dot: "bg-subtle-foreground", text: "text-muted-foreground" },
};

export interface StatusDotProps extends React.ComponentProps<"span"> {
  tone: StatusTone;
  label?: string;
  /** Rótulo para leitores de tela quando não há `label` visível. */
  srLabel?: string;
  pulse?: boolean;
}

/** Indicador de status com ponto colorido (7px) e rótulo opcional. */
export function StatusDot({
  tone,
  label,
  srLabel,
  pulse = false,
  className,
  ...props
}: StatusDotProps) {
  const classes = TONE_CLASS[tone];

  return (
    <span
      data-slot="status-dot"
      data-tone={tone}
      className={cn("inline-flex items-center gap-1.5 text-xs font-medium", className)}
      {...props}
    >
      <span
        className="relative flex size-[7px] shrink-0"
        role={label ? undefined : "img"}
        aria-label={label ? undefined : (srLabel ?? tone)}
        aria-hidden={label ? true : undefined}
      >
        {pulse ? (
          <span
            className={cn(
              "absolute inline-flex size-full animate-ping rounded-full opacity-60",
              classes.dot,
            )}
            aria-hidden="true"
          />
        ) : null}
        <span className={cn("relative inline-flex size-[7px] rounded-full", classes.dot)} />
      </span>
      {label ? <span className={classes.text}>{label}</span> : null}
    </span>
  );
}
