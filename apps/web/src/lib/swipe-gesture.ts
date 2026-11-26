/**
 * Regras do gesto "deslizar para categorizar" na lista mobile. Funções puras
 * (sem DOM) para os limiares ficarem testáveis; quem escuta os ponteiros é
 * `use-swipe-to-act.ts`, que só escreve `transform` por referência.
 */

/** Movimento mínimo (px) para decidir se o gesto é horizontal ou vertical. */
export const SWIPE_SLOP_PX = 10;
/** Quanto o movimento horizontal precisa dominar o vertical para o gesto valer. */
export const HORIZONTAL_DOMINANCE = 1.6;
/** Deslocamento (px, para a esquerda) a partir do qual soltar dispara a ação. */
export const SWIPE_ARM_PX = 72;
/** Largura em que a linha para de acompanhar o dedo em 1:1 (resistência). */
export const SWIPE_MAX_PX = 112;
/**
 * Faixa (px) junto a cada borda da tela onde o gesto não começa: ali o sistema
 * usa o deslize para voltar (iOS à esquerda, Android nas duas bordas).
 */
export const EDGE_GUARD_PX = 24;

export type GestureIntent = "pending" | "horizontal" | "vertical";

/**
 * Classifica o gesto pelo deslocamento acumulado desde o toque. Só vira
 * horizontal quando o movimento é claramente horizontal; qualquer dúvida cai
 * em vertical (a rolagem da página nunca fica refém da linha).
 */
export function classifyGesture(dx: number, dy: number): GestureIntent {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);

  if (ax < SWIPE_SLOP_PX && ay < SWIPE_SLOP_PX) {
    return "pending";
  }

  return ax >= SWIPE_SLOP_PX && ax > ay * HORIZONTAL_DOMINANCE ? "horizontal" : "vertical";
}

/**
 * Posição da linha (px, ≤ 0) para um deslocamento do dedo. Só a esquerda abre;
 * depois de `SWIPE_MAX_PX` o avanço vira um terço, como a resistência nativa.
 */
export function swipeOffset(dx: number): number {
  if (dx >= 0) {
    return 0;
  }

  const pull = -dx;
  if (pull <= SWIPE_MAX_PX) {
    return -pull;
  }

  return -(SWIPE_MAX_PX + (pull - SWIPE_MAX_PX) / 3);
}

/** `true` quando soltar agora dispara a ação ("armado"). */
export function isSwipeArmed(offset: number): boolean {
  return -offset >= SWIPE_ARM_PX;
}

/** `true` se o toque começou perto demais de uma borda (gesto do sistema). */
export function startsInEdgeGuard(clientX: number, viewportWidth: number): boolean {
  return clientX < EDGE_GUARD_PX || clientX > viewportWidth - EDGE_GUARD_PX;
}
