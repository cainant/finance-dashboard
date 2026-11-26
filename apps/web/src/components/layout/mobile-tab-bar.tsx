import { Link, useRouterState } from "@tanstack/react-router";

import { MOBILE_TABS, activeMobileTab } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Barra de abas inferior (abaixo de `lg`): cápsula flutuante de vidro com os
 * 5 destinos principais. É um dos dois únicos elementos com `backdrop-filter`
 * (o outro é a barra superior). Os links preservam os search params atuais
 * (filtro global de período) como a sidebar. Tocar na aba já ativa, estando na
 * própria raiz dela, rola a página ao topo.
 */
export function MobileTabBar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = activeMobileTab(pathname);

  return (
    <nav
      aria-label="Navegação principal"
      data-slot="mobile-tab-bar"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))] pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      <ul className="glass-tabbar pointer-events-auto mx-auto grid h-[60px] max-w-md grid-cols-5 items-stretch rounded-[30px] p-1">
        {MOBILE_TABS.map((tab) => {
          const isActive = active === tab.id;
          const Icon = tab.icon;

          return (
            <li key={tab.id} className="min-w-0">
              <Link
                to={tab.to}
                search={(previous) => previous}
                // Troca de aba é instantânea, sem view transition (como apps nativos).
                viewTransition={false}
                aria-current={isActive ? "page" : undefined}
                onClick={(event) => {
                  if (pathname === tab.to) {
                    // Já na raiz da aba: só volta ao topo, sem renavegar (o
                    // restore de scroll do router desfaria a rolagem suave).
                    event.preventDefault();
                    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
                  }
                }}
                className={cn(
                  "flex h-full min-h-[44px] flex-col items-center justify-center gap-[3px] rounded-[26px] outline-offset-0 transition-transform duration-[120ms] ease-out active:scale-[0.94]",
                  isActive ? "text-primary-ink" : "text-muted-foreground",
                )}
              >
                <Icon
                  aria-hidden="true"
                  className="size-[21px]"
                  strokeWidth={isActive ? 2.1 : 1.75}
                />
                <span className="max-w-full truncate text-[11px] leading-[13px] font-medium">
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
