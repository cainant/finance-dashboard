import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  HIDE_VALUES_STORAGE_KEY,
  PrivacyContext,
  persistHideValues,
  readStoredHideValues,
  type PrivacyContextValue,
} from "./privacy-context";

export interface PrivacyProviderProps {
  children: ReactNode;
}

/**
 * Estado global de "Ocultar valores", persistido em `lumen:hide-values`.
 * Mantém abas abertas em sincronia e nunca deixa o app sem provider.
 */
export function PrivacyProvider({ children }: PrivacyProviderProps) {
  const [hideValues, setHideValuesState] = useState<boolean>(readStoredHideValues);

  useEffect(() => {
    persistHideValues(hideValues);
  }, [hideValues]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === HIDE_VALUES_STORAGE_KEY) {
        setHideValuesState(event.newValue === "1");
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setHideValues = useCallback((value: boolean) => {
    setHideValuesState(value);
  }, []);

  const toggleHideValues = useCallback(() => {
    setHideValuesState((current) => !current);
  }, []);

  const value = useMemo<PrivacyContextValue>(
    () => ({ hideValues, setHideValues, toggleHideValues }),
    [hideValues, setHideValues, toggleHideValues],
  );

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}
