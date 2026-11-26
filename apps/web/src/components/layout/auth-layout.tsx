import type { ReactNode } from "react";

import { BrandLogo } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export interface AuthLayoutProps {
  title: string;
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Layout das telas de login/setup: coluna única centralizada sobre fundo liso.
 * Marca no topo, formulário de ~400px centralizado vertical e horizontalmente
 * e o alternador de tema no canto superior direito. Sem gradiente nem lista de
 * recursos; as rotas continuam fornecendo título, descrição, filhos e rodapé.
 */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center px-4 sm:px-6">
        <BrandLogo />
      </header>

      <div className="absolute top-3 right-3 sm:right-4">
        <ThemeToggle />
      </div>

      <main className="flex flex-1 items-center justify-center px-4 pt-4 pb-20 sm:px-6">
        <div className="w-full max-w-[400px] space-y-6">
          <header className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          </header>

          {children}

          {footer ? <div className="text-sm text-muted-foreground">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
