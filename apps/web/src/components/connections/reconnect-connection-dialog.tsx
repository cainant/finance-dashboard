import type { Connection } from "@fd/contracts";
import { useMutation } from "@tanstack/react-query";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, errorMessage } from "@/lib/api";
import { useCreateConnectionMutation, useSyncConnectionMutation } from "@/lib/mutations";
import {
  loadPluggyConnect,
  readPluggyItemId,
  widgetErrorMessage,
  type PluggyConnectWidget,
} from "@/lib/pluggy-connect";

import { connectionDisplayName } from "./connection-view";

export interface ReconnectConnectionDialogProps {
  connection: Connection;
  /** Título do card (instituição autorizada); cai no nome da conexão quando ausente. */
  title?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Reconexão/renovação do MeuPluggy: cria um connect token para o item existente
 * (o backend valida que ele pertence ao usuário) e abre o widget com
 * `updateItem`. Se o Pluggy criar um item novo durante a renovação, o app
 * registra a nova conexão em vez de fingir que o id antigo continua válido.
 */
export function ReconnectConnectionDialog({
  connection,
  title,
  open,
  onOpenChange,
}: ReconnectConnectionDialogProps) {
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [widgetActive, setWidgetActive] = useState(false);
  const widgetRef = useRef<PluggyConnectWidget | null>(null);

  const tokenMutation = useMutation({
    mutationFn: () => api.pluggyConnectToken(connection.externalId),
  });
  const createMutation = useCreateConnectionMutation();
  const { mutation: syncMutation } = useSyncConnectionMutation();

  const isBusy = tokenMutation.isPending || createMutation.isPending || syncMutation.isPending;

  useEffect(() => {
    if (!open) {
      widgetRef.current?.destroy?.();
      widgetRef.current = null;
    }
  }, [open]);

  useEffect(
    () => () => {
      widgetRef.current?.destroy?.();
      widgetRef.current = null;
    },
    [],
  );

  function closeDialog() {
    widgetRef.current?.destroy?.();
    widgetRef.current = null;
    setWidgetActive(false);
    setProgress(null);
    setError(null);
    onOpenChange(false);
  }

  async function handleSuccess(rawItemId: string | null) {
    setProgress("Autorização concluída. Sincronizando os dados…");

    let targetId = connection.id;
    if (rawItemId && rawItemId !== connection.externalId) {
      setProgress("O MeuPluggy criou um novo item. Registrando a nova conexão e sincronizando…");
      try {
        const created = await createMutation.mutateAsync({
          provider: "pluggy",
          itemId: rawItemId,
        });
        targetId = created.data.id;
      } catch (createError) {
        setError(errorMessage(createError));
        setWidgetActive(false);
        return;
      }
    }

    try {
      await syncMutation.mutateAsync(targetId);
      closeDialog();
    } catch (syncError) {
      setError(errorMessage(syncError));
      setWidgetActive(false);
    }
  }

  async function openWidget() {
    setError(null);
    setProgress("Preparando o Pluggy Connect…");

    try {
      const [token, PluggyConnect] = await Promise.all([
        tokenMutation.mutateAsync(),
        loadPluggyConnect(),
      ]);

      const widget = new PluggyConnect({
        connectToken: token.accessToken,
        updateItem: connection.externalId,
        forceAskForCredentials: true,
        ...(token.connectorId ? { connectorIds: [token.connectorId] } : {}),
        onSuccess: (payload) => {
          void handleSuccess(readPluggyItemId(payload));
        },
        onError: (widgetError) => {
          setError(widgetErrorMessage(widgetError));
          setWidgetActive(false);
          setProgress(null);
        },
        onClose: () => {
          setWidgetActive(false);
          setProgress((current) => (current === "Preparando o Pluggy Connect…" ? null : current));
        },
      });

      widgetRef.current?.destroy?.();
      widgetRef.current = widget;
      widget.init();
      setWidgetActive(true);
      setProgress("Widget aberto. Renove a autorização do MeuPluggy na janela do Pluggy.");
    } catch (widgetError) {
      setError(widgetErrorMessage(widgetError));
      setProgress(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : closeDialog())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reconectar {title ?? connectionDisplayName(connection)}</DialogTitle>
          <DialogDescription>
            Abre o Pluggy Connect no item existente. Entre de novo no MeuPluggy se a autorização
            tiver expirado (ela vale por 1 ano). Se o Pluggy criar um item novo, o app adiciona a
            nova conexão e mantém o histórico antigo.
          </DialogDescription>
        </DialogHeader>

        {progress ? (
          <p className="flex items-start gap-2 text-[13px] leading-5 text-info" role="status">
            {isBusy ? (
              <RefreshCw aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 animate-spin" />
            ) : null}
            {progress}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="flex items-start gap-2 text-[13px] leading-5 text-negative">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={closeDialog} disabled={isBusy}>
            Fechar
          </Button>
          <Button
            onClick={() => {
              if (isBusy || widgetActive) return;
              void openWidget();
            }}
            disabled={isBusy || widgetActive}
          >
            {isBusy ? (
              <RefreshCw aria-hidden="true" className="animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" />
            )}
            {isBusy ? "Reconectando…" : "Abrir Pluggy Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
