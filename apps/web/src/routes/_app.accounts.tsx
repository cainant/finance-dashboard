import type { AccountType } from "@fd/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search, Wallet } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AccountsSummaryCard } from "@/components/accounts/accounts-summary";
import { InstitutionAccountsCard } from "@/components/accounts/institution-accounts-card";
import { DemoBadge } from "@/components/domain/demo-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { HeaderActionLabel } from "@/components/domain/header-action-label";
import { InstitutionAvatar } from "@/components/domain/institution-avatar";
import { PageHeader } from "@/components/domain/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  accountGroupKeyFromSearch,
  groupAccountsByInstitution,
  isDemoAccount,
  summarizeAccounts,
} from "@/lib/accounts";
import { hasLiveConnections } from "@/lib/connections";
import { accountsEmptyDescription } from "@/lib/demo-visibility";
import { useDemoProviderEnabled } from "@/lib/providers";
import {
  accountsQueryOptions,
  connectionsQueryOptions,
  investmentsQueryOptions,
} from "@/lib/queries";
import { accountsSearchSchema } from "@/lib/search";

export const Route = createFileRoute("/_app/accounts")({
  staticData: { title: "Contas" },
  validateSearch: (search) => accountsSearchSchema.parse(search),
  loader: async ({ context }) => {
    await Promise.allSettled([
      context.queryClient.ensureQueryData(accountsQueryOptions),
      context.queryClient.ensureQueryData(connectionsQueryOptions),
      context.queryClient.ensureQueryData(investmentsQueryOptions),
    ]);
  },
  component: AccountsPage,
});

const ALL = "all";

function AccountsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const accountsQuery = useQuery(accountsQueryOptions);
  const connectionsQuery = useQuery(connectionsQueryOptions);
  const investmentsQuery = useQuery(investmentsQueryOptions);
  const demoEnabled = useDemoProviderEnabled();

  const [query, setQuery] = useState("");
  const [type, setType] = useState<AccountType | typeof ALL>(ALL);
  const searchInput = useRef<HTMLInputElement>(null);

  const connections = useMemo(() => connectionsQuery.data?.data ?? [], [connectionsQuery.data]);
  const accounts = useMemo(() => accountsQuery.data?.data ?? [], [accountsQuery.data]);
  const positions = useMemo(() => investmentsQuery.data?.data ?? [], [investmentsQuery.data]);
  const hasDemoAccount = useMemo(
    () => accounts.some((account) => isDemoAccount(account, connections)),
    [accounts, connections],
  );
  // O resumo de patrimônio continua global: o filtro de instituição recorta só
  // a lista, nunca os totais do patrimônio.
  const summary = useMemo(() => summarizeAccounts(accounts, positions), [accounts, positions]);

  const allGroups = useMemo(
    () => groupAccountsByInstitution(accounts, connections),
    [accounts, connections],
  );
  // Chave inexistente (link antigo) não filtra nada; a lista mostra todas as
  // contas e o filtro inválido é limpo da URL abaixo, com `replace`.
  const selectedGroup = useMemo(() => {
    const requested = accountGroupKeyFromSearch(search);

    return requested ? (allGroups.find((group) => group.key === requested) ?? null) : null;
  }, [allGroups, search]);
  const scopedAccounts = selectedGroup ? selectedGroup.accounts : accounts;

  const filteredAccounts = useMemo(() => {
    const term = query.trim().toLowerCase();

    return scopedAccounts.filter((account) => {
      if (type !== ALL && account.type !== type) {
        return false;
      }

      if (!term) {
        return true;
      }

      const institution = connections.find((connection) => connection.id === account.connectionId)
        ?.institution?.name;

      return [account.name, account.numberMasked ?? "", institution ?? ""].some((value) =>
        value.toLowerCase().includes(term),
      );
    });
  }, [connections, query, scopedAccounts, type]);

  const groups = useMemo(
    () => groupAccountsByInstitution(filteredAccounts, connections),
    [filteredAccounts, connections],
  );

  // A falha de `/api/investments` degrada só o resumo de patrimônio: a lista
  // de contas depende apenas de contas e conexões.
  const isLoading = accountsQuery.isPending || connectionsQuery.isPending;
  const isError = accountsQuery.isError || connectionsQuery.isError;
  const error = accountsQuery.error ?? connectionsQuery.error;
  const summaryLoading = isLoading || investmentsQuery.isPending;
  // Com instituição viva, "Conectar conta" é atalho secundário; no estado
  // vazio (nenhuma conexão) ele é a ação primária do cabeçalho. Enquanto a
  // consulta não resolve (ou falha), fica secundário em vez de piscar azul.
  const connectIsPrimary = connectionsQuery.isSuccess && !hasLiveConnections(connections);

  // Link antigo com conexão/instituição que não existe mais: limpa a URL para
  // ela não continuar prometendo um filtro que a página não aplica.
  const hasStaleFilter =
    !isLoading && !isError && accountGroupKeyFromSearch(search) !== null && selectedGroup === null;
  useEffect(() => {
    if (!hasStaleFilter) {
      return;
    }

    void navigate({
      search: (previous) => ({ ...previous, connection: undefined, institution: undefined }),
      replace: true,
      resetScroll: false,
    });
  }, [hasStaleFilter, navigate]);

  function retry() {
    void accountsQuery.refetch();
    void connectionsQuery.refetch();
  }

  function clearFilters() {
    setQuery("");
    setType(ALL);

    if (search.connection || search.institution) {
      void navigate({
        search: (previous) => ({
          ...previous,
          connection: undefined,
          institution: undefined,
        }),
        replace: true,
        resetScroll: false,
      });
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Contas"
        badge={hasDemoAccount ? <DemoBadge /> : null}
        description="Saldos por instituição conectada."
        actions={
          <Button asChild variant={connectIsPrimary ? "default" : "outline"}>
            <Link to="/connections" search={(previous) => previous}>
              <Plus aria-hidden="true" />
              <HeaderActionLabel label="Conectar conta" shortLabel="Conectar" />
            </Link>
          </Button>
        }
      />

      {selectedGroup ? (
        <div data-slot="accounts-institution-filter" className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtrando por</span>
          <Badge variant="secondary" className="gap-1.5 pl-1">
            <InstitutionAvatar
              name={selectedGroup.institutionName}
              color={selectedGroup.institutionColor}
              size="xs"
              className="size-4 rounded-[4px] text-[9px]"
            />
            {selectedGroup.institutionName}
          </Badge>
          <Button variant="ghost" size="sm" asChild>
            <Link
              to="/accounts"
              search={(previous) => ({
                ...previous,
                connection: undefined,
                institution: undefined,
              })}
              onClick={() => searchInput.current?.focus()}
            >
              Ver todas as contas
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                ref={searchInput}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por instituição ou conta"
                aria-label="Buscar contas"
                className="pl-9"
              />
            </div>
            <Select
              value={type}
              onValueChange={(value) => setType(value as AccountType | typeof ALL)}
            >
              <SelectTrigger aria-label="Filtrar por tipo de conta" className="min-w-44">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os tipos</SelectItem>
                <SelectItem value="checking">Conta corrente</SelectItem>
                <SelectItem value="savings">Poupança</SelectItem>
                <SelectItem value="credit_card">Cartão de crédito</SelectItem>
                <SelectItem value="investment">Investimentos</SelectItem>
                <SelectItem value="other">Outra</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <AccountsSkeleton />
          ) : isError ? (
            <ErrorState
              title="Não foi possível carregar as contas"
              error={error}
              onRetry={retry}
              isRetrying={accountsQuery.isFetching || connectionsQuery.isFetching}
            />
          ) : groups.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title={
                accounts.length === 0
                  ? "Nenhuma conta conectada"
                  : selectedGroup
                    ? `Nenhuma conta de ${selectedGroup.institutionName} com esses filtros`
                    : "Nenhuma conta com esses filtros"
              }
              description={
                accounts.length === 0
                  ? accountsEmptyDescription(demoEnabled)
                  : selectedGroup
                    ? "Ajuste a busca ou o tipo de conta, ou veja todas as contas."
                    : "Ajuste a busca ou o tipo de conta para ver outras contas."
              }
              action={
                accounts.length === 0 ? (
                  <Button asChild>
                    <Link to="/connections" search={(previous) => previous}>
                      <Plus aria-hidden="true" />
                      Conectar instituição
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" onClick={clearFilters}>
                    Limpar filtros
                  </Button>
                )
              }
            />
          ) : (
            <div className="space-y-4">
              {groups.map((group) => {
                const connectionId = group.accounts[0]?.connectionId;
                const connection = connections.find((item) => item.id === connectionId) ?? null;

                return (
                  <InstitutionAccountsCard key={group.key} group={group} connection={connection} />
                );
              })}
            </div>
          )}
        </div>

        <aside aria-label="Resumo de patrimônio" className="min-w-0 space-y-2">
          {selectedGroup ? (
            <p
              data-slot="accounts-summary-scope"
              className="text-xs leading-4 text-muted-foreground"
            >
              Todas as contas · o filtro não altera o patrimônio
            </p>
          ) : null}
          <AccountsSummaryCard
            summary={summary}
            isLoading={summaryLoading}
            investmentsUnavailable={investmentsQuery.isError}
            onRetryInvestments={() => {
              void investmentsQuery.refetch();
            }}
          />
        </aside>
      </div>
    </div>
  );
}

function AccountsSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: 2 }).map((_, index) => (
        <div key={index} className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-2.5">
            <Skeleton className="size-8 rounded-md" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2.5 w-20" />
            </div>
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="divide-y divide-border-subtle">
            {Array.from({ length: 3 }).map((_, row) => (
              <div key={row} className="flex h-11 items-center gap-3 px-4">
                <Skeleton className="size-4 rounded-sm" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
          <div className="flex h-10 items-center gap-2 rounded-b-[7px] border-t border-border bg-background px-4">
            <Skeleton className="size-2 rounded-full" />
            <Skeleton className="h-2.5 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}
