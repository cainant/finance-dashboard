import { createContext, useContext } from "react";

export interface DataRefreshValue {
  /** Refaz as consultas ativas da tela (não dispara sincronização com o provider). */
  refresh: () => Promise<void>;
  isRefreshing: boolean;
}

export const DataRefreshContext = createContext<DataRefreshValue | null>(null);

/** Atualização manual dos dados da tela: usada pelo gesto, pelo botão e pelo menu. */
export function useDataRefresh(): DataRefreshValue {
  const value = useContext(DataRefreshContext);

  if (!value) {
    throw new Error("useDataRefresh precisa estar dentro de <DataRefreshProvider>");
  }

  return value;
}
