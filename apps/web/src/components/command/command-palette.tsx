import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeftRight, Eye, EyeOff, Moon, Plus, RefreshCw, Sun, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useMoneyFormatter, usePrivacy } from "@/components/privacy/privacy-context";
import { useTheme } from "@/components/theme/theme-context";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { accountSearchText, accountTypeCaption } from "@/lib/accounts";
import { useSyncConnectionMutation } from "@/lib/mutations";
import { ALL_NAV_ITEMS } from "@/lib/nav";
import { accountsQueryOptions, connectionsQueryOptions } from "@/lib/queries";

import { paletteAccountItem } from "./palette-account-item";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Atalho global da paleta (Ctrl no Windows/Linux, ⌘ no macOS). */
function isPaletteShortcut(event: KeyboardEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "k"
  );
}

/**
 * Paleta de comandos (Ctrl/Cmd+K): navegação, ações do shell e contas em cache.
 * A busca de transações reaproveita a rota com o filtro `q` — sem endpoint novo.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { hideValues, toggleHideValues } = usePrivacy();
  const money = useMoneyFormatter();
  const [query, setQuery] = useState("");

  const accountsQuery = useQuery(accountsQueryOptions);
  const connectionsQuery = useQuery(connectionsQueryOptions);
  const accounts = useMemo(() => accountsQuery.data?.data ?? [], [accountsQuery.data]);
  const connections = useMemo(() => connectionsQuery.data?.data ?? [], [connectionsQuery.data]);

  const syncTarget = useMemo(
    () =>
      connections.find((connection) => connection.status === "error") ??
      connections.find((connection) => connection.status === "login_required") ??
      connections.find((connection) => connection.status !== "disconnected") ??
      null,
    [connections],
  );

  const sync = useSyncConnectionMutation();
  const term = query.trim();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isPaletteShortcut(event)) {
        return;
      }

      event.preventDefault();
      onOpenChange(!open);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  /**
   * O Radix entrega Escape só para a camada que ele considera no topo da pilha
   * global. Se um menu, Select ou o painel de transação ainda estiver saindo
   * quando a paleta abre, essa camada fica na frente e o Esc não fecha a
   * paleta (o diálogo continua `data-state="open"`). O atalho já é nosso, então
   * o Esc também é — sem depender da pilha de outra camada.
   */
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      // Sem olhar `defaultPrevented`: o Radix chama preventDefault() quando
      // fecha a camada que ele acha que está no topo (o menu saindo), e é
      // justamente aí que a paleta precisa fechar também.
      event.preventDefault();
      setQuery("");
      onOpenChange(false);
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onOpenChange]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setQuery("");
    }

    onOpenChange(next);
  }

  function run(action: () => void) {
    handleOpenChange(false);
    action();
  }

  function go(to: (typeof ALL_NAV_ITEMS)[number]["to"]) {
    run(() => {
      void navigate({ to, search: (previous) => previous });
    });
  }

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput
        placeholder="Buscar telas, ações e contas…"
        aria-label="Buscar comando"
        value={query}
        onValueChange={setQuery}
      />

      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>

        <CommandGroup heading="Ir para">
          {ALL_NAV_ITEMS.map((item) => (
            <CommandItem key={item.to} value={`ir ${item.label}`} onSelect={() => go(item.to)}>
              <item.icon aria-hidden="true" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Ações">
          <CommandItem
            value="sincronizar agora conexões"
            disabled={!syncTarget || sync.mutation.isPending}
            onSelect={() => {
              if (syncTarget) {
                run(() => sync.mutation.mutate(syncTarget.id));
              }
            }}
          >
            <RefreshCw aria-hidden="true" />
            {sync.mutation.isPending ? "Sincronizando…" : "Sincronizar agora"}
          </CommandItem>
          <CommandItem
            value={hideValues ? "mostrar valores" : "ocultar valores"}
            onSelect={() => run(toggleHideValues)}
          >
            {hideValues ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
            {hideValues ? "Mostrar valores" : "Ocultar valores"}
          </CommandItem>
          <CommandItem value="alternar tema claro escuro" onSelect={() => run(toggleTheme)}>
            {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            {theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
          </CommandItem>
          <CommandItem
            value="conectar conta conexões pluggy"
            onSelect={() =>
              run(() => {
                void navigate({ to: "/connections", search: (previous) => previous });
              })
            }
          >
            <Plus aria-hidden="true" />
            Conectar conta
            <CommandShortcut>Conexões</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {accounts.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Contas">
              {accounts.map((account) => {
                const typeCaption = accountTypeCaption(account);
                const item = paletteAccountItem(account, connections, money);

                return (
                  <CommandItem
                    key={account.id}
                    value={`conta ${account.id} ${accountSearchText(account)} ${item.searchText}`}
                    onSelect={() =>
                      run(() => {
                        void navigate({
                          to: "/accounts/$accountId",
                          params: { accountId: account.id },
                          search: (previous) => previous,
                        });
                      })
                    }
                  >
                    <Wallet aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">
                      {item.label}
                      {typeCaption ? (
                        <span className="text-muted-foreground">{` · ${typeCaption}`}</span>
                      ) : null}
                    </span>
                    <CommandShortcut
                      className="shrink-0 tabular-nums"
                      title={money.hidden ? undefined : item.amountLabel}
                      aria-label={money.ariaLabel}
                    >
                      {item.amountLabel}
                    </CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        ) : null}

        {term ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Transações">
              <CommandItem
                value={`buscar ${term} em transações`}
                onSelect={() =>
                  run(() => {
                    void navigate({
                      to: "/transactions",
                      search: (previous) => ({ ...previous, q: term }),
                    });
                  })
                }
              >
                <ArrowLeftRight aria-hidden="true" />
                <span className="min-w-0 truncate">Buscar “{term}” em Transações</span>
              </CommandItem>
            </CommandGroup>
          </>
        ) : null}
      </CommandList>

      <div className="flex items-center gap-4 border-t border-border bg-background px-4 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <kbd className="rounded border border-border px-1 py-px text-[11px]">↑↓</kbd>
          navegar
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="rounded border border-border px-1 py-px text-[11px]">Enter</kbd>
          abrir
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <kbd className="rounded border border-border px-1 py-px text-[11px]">Esc</kbd>
          fechar
        </span>
      </div>
    </CommandDialog>
  );
}
