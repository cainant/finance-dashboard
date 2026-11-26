import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

/*
 * Pill de 20px: fundo `card`, borda 1px e texto/ borda semânticos. As
 * variantes verde/vermelho/âmbar não usam fundo cheio — a cor é sinal, não
 * decoração.
 */
const badgeVariants = cva(
  [
    "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 rounded-full border bg-card px-2",
    "text-xs font-medium whitespace-nowrap",
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3",
  ],
  {
    variants: {
      variant: {
        default: "border-border text-foreground",
        secondary: "border-border text-muted-foreground",
        outline: "border-border text-foreground",
        destructive: "border-destructive/40 text-destructive",
        positive: "border-positive/40 text-positive",
        negative: "border-negative/40 text-negative",
        warning: "border-warning/40 text-warning",
        info: "border-info/40 text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
