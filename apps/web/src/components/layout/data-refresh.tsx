import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { DataRefreshContext, useDataRefresh } from "@/components/layout/data-refresh-context";
import { refreshActiveQueries } from "@/lib/refresh-queries";
import {
  canStartPull,
  isTextEntryActive,
  classifyPull,
  isPullArmed,
  PULL_HOLD_DISTANCE,
  pullDistance,
  pullProgress,
} from "@/lib/pull-to-refresh";

/** Tempo que a confirmação "Dados atualizados" fica na região de status. */
const DONE_MESSAGE_MS = 2_500;

/**
 * "Atualizar" significa recarregar os dados da nossa API: refaz as consultas
 * ativas (as da tela atual e do chrome); numa query infinita só a primeira
 * página (`refreshActiveQueries`), para o custo não crescer com os lotes já
 * carregados. Não aciona `POST /sync`: o provider
 * não faz refresh sob demanda e a sincronização tem custo e regras próprias,
 * então continua explícita em "Sincronizar agora". Falha vira aviso.
 */
export function DataRefreshProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [isRefreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(() => {
    if (inFlight.current) {
      return inFlight.current;
    }

    const run = (async () => {
      setRefreshing(true);
      setMessage("Atualizando dados…");

      try {
        await refreshActiveQueries(queryClient);
        setMessage("Dados atualizados.");
      } catch {
        setMessage("Não foi possível atualizar os dados.");
        toast.error("Não foi possível atualizar os dados.", {
          description: "Verifique a conexão e tente de novo.",
        });
      } finally {
        setRefreshing(false);
        inFlight.current = null;
      }
    })();

    inFlight.current = run;

    return run;
  }, [queryClient]);

  useEffect(() => {
    if (!message || isRefreshing) {
      return;
    }

    const timeout = window.setTimeout(() => setMessage(""), DONE_MESSAGE_MS);

    return () => window.clearTimeout(timeout);
  }, [message, isRefreshing]);

  const value = useMemo(() => ({ refresh, isRefreshing }), [refresh, isRefreshing]);

  return (
    <DataRefreshContext.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" className="sr-only">
        {message}
      </div>
    </DataRefreshContext.Provider>
  );
}

/**
 * Alternativa sem gesto: botão que só aparece quando recebe o foco (teclado,
 * leitor de tela), como o "Pular para o conteúdo". Só abaixo de `lg`.
 */
export function RefreshFocusButton() {
  const { refresh, isRefreshing } = useDataRefresh();

  return (
    <button
      type="button"
      onClick={() => void refresh()}
      disabled={isRefreshing}
      className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-4 focus:left-1/2 focus:-translate-x-1/2 lg:hidden"
    >
      Atualizar dados
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Puxar para atualizar                                                       */
/* -------------------------------------------------------------------------- */

const MOBILE_QUERY = "(max-width: 1023.98px)";

/** Regiões com gesto ou rolagem próprios, onde o puxão nunca começa. */
const EXCLUDED_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='dialog']",
  "[role='alertdialog']",
  "[role='menu']",
  "[role='listbox']",
  "[data-radix-popper-content-wrapper]",
  "[data-no-pull-refresh]",
].join(",");

/** Campo de texto com foco e teclado aberto: o toque é de edição, não de puxar. */
function isTextEntryFocused(): boolean {
  const active = document.activeElement;

  return isTextEntryActive({
    focused:
      active instanceof HTMLElement
        ? {
            tagName: active.tagName,
            inputType: active instanceof HTMLInputElement ? active.type : undefined,
            isContentEditable: active.isContentEditable,
          }
        : null,
    viewportHeight: window.visualViewport?.height,
    windowHeight: window.innerHeight,
  });
}

/** `true` se algum ancestral do alvo rola sozinho e já está deslocado do topo. */
function insideScrolledContainer(target: Element): boolean {
  for (
    let node: Element | null = target;
    node && node !== document.body;
    node = node.parentElement
  ) {
    if (node.scrollTop > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Indicador + gesto. Ouve `touchstart`/`touchmove`/`touchend` no documento,
 * todos passivos: o `overscroll-behavior-y: none` (CSS, no `html`) já desliga o
 * recarregar nativo e o elástico do iOS, então não é preciso `preventDefault`. Durante o puxão só
 * escreve `--ptr-y`/`--ptr-p` por ref no elemento, sem `setState`.
 */
export function PullToRefresh() {
  const { refresh, isRefreshing } = useDataRefresh();
  const indicatorRef = useRef<HTMLDivElement>(null);
  const refreshRef = useRef(refresh);
  const busyRef = useRef(isRefreshing);

  useEffect(() => {
    refreshRef.current = refresh;
    busyRef.current = isRefreshing;
  }, [refresh, isRefreshing]);

  useEffect(() => {
    const indicator = indicatorRef.current;

    if (!indicator) {
      return;
    }

    const element: HTMLDivElement = indicator;
    const mobile = window.matchMedia(MOBILE_QUERY);
    let start: { x: number; y: number } | null = null;
    let active = false;
    let armed = false;

    function write(next: number) {
      element.style.setProperty("--ptr-y", `${next}px`);
      element.style.setProperty("--ptr-p", String(pullProgress(next)));
    }

    function reset() {
      start = null;
      active = false;
      armed = false;
      delete element.dataset.dragging;
      delete element.dataset.armed;
      clearVars();
    }

    function onTouchStart(event: TouchEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const touch = event.touches[0];

      if (
        !target ||
        !touch ||
        !canStartPull({
          scrollY: window.scrollY,
          touchCount: event.touches.length,
          blocked:
            !mobile.matches ||
            busyRef.current ||
            document.body.hasAttribute("data-scroll-locked") ||
            isTextEntryFocused(),
          insideExcludedRegion:
            target.closest(EXCLUDED_SELECTOR) !== null || insideScrolledContainer(target),
        })
      ) {
        start = null;
        return;
      }

      start = { x: touch.clientX, y: touch.clientY };
      active = false;
    }

    function onTouchMove(event: TouchEvent) {
      const touch = event.touches[0];

      if (!start || !touch) {
        return;
      }

      // A página saiu do topo (rolagem iniciada ou inércia): abandona.
      if (window.scrollY > 0 || event.touches.length > 1) {
        reset();
        return;
      }

      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;

      if (!active) {
        const gesture = classifyPull(dx, dy);

        if (gesture === "abort") {
          start = null;
          return;
        }

        if (gesture === "undecided") {
          return;
        }

        active = true;
        element.dataset.dragging = "true";
      }

      const distance = pullDistance(dy);
      const nowArmed = isPullArmed(distance);

      if (nowArmed !== armed) {
        armed = nowArmed;
        element.dataset.armed = String(armed);
      }

      write(distance);
    }

    function clearVars() {
      element.style.removeProperty("--ptr-y");
      element.style.removeProperty("--ptr-p");
    }

    function onTouchEnd() {
      if (!active) {
        start = null;
        return;
      }

      const shouldRefresh = armed;
      reset();

      if (shouldRefresh) {
        // Segura o indicador na posição de espera até os dados chegarem; o
        // `data-refreshing` (estado React) assume o mesmo valor via CSS.
        write(PULL_HOLD_DISTANCE);
        void refreshRef.current().finally(clearVars);
      }
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", reset);
    };
  }, []);

  return (
    <div
      ref={indicatorRef}
      aria-hidden="true"
      data-slot="pull-indicator"
      data-refreshing={isRefreshing ? "true" : undefined}
      className="pull-indicator lg:hidden"
    >
      <RefreshCw className="pull-indicator-icon size-4" strokeWidth={2} />
    </div>
  );
}
