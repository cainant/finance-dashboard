import {
  ArrowLeftRight,
  ChartLine,
  CreditCard,
  Ellipsis,
  LayoutDashboard,
  Link2,
  Settings,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavPath =
  | "/"
  | "/accounts"
  | "/transactions"
  | "/credit-cards"
  | "/analytics"
  | "/budget"
  | "/connections"
  | "/settings";

export interface NavItem {
  label: string;
  to: NavPath;
  icon: LucideIcon;
}

/**
 * Navegação principal do shell autenticado. `PRIMARY_NAV` mantém a ordem da
 * sidebar; "Contas" e "Cartões" são expandidos com dados no `AppSidebar`.
 */
export const NAV_ITEMS = {
  overview: { label: "Visão geral", to: "/", icon: LayoutDashboard },
  transactions: { label: "Transações", to: "/transactions", icon: ArrowLeftRight },
  accounts: { label: "Contas", to: "/accounts", icon: Wallet },
  creditCards: { label: "Cartões", to: "/credit-cards", icon: CreditCard },
  analytics: { label: "Análises", to: "/analytics", icon: ChartLine },
  budget: { label: "Metas", to: "/budget", icon: Target },
  connections: { label: "Conexões", to: "/connections", icon: Link2 },
  settings: { label: "Configurações", to: "/settings", icon: Settings },
} as const satisfies Record<string, NavItem>;

export const PRIMARY_NAV = [
  NAV_ITEMS.overview,
  NAV_ITEMS.transactions,
  NAV_ITEMS.accounts,
  NAV_ITEMS.creditCards,
  NAV_ITEMS.analytics,
  NAV_ITEMS.budget,
] as const;

export const SYSTEM_NAV = [NAV_ITEMS.connections, NAV_ITEMS.settings] as const;

export const ALL_NAV_ITEMS = [...PRIMARY_NAV, ...SYSTEM_NAV] as const;

export const APP_PATHS: readonly NavPath[] = ALL_NAV_ITEMS.map((item) => item.to);

export function isAppPath(value: string): value is NavPath {
  return (APP_PATHS as readonly string[]).includes(value);
}

/**
 * `true` quando o item deve aparecer ativo. A raiz exige caminho exato; os
 * demais aceitam rotas filhas (ex.: `/accounts/$accountId` deixa "Contas"
 * no estado "ativo-contém").
 */
export function isNavPathActive(pathname: string, to: NavPath, exact = false): boolean {
  if (to === "/") {
    return pathname === "/";
  }

  return pathname === to || (!exact && pathname.startsWith(`${to}/`));
}

/** Rota da tela "Mais" (só mobile na navegação; no desktop a sidebar cobre tudo). */
export const MORE_PATH = "/more" as const;

export interface MobileTab {
  id: "overview" | "transactions" | "accounts" | "credit-cards" | "more";
  label: string;
  to: NavPath | typeof MORE_PATH;
  icon: LucideIcon;
}

/** As 5 abas da barra inferior (abaixo de `lg`). */
export const MOBILE_TABS: readonly MobileTab[] = [
  { id: "overview", label: NAV_ITEMS.overview.label, to: "/", icon: NAV_ITEMS.overview.icon },
  {
    id: "transactions",
    label: NAV_ITEMS.transactions.label,
    to: "/transactions",
    icon: NAV_ITEMS.transactions.icon,
  },
  {
    id: "accounts",
    label: NAV_ITEMS.accounts.label,
    to: "/accounts",
    icon: NAV_ITEMS.accounts.icon,
  },
  {
    id: "credit-cards",
    label: NAV_ITEMS.creditCards.label,
    to: "/credit-cards",
    icon: NAV_ITEMS.creditCards.icon,
  },
  { id: "more", label: "Mais", to: MORE_PATH, icon: Ellipsis },
];

/** Destinos que vivem sob a aba "Mais". */
const MORE_PATHS: readonly string[] = [
  MORE_PATH,
  "/analytics",
  "/budget",
  "/connections",
  "/settings",
];

/**
 * Aba ativa para um caminho. Rotas filhas herdam a aba do pai (ex.:
 * `/accounts/$accountId` mantém "Contas"); Análises, Conexões e Configurações
 * ficam sob "Mais" (Metas também).
 */
export function activeMobileTab(pathname: string): MobileTab["id"] | null {
  if (MORE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return "more";
  }

  for (const tab of MOBILE_TABS) {
    if (tab.id !== "more" && isNavPathActive(pathname, tab.to as NavPath)) {
      return tab.id;
    }
  }

  return null;
}
