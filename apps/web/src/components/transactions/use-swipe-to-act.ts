import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

import {
  classifyGesture,
  isSwipeArmed,
  startsInEdgeGuard,
  swipeOffset,
  type GestureIntent,
} from "@/lib/swipe-gesture";

/** Linha deslizável: o `li` leva `data-swipe` + `data-index`; o conteúdo, `data-swipe-fg`. */
const ROW_SELECTOR = "li[data-swipe]";
const FOREGROUND_SELECTOR = "[data-swipe-fg]";
const SPRING_BACK = "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)";

interface ActiveGesture {
  pointerId: number;
  startX: number;
  startY: number;
  row: HTMLElement;
  foreground: HTMLElement;
  intent: GestureIntent;
  offset: number;
}

/**
 * Gesto "deslizar para a esquerda" em linhas de uma lista, por delegação: um
 * conjunto de handlers no `<ul>` serve todas as linhas montadas.
 *
 * Nada aqui usa `setState`: o estado do gesto vive num ref e o movimento é
 * escrito direto em `transform` (e em `data-armed`, que o CSS lê) no
 * foreground da linha. A linha só tem `touch-action: pan-y`, então a rolagem
 * vertical continua do navegador; o gesto só é assumido quando o movimento é
 * claramente horizontal (`classifyGesture`) e não começa nas bordas da tela
 * (voltar do sistema).
 *
 * `onAct(index)` dispara ao soltar além do limiar — ou com a seta ←, a
 * alternativa de teclado para o mesmo gesto.
 */
export function useSwipeToAct(onAct: (index: number) => void) {
  const gesture = useRef<ActiveGesture | null>(null);
  const suppressClick = useRef(false);
  const onActRef = useRef(onAct);
  useEffect(() => {
    onActRef.current = onAct;
  });

  const finish = useCallback((commit: boolean) => {
    const active = gesture.current;
    gesture.current = null;

    if (!active) {
      return;
    }

    const { row, foreground, intent, offset } = active;
    if (intent !== "horizontal") {
      return;
    }

    // O `click` que o navegador gera ao soltar não pode abrir o detalhe.
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 350);

    const armed = isSwipeArmed(offset);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    foreground.style.transition = reduceMotion ? "none" : SPRING_BACK;
    foreground.style.transform = "";
    delete row.dataset.armed;
    window.setTimeout(() => {
      foreground.style.transition = "";
      foreground.style.willChange = "";
    }, 260);

    if (commit && armed) {
      onActRef.current(Number(row.dataset.index));
    }
  }, []);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }
    if (startsInEdgeGuard(event.clientX, window.innerWidth)) {
      return;
    }

    const row = (event.target as Element).closest<HTMLElement>(ROW_SELECTOR);
    const foreground = row?.querySelector<HTMLElement>(FOREGROUND_SELECTOR);
    if (!row || !foreground) {
      return;
    }

    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      row,
      foreground,
      intent: "pending",
      offset: 0,
    };
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId || active.intent === "vertical") {
      return;
    }

    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;

    if (active.intent === "pending") {
      active.intent = classifyGesture(dx, dy);

      if (active.intent === "vertical") {
        // A rolagem é da página; o navegador cancela o ponteiro em seguida.
        gesture.current = null;
        return;
      }
      if (active.intent === "horizontal") {
        // Seguimos o dedo mesmo que ele saia da linha (e do `ul`).
        event.currentTarget.setPointerCapture(event.pointerId);
        active.foreground.style.transition = "none";
        active.foreground.style.willChange = "transform";
      }
    }

    if (active.intent !== "horizontal") {
      return;
    }

    const offset = swipeOffset(dx);
    active.offset = offset;
    active.foreground.style.transform = `translate3d(${offset}px, 0, 0)`;

    const armed = isSwipeArmed(offset);
    if (armed !== (active.row.dataset.armed === "true")) {
      if (armed) {
        active.row.dataset.armed = "true";
      } else {
        delete active.row.dataset.armed;
      }
    }
  }, []);

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (gesture.current?.pointerId === event.pointerId) {
        finish(true);
      }
    },
    [finish],
  );

  const onPointerCancel = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (gesture.current?.pointerId === event.pointerId) {
        finish(false);
      }
    },
    [finish],
  );

  const onClickCapture = useCallback((event: MouseEvent<HTMLElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowLeft" || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const target = event.target as Element;
    if (!target.matches(FOREGROUND_SELECTOR)) {
      return;
    }

    const row = target.closest<HTMLElement>(ROW_SELECTOR);
    if (!row) {
      return;
    }

    event.preventDefault();
    onActRef.current(Number(row.dataset.index));
  }, []);

  return useMemo(
    () => ({
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onClickCapture,
      onKeyDown,
    }),
    [onClickCapture, onKeyDown, onPointerCancel, onPointerDown, onPointerMove, onPointerUp],
  );
}
