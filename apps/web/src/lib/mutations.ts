import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  CreateConnectionBody,
  LoginBody,
  SetupBody,
  UpdateBudgetBody,
  UpdateBudgetCategoryBody,
  UpdateCardPaymentPlanBody,
  UpdateSettingsBody,
  UpdateTransactionBody,
} from "@fd/contracts";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { api, errorMessage } from "./api";
import { queryKeys } from "./queries";

/** Invalida tudo que depende de dados sincronizados (sync pode mudar qualquer tela). */
export async function invalidateFinancialData(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["overview"] }),
    queryClient.invalidateQueries({ queryKey: ["analytics"] }),
    queryClient.invalidateQueries({ queryKey: ["transactions"] }),
    queryClient.invalidateQueries({ queryKey: ["accounts"] }),
    queryClient.invalidateQueries({ queryKey: ["categories"] }),
    queryClient.invalidateQueries({ queryKey: ["credit-cards"] }),
    queryClient.invalidateQueries({ queryKey: ["bills"] }),
    queryClient.invalidateQueries({ queryKey: ["investments"] }),
    queryClient.invalidateQueries({ queryKey: ["connections"] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.budgetProgressAll }),
    queryClient.invalidateQueries({ queryKey: queryKeys.cardReserves }),
  ]);
}

function toastError(title: string, error: unknown) {
  toast.error(title, { description: errorMessage(error) });
}

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: LoginBody) => api.auth.login(body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.auth.me, data);
    },
    onError: (error) => toastError("Não foi possível entrar", error),
  });
}

export function useSetupMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: SetupBody) => api.auth.setup(body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.auth.me, data);
    },
    onError: (error) => toastError("Não foi possível criar a conta", error),
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.auth.logout(),
    onSettled: () => {
      queryClient.clear();
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Transações                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Id do toast de sucesso da edição de transação. O aviso com "Desfazer" o
 * substitui por id: um `toast.dismiss()` sem id derrubaria também um toast de
 * erro que estivesse na tela.
 */
export const TRANSACTION_UPDATE_TOAST_ID = "transaction-update";

export function useUpdateTransactionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdateTransactionBody) =>
      api.updateTransaction(id, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
      // Categoria e exceção de grupo mudam o realizado das metas.
      void queryClient.invalidateQueries({ queryKey: queryKeys.budgetProgressAll });

      if (variables.categoryId !== undefined) {
        // Categorizar/desmarcar muda o contador de "sem categoria" da sidebar
        // e o alerta da Visão geral.
        void queryClient.invalidateQueries({ queryKey: queryKeys.uncategorizedCount });
        toast.success("Categoria atualizada", { id: TRANSACTION_UPDATE_TOAST_ID });
      } else if (variables.notes !== undefined) {
        toast.success("Notas salvas", { id: TRANSACTION_UPDATE_TOAST_ID });
      } else if (variables.budgetGroupId !== undefined) {
        toast.success("Grupo de metas atualizado", { id: TRANSACTION_UPDATE_TOAST_ID });
      }
    },
    onError: (error) => toastError("Não foi possível salvar a transação", error),
  });
}

/* -------------------------------------------------------------------------- */
/* Conexões                                                                   */
/* -------------------------------------------------------------------------- */

export function useCreateConnectionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateConnectionBody) => api.createConnection(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["connections"] });
      void queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
    onError: (error) => toastError("Não foi possível adicionar a conexão", error),
  });
}

export interface SyncConnectionProgress {
  /** Conexão em que o usuário clicou (a que a UI deve destacar). */
  connectionId: string;
  slice: number;
}

export function useSyncConnectionMutation() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<SyncConnectionProgress | null>(null);

  const mutation = useMutation({
    mutationFn: async (id: string) => {
      // O endpoint demo sincroniza as três instituições no mesmo POST; para
      // completar o histórico fatiado, o loop considera todas as demo.
      const listed = (await api.connections()).data;
      const connection = listed.find((item) => item.id === id);
      if (!connection) {
        throw new Error("Conexão não encontrada.");
      }

      const targets =
        connection.provider === "demo"
          ? listed.filter((item) => item.provider === "demo")
          : [connection];

      const result = await syncConnectionsUntilComplete(
        targets,
        {
          sync: (targetId, options) => api.syncConnection(targetId, options),
          listConnections: async () => (await api.connections()).data,
          // O botão "Sincronizar" sempre busca dados novos, mesmo quando não há
          // fatia pendente: é um sync incremental normal.
          forceFirstSync: true,
        },
        (value) => {
          if (value.slice !== undefined) {
            setProgress({ connectionId: id, slice: value.slice });
          }
        },
      );

      if (result.failure) {
        throw result.failure.error;
      }

      return result;
    },
    onSuccess: async (result) => {
      await invalidateFinancialData(queryClient);
      setProgress(null);

      if (result.complete) {
        toast.success("Sincronização concluída");
        return;
      }

      toast.info("Importação do histórico ainda não terminou", {
        description:
          "A API continua no próximo ciclo. Use “Sincronizar” para retomar de onde parou.",
      });
    },
    onError: (error) => {
      setProgress(null);
      toastError("A sincronização falhou", error);
    },
  });

  return { mutation, progress };
}

export function useDeleteConnectionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteConnection(id),
    onSuccess: async () => {
      await invalidateFinancialData(queryClient);
      toast.success("Conexão removida");
    },
    onError: (error) => toastError("Não foi possível remover a conexão", error),
  });
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

export function useUpdateSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdateSettingsBody) => api.updateSettings(body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.settings, data);
      toast.success("Preferências salvas");
    },
    onError: (error) => toastError("Não foi possível salvar as preferências", error),
  });
}

/* -------------------------------------------------------------------------- */
/* Metas                                                                      */
/* -------------------------------------------------------------------------- */

/** `PUT /api/budget`: renda de referência e/ou a lista inteira de grupos. */
export function useUpdateBudgetMutation(successMessage: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdateBudgetBody) => api.updateBudget(body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.budget, data);
      // Remover um grupo zera exceções nas transações; renda muda as metas em R$.
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.budgetProgressAll });
      toast.success(successMessage);
    },
    onError: (error) => toastError("Não foi possível salvar as metas", error),
  });
}

/** `PUT /api/budget/categories/:categoryId`: grupo padrão de uma categoria. */
export function useUpdateBudgetCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ categoryId, ...body }: { categoryId: string } & UpdateBudgetCategoryBody) =>
      api.updateBudgetCategory(categoryId, body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.budget, data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.budgetProgressAll });
    },
    onError: (error) => toastError("Não foi possível alterar o grupo da categoria", error),
  });
}

/* -------------------------------------------------------------------------- */
/* Reserva para faturas                                                       */
/* -------------------------------------------------------------------------- */

/** `PUT /api/credit-cards/:id/payment-plan`. */
export function useUpdateCardPaymentPlanMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ accountId, ...body }: { accountId: string } & UpdateCardPaymentPlanBody) =>
      api.updateCardPaymentPlan(accountId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.cardReserves });
      toast.success("Forma de pagamento do cartão salva");
    },
    onError: (error) => toastError("Não foi possível salvar a forma de pagamento", error),
  });
}

/* -------------------------------------------------------------------------- */
/* Demonstração                                                               */
/* -------------------------------------------------------------------------- */

export type ConnectDemoStep = "idle" | "creating" | "syncing" | "done";

/** `statusDetail` que a API usa enquanto ainda há fatias do histórico pendentes. */
export const PARTIAL_SYNC_DETAIL = "PARTIAL_SYNC";

/**
 * Limite de segurança de fatias por sincronização manual. O demo completa em
 * ~4 fatias; o teto evita loop infinito se a API passar a devolver um status
 * inesperado. O que sobrar continua no próximo cron/na próxima tentativa.
 */
export const MAX_SYNC_SLICES = 12;

/** Progresso da sincronização das conexões demo (ex.: 2 de 3). */
export interface ConnectDemoProgress {
  completed: number;
  total: number;
  /** Fatia atual do histórico (1-based), quando a API pagina o sync. */
  slice?: number;
}

/** Dados mínimos de uma conexão para decidir o que ainda falta sincronizar. */
export interface DemoConnectionRef {
  id: string;
  provider: string;
  lastSyncedAt: string | null;
  statusDetail?: string | null;
}

/** `true` enquanto a API ainda tem fatias do histórico para importar. */
export function isPartialSync(connection: Pick<DemoConnectionRef, "statusDetail">): boolean {
  return connection.statusDetail === PARTIAL_SYNC_DETAIL;
}

function needsSync(connection: DemoConnectionRef): boolean {
  return connection.lastSyncedAt === null || isPartialSync(connection);
}

/**
 * Conexões demo que ainda não foram sincronizadas. O `POST /api/connections`
 * cria três instituições de uma vez, então sincronizar apenas a resposta
 * deixava duas sem dados. Conexões com `PARTIAL_SYNC` também entram: o
 * histórico fatiado precisa continuar até o fim.
 */
export function pendingDemoConnections(
  connections: readonly DemoConnectionRef[],
): DemoConnectionRef[] {
  return connections.filter(
    (connection) => connection.provider === "demo" && needsSync(connection),
  );
}

export interface SyncSlicesDeps {
  /**
   * `refresh` pede ao provider dados novos; a UI só pede na primeira chamada
   * (fora de uma fatia de histórico) para não disparar PATCH em loop.
   */
  sync: (id: string, options?: { refresh?: boolean }) => Promise<unknown>;
  listConnections: () => Promise<readonly DemoConnectionRef[]>;
  maxSlices?: number;
  /** O sync manual sempre roda uma vez, mesmo sem histórico pendente. */
  forceFirstSync?: boolean;
}

export interface SyncSlicesResult {
  /** Fatias executadas nesta chamada. */
  slices: number;
  /** `true` quando nenhuma conexão alvo continua com histórico pendente. */
  complete: boolean;
  /** Conexões que continuaram pendentes ao fim. */
  failed: Array<{ id: string; error: unknown }>;
  /** Erro que interrompeu o loop, quando a chamada de sync falhou. */
  failure: { id: string; error: unknown } | null;
  /** Última fotografia das conexões alvo devolvida pela API. */
  latest: DemoConnectionRef[];
}

/**
 * Continua chamando `sync` enquanto a API informar `PARTIAL_SYNC` para alguma
 * das conexões alvo. O `POST .../sync` do demo sincroniza as três conexões de
 * uma vez; por isso uma chamada já pode concluir todas, mas o loop também
 * funciona para conexões independentes.
 */
export async function syncConnectionsUntilComplete(
  targets: readonly DemoConnectionRef[],
  deps: SyncSlicesDeps,
  onProgress?: (progress: ConnectDemoProgress) => void,
): Promise<SyncSlicesResult> {
  const ids = new Set(targets.map((connection) => connection.id));
  const maxSlices = deps.maxSlices ?? MAX_SYNC_SLICES;
  let latest: DemoConnectionRef[] = [...targets];
  const failed: Array<{ id: string; error: unknown }> = [];
  let failure: { id: string; error: unknown } | null = null;
  let slices = 0;
  let forceNext = deps.forceFirstSync === true;

  if (targets.length === 0) {
    return { slices: 0, complete: true, failed, failure, latest };
  }

  while (slices < maxSlices) {
    const pending = latest.filter((connection) => ids.has(connection.id) && needsSync(connection));
    if (pending.length === 0 && !forceNext) break;

    const next = pending[0] ?? latest.find((connection) => ids.has(connection.id)) ?? targets[0];
    if (!next) break;

    // O primeiro sync manual de uma conexão em dia não é uma "fatia": só
    // mostra o progresso fatiado quando a API realmente tem histórico pendente.
    const isSlice = pending.length > 0;
    forceNext = false;
    slices += 1;
    onProgress?.({
      completed: targets.length - pending.length,
      total: targets.length,
      slice: isSlice ? slices : undefined,
    });

    try {
      await deps.sync(next.id, { refresh: slices === 1 && !isSlice });
    } catch (error) {
      failure = { id: next.id, error };
      failed.push({ id: next.id, error });
      break;
    }

    latest = (await deps.listConnections()).filter((connection) => ids.has(connection.id));
    const remaining = latest.filter((connection) => needsSync(connection)).length;
    onProgress?.({
      completed: targets.length - remaining,
      total: targets.length,
      slice: isSlice ? slices : undefined,
    });
  }

  const latestById = new Map(latest.map((connection) => [connection.id, connection]));
  const stillPending = targets.filter((connection) => {
    const current = latestById.get(connection.id);
    return !current || needsSync(current);
  });
  for (const connection of stillPending) {
    if (!failed.some((entry) => entry.id === connection.id)) {
      failed.push({ id: connection.id, error: new Error("Histórico ainda incompleto.") });
    }
  }

  return { slices, complete: stillPending.length === 0, failed, failure, latest };
}

export interface DemoSyncResult {
  total: number;
  synced: number;
  failed: Array<{ id: string; error: unknown }>;
}

/**
 * Sincroniza as conexões demo pendentes até o histórico ficar completo,
 * reportando o progresso. Falha parcial não interrompe as demais: devolvemos
 * o que falhou para a UI avisar e permitir nova tentativa.
 */
export async function syncDemoConnections(
  connections: readonly DemoConnectionRef[],
  deps: SyncSlicesDeps,
  onProgress?: (progress: ConnectDemoProgress) => void,
): Promise<DemoSyncResult> {
  const targets = connections.filter(needsSync);
  if (targets.length === 0) {
    return { total: 0, synced: 0, failed: [] };
  }

  const outcome = await syncConnectionsUntilComplete(targets, deps, onProgress);
  const latestById = new Map(outcome.latest.map((connection) => [connection.id, connection]));
  const synced = targets.filter((connection) => {
    const current = latestById.get(connection.id);
    return current !== undefined && !needsSync(current);
  }).length;

  return { total: targets.length, synced, failed: outcome.failed };
}

/**
 * Fluxo "Conectar demonstração": cria as conexões, lista o que existe e
 * sincroniza todas as conexões demo sem `lastSyncedAt`, expondo o passo e o
 * progresso para a UI.
 */
export function useConnectDemo() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<ConnectDemoStep>("idle");
  const [progress, setProgress] = useState<ConnectDemoProgress | null>(null);

  const connect = useMutation({
    mutationFn: async () => {
      setStep("creating");
      setProgress(null);

      const created = await api.createConnection({ provider: "demo" });
      const listed = await api.connections();
      const pending = pendingDemoConnections(listed.data);

      setStep("syncing");
      setProgress({ completed: 0, total: pending.length, slice: 0 });

      const result = await syncDemoConnections(
        pending,
        {
          sync: (id) => api.syncConnection(id),
          listConnections: async () => (await api.connections()).data,
        },
        setProgress,
      );

      return { created, result };
    },
    onSuccess: async ({ result }) => {
      await invalidateFinancialData(queryClient);
      setProgress(null);

      if (result.failed.length > 0) {
        setStep("idle");
        toast.error("Sincronização parcial da demonstração", {
          description: `${result.synced} de ${result.total} conexões sincronizadas. Tente novamente para completar.`,
        });
        return;
      }

      setStep("done");
      toast.success("Dados de demonstração conectados", {
        description:
          result.total > 0
            ? `${result.total} conexões sincronizadas com contas, transações e faturas fictícias.`
            : "As conexões de demonstração já estavam sincronizadas.",
      });
    },
    onError: (error) => {
      setStep("idle");
      setProgress(null);
      toastError("Não foi possível conectar a demonstração", error);
    },
  });

  const reset = useCallback(() => {
    setStep("idle");
    setProgress(null);
  }, []);

  return { connect, step, progress, reset };
}
