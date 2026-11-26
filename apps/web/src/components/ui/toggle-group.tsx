import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Grupo segmentado (padrão do filtro de período): contêiner de 32px com borda
 * 1px sobre `card`; o item ativo ganha superfície `background` e borda 1px.
 * Use `type="single"` para escolha exclusiva ou `"multiple"` para alternáveis.
 */
export function ToggleGroup({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      orientation={orientation}
      className={cn(
        "inline-flex w-fit items-center gap-0.5 rounded-lg border border-border bg-card p-0.5",
        "data-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

const toggleGroupItemVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent px-2.5",
    "text-[13px] font-medium whitespace-nowrap text-muted-foreground",
    "transition-[color,background-color,border-color] duration-150",
    "hover:bg-accent hover:text-foreground",
    "disabled:pointer-events-none disabled:opacity-50",
    "data-[state=on]:border-border data-[state=on]:bg-background data-[state=on]:text-foreground",
    "[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      size: {
        default: "h-7",
        sm: "h-6 px-2 text-xs",
        lg: "h-8 px-3 text-sm",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export interface ToggleGroupItemProps
  extends
    React.ComponentProps<typeof ToggleGroupPrimitive.Item>,
    VariantProps<typeof toggleGroupItemVariants> {}

export function ToggleGroupItem({ className, size, ...props }: ToggleGroupItemProps) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(toggleGroupItemVariants({ size }), className)}
      {...props}
    />
  );
}
