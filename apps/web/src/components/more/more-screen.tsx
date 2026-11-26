import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Eye, EyeOff, Moon, RefreshCw, Search } from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { useCommandPalette } from "@/components/command/palette-context";
import { InstitutionAvatar } from "@/components/domain/institution-avatar";
import { PageHeader } from "@/components/domain/page-header";
import { StatusDot } from "@/components/domain/status-dot";
import { usePrivacy } from "@/components/privacy/privacy-context";
import { useTheme } from "@/components/theme/theme-context";
import { Switch } from "@/components/ui/switch";
import {
  accountGroupSearch,
  groupAccountsByInstitution,
  sortGroupsByDisplayCents,
} from "@/lib/accounts";
import { useSyncConnectionMutation } from "@/lib/mutations";
import { NAV_ITEMS } from "@/lib/nav";
import { useDemoProviderEnabled } from "@/lib/providers";
import { accountsQueryOptions, connectionsQueryOptions } from "@/lib/queries";
import { deriveSyncStatus, pickSyncTarget } from "@/lib/sync-status";
import { cn } from "@/lib/utils";

const ROW_CLASS =
  "relative flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left outline-offset-[-2px] transition-colors duration-150 active:bg-accent";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-1.5">
      <h2 className="px-1 text-xs font-medium text-muted-foreground">{title}</h2>
      <ul className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border bg-card">
        {children}
      </ul>
    </section>
  );
}

function IconTile({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center rounded-lg border border-border-subtle bg-surface-2 text-subtle-foreground [&>svg]:size-4"
    >
      {children}
    </span>
  );
}

function Chevron() {
  return <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-subtle-foreground" />;
}

/**
 * Tela "Mais": tudo o que no mobile só era alcançável pela sidebar ou pela
 * topbar (Análises, Conexões, Configurações, busca, sincronização, tema,
 * ocultar valores e o filtro por instituição). O período global e o selo de
 * demonstração continuam nos cabeçalhos das páginas.
 */
export function MoreScreen() {
  const palette = useCommandPalette();
  const { hideValues, toggleHideValues } = usePrivacy();
  const { theme, setTheme } = useTheme();
  const demoEnabled = useDemoProviderEnabled();
  const sync = useSyncConnectionMutation();

  const accountsQuery = useQuery(accountsQueryOptions);
  const connectionsQuery = useQuery(connectionsQueryOptions);
  const accounts = useMemo(() => accountsQuery.data?.data ?? [], [accountsQuery.data]);
  const connections = useMemo(() => connectionsQuery.data?.data ?? [], [connectionsQuery.data]);

  const syncStatus = useMemo(() => deriveSyncStatus(connections), [connections]);
  const syncTarget = useMemo(() => pickSyncTarget(connections), [connections]);

  const groups = useMemo(() => {
    const all = groupAccountsByInstitution(accounts, connections);
    return sortGroupsByDisplayCents(
      demoEnabled ? all : all.filter((group) => group.provider !== "demo"),
    );
  }, [accounts, connections, demoEnabled]);

  return (
    <div className="space-y-6">
      <PageHeader title="Mais" description="Análises, metas, conexões, preferências e atalhos." />

      <Group title="Navegar">
        {[NAV_ITEMS.analytics, NAV_ITEMS.budget, NAV_ITEMS.connections, NAV_ITEMS.settings].map(
          (item) => {
            const Icon = item.icon;

            return (
              <li key={item.to}>
                <Link to={item.to} search={(previous) => previous} className={ROW_CLASS}>
                  <IconTile>
                    <Icon />
                  </IconTile>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
                  {item.to === "/connections" && syncStatus.tone !== "success" ? (
                    <StatusDot tone={syncStatus.tone} pulse={syncStatus.pulse} />
                  ) : null}
                  <Chevron />
                </Link>
              </li>
            );
          },
        )}
        <li>
          <button type="button" onClick={palette.open} className={ROW_CLASS}>
            <IconTile>
              <Search />
            </IconTile>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">Buscar ou ir para…</span>
            <Chevron />
          </button>
        </li>
      </Group>

      <Group title="Preferências">
        <li>
          <div className={ROW_CLASS}>
            <IconTile>{hideValues ? <EyeOff /> : <Eye />}</IconTile>
            <label
              htmlFor="more-hide-values"
              className="min-w-0 flex-1 truncate text-sm font-medium"
            >
              Ocultar valores
            </label>
            <Switch id="more-hide-values" checked={hideValues} onCheckedChange={toggleHideValues} />
          </div>
        </li>
        <li>
          <div className={ROW_CLASS}>
            <IconTile>
              <Moon />
            </IconTile>
            <label
              htmlFor="more-dark-theme"
              className="min-w-0 flex-1 truncate text-sm font-medium"
            >
              Tema escuro
            </label>
            <Switch
              id="more-dark-theme"
              checked={theme === "dark"}
              onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
            />
          </div>
        </li>
      </Group>

      <Group title="Sincronização">
        <li>
          <div data-slot="more-sync-status" className={cn(ROW_CLASS, "justify-between")}>
            <StatusDot tone={syncStatus.tone} pulse={syncStatus.pulse} label={syncStatus.text} />
            <button
              type="button"
              disabled={!syncTarget || sync.mutation.isPending}
              onClick={() => {
                if (syncTarget) {
                  sync.mutation.mutate(syncTarget.id);
                }
              }}
              className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-primary-ink disabled:opacity-50"
            >
              <RefreshCw
                aria-hidden="true"
                className={cn("size-4", sync.mutation.isPending && "animate-spin")}
              />
              Sincronizar agora
            </button>
          </div>
        </li>
      </Group>

      {groups.length > 0 ? (
        <Group title="Contas por instituição">
          {groups.map((group) => (
            <li key={group.key}>
              <Link
                to="/accounts"
                search={(previous) => ({ ...previous, ...accountGroupSearch(group.key) })}
                className={ROW_CLASS}
              >
                <InstitutionAvatar
                  name={group.institutionName}
                  color={group.institutionColor}
                  size="sm"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {group.institutionName}
                </span>
                <Chevron />
              </Link>
            </li>
          ))}
        </Group>
      ) : null}
    </div>
  );
}
