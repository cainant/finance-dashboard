import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/** Seta de "abre outra tela" à direita da linha. */
export function RowChevron({ className }: { className?: string }) {
  return (
    <ChevronRight
      aria-hidden="true"
      className={cn("size-4 shrink-0 text-subtle-foreground", className)}
    />
  );
}

/** Texto só para leitores de tela: diz para onde o link leva. */
export function SrDestination({ children }: { children: string }) {
  return <span className="sr-only">{children}</span>;
}
