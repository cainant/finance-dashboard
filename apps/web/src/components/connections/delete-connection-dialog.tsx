import type { Connection } from "@fd/contracts";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeleteConnectionMutation } from "@/lib/mutations";

import { connectionDisplayName } from "./connection-view";

export interface DeleteConnectionDialogProps {
  connection: Connection | null;
  /** Título do card (instituição autorizada); cai no nome da conexão quando ausente. */
  title?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Confirmação explícita antes de remover uma conexão e seus dados. */
export function DeleteConnectionDialog({
  connection,
  title,
  open,
  onOpenChange,
}: DeleteConnectionDialogProps) {
  const deleteMutation = useDeleteConnectionMutation();
  const name = title ?? (connection ? connectionDisplayName(connection) : "esta conexão");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remover conexão?</DialogTitle>
          <DialogDescription>
            A conexão com <strong className="text-foreground">{name}</strong> será removida e os
            dados sincronizados por ela deixarão de aparecer no painel.
            {connection?.provider === "pluggy"
              ? " O item também será revogado no Pluggy (se ele já não existir, a remoção continua)."
              : ""}{" "}
            Essa ação não pode ser desfeita pela interface.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={deleteMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending || !connection}
            onClick={() => {
              if (!connection) {
                return;
              }

              deleteMutation.mutate(connection.id, {
                onSuccess: () => onOpenChange(false),
              });
            }}
          >
            {deleteMutation.isPending ? "Removendo…" : "Remover conexão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
