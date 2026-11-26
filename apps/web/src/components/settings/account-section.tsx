import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { RefreshCw, TriangleAlert, UserRound } from "lucide-react";

import { ErrorState } from "@/components/domain/error-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { getInitials } from "@/lib/institution";
import { meQueryOptions } from "@/lib/queries";
import { cn } from "@/lib/utils";

import { SettingsCard } from "./settings-section";
import { isSessionUnavailable } from "./settings-view";

/** Dados reais da sessão (`GET /api/auth/me`) com estado amigável para 401/404. */
export function AccountSection() {
  const meQuery = useQuery(meQueryOptions);
  const user = meQuery.data?.user;

  return (
    <SettingsCard title="Conta" description="Seu perfil no Lumen.">
      {meQuery.isPending ? (
        <AccountSkeleton />
      ) : meQuery.isError ? (
        isSessionUnavailable(meQuery.error) ? (
          <div className="flex items-start gap-3 p-4">
            <span
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-border-subtle bg-surface-2 text-muted-foreground"
              aria-hidden="true"
            >
              <UserRound className="size-4" />
            </span>
            <div className="min-w-0 space-y-1.5">
              <p className="text-sm font-medium text-foreground">Sessão indisponível</p>
              <p className="text-[13px] leading-5 text-muted-foreground">
                Sua sessão expirou ou o login ainda não está disponível. Entre novamente — o
                restante da página continua funcionando.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void meQuery.refetch()}
                  disabled={meQuery.isFetching}
                >
                  <RefreshCw
                    aria-hidden="true"
                    className={cn(meQuery.isFetching && "animate-spin")}
                  />
                  Tentar novamente
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/login">Ir para o login</Link>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <ErrorState
              compact
              className="border-0 bg-transparent px-0"
              title="Não foi possível carregar a conta"
              error={meQuery.error}
              onRetry={() => void meQuery.refetch()}
              isRetrying={meQuery.isFetching}
            />
          </div>
        )
      ) : user ? (
        <>
          <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
            <Avatar className="size-10 border border-border-subtle">
              {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
              <AvatarFallback className="bg-primary/15 text-sm font-semibold text-primary">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>

          <dl>
            <AccountField label="Nome" value={user.name} />
            <AccountField label="E-mail" value={user.email} />
            <AccountField label="Login GitHub" value={user.githubLogin ?? "Não vinculado"} />
            <AccountField label="Conta criada em" value={formatDate(user.createdAt)} />
          </dl>

          <p className="flex items-start gap-2 px-4 py-3 text-xs leading-5 text-muted-foreground">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            Editar o perfil ainda não está disponível.
          </p>
        </>
      ) : (
        <p className="px-4 py-3 text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
      )}
    </SettingsCard>
  );
}

function AccountField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-b border-border-subtle px-4 py-2">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-sm text-foreground">{value}</dd>
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div className="space-y-4 p-4" aria-hidden="true">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-2.5 w-52" />
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <Skeleton className="h-2 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}
