/**
 * Lógica pura do arrasto do bottom sheet (sem DOM): limiares de fechamento,
 * velocidade e opacidade do scrim. O gesto em si (ponteiro + `transform`) vive
 * em `components/ui/bottom-sheet.tsx`; separar aqui permite testar os limiares
 * sem navegador.
 */

/** Distância (px) a partir da qual soltar o sheet o fecha. */
export const DISMISS_DISTANCE_PX = 120;
/** Velocidade (px/ms) de um arremesso para baixo que fecha mesmo com pouca distância. */
export const DISMISS_VELOCITY_PX_PER_MS = 0.55;
/** Distância mínima (px) para um arremesso contar: evita fechar por um toque trêmulo. */
export const FLING_MIN_DISTANCE_PX = 16;
/** Movimento (px) antes de o gesto virar arrasto: abaixo disso ainda é um toque. */
export const DRAG_START_SLOP_PX = 6;
/** Pausa (ms) entre o último movimento e o soltar que zera a velocidade. */
export const STALE_VELOCITY_MS = 100;

export interface DragSample {
  y: number;
  time: number;
}

/**
 * Velocidade vertical (px/ms, positiva = para baixo) entre duas amostras.
 * `now` é o instante do soltar: se o dedo parou antes disso, o arremesso
 * acabou e a velocidade é zero.
 */
export function dragVelocity(previous: DragSample, last: DragSample, now = last.time): number {
  if (now - last.time > STALE_VELOCITY_MS) {
    return 0;
  }

  const elapsed = Math.max(1, last.time - previous.time);

  return (last.y - previous.y) / elapsed;
}

/** Fecha por distância ou por arremesso para baixo. */
export function shouldDismissSheet(input: { distance: number; velocity: number }): boolean {
  const { distance, velocity } = input;

  if (distance >= DISMISS_DISTANCE_PX) {
    return true;
  }

  return distance >= FLING_MIN_DISTANCE_PX && velocity >= DISMISS_VELOCITY_PX_PER_MS;
}

/** Deslocamento do sheet: nunca sobe além da posição aberta. */
export function clampDragDistance(distance: number): number {
  return Math.max(0, distance);
}

/** Opacidade do scrim durante o arrasto (1 aberto → 0 quando o sheet sai de vista). */
export function scrimOpacityForDrag(distance: number, sheetHeight: number): number {
  if (sheetHeight <= 0) {
    return 1;
  }

  return Math.min(1, Math.max(0, 1 - (distance / sheetHeight) * 1.4));
}

/**
 * Espaço (px) que o teclado virtual ocupa na base do layout viewport.
 * `visualViewport` encolhe com o teclado; `offsetTop` cobre o viewport
 * rolado pelo navegador. Valores negativos ou ruído (<1px) viram 0.
 */
export function keyboardInset(input: {
  layoutHeight: number;
  visualHeight: number;
  visualOffsetTop: number;
}): number {
  const inset = input.layoutHeight - input.visualHeight - input.visualOffsetTop;

  return inset > 1 ? Math.round(inset) : 0;
}
