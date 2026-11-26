import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/**
 * Adia a propagação de um valor (ex.: texto de busca) até que ele pare de
 * mudar por `delay` ms. Mantém a primeira renderização imediata.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (value === debounced) {
      return;
    }

    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
    // `debounced` entra de propósito: evita agendar quando nada mudou.
  }, [value, delay, debounced]);

  return debounced;
}

/**
 * Acompanha uma media query (`window.matchMedia`) com cleanup.
 *
 * O app é uma SPA (Vite + `createRoot`, sem SSR): o valor real já sai no
 * primeiro render, lido de forma síncrona (`useSyncExternalStore`), para o
 * celular não montar um quadro com o layout de desktop. Só devolve `null`
 * onde não há `matchMedia` (testes em Node, servidor).
 */
export function useMediaQuery(query: string): boolean | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => {};
      }

      const mediaQuery = window.matchMedia(query);
      mediaQuery.addEventListener("change", onChange);

      return () => mediaQuery.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () =>
      typeof window === "undefined" || typeof window.matchMedia !== "function"
        ? null
        : window.matchMedia(query).matches,
    [query],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/**
 * `true` enquanto a aba está em primeiro plano. O carregamento em segundo
 * plano da lista de transações pausa com a aba oculta: uma aba esquecida
 * aberta não fica gastando requests, bateria e cota de leitura do D1.
 */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState !== "hidden",
  );

  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);

    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  return visible;
}

/** Lê um valor de localStorage sem quebrar em navegadores restritos. */
export function readLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Grava em localStorage como melhor esforço. */
export function writeLocalStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* Persistência é melhor esforço. */
  }
}

const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribeDesktop(onChange: () => void): () => void {
  const mediaQuery = window.matchMedia(DESKTOP_QUERY);
  mediaQuery.addEventListener("change", onChange);

  return () => mediaQuery.removeEventListener("change", onChange);
}

/**
 * `true` a partir do breakpoint `lg` (1024px, o mesmo do Tailwind e do shell).
 * Leitura síncrona no primeiro render (sem o `null` de `useMediaQuery`), para a
 * página montar direto no layout certo em vez de piscar o outro.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}
