import { createContext, useContext, useMemo } from "react";

import {
  formatAxisAmountFromCents,
  formatCompactCurrencyFromCents,
  formatCompactMoneyFromCents,
  formatCurrencyFromCents,
  type CurrencyFormatOptions,
} from "@/lib/format";
import { readLocalStorage, writeLocalStorage } from "@/lib/hooks";

/**
 * Preferência global de privacidade ("Ocultar valores").
 *
 * A máscara é real: todo valor monetário passa pelo `useMoneyFormatter` e vira
 * `R$ ••••` — nunca blur/opacidade, que ainda deixariam o número legível no DOM.
 * O mesmo helper atende páginas, tabelas, sidebar e eixos de gráfico.
 */

export const HIDE_VALUES_STORAGE_KEY = "lumen:hide-values";

/** Texto da máscara (BRL). */
export const HIDDEN_MONEY_TEXT = "R$ ••••";

/** Máscara curta em espaços estreitos (sidebar), sem o prefixo da moeda. */
export const HIDDEN_COMPACT_TEXT = "••••";

/** Rótulo acessível de um valor oculto. */
export const HIDDEN_VALUE_LABEL = "Valor oculto";

export interface PrivacyContextValue {
  hideValues: boolean;
  setHideValues: (value: boolean) => void;
  toggleHideValues: () => void;
}

export const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function readStoredHideValues(): boolean {
  return readLocalStorage(HIDE_VALUES_STORAGE_KEY) === "1";
}

export function persistHideValues(value: boolean): void {
  writeLocalStorage(HIDE_VALUES_STORAGE_KEY, value ? "1" : "0");
}

const VISIBLE_FALLBACK: PrivacyContextValue = {
  hideValues: false,
  setHideValues: () => {},
  toggleHideValues: () => {},
};

/** Fora do `PrivacyProvider` (testes/SSR) os valores ficam visíveis. */
export function usePrivacy(): PrivacyContextValue {
  return useContext(PrivacyContext) ?? VISIBLE_FALLBACK;
}

export interface MoneyFormatter {
  /** `true` quando os valores devem aparecer mascarados. */
  hidden: boolean;
  /** Texto fixo da máscara (`R$ ••••`). */
  mask: string;
  /** Rótulo acessível (`Valor oculto`) ou `undefined` quando visível. */
  ariaLabel: string | undefined;
  /** Valor completo em BRL, ou a máscara quando oculto. */
  formatCurrency(cents: number | null | undefined, options?: CurrencyFormatOptions): string;
  /** Valor curto em BRL ("R$ 420"), ou a máscara curta quando oculto. */
  formatCompactMoney(cents: number): string;
  /** Notação compacta com "R$" (legendas, paleta), ou a máscara quando oculto. */
  formatCompact(cents: number): string;
  /** Rótulo de eixo sem "R$": "80 mil", "2,5 mil", "0"; vazio quando oculto. */
  formatAxis(cents: number): string;
}

export function createMoneyFormatter(hidden: boolean): MoneyFormatter {
  return {
    hidden,
    mask: HIDDEN_MONEY_TEXT,
    ariaLabel: hidden ? HIDDEN_VALUE_LABEL : undefined,
    formatCurrency(cents, options) {
      if (typeof cents === "number" && Number.isFinite(cents)) {
        return hidden ? HIDDEN_MONEY_TEXT : formatCurrencyFromCents(cents, options);
      }

      return "—";
    },
    formatCompactMoney(cents) {
      return hidden ? HIDDEN_COMPACT_TEXT : formatCompactMoneyFromCents(cents);
    },
    formatCompact(cents) {
      return hidden ? HIDDEN_MONEY_TEXT : formatCompactCurrencyFromCents(cents);
    },
    formatAxis(cents) {
      return hidden ? "" : formatAxisAmountFromCents(cents);
    },
  };
}

/** Hook único de formatação monetária ciente da preferência de privacidade. */
export function useMoneyFormatter(): MoneyFormatter {
  const { hideValues } = usePrivacy();

  return useMemo(() => createMoneyFormatter(hideValues), [hideValues]);
}
