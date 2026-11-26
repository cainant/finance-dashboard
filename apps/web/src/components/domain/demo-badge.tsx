import { FlaskConical } from "lucide-react";
import type * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface DemoBadgeProps extends React.ComponentProps<typeof Badge> {
  label?: string;
}

/**
 * Marca obrigatória para dados fictícios do provider demo (architecture.md).
 * Nunca apresente dado de demonstração sem este selo.
 */
export function DemoBadge({ label = "Demonstração", className, ...props }: DemoBadgeProps) {
  return (
    <Badge
      data-slot="demo-badge"
      variant="secondary"
      title="Dados fictícios do provider de demonstração"
      className={cn("gap-1", className)}
      {...props}
    >
      <FlaskConical aria-hidden="true" className="text-subtle-foreground" />
      {label}
    </Badge>
  );
}
