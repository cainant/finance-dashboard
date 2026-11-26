import type { ProviderInfo } from "@fd/contracts";
import { useMutation } from "@tanstack/react-query";
import { Check, ChevronDown, Link2, Plug, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ErrorState } from "@/components/domain/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api";
import { useCreateConnectionMutation, useSyncConnectionMutation } from "@/lib/mutations";
import {
  PLUGGY_REQUIRED_SECRETS,
  loadPluggyConnect,
  normalizePluggyItemId,
  readPluggyItemId,
  widgetErrorMessage,
  type PluggyConnectWidget,
} from "@/lib/pluggy-connect";
import { cn } from "@/lib/utils";

import { MEU_PLUGGY_REFRESH_NOTICE } from "./connection-view";

export interface PluggyConnectPanelProps {
  provider: ProviderInfo | null;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  onRetry: () => void;
  /** Ainda não há conexão MeuPluggy: o aviso das 24h aparece aqui também. */
  showRefreshNotice?: boolean;
}

type ProgressTone = "info" | "success" | "error";

interface ProgressState {
  tone: ProgressTone;
  message: string;
}

/**
 * Fluxo MeuPluggy: widget oficial do Pluggy Connect restrito ao conector
 * MeuPluggy (resolvido no backend) + cadastro avançado de um código de conexão
 * já existente. Credenciais nunca passam pelo navegador.
 */
export function PluggyConnectPanel({
  provider,
  isPending,
  isError,
  error,
  isFetching,
  onRetry,
  showRefreshNotice = false,
}: PluggyConnectPanelProps) {
  const [itemId, setItemId] = useState("");
  const [itemIdError, setItemIdError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [isOpeningWidget, setIsOpeningWidget] = useState(false);
  const widgetRef = useRef<PluggyConnectWidget | null>(null);
  const isMountedRef = useRef(true);
  const isProcessingRef = useRef(false);

  const tokenMutation = useMutation({ mutationFn: () => api.pluggyConnectToken() });
  const createMutation = useCreateConnectionMutation();
  const { mutation: syncMutation, progress: syncProgress } = useSyncConnectionMutation();

  const isBusy = createMutation.isPending || syncMutation.isPending;

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      widgetRef.current?.destroy?.();
      widgetRef.current = null;
    };
  }, []);

  const syncStatus = syncMutation.isPending
    ? syncProgress?.slice
      ? `Importando histórico… fatia ${syncProgress.slice}`
      : "Sincronizando contas, cartões e transações…"
    : null;

  async function connectItem(rawItemId: string, origin: "widget" | "manual") {
    const normalized = normalizePluggyItemId(rawItemId);
    if (!normalized) {
      setItemIdError("Confira o código: ele é longo e tem hífens, como aparece no MeuPluggy.");
      setProgress({ tone: "error", message: "O código informado não parece válido." });
      return;
    }

    setItemIdError(null);
    isProcessingRef.current = true;
    setProgress({
      tone: "info",
      message:
        origin === "widget" ? "MeuPluggy autorizado. Salvando a conexão…" : "Salvando a conexão…",
    });

    let createdId: string;
    try {
      const created = await createMutation.mutateAsync({
        provider: "pluggy",
        itemId: normalized,
      });
      createdId = created.data.id;
    } catch (createError) {
      isProcessingRef.current = false;
      setProgress({
        tone: "error",
        message: `Não foi possível registrar a conexão: ${errorMessage(createError)}`,
      });
      return;
    }

    setProgress({
      tone: "info",
      message: "Conexão criada. Sincronizando contas, cartões e transações…",
    });

    try {
      await syncMutation.mutateAsync(createdId);
      setItemId("");
      setProgress({
        tone: "success",
        message: "MeuPluggy conectado. As contas, cartões e transações foram sincronizados.",
      });
      widgetRef.current?.destroy?.();
      widgetRef.current = null;
    } catch (syncError) {
      setProgress({
        tone: "error",
        message: `A conexão foi criada, mas a sincronização falhou: ${errorMessage(syncError)} Use “Atualizar” na lista para tentar novamente.`,
      });
    } finally {
      isProcessingRef.current = false;
    }
  }

  async function openWidget() {
    setProgress({ tone: "info", message: "Abrindo o MeuPluggy…" });
    setIsOpeningWidget(true);

    try {
      const [token, PluggyConnect] = await Promise.all([
        tokenMutation.mutateAsync(),
        loadPluggyConnect(),
      ]);

      if (!isMountedRef.current) {
        return;
      }

      widgetRef.current?.destroy?.();
      const widget = new PluggyConnect({
        connectToken: token.accessToken,
        ...(token.connectorId ? { connectorIds: [token.connectorId] } : {}),
        onSuccess: (payload) => {
          const received = readPluggyItemId(payload);
          if (!received) {
            setProgress({
              tone: "error",
              message: "O MeuPluggy não retornou um código válido. Tente novamente.",
            });
            return;
          }

          void connectItem(received, "widget");
        },
        onError: (widgetError) => {
          setProgress({
            tone: "error",
            message: widgetErrorMessage(widgetError),
          });
        },
        onClose: () => {
          setProgress((current) =>
            current?.tone === "info" && !isProcessingRef.current ? null : current,
          );
        },
      });

      widgetRef.current = widget;
      widget.init();
      setProgress({
        tone: "info",
        message: "MeuPluggy aberto. Entre para autorizar seus bancos.",
      });
    } catch (widgetError) {
      setProgress({ tone: "error", message: widgetErrorMessage(widgetError) });
    } finally {
      setIsOpeningWidget(false);
    }
  }

  if (isPending) {
    return <PluggyPanelSkeleton />;
  }

  if (isError) {
    return (
      <ErrorState
        compact
        className="border-0 bg-transparent px-0 py-4"
        title="Não foi possível verificar a conexão com o MeuPluggy"
        error={error}
        onRetry={onRetry}
        isRetrying={isFetching}
      />
    );
  }

  if (!provider?.configured) {
    return (
      <div className="space-y-3">
        <p className="text-[13px] leading-5 text-muted-foreground">
          A conexão com o MeuPluggy ainda não está disponível.
        </p>
        {/* Como configurar: só em desenvolvimento, nunca na tela do usuário final. */}
        {import.meta.env.DEV ? (
          <>
            <p className="text-[13px] leading-5 text-muted-foreground">
              Adicione as credenciais abaixo ao Worker da API — nenhuma delas é enviada ao
              navegador.
            </p>
            <ul className="space-y-2">
              {PLUGGY_REQUIRED_SECRETS.map((secret) => (
                <li
                  key={secret.name}
                  className="rounded-md border border-border-subtle bg-surface-2/40 px-2.5 py-2"
                >
                  <code className="font-mono text-xs font-medium text-foreground">
                    {secret.name}
                  </code>
                  <p className="mt-0.5 text-xs text-muted-foreground">{secret.description}</p>
                </li>
              ))}
            </ul>
            <p className="text-[13px] leading-5 text-muted-foreground">
              Local: <code className="font-mono text-xs">apps/api/.dev.vars</code>. Produção:{" "}
              <code className="font-mono text-xs">wrangler secret put &lt;NOME&gt;</code> no Worker
              da API. O painel de conexão aparece aqui quando <code>/api/providers</code> reportar{" "}
              <code>configured: true</code> e <code>supportsConnectWidget: true</code>.
            </p>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {provider.description ? (
        <p className="text-[13px] leading-5 text-muted-foreground">{provider.description}</p>
      ) : null}

      <ProgressMessage progress={progress} />

      {syncStatus ? (
        <p className="flex items-center gap-2 text-xs text-primary" role="status">
          <RefreshCw aria-hidden="true" className="size-3.5 animate-spin" />
          {syncStatus}
        </p>
      ) : null}

      {provider.supportsConnectWidget ? (
        <div className="space-y-3 rounded-md border border-border-subtle bg-surface-2/40 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-foreground">Conectar MeuPluggy</p>
              <p className="text-[13px] leading-5 text-muted-foreground">
                Entre com a conta do meu.pluggy.ai que você usa para autorizar seus bancos. Suas
                senhas bancárias são digitadas na janela do MeuPluggy, não no Lumen.
              </p>
            </div>
            <Button
              onClick={() => void openWidget()}
              disabled={isOpeningWidget || isBusy}
              className="shrink-0"
            >
              {isOpeningWidget ? (
                <RefreshCw aria-hidden="true" className="animate-spin" />
              ) : (
                <Plug aria-hidden="true" />
              )}
              {isOpeningWidget ? "Abrindo…" : "Conectar MeuPluggy"}
            </Button>
          </div>

          {showRefreshNotice ? (
            <p
              className="text-xs leading-5 text-muted-foreground"
              data-slot="meupluggy-refresh-notice"
            >
              {MEU_PLUGGY_REFRESH_NOTICE}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-[13px] leading-5 text-warning">
          A conexão com o MeuPluggy não está disponível aqui. Use o código da conexão abaixo.
        </p>
      )}

      <details className="group rounded-md border border-border-subtle bg-card px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[13px] font-medium text-foreground">
          Já conectou seus bancos no MeuPluggy?
          <ChevronDown
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>

        <form
          className="mt-3 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void connectItem(itemId, "manual");
          }}
        >
          <p className="text-[13px] leading-5 text-muted-foreground">
            Se você já autorizou seus bancos em meu.pluggy.ai, cole o código da conexão abaixo. Não
            precisa autorizar de novo.
          </p>
          <Label htmlFor="pluggy-item-id">Código da conexão</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="pluggy-item-id"
              value={itemId}
              onChange={(event) => {
                setItemId(event.target.value);
                if (itemIdError) {
                  setItemIdError(null);
                }
              }}
              placeholder="Cole o código que aparece no MeuPluggy"
              autoComplete="off"
              spellCheck={false}
              disabled={isBusy}
              aria-invalid={itemIdError ? true : undefined}
              aria-describedby={
                itemIdError ? "pluggy-item-id-hint pluggy-item-id-error" : "pluggy-item-id-hint"
              }
            />
            <Button
              type="submit"
              variant="outline"
              disabled={isBusy || itemId.trim().length === 0}
              className="shrink-0"
            >
              <Link2 aria-hidden="true" />
              {isBusy ? "Conectando…" : "Usar este código"}
            </Button>
          </div>
          {itemIdError ? (
            <p id="pluggy-item-id-error" role="alert" className="text-xs text-negative">
              {itemIdError}
            </p>
          ) : null}
          <p id="pluggy-item-id-hint" className="text-xs text-muted-foreground">
            O código só identifica a conexão; ele não dá acesso às suas contas.
          </p>
        </form>
      </details>
    </div>
  );
}

function ProgressMessage({ progress }: { progress: ProgressState | null }) {
  if (!progress) {
    return null;
  }

  const isError = progress.tone === "error";

  return (
    <p
      role={isError ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md border bg-card px-3 py-2 text-[13px] leading-5",
        progress.tone === "error" && "border-negative/40 text-negative",
        progress.tone === "success" && "border-positive/40 text-positive",
        progress.tone === "info" && "border-info/40 text-info",
      )}
    >
      {isError ? (
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      ) : progress.tone === "success" ? (
        <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      ) : (
        <RefreshCw aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 animate-spin" />
      )}
      <span>{progress.message}</span>
    </p>
  );
}

function PluggyPanelSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}
