import type { Connection } from "@fd/contracts";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight, PanelLeftClose, PanelLeftOpen, RefreshCw, Search } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { InstitutionAvatar } from "@/components/domain/institution-avatar";
import { StatusDot, type StatusTone } from "@/components/domain/status-dot";
import { BrandMark } from "@/components/layout/brand";
import { useMoneyFormatter } from "@/components/privacy/privacy-context";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  accountGroupKeyFromSearch,
  accountGroupLinkSearch,
  accountGroupSearch,
  groupAccountsByInstitution,
  groupDisplayCents,
  groupHasCardDebt,
  groupsAccountsBalanceCents,
  sortGroupsByDisplayCents,
} from "@/lib/accounts";
import type { AccountGroup } from "@/lib/accounts";
import { readLocalStorage, writeLocalStorage } from "@/lib/hooks";
import { useSyncConnectionMutation } from "@/lib/mutations";
import { deriveSyncStatus, pickSyncTarget } from "@/lib/sync-status";
import { NAV_ITEMS, isNavPathActive, type NavItem, type NavPath } from "@/lib/nav";
import { useDemoProviderEnabled } from "@/lib/providers";
import {
  accountsQueryOptions,
  connectionsQueryOptions,
  creditCardsQueryOptions,
  uncategorizedCountQueryOptions,
  upcomingBillsQueryOptions,
} from "@/lib/queries";
import { accountsSearchSchema, type AccountsSearch } from "@/lib/search";
import { cn } from "@/lib/utils";

const COLLAPSE_STORAGE_KEY = "lumen:sidebar-collapsed";
const GROUPS_STORAGE_KEY = "lumen:sidebar-groups";

type GroupId = "accounts" | "credit-cards";

const DEFAULT_GROUP_STATE: Record<GroupId, boolean> = {
  accounts: true,
  "credit-cards": false,
};

function readGroupState(): Record<GroupId, boolean> {
  const stored = readLocalStorage(GROUPS_STORAGE_KEY);
  if (!stored) {
    return DEFAULT_GROUP_STATE;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<Record<GroupId, unknown>>;

    return {
      accounts:
        typeof parsed.accounts === "boolean" ? parsed.accounts : DEFAULT_GROUP_STATE.accounts,
      "credit-cards":
        typeof parsed["credit-cards"] === "boolean"
          ? parsed["credit-cards"]
          : DEFAULT_GROUP_STATE["credit-cards"],
    };
  } catch {
    return DEFAULT_GROUP_STATE;
  }
}

type CounterTone = "neutral" | "warning" | "danger";

interface NavCounterValue {
  value: number;
  tone: CounterTone;
  srLabel: string;
}

const COUNTER_CLASS: Record<CounterTone, string> = {
  neutral: "border-border text-muted-foreground",
  warning: "border-warning/45 bg-warning/15 text-warning",
  danger: "border-negative/45 bg-negative/15 text-negative",
};

const COUNTER_DOT_CLASS: Record<CounterTone, string> = {
  neutral: "bg-muted-foreground/70",
  warning: "bg-warning",
  danger: "bg-negative",
};

const SYNC_DOT_CLASS: Record<StatusTone, string> = {
  success: "bg-positive",
  warning: "bg-warning",
  danger: "bg-negative",
  info: "bg-info",
  neutral: "bg-muted-foreground/70",
};

const SYNC_TEXT_CLASS: Record<StatusTone, string> = {
  success: "text-sidebar-foreground",
  warning: "text-warning",
  danger: "text-negative",
  info: "text-sidebar-foreground",
  neutral: "text-muted-foreground",
};

/**
 * Props do valor monetário curto de um item da sidebar. O texto visível já é
 * dinheiro (nome acessível do link); o `title` acrescenta o contexto — saldo,
 * líquido ou fatura — e o valor exato, e a dica vira `sr-only` para leitores de
 * tela, nunca o único lugar do valor.
 */
function moneyMeta(
  money: ReturnType<typeof useMoneyFormatter>,
  cents: number,
  description: string,
  hint?: string,
) {
  return {
    meta: money.formatCompactMoney(cents),
    metaLabel: money.ariaLabel,
    metaHint: money.hidden ? undefined : hint,
    metaTitle: money.hidden ? undefined : `${description}: ${money.formatCurrency(cents)}`,
    // Dívida (fatura aberta) usa o mesmo tom de perigo das saídas no app, mas a
    // máscara de "Ocultar valores" fica neutra.
    metaDanger: !money.hidden && cents < 0,
  };
}

/** Contexto do valor de um grupo: `title` e dica para leitores de tela. */
function groupValueContext(group: AccountGroup): { description: string; hint?: string } {
  if (!groupHasCardDebt(group)) {
    return { description: "Saldo" };
  }

  return group.totalCents === 0
    ? { description: "Fatura aberta", hint: "fatura aberta" }
    : { description: "Líquido (saldos − faturas)", hint: "líquido" };
}

function connectionAttentionTone(status: Connection["status"]): CounterTone | null {
  if (status === "error") {
    return "danger";
  }

  if (status === "login_required" || status === "outdated") {
    return "warning";
  }

  return null;
}

function dueShortLabel(days: number): string {
  if (days === 0) {
    return "vence hoje";
  }

  return days > 0 ? `vence em ${days} d` : `venceu há ${Math.abs(days)} d`;
}

function NavCounter({ counter }: { counter: NavCounterValue }) {
  return (
    <span
      aria-hidden="true"
      title={counter.srLabel}
      className={cn(
        "ml-auto inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full border px-1.5 text-[11px] font-medium tabular-nums",
        COUNTER_CLASS[counter.tone],
      )}
    >
      {counter.value}
    </span>
  );
}

function NavTooltip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" className="ml-1">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function hasRenderableChildren(children: ReactNode): boolean {
  if (children === null || children === undefined || typeof children === "boolean") {
    return false;
  }

  return Array.isArray(children) ? children.length > 0 : true;
}

const NAV_LINK_CLASS =
  "flex h-[34px] min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium text-sidebar-foreground outline-offset-2 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

function NavIcon({
  icon: Icon,
  active,
  compact,
  counter,
}: {
  icon: NavItem["icon"];
  active: boolean;
  compact: boolean;
  counter?: NavCounterValue | null;
}) {
  return (
    <span className="relative flex shrink-0 items-center justify-center">
      <Icon
        aria-hidden="true"
        className={cn("size-4", active ? "text-foreground" : "text-muted-foreground")}
      />
      {compact && counter ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute -top-1 -right-1 size-1.5 rounded-full",
            COUNTER_DOT_CLASS[counter.tone],
          )}
        />
      ) : null}
    </span>
  );
}

function SidebarLink({
  item,
  compact,
  active,
  counter,
  onNavigate,
}: {
  item: NavItem;
  compact: boolean;
  active: boolean;
  counter?: NavCounterValue | null;
  onNavigate?: () => void;
}) {
  const counterDescriptionId = useId();

  const link = (
    <Link
      to={item.to}
      search={(previous) => previous}
      onClick={onNavigate}
      activeOptions={{ exact: item.to === "/" }}
      aria-label={item.label}
      aria-describedby={counter ? counterDescriptionId : undefined}
      className={cn(
        NAV_LINK_CLASS,
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
        compact && "justify-center px-0",
      )}
    >
      <NavIcon icon={item.icon} active={active} compact={compact} counter={counter} />
      <span className={cn("truncate", compact && "sr-only")}>{item.label}</span>
      {!compact && counter ? <NavCounter counter={counter} /> : null}
      {counter ? (
        <span id={counterDescriptionId} className="sr-only">
          {counter.srLabel}
        </span>
      ) : null}
    </Link>
  );

  return compact ? <NavTooltip label={item.label}>{link}</NavTooltip> : link;
}

interface SidebarGroupProps {
  item: NavItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  active: boolean;
  compact: boolean;
  counter?: NavCounterValue | null;
  onNavigate?: () => void;
  pending?: boolean;
  error?: boolean;
  skeletonRows?: number;
  children: ReactNode;
}

function SidebarGroup({
  item,
  open,
  onOpenChange,
  active,
  compact,
  counter,
  onNavigate,
  pending = false,
  error = false,
  skeletonRows = 2,
  children,
}: SidebarGroupProps) {
  const link = (
    <Link
      to={item.to}
      search={(previous) => previous}
      onClick={onNavigate}
      aria-label={item.label}
      className={cn(
        NAV_LINK_CLASS,
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
        compact && "justify-center px-0",
      )}
    >
      <NavIcon icon={item.icon} active={active} compact={compact} counter={counter} />
      <span className={cn("truncate", compact && "sr-only")}>{item.label}</span>
      {!compact && counter ? <NavCounter counter={counter} /> : null}
    </Link>
  );

  if (compact) {
    return (
      <li className="shrink-0">
        <NavTooltip label={item.label}>{link}</NavTooltip>
      </li>
    );
  }

  const hasSubitems = !error && (pending || hasRenderableChildren(children));

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} asChild>
      <li className="shrink-0">
        <div
          className={cn(
            "flex h-[34px] items-center rounded-lg transition-colors duration-150 hover:bg-sidebar-accent",
            active && "bg-sidebar-accent",
          )}
        >
          {link}
          {hasSubitems ? (
            <CollapsibleTrigger asChild>
              <button
                type="button"
                aria-label={`${open ? "Recolher" : "Expandir"} ${item.label}`}
                className="mr-1 grid size-7 shrink-0 place-items-center rounded-md text-subtle-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
              >
                <ChevronRight
                  aria-hidden="true"
                  className={cn("size-4 transition-transform duration-150", open && "rotate-90")}
                />
              </button>
            </CollapsibleTrigger>
          ) : null}
        </div>
        {hasSubitems ? (
          <CollapsibleContent>
            <ul className="mt-px mb-1 ml-[17px] flex min-w-0 flex-col gap-px border-l border-border-subtle pl-[9px]">
              {pending ? <SubItemSkeletons rows={skeletonRows} /> : children}
            </ul>
          </CollapsibleContent>
        ) : null}
      </li>
    </Collapsible>
  );
}

function SubItemSkeletons({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="flex h-8 items-center gap-2 px-3" aria-hidden="true">
          <Skeleton className="size-[18px] rounded-[5px]" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="ml-auto h-3 w-10" />
        </li>
      ))}
    </>
  );
}

function SubItemLink({
  to,
  active = false,
  onNavigate,
  avatar,
  meta,
  metaLabel,
  metaHint,
  metaTitle,
  metaDanger = false,
  nameTitle,
  attention,
  search,
  dataSlot,
  children,
}: {
  to: NavPath;
  active?: boolean;
  onNavigate?: () => void;
  avatar?: ReactNode;
  meta?: string;
  /** Texto lido no lugar da máscara (ex.: "Valor oculto"); `undefined` quando visível. */
  metaLabel?: string;
  /** Dica curta do valor ("líquido", "fatura aberta"); nada quando oculto. */
  metaHint?: string;
  /** Contexto e valor exato do valor compacto; ausente quando oculto. */
  metaTitle?: string;
  /** `true` pinta o valor em tom de perigo (dívida/fatura). */
  metaDanger?: boolean;
  /** Nome completo quando o texto do item pode ser truncado. */
  nameTitle?: string;
  attention?: boolean;
  /**
   * Filtro escrito na URL de `/accounts` (sub-itens de Contas). Sem
   * `connection`/`institution` o recorte é limpo ("Todas as contas"); sem a
   * prop, a search atual é preservada.
   */
  search?: AccountsSearch;
  dataSlot?: string;
  children: ReactNode;
}) {
  const trailing =
    attention || meta ? (
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {attention ? <StatusDot tone="warning" srLabel="Conexão precisa de atenção" /> : null}
        {meta ? (
          <span
            data-slot="sidebar-item-meta"
            title={metaTitle}
            // Oculto: o texto é só a máscara; quem descreve é o "Valor oculto".
            aria-hidden={metaLabel ? "true" : undefined}
            className={cn(
              "text-xs font-normal whitespace-nowrap tabular-nums",
              metaDanger ? "text-negative" : "text-muted-foreground",
            )}
          >
            {meta}
          </span>
        ) : null}
        {meta && metaLabel ? <span className="sr-only">{metaLabel}</span> : null}
        {meta && metaHint ? <span className="sr-only">{metaHint}</span> : null}
      </span>
    ) : null;

  return (
    <Link
      to={to}
      search={
        search ? (previous) => accountGroupLinkSearch(previous, search) : (previous) => previous
      }
      activeOptions={{ exact: true }}
      onClick={onNavigate}
      data-slot={dataSlot}
      data-active={active ? "true" : "false"}
      className={cn(
        "flex h-8 min-w-0 items-center gap-2 rounded-lg px-3 text-[13px] text-sidebar-foreground outline-offset-2 transition-colors duration-150",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
    >
      {avatar}
      <span className="min-w-0 flex-1 truncate" title={nameTitle}>
        {children}
      </span>
      {trailing}
    </Link>
  );
}

export interface AppSidebarProps {
  /** Variante usada dentro do Sheet no mobile: sem colapso e fecha ao navegar. */
  mobile?: boolean;
  onNavigate?: () => void;
  /** Abre a paleta de comandos (Ctrl/Cmd+K). */
  onOpenCommandPalette?: () => void;
  className?: string;
}

/**
 * Sidebar de 256px no estilo do painel da Cloudflare: marca, busca rápida,
 * itens de 34px, grupos expansíveis com dados reais, status de sincronização e
 * trilha recolhida de 56px com tooltips. O estado persiste em localStorage.
 */
export function AppSidebar({
  mobile = false,
  onNavigate,
  onOpenCommandPalette,
  className,
}: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    mobile ? false : readLocalStorage(COLLAPSE_STORAGE_KEY) === "1",
  );
  const [openGroups, setOpenGroups] = useState<Record<GroupId, boolean>>(readGroupState);
  const compact = collapsed && !mobile;
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // Filtro de instituição da página de Contas: é o mesmo par que os sub-itens
  // escrevem na URL, então o item ativo nasce do endereço atual.
  const locationSearch = useRouterState({ select: (state) => state.location.search });
  // A search crua pode chegar com tipos inesperados (`?institution=2024` vira
  // número); validar aqui evita quebrar o shell fora da rota de Contas.
  const groupSearch = useMemo<AccountsSearch>(() => {
    const parsed = accountsSearchSchema.safeParse(locationSearch);

    return parsed.success ? parsed.data : {};
  }, [locationSearch]);
  const money = useMoneyFormatter();
  const demoEnabled = useDemoProviderEnabled();

  const accountsQuery = useQuery(accountsQueryOptions);
  const connectionsQuery = useQuery(connectionsQueryOptions);
  const cardsQuery = useQuery(creditCardsQueryOptions);
  const upcomingQuery = useQuery(upcomingBillsQueryOptions({ days: 45, limit: 20 }));
  const uncategorizedQuery = useQuery(uncategorizedCountQueryOptions);

  const accounts = useMemo(() => accountsQuery.data?.data ?? [], [accountsQuery.data]);
  const connections = useMemo(() => connectionsQuery.data?.data ?? [], [connectionsQuery.data]);
  const cards = useMemo(() => cardsQuery.data?.data ?? [], [cardsQuery.data]);
  const upcoming = useMemo(() => upcomingQuery.data?.data ?? [], [upcomingQuery.data]);

  const accountGroups = useMemo(() => {
    const groups = groupAccountsByInstitution(accounts, connections);
    // Produção roda sem o provider demo: mesmo que uma conta de demonstração
    // tenha sobrado no banco, ela não aparece na navegação nem no total.
    const visible = demoEnabled ? groups : groups.filter((group) => group.provider !== "demo");
    // A lista segue o valor que o usuário vê (líquido quando há fatura), não o
    // saldo bruto usado no desempate de `groupAccountsByInstitution`.
    return sortGroupsByDisplayCents(visible);
  }, [accounts, connections, demoEnabled]);

  /**
   * "Todas as contas" é o "Em contas" do resumo de patrimônio calculado sobre as
   * mesmas contas que a sidebar exibe: saldos sem cartões e sem investimentos.
   * A fatura aberta aparece na própria instituição (como "Total líquido" na
   * página Contas) e no grupo Cartões.
   */
  const accountsBalanceCents = useMemo(
    () => groupsAccountsBalanceCents(accountGroups),
    [accountGroups],
  );

  // Um filtro que não corresponde a nenhum grupo cai em "Todas as contas":
  // assim a sidebar nunca fica sem item ativo por causa de URL antiga.
  const selectedGroupKey = useMemo(() => {
    const requested = accountGroupKeyFromSearch(groupSearch);

    return requested && accountGroups.some((group) => group.key === requested) ? requested : null;
  }, [accountGroups, groupSearch]);
  const allAccountsActive = pathname === "/accounts" && selectedGroupKey === null;

  const connectionById = useMemo(
    () => new Map(connections.map((connection) => [connection.id, connection])),
    [connections],
  );

  const dueByAccount = useMemo(() => {
    const map = new Map<string, number>();

    for (const bill of upcoming) {
      const current = map.get(bill.accountId);
      if (current === undefined || bill.daysUntilDue < current) {
        map.set(bill.accountId, bill.daysUntilDue);
      }
    }

    return map;
  }, [upcoming]);

  const connectionsCounter = useMemo<NavCounterValue | null>(() => {
    const errors = connections.filter((connection) => connection.status === "error").length;
    if (errors > 0) {
      return {
        value: errors,
        tone: "danger",
        srLabel: errors === 1 ? "1 conexão com erro" : `${errors} conexões com erro`,
      };
    }

    const attention = connections.filter(
      (connection) => connection.status === "login_required" || connection.status === "outdated",
    ).length;
    if (attention > 0) {
      return {
        value: attention,
        tone: "warning",
        srLabel:
          attention === 1
            ? "1 conexão precisa de atenção"
            : `${attention} conexões precisam de atenção`,
      };
    }

    return null;
  }, [connections]);

  /**
   * Contador neutro de transações sem categoria. Carregando ou com erro, nada:
   * o badge é informativo e nunca deve piscar ou travar o shell.
   */
  const uncategorizedCounter = useMemo<NavCounterValue | null>(() => {
    if (uncategorizedQuery.isPending || uncategorizedQuery.isError) {
      return null;
    }

    const count = uncategorizedQuery.data?.count ?? 0;
    if (count <= 0) {
      return null;
    }

    return {
      value: count,
      tone: "neutral",
      srLabel: count === 1 ? "1 transação sem categoria" : `${count} transações sem categoria`,
    };
  }, [uncategorizedQuery.data, uncategorizedQuery.isError, uncategorizedQuery.isPending]);

  const syncStatus = useMemo(() => deriveSyncStatus(connections), [connections]);
  const syncTarget = useMemo(() => pickSyncTarget(connections), [connections]);
  const sync = useSyncConnectionMutation();

  const setGroupOpen = useCallback((id: GroupId, open: boolean) => {
    setOpenGroups((current) => (current[id] === open ? current : { ...current, [id]: open }));
  }, []);

  useEffect(() => {
    if (mobile) {
      return;
    }

    writeLocalStorage(COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed, mobile]);

  useEffect(() => {
    writeLocalStorage(GROUPS_STORAGE_KEY, JSON.stringify(openGroups));
  }, [openGroups]);

  function handleSync() {
    if (syncTarget) {
      sync.mutation.mutate(syncTarget.id);
    }
  }

  const searchButton = (
    <button
      type="button"
      onClick={onOpenCommandPalette}
      aria-label="Buscar ou ir para…"
      className={cn(
        "flex h-8 w-full min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-[13px] text-muted-foreground outline-offset-2 transition-colors duration-150",
        "hover:bg-sidebar-accent hover:text-foreground",
        compact && "justify-center px-0",
      )}
    >
      <Search aria-hidden="true" className="size-4 shrink-0" />
      {compact ? null : (
        <>
          <span className="flex-1 truncate text-left">Buscar ou ir para…</span>
          <kbd className="rounded border border-border bg-background px-1.5 py-px text-[11px] font-normal text-muted-foreground">
            Ctrl K
          </kbd>
        </>
      )}
    </button>
  );

  return (
    <aside
      data-slot="app-sidebar"
      data-collapsed={compact ? "true" : "false"}
      aria-label="Navegação principal"
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        !mobile && "sticky top-0 h-dvh shrink-0 transition-[width] duration-200",
        compact ? "w-14" : "w-64",
        mobile && "w-full border-none",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-sidebar-border",
          compact ? "justify-center px-0" : "px-3",
        )}
      >
        <Link
          to="/"
          search={(previous) => previous}
          aria-label="Lumen Finance — início"
          onClick={onNavigate}
          className="flex min-w-0 items-center rounded-lg outline-offset-2"
        >
          <BrandMark size="sm" />
          {compact ? null : (
            <span className="ml-2.5 truncate text-sm font-semibold tracking-tight text-foreground">
              Lumen Finance
            </span>
          )}
        </Link>
      </div>

      <div className={cn("shrink-0 pt-3", compact ? "px-2" : "px-3")}>
        {compact ? (
          <NavTooltip label="Buscar ou ir para…">{searchButton}</NavTooltip>
        ) : (
          searchButton
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:block! [&>div]:min-w-0!">
        <nav
          aria-label="Seções do painel"
          className={cn("flex min-w-0 flex-col", compact ? "px-2" : "px-3")}
        >
          <ul className="flex flex-col gap-0.5 py-2">
            <li className="shrink-0">
              <SidebarLink
                item={NAV_ITEMS.overview}
                compact={compact}
                active={isNavPathActive(pathname, NAV_ITEMS.overview.to)}
                onNavigate={onNavigate}
              />
            </li>
            <li className="shrink-0">
              <SidebarLink
                item={NAV_ITEMS.transactions}
                compact={compact}
                active={isNavPathActive(pathname, NAV_ITEMS.transactions.to)}
                counter={uncategorizedCounter}
                onNavigate={onNavigate}
              />
            </li>

            <SidebarGroup
              item={NAV_ITEMS.accounts}
              compact={compact}
              open={openGroups.accounts}
              onOpenChange={(open) => setGroupOpen("accounts", open)}
              active={isNavPathActive(pathname, NAV_ITEMS.accounts.to)}
              onNavigate={onNavigate}
              pending={accountsQuery.isPending || connectionsQuery.isPending}
              error={accountsQuery.isError || connectionsQuery.isError}
              skeletonRows={3}
            >
              <li>
                <SubItemLink
                  to="/accounts"
                  search={{ connection: undefined, institution: undefined }}
                  active={allAccountsActive}
                  onNavigate={onNavigate}
                  dataSlot="sidebar-all-accounts"
                  {...moneyMeta(
                    money,
                    accountsBalanceCents,
                    "Saldo das contas, sem faturas nem investimentos",
                  )}
                >
                  Todas as contas
                </SubItemLink>
              </li>
              {accountGroups.map((group) => {
                const connection = group.accounts[0]
                  ? connectionById.get(group.accounts[0].connectionId)
                  : undefined;
                const attention = connection ? connectionAttentionTone(connection.status) : null;
                const context = groupValueContext(group);

                return (
                  <li key={group.key}>
                    <SubItemLink
                      to="/accounts"
                      search={accountGroupSearch(group.key)}
                      active={pathname === "/accounts" && selectedGroupKey === group.key}
                      onNavigate={onNavigate}
                      dataSlot="sidebar-account-group"
                      avatar={
                        <InstitutionAvatar
                          name={group.institutionName}
                          color={group.institutionColor}
                          size="xs"
                          className="size-[18px] rounded-[5px] text-[10px]"
                        />
                      }
                      {...moneyMeta(
                        money,
                        groupDisplayCents(group),
                        context.description,
                        context.hint,
                      )}
                      nameTitle={group.institutionName}
                      attention={Boolean(attention)}
                    >
                      {group.institutionName}
                    </SubItemLink>
                  </li>
                );
              })}
            </SidebarGroup>

            <SidebarGroup
              item={NAV_ITEMS.creditCards}
              compact={compact}
              open={openGroups["credit-cards"]}
              onOpenChange={(open) => setGroupOpen("credit-cards", open)}
              active={isNavPathActive(pathname, NAV_ITEMS.creditCards.to)}
              onNavigate={onNavigate}
              pending={cardsQuery.isPending}
              error={cardsQuery.isError}
              skeletonRows={2}
            >
              {cards.map((card) => {
                const daysUntilDue = dueByAccount.get(card.accountId);

                return (
                  <li key={card.accountId}>
                    <SubItemLink
                      to="/credit-cards"
                      onNavigate={onNavigate}
                      avatar={
                        <InstitutionAvatar
                          name={card.account.institutionName ?? card.account.name}
                          size="xs"
                          className="size-[18px] rounded-[5px] text-[10px]"
                        />
                      }
                      meta={daysUntilDue === undefined ? undefined : dueShortLabel(daysUntilDue)}
                    >
                      {card.account.name}
                    </SubItemLink>
                  </li>
                );
              })}
            </SidebarGroup>

            <li className="shrink-0">
              <SidebarLink
                item={NAV_ITEMS.analytics}
                compact={compact}
                active={isNavPathActive(pathname, NAV_ITEMS.analytics.to)}
                onNavigate={onNavigate}
              />
            </li>
            <li className="shrink-0">
              <SidebarLink
                item={NAV_ITEMS.budget}
                compact={compact}
                active={isNavPathActive(pathname, NAV_ITEMS.budget.to)}
                onNavigate={onNavigate}
              />
            </li>
          </ul>

          <div className="mx-1 h-px shrink-0 bg-border-subtle" aria-hidden="true" />

          <p
            className={cn(
              "shrink-0 px-3 pt-4 pb-1.5 text-xs font-medium text-muted-foreground",
              compact && "sr-only",
            )}
          >
            Sistema
          </p>

          <ul className="flex flex-col gap-0.5 pb-2">
            <li className="shrink-0">
              <SidebarLink
                item={NAV_ITEMS.connections}
                compact={compact}
                active={isNavPathActive(pathname, NAV_ITEMS.connections.to)}
                counter={connectionsCounter}
                onNavigate={onNavigate}
              />
            </li>
            <li className="shrink-0">
              <SidebarLink
                item={NAV_ITEMS.settings}
                compact={compact}
                active={isNavPathActive(pathname, NAV_ITEMS.settings.to)}
                onNavigate={onNavigate}
              />
            </li>
          </ul>
        </nav>
      </ScrollArea>

      <div className="shrink-0 border-t border-sidebar-border">
        {compact ? (
          <div className="flex flex-col items-center gap-1 py-2">
            <NavTooltip label={`${syncStatus.text} · Sincronizar agora`}>
              <Button
                variant="ghost"
                size="icon-sm"
                className="relative"
                aria-label="Sincronizar agora"
                disabled={!syncTarget || sync.mutation.isPending}
                onClick={handleSync}
              >
                <RefreshCw
                  aria-hidden="true"
                  className={cn("size-4", sync.mutation.isPending && "animate-spin")}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-1 right-1 size-1.5 rounded-full",
                    SYNC_DOT_CLASS[syncStatus.tone],
                  )}
                />
              </Button>
            </NavTooltip>
            <NavTooltip label="Expandir menu lateral">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Expandir menu lateral"
                aria-expanded={false}
                onClick={() => setCollapsed(false)}
              >
                <PanelLeftOpen aria-hidden="true" className="size-4" />
              </Button>
            </NavTooltip>
          </div>
        ) : (
          <div
            data-slot="sidebar-sync-status"
            className="flex h-12 min-w-0 items-center gap-1 px-3"
          >
            <StatusDot tone={syncStatus.tone} pulse={syncStatus.pulse} className="mr-1.5" />
            <p
              data-slot="sidebar-sync-text"
              className={cn(
                "min-w-0 flex-1 truncate text-xs font-medium",
                SYNC_TEXT_CLASS[syncStatus.tone],
              )}
              title={syncStatus.text}
            >
              {syncStatus.text}
            </p>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Sincronizar agora"
              title="Sincronizar agora"
              disabled={!syncTarget || sync.mutation.isPending}
              onClick={handleSync}
            >
              <RefreshCw
                aria-hidden="true"
                className={cn("size-4", sync.mutation.isPending && "animate-spin")}
              />
            </Button>
            {mobile ? null : (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Recolher menu lateral"
                title="Recolher menu lateral"
                aria-expanded
                onClick={() => setCollapsed(true)}
              >
                <PanelLeftClose aria-hidden="true" className="size-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
