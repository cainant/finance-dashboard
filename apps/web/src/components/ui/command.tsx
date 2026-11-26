import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";
import type * as React from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Primitivos da paleta de comandos (`cmdk`) no visual do painel. */
export function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground",
        className,
      )}
      {...props}
    />
  );
}

export interface CommandDialogProps extends React.ComponentProps<typeof Dialog> {
  /** Título lido por leitores de tela (o Dialog exige um). */
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
}

/** Paleta dentro de um Dialog: 580px, raio 12, sem o botão de fechar padrão. */
export function CommandDialog({
  title = "Paleta de comandos",
  description = "Busque telas, ações e contas do painel.",
  className,
  showCloseButton = false,
  children,
  ...props
}: CommandDialogProps) {
  return (
    <Dialog {...props}>
      <DialogContent
        className={cn(
          "top-[12%] translate-y-0 gap-0 overflow-hidden rounded-xl p-0 sm:max-w-[580px]",
          className,
        )}
        showCloseButton={showCloseButton}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        <Command>{children}</Command>
      </DialogContent>
    </Dialog>
  );
}

export function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-4 transition-[box-shadow,background-color] duration-150 focus-within:bg-accent/40 focus-within:ring-2 focus-within:ring-ring/60 focus-within:ring-inset"
    >
      <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "flex h-10 w-full bg-transparent text-sm text-foreground outline-hidden",
          "placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn("max-h-[420px] overflow-x-hidden overflow-y-auto p-1.5", className)}
      {...props}
    />
  );
}

export function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-8 text-center text-sm text-muted-foreground"
      {...props}
    />
  );
}

export function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden text-foreground",
        "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5",
        "[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
        "[&_[cmdk-group-heading]]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("my-1 h-px bg-border-subtle", className)}
      {...props}
    />
  );
}

export function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "relative flex cursor-default select-none items-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium outline-hidden",
        "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
        "[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        "[&_svg]:text-muted-foreground data-[selected=true]:[&_svg]:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn("ml-auto text-[11px] font-normal text-muted-foreground", className)}
      {...props}
    />
  );
}
