import type * as React from "react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface SettingsCardProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Ação opcional no canto direito do cabeçalho de 44px. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

/** Card de configurações: cabeçalho padrão de 44px e conteúdo em linhas. */
export function SettingsCard({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: SettingsCardProps) {
  return (
    <Card className={cn("min-w-0 gap-0", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className={cn("p-0", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

export interface SettingsRowProps {
  /** Omitir quando a descrição sozinha já explica a linha (nada de título repetindo o botão). */
  label?: React.ReactNode;
  description?: React.ReactNode;
  /** Controle à direita; no mobile a linha empilha. */
  control?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  align?: "center" | "start";
}

/** Linha rótulo/descrição à esquerda e controle à direita (44px no mínimo). */
export function SettingsRow({
  label,
  description,
  control,
  children,
  className,
  align = "center",
}: SettingsRowProps) {
  return (
    <div
      data-slot="settings-row"
      className={cn(
        "flex min-h-11 flex-col gap-2 border-b border-border-subtle px-4 py-3 last:border-b-0 sm:flex-row sm:justify-between sm:gap-6",
        align === "start" ? "sm:items-start" : "sm:items-center",
        className,
      )}
    >
      <div className="min-w-0 space-y-0.5">
        {label ? <p className="text-sm leading-5 font-medium text-foreground">{label}</p> : null}
        {description ? (
          <p className="text-[13px] leading-5 text-muted-foreground">{description}</p>
        ) : null}
        {children}
      </div>
      {control ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 self-start sm:self-auto">
          {control}
        </div>
      ) : null}
    </div>
  );
}
