import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium",
    "transition-[color,background-color,border-color,box-shadow] duration-150",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        /* Acento único (azul). Verde nunca é cor de botão. */
        default: "border border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "border border-border bg-card text-foreground hover:bg-accent",
        outline: "border border-border bg-card text-foreground hover:bg-accent",
        ghost: "border border-transparent text-foreground hover:bg-accent hover:text-foreground",
        destructive:
          "border border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "border border-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-8 gap-1.5 px-3 text-[13px]",
        lg: "h-10 px-6",
        icon: "size-8",
        "icon-sm": "size-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  const resolved = buttonVariants({ variant, size });

  return (
    <Comp
      data-slot="button"
      /* Variante exposta também no DOM: os testes de layout distinguem CTA
         primário de secundário sem depender das classes do tema. */
      data-variant={variant ?? "default"}
      className={cn(resolved, className)}
      {...props}
    />
  );
}
