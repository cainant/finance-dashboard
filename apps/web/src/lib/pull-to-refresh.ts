/**
 * Lógica pura do "puxar para atualizar" (sem DOM): condição de ativação,
 * classificação do gesto, distância com resistência e limiar. O componente só
 * lê os toques e escreve um `transform` com o resultado.
 */

/** Deslocamento do dedo (px) antes de decidir se o gesto é um puxão. */
export const PULL_SLOP = 10;
/** Distância visual (px) do indicador a partir da qual soltar atualiza. */
export const PULL_THRESHOLD = 64;
/** Distância visual máxima (px) do indicador, mesmo com o dedo mais longe. */
export const PULL_MAX = 110;
/** Constante da curva de resistência: quanto maior, mais "solto" o início. */
const PULL_STIFFNESS = 130;
/** O movimento vertical precisa superar o horizontal por este fator. */
const VERTICAL_DOMINANCE = 1.5;
/** Posição (px) em que o indicador fica enquanto os dados recarregam. */
export const PULL_HOLD_DISTANCE = 56;

export type PullGesture = "undecided" | "pull" | "abort";

/**
 * Decide, a partir do deslocamento acumulado do dedo desde o toque inicial,
 * se o gesto é um puxão (vertical para baixo), se deve ser abandonado
 * (rolagem para cima, gesto horizontal) ou se ainda não dá para saber.
 */
export function classifyPull(dx: number, dy: number): PullGesture {
  const absX = Math.abs(dx);

  // Rolagem para cima, ou um gesto que já ficou mais horizontal que vertical
  // (carrossel, scrub de gráfico, deslizar linha): nunca é um puxão.
  if (dy < -4 || (absX > PULL_SLOP && absX * VERTICAL_DOMINANCE > Math.abs(dy))) {
    return "abort";
  }

  if (dy <= PULL_SLOP) {
    return "undecided";
  }

  return "pull";
}

/**
 * Distância visual do indicador para um deslocamento `dy` do dedo. A curva
 * exponencial dá resistência crescente e satura em `PULL_MAX`: o limiar de 64px
 * é alcançado com ~115px de movimento do dedo.
 */
export function pullDistance(dy: number): number {
  const travelled = Math.max(0, dy - PULL_SLOP);

  return PULL_MAX * (1 - Math.exp(-travelled / PULL_STIFFNESS));
}

/** `true` quando soltar agora dispara a atualização. */
export function isPullArmed(distance: number): boolean {
  return distance >= PULL_THRESHOLD;
}

/** Progresso 0–1 do indicador (opacidade/escala) até o limiar. */
export function pullProgress(distance: number): number {
  return Math.min(1, Math.max(0, distance / PULL_THRESHOLD));
}

export interface PullStartContext {
  /** Posição de rolagem vertical da página. */
  scrollY: number;
  /** Quantidade de toques simultâneos. */
  touchCount: number;
  /** Página já está ocupada (atualizando, sheet/diálogo aberto, desktop). */
  blocked: boolean;
  /** O alvo está dentro de campo de texto, sheet, ou região que rola sozinha. */
  insideExcludedRegion: boolean;
}

/**
 * O puxão só pode começar com a página realmente no topo, um único dedo e fora
 * de regiões que têm gesto/rolagem própria.
 */
export function canStartPull(context: PullStartContext): boolean {
  return (
    context.scrollY <= 0 &&
    context.touchCount === 1 &&
    !context.blocked &&
    !context.insideExcludedRegion
  );
}

const TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  "text",
  "search",
  "email",
  "number",
  "tel",
  "url",
  "password",
]);

/** Fração da janela abaixo da qual o `visualViewport` indica teclado na tela. */
const KEYBOARD_VIEWPORT_RATIO = 0.85;

export interface FocusedElementInfo {
  tagName: string;
  /** `HTMLInputElement.type` (só para `input`). */
  inputType?: string;
  isContentEditable?: boolean;
}

export interface TextEntryContext {
  /** Elemento com foco, ou `null` (corpo/nada). */
  focused: FocusedElementInfo | null;
  /** `visualViewport.height` quando a API existe. */
  viewportHeight?: number;
  /** `window.innerHeight`. */
  windowHeight: number;
}

/**
 * `true` quando o toque seguinte é de edição de texto e o puxar deve ficar desligado: o foco está
 * num campo de texto (não checkbox, radio, range ou botão) **e**, onde o `visualViewport` existe, o
 * teclado está de fato aberto. No Android, fechar o teclado com o voltar mantém o foco no campo,
 * então só o foco não basta.
 */
export function isTextEntryActive({
  focused,
  viewportHeight,
  windowHeight,
}: TextEntryContext): boolean {
  if (!focused) {
    return false;
  }

  const tag = focused.tagName.toLowerCase();
  const isTextField =
    tag === "textarea" ||
    Boolean(focused.isContentEditable) ||
    (tag === "input" && TEXT_INPUT_TYPES.has((focused.inputType ?? "text").toLowerCase()));

  if (!isTextField) {
    return false;
  }

  if (viewportHeight === undefined || windowHeight <= 0) {
    return true;
  }

  return viewportHeight < windowHeight * KEYBOARD_VIEWPORT_RATIO;
}
