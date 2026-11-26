import type * as React from "react";

import { cn } from "@/lib/utils";

/*
 * Card plano: borda 1px, raio 8, sem sombra. Sem `overflow-hidden` para não
 * cortar o anel de foco de controles internos (o raio é feito pela borda).
 */
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex min-w-0 flex-col gap-0 rounded-lg border border-border bg-card text-card-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** Cabeçalho padrão: no mínimo 44px, padding 16px e divisória inferior. */
export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid min-h-11 auto-rows-min grid-rows-[auto_auto] items-center gap-0.5 border-b border-border-subtle px-4 py-2.5",
        "has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="card-title"
      className={cn("text-sm leading-5 font-medium text-foreground", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-[13px] leading-5 text-muted-foreground", className)}
      {...props}
    />
  );
}

export function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-center justify-self-end", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-4 py-4", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-4 py-3 [.border-t]:border-border-subtle", className)}
      {...props}
    />
  );
}
