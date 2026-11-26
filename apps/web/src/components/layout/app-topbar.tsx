import { useQuery } from "@tanstack/react-query";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import { useEffect } from "react";

import { UserMenu } from "@/components/layout/user-menu";
import { usePrivacy } from "@/components/privacy/privacy-context";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { historyIndex, navTrail, screenLabel } from "@/lib/nav-trail";
import { accountsQueryOptions } from "@/lib/queries";
import { useTitleOffscreen } from "@/lib/use-title-offscreen";
import { cn } from "@/lib/utils";
import { markProgrammaticBack } from "@/lib/view-transitions";

/** Título da rota atual: último match com `staticData.title`. */
function useCurrentTitle(): string {
  return useRouterState({
    select: (state) => {
      for (let index = state.matches.length - 1; index >= 0; index -= 1) {
        const staticData = state.matches[index]?.staticData as { title?: unknown } | undefined;
        if (typeof staticData?.title === "string") {
          return staticData.title;
        }
      }

      return "Painel";
    },
  });
}

type DetailParent = "/accounts" | "/credit-cards";

interface DetailBreadcrumb {
  /** Nome da conta/cartão (ou "Conta"/"Cartão" enquanto carrega). */
  name: string;
  /** Lista de origem do detalhe: destino do voltar quando não há histórico. */
  parent: DetailParent;
  parentLabel: string;
}

/**
 * Nome da conta/cartão em telas de detalhe (`/accounts/$id`, `/credit-cards/$id`).
 * Fora delas, `null`: o título vive só no `PageHeader` (h1), sem repetir na barra.
 */
function useDetailBreadcrumb(pathname: string): DetailBreadcrumb | null {
  const match = /^\/(accounts|credit-cards)\/([^/]+)\/?$/.exec(pathname);
  const isCardRoute = match?.[1] === "credit-cards";
  const accountId = match?.[2] ?? null;
  const accountsQuery = useQuery({ ...accountsQueryOptions, enabled: accountId !== null });

  if (!accountId) {
    return null;
  }

  const account = accountsQuery.data?.data.find((item) => item.id === accountId);

  return {
    name: account?.name ?? (isCardRoute ? "Cartão" : "Conta"),
    parent: isCardRoute ? "/credit-cards" : "/accounts",
    parentLabel: isCardRoute ? "Cartões" : "Contas",
  };
}

/**
 * Botão voltar do mobile. Quando a trilha sabe qual é a entrada anterior do
 * histórico, ele **é** o voltar do histórico (a mesma saída do gesto do
 * sistema, com a rolagem da tela anterior restaurada) e leva o nome dela;
 * sem essa informação (deep link, reload) cai na lista de origem.
 */
function MobileBackLink({ detail, pathname }: { detail: DetailBreadcrumb; pathname: string }) {
  const router = useRouter();
  const index = useRouterState({ select: (state) => historyIndex(state.location) });
  const previous = navTrail.previousOf(index);
  const useHistory = previous !== null && previous !== pathname;
  const label = useHistory ? screenLabel(previous) : detail.parentLabel;

  return (
    <Link
      to={detail.parent}
      search={(previousSearch) => previousSearch}
      aria-label={`Voltar para ${label}`}
      onClick={(event) => {
        if (
          !useHistory ||
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        event.preventDefault();
        markProgrammaticBack();
        router.history.back();
      }}
      className="-ml-2 flex min-h-11 items-center gap-0.5 rounded-lg pr-2 pl-1 text-[15px] font-medium text-primary-ink lg:hidden"
    >
      <ChevronLeft aria-hidden="true" className="size-5" />
      {label}
    </Link>
  );
}

/**
 * Barra superior. Desktop: faixa sólida com a trilha de navegação. Mobile
 * (abaixo de `lg`): vidro translúcido, botão voltar em telas de detalhe e o
 * título compacto, que só aparece depois que o h1 da página sai da tela.
 */
export function AppTopbar() {
  const title = useCurrentTitle();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const detail = useDetailBreadcrumb(pathname);
  const breadcrumb = detail?.name ?? null;
  const { hideValues, toggleHideValues } = usePrivacy();
  const titleOffscreen = useTitleOffscreen(pathname);
  const compactTitle = breadcrumb ?? title;

  useEffect(() => {
    document.title = title === "Visão geral" ? "Lumen Finance" : `${title} · Lumen Finance`;
  }, [title]);

  const hideLabel = hideValues ? "Mostrar valores" : "Ocultar valores";

  return (
    <header
      data-slot="app-topbar"
      className={cn(
        "sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] pt-[env(safe-area-inset-top)]",
        "lg:h-14 lg:bg-background lg:px-6 lg:pt-0",
        titleOffscreen
          ? "border-border-subtle lg:border-border"
          : "border-transparent lg:border-border",
      )}
    >
      {/* Vidro só no mobile; o desktop mantém o fundo sólido do header. */}
      <div aria-hidden="true" className="glass-bar absolute inset-0 -z-10 lg:hidden" />

      {detail ? <MobileBackLink detail={detail} pathname={pathname} /> : null}

      {detail ? (
        <nav
          aria-label="Trilha de navegação"
          className="hidden min-w-0 items-center gap-2 text-[13px] lg:flex"
        >
          <Link
            to={detail.parent}
            search={(previous) => previous}
            className="rounded-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            {detail.parentLabel}
          </Link>
          <ChevronRight aria-hidden="true" className="size-3 shrink-0 text-subtle-foreground" />
          <span aria-current="page" className="truncate font-medium text-foreground">
            {breadcrumb}
          </span>
        </nav>
      ) : null}

      {/* Título compacto: só no mobile e só com o h1 fora da tela (nunca duplica
          o texto do PageHeader). Não é lido por leitores de tela: o h1 já é. */}
      {titleOffscreen ? (
        <p
          aria-hidden="true"
          data-slot="topbar-compact-title"
          className="animate-compact-title pointer-events-none absolute inset-x-28 bottom-0 flex h-14 items-center justify-center truncate text-base font-semibold tracking-[-0.015em] lg:hidden"
        >
          <span className="truncate">{compactTitle}</span>
        </p>
      ) : null}

      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-11 lg:size-8"
          onClick={toggleHideValues}
          aria-label={hideLabel}
          aria-pressed={hideValues}
          title={hideLabel}
        >
          {hideValues ? (
            <Eye aria-hidden="true" className="size-4" />
          ) : (
            <EyeOff aria-hidden="true" className="size-4" />
          )}
        </Button>
        <div className="hidden lg:block">
          <ThemeToggle />
        </div>
        <UserMenu />
      </div>
    </header>
  );
}
