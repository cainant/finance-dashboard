import { Link, useRouteContext } from "@tanstack/react-router";
import { LogOut, Moon, RefreshCw, Settings2, Sun, UserRound } from "lucide-react";

import { useDataRefresh } from "@/components/layout/data-refresh-context";

import { useTheme } from "@/components/theme/theme-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { userInitials } from "@/lib/auth";
import { useLogoutMutation } from "@/lib/mutations";

/** Menu da conta com o usuário real da sessão e logout na API. */
export function UserMenu() {
  const { user } = useRouteContext({ from: "/_app" });
  const { theme, setTheme } = useTheme();
  const logout = useLogoutMutation();
  const { refresh, isRefreshing } = useDataRefresh();

  function handleLogout() {
    void (async () => {
      try {
        await logout.mutateAsync();
      } finally {
        // Recarrega para limpar qualquer estado em memória e revalidar o guard.
        window.location.assign("/login");
      }
    })();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Abrir menu da conta de ${user.name}`}
          className="grid size-11 place-items-center rounded-full outline-offset-2 transition-opacity duration-150 hover:opacity-90 lg:size-auto"
        >
          <Avatar className="size-7 border border-border">
            {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
            <AvatarFallback className="bg-secondary text-[11px] font-semibold text-foreground">
              {userInitials(user.name)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</p>
          {user.githubLogin ? (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              GitHub · {user.githubLogin}
            </p>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* Alternativa sem gesto ao puxar para atualizar (só no mobile). */}
        <DropdownMenuItem
          className="min-h-11 lg:hidden"
          disabled={isRefreshing}
          onSelect={() => void refresh()}
        >
          <RefreshCw aria-hidden="true" />
          Atualizar dados
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings" search={(previous) => previous}>
            <UserRound aria-hidden="true" />
            Perfil e preferências
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings" search={(previous) => previous}>
            <Settings2 aria-hidden="true" />
            Configurações
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            setTheme(theme === "dark" ? "light" : "dark");
          }}
        >
          {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          {theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleLogout} disabled={logout.isPending}>
          <LogOut aria-hidden="true" />
          {logout.isPending ? "Saindo…" : "Sair"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
