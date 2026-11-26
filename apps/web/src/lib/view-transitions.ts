/**
 * View Transitions como melhoria progressiva: empurrar para a direita ao
 * entrar num detalhe e voltar ao sair; abas trocam sem animação. O router
 * chama `document.startViewTransition` e este módulo só decide o *tipo*
 * (`nav-forward` | `nav-back`) ou `false` (sem transição). As animações vivem
 * no CSS (`:active-view-transition-type`) e usam apenas transform/opacity.
 */

export type NavTransitionType = "nav-forward" | "nav-back";

/** Telas de detalhe empilhadas sobre uma aba (`/accounts/:id`, `/credit-cards/:id`). */
const DETAIL_PATTERN = /^\/(?:accounts|credit-cards)\/[^/]+\/?$/;

export function isDetailPath(pathname: string): boolean {
  return DETAIL_PATTERN.test(pathname);
}

/**
 * Entrar num detalhe empurra; sair dele volta; qualquer outra mudança de
 * caminho (troca de aba, abrir "Mais") é instantânea. Mudar só os search
 * params (período, filtros) não muda de tela.
 */
export function transitionTypeFor(
  fromPathname: string | undefined,
  toPathname: string,
): NavTransitionType | false {
  if (fromPathname === undefined || fromPathname === toPathname) {
    return false;
  }

  const from = isDetailPath(fromPathname);
  const to = isDetailPath(toPathname);

  if (to && !from) {
    return "nav-forward";
  }

  if (from && !to) {
    return "nav-back";
  }

  return false;
}

/** Janela em que um `popstate` ainda conta como origem da navegação em curso. */
const POP_WINDOW_MS = 3_000;

export interface PopOrigin {
  /** Instante (ms) do último `popstate` do navegador, ou `null`. */
  lastPopAt: number | null;
  /** O voltar foi disparado pelo botão do app (e não pelo gesto do sistema). */
  programmatic: boolean;
}

/**
 * O iOS (Safari e app instalado) anima sozinho o gesto de voltar pela borda e
 * só então dispara o `popstate`: rodar a transição por cima animaria duas
 * vezes. Nesse caso a transição é pulada para voltas que vieram do navegador.
 * O botão voltar do app (programático) continua animando.
 */
export function shouldSkipForSystemBack(options: {
  now: number;
  origin: PopOrigin;
  isIosWebKit: boolean;
}): boolean {
  const { now, origin, isIosWebKit } = options;

  if (!isIosWebKit || origin.programmatic || origin.lastPopAt === null) {
    return false;
  }

  return now - origin.lastPopAt <= POP_WINDOW_MS;
}

export function isIosWebKit(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS se identifica como Mac; só ele tem Mac com multitoque.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * Quanto tempo o pedido do botão voltar vale. `history.back()` dispara o
 * `popstate` em poucos ms; se não houver navegação (já era a primeira entrada,
 * ou o clique não voltou nada), a marca expira e não contamina a próxima.
 */
export const PROGRAMMATIC_BACK_TTL_MS = 1_500;

const origin: { lastPopAt: number | null; programmaticAt: number | null } = {
  lastPopAt: null,
  programmaticAt: null,
};

/** Marca que o próximo `popstate` foi pedido pelo botão voltar do app. */
export function markProgrammaticBack(now: number = performance.now()): void {
  origin.programmaticAt = now;
}

/** Registra um `popstate` do navegador. */
export function recordPopState(now: number = performance.now()): void {
  origin.lastPopAt = now;
}

/**
 * Lê e zera a origem da navegação em curso (cada navegação a consome). A marca
 * programática só conta dentro da janela `PROGRAMMATIC_BACK_TTL_MS`.
 */
export function consumeNavigationOrigin(now: number = performance.now()): PopOrigin {
  const programmatic =
    origin.programmaticAt !== null && now - origin.programmaticAt <= PROGRAMMATIC_BACK_TTL_MS;
  const consumed: PopOrigin = { lastPopAt: origin.lastPopAt, programmatic };

  origin.programmaticAt = null;
  origin.lastPopAt = null;

  return consumed;
}

/** Observa `popstate` (chamar uma vez, no bootstrap). */
export function watchPopState(): void {
  window.addEventListener("popstate", () => recordPopState());
}

function supportsTransitionTypes(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof document.startViewTransition === "function" &&
    typeof CSS !== "undefined" &&
    CSS.supports("selector(:active-view-transition-type(a))")
  );
}

export interface ViewTransitionRouterOptions {
  types: (info: {
    fromLocation?: { pathname: string };
    toLocation: { pathname: string };
  }) => string[] | false;
}

/**
 * Opções do router (`defaultViewTransition`), ou `undefined` quando o
 * navegador não suporta tipos de transição: sem eles o router faria um
 * fade padrão em toda navegação, inclusive entre abas.
 */
export function createViewTransitionOptions(): ViewTransitionRouterOptions | undefined {
  if (!supportsTransitionTypes()) {
    return undefined;
  }

  return {
    types: ({ fromLocation, toLocation }) => {
      const now = performance.now();
      // Cada navegação consome a origem registrada.
      const skipForSystemBack = shouldSkipForSystemBack({
        now,
        origin: consumeNavigationOrigin(now),
        isIosWebKit: isIosWebKit(),
      });

      // Só abaixo de `lg` (o desktop não ganha transição) e sem movimento reduzido.
      if (
        window.matchMedia("(min-width: 1024px)").matches ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        document.visibilityState === "hidden" ||
        skipForSystemBack
      ) {
        return false;
      }

      const type = transitionTypeFor(fromLocation?.pathname, toLocation.pathname);

      return type === false ? false : [type];
    },
  };
}
