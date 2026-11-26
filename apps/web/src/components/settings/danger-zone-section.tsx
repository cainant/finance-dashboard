import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useDeleteConnectionMutation } from "@/lib/mutations";
import { connectionsQueryOptions } from "@/lib/queries";
import { cn } from "@/lib/utils";

import { SettingsCard, SettingsRow } from "./settings-section";

/** Zona de perigo: remove todas as conexões com confirmação explícita. */
export function DangerZoneSection() {
  const connectionsQuery = useQuery(connectionsQueryOptions);
  const deleteMutation = useDeleteConnectionMutation();
  const [open, setOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const connections = connectionsQuery.data?.data ?? [];
  const count = connections.length;
  const disabled =
    connectionsQuery.isPending || connectionsQuery.isError || count === 0 || isRemoving;

  const description = connectionsQuery.isPending
    ? "Verificando conexões…"
    : connectionsQuery.isError
      ? "Não foi possível verificar as conexões."
      : count === 0
        ? "Nenhuma conexão para remover. Nada será apagado."
        : `${count} ${count === 1 ? "conexão e os dados importados serão apagados" : "conexões e os dados importados serão apagados"}. Não dá para desfazer.`;

  async function removeAll() {
    setIsRemoving(true);
    let failed = 0;

    for (const connection of connections) {
      try {
        await deleteMutation.mutateAsync(connection.id);
      } catch {
        failed += 1;
      }
    }

    setIsRemoving(false);
    setOpen(false);

    if (failed > 0) {
      toast.error("Algumas conexões não foram removidas", {
        description: `${failed} de ${count} falharam. Tente novamente pela página de conexões.`,
      });
    }
  }

  return (
    <SettingsCard
      className="border-destructive/30"
      title={
        <span className="flex items-center gap-2 text-destructive">
          <Trash2 aria-hidden="true" className="size-4" />
          Zona de perigo
        </span>
      }
      description="Desconectar todas as instituições apaga as conexões e os dados que vieram delas."
    >
      {connectionsQuery.isError ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-3 text-[13px] text-muted-foreground">
          <TriangleAlert aria-hidden="true" className="size-4 text-warning" />
          <span>Não foi possível verificar as conexões.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void connectionsQuery.refetch()}
            disabled={connectionsQuery.isFetching}
          >
            <RefreshCw
              aria-hidden="true"
              className={cn(connectionsQuery.isFetching && "animate-spin")}
            />
            Tentar novamente
          </Button>
        </div>
      ) : null}

      <SettingsRow
        description={description}
        control={
          <Dialog
            open={open}
            onOpenChange={(next) => {
              if (!isRemoving) {
                setOpen(next);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="border-destructive/40 text-destructive"
                disabled={disabled}
              >
                <Trash2 aria-hidden="true" />
                Remover todas as conexões
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Remover todas as conexões?</DialogTitle>
                <DialogDescription>
                  {count === 1 ? "1 conexão será removida" : `${count} conexões serão removidas`} e
                  os dados que vieram delas deixarão de aparecer no painel. Não dá para desfazer.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={isRemoving}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void removeAll()}
                  disabled={isRemoving || count === 0}
                >
                  {isRemoving ? "Removendo…" : "Remover tudo"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      >
        {isRemoving ? (
          <p className="flex items-center gap-2 text-xs text-warning" role="status">
            <RefreshCw aria-hidden="true" className="size-3.5 animate-spin" />
            Removendo conexões…
          </p>
        ) : null}
      </SettingsRow>
    </SettingsCard>
  );
}
