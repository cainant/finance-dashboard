import { Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { CommandPalette } from "@/components/command/command-palette";
import { CommandPaletteContext } from "@/components/command/palette-context";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import {
  DataRefreshProvider,
  PullToRefresh,
  RefreshFocusButton,
} from "@/components/layout/data-refresh";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Shell autenticado: sidebar fixa no desktop; barra de abas e barra de vidro no mobile. */
export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteControls = useMemo(() => ({ open: () => setPaletteOpen(true) }), []);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // O router atualiza a URL antes de montar a rota nova e mantém a página
  // anterior na tela nesse intervalo. Enquanto isso, o conteúdo antigo não
  // pode receber clique: o menu de período abria nele e sumia no commit
  // seguinte, parecendo que fechou sozinho.
  const isPageStale = useRouterState({
    select: (state) =>
      state.status === "pending" && state.resolvedLocation?.pathname !== state.location.pathname,
  });
  const mainRef = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);

  // Em navegação entre páginas, move o foco para o conteúdo (leitores de tela).
  useEffect(() => {
    if (previousPath.current === pathname) {
      return;
    }

    previousPath.current = pathname;
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <CommandPaletteContext.Provider value={paletteControls}>
      <TooltipProvider>
        <DataRefreshProvider>
          <a
            href="#conteudo"
            className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
          >
            Pular para o conteúdo
          </a>
          <RefreshFocusButton />
          <PullToRefresh />

          <div className="flex min-h-dvh bg-background">
            <AppSidebar
              className="hidden lg:flex"
              onOpenCommandPalette={() => setPaletteOpen(true)}
            />

            <div className="flex min-w-0 flex-1 flex-col">
              <AppTopbar />
              <main
                ref={mainRef}
                id="conteudo"
                tabIndex={-1}
                data-navigation-pending={isPageStale ? "true" : undefined}
                className={cn(
                  "flex-1 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] pt-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] outline-none sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pl-[max(1.5rem,env(safe-area-inset-left))] lg:px-8 lg:pt-7 lg:pb-8",
                  isPageStale && "pointer-events-none",
                )}
              >
                <div className="mx-auto w-full max-w-[1320px] animate-fade-in">
                  <Outlet />
                </div>
              </main>
            </div>
          </div>

          <MobileTabBar />
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        </DataRefreshProvider>
      </TooltipProvider>
    </CommandPaletteContext.Provider>
  );
}
