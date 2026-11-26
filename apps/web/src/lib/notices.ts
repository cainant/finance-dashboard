import { toast } from "sonner";

/**
 * Aviso padrão para ações cuja integração com a API ainda não foi ligada.
 * Evita botões mortos nesta etapa do shell, sem simular dados reais.
 */
export function notifyIntegrationPending(action = "Esta ação") {
  toast.info("Integração em andamento", {
    description: `${action} será conectada à API em uma próxima entrega.`,
  });
}
