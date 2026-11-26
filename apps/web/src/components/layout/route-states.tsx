import { Link } from "@tanstack/react-router";
import { Compass, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StateFrameProps {
  standalone?: boolean;
  children: ReactNode;
}

function StateFrame({ standalone = false, children }: StateFrameProps) {
  if (!standalone) {
    return <div className="flex min-h-[60vh] items-center justify-center py-10">{children}</div>;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-14 items-center border-b border-border px-4 sm:px-6">
        <Link to="/" search={(previous) => previous} aria-label="Lumen Finance — início">
          <BrandLogo />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">{children}</main>
    </div>
  );
}

function StateBody({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
      <span
        className="grid size-12 place-items-center rounded-lg border border-border bg-surface-2 text-muted-foreground"
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children ? (
        <div className="flex flex-wrap items-center justify-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}

export interface RouteErrorStateProps {
  error: unknown;
  reset: () => void;
  standalone?: boolean;
}

/** Error boundary de rota: mantém a marca e oferece retry + volta ao início. */
export function RouteErrorState({ error, reset, standalone = false }: RouteErrorStateProps) {
  return (
    <StateFrame standalone={standalone}>
      <div className="w-full max-w-lg space-y-5">
        <StateBody
          icon={<TriangleAlert className="size-5" />}
          title="Algo saiu do trilho"
          description="A página encontrou um erro inesperado. Você pode tentar novamente ou voltar para a visão geral."
        >
          <Button onClick={reset}>Tentar novamente</Button>
          <Button asChild variant="outline">
            <Link to="/" search={(previous) => previous}>
              Voltar para a visão geral
            </Link>
          </Button>
        </StateBody>
        {error instanceof Error && import.meta.env.DEV ? (
          <p className="rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-xs break-words text-muted-foreground">
            {error.message}
          </p>
        ) : null}
      </div>
    </StateFrame>
  );
}

export interface RouteNotFoundStateProps {
  standalone?: boolean;
  className?: string;
}

/** 404 com caminho de volta; usado no root e dentro do shell. */
export function RouteNotFoundState({ standalone = false, className }: RouteNotFoundStateProps) {
  const body = (
    <div className={cn("flex w-full items-center justify-center py-10", className)}>
      <StateBody
        icon={<Compass className="size-5" />}
        title="Página não encontrada"
        description="O endereço que você abriu não existe ou foi movido. Confira o link ou volte para o painel."
      >
        <Button asChild>
          <Link to="/" search={(previous) => previous}>
            Ir para a visão geral
          </Link>
        </Button>
      </StateBody>
    </div>
  );

  return standalone ? <StateFrame standalone>{body}</StateFrame> : body;
}
