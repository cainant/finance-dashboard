import type { Settings } from "@fd/contracts";

import { DEFAULT_PERIOD, PERIOD_OPTIONS, PERIOD_VALUES, type Period } from "../../lib/period";

/** Chave local da preferência de período (o contrato de settings não tem esse campo). */
export const DEFAULT_PERIOD_STORAGE_KEY = "lumen:default-period";

/** Aceita apenas presets de período — `custom` não faz sentido como padrão. */
export function parseDefaultPeriod(value: string | null | undefined): Period | null {
  if (!value || value === "custom") {
    return null;
  }

  return (PERIOD_VALUES as readonly string[]).includes(value) ? (value as Period) : null;
}

/** Lê a preferência local com fallback para o período padrão do app. */
export function resolveDefaultPeriod(value: string | null | undefined): Period {
  return parseDefaultPeriod(value) ?? DEFAULT_PERIOD;
}

export function defaultPeriodLabel(period: Period): string {
  return PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? period;
}

/** Rótulo pt-BR do tema salvo no contrato de settings (inclui `system`). */
export function themeLabel(theme: Settings["theme"]): string {
  switch (theme) {
    case "dark":
      return "Escuro";
    case "light":
      return "Claro";
    case "system":
      return "Sistema";
    default:
      return theme;
  }
}

/** "pt-BR" → "Português (Brasil)": a tela não mostra código de locale. */
export function localeLabel(locale: string): string {
  switch (locale) {
    case "pt-BR":
      return "Português (Brasil)";
    default:
      return locale;
  }
}

/** "BRL" → "Real": a tela não mostra código de moeda. */
export function currencyLabel(currency: string): string {
  switch (currency) {
    case "BRL":
      return "Real";
    default:
      return currency;
  }
}

/** Resumo de uma linha das settings retornadas pela API, em pt-BR. */
export function settingsSummary(settings: Settings | null | undefined): string {
  if (!settings) {
    return "Preferências da conta indisponíveis";
  }

  return `${themeLabel(settings.theme)} · ${localeLabel(settings.locale)} · ${currencyLabel(settings.currency)}`;
}

/**
 * Sessão indisponível é 401/404: a API de auth ainda pode não existir no
 * ambiente ou a sessão expirou. Nunca deve derrubar a página.
 * A checagem é estrutural para não acoplar o helper ao cliente HTTP.
 */
export function isSessionUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const status = (error as { status?: unknown }).status;
  return status === 401 || status === 404;
}
