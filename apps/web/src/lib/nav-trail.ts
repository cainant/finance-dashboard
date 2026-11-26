/**
 * Trilha das telas visitadas na sessão, indexada pela posição na pilha de
 * histórico do router (`location.state.__TSR_index`). O router não revela qual
 * é a entrada anterior do histórico; com a trilha o botão voltar sabe se o
 * "voltar" do histórico leva à tela que o rótulo promete (e o rótulo mostra o
 * nome dela, como nos apps nativos). Vive em memória: depois de um reload a
 * trilha começa vazia e o botão cai no destino fixo da tela.
 */

export interface TrailLocation {
  pathname: string;
  state?: unknown;
}

/** Índice da entrada no histórico, quando o router o registrou. */
export function historyIndex(location: TrailLocation | null | undefined): number | null {
  const state = location?.state as { __TSR_index?: unknown } | undefined;
  const index = state?.__TSR_index;

  return typeof index === "number" ? index : null;
}

export class NavTrail {
  private readonly entries = new Map<number, string>();

  /** Registra a tela de cada lado de uma navegação. */
  record(from: TrailLocation | null | undefined, to: TrailLocation | null | undefined): void {
    for (const location of [from, to]) {
      const index = historyIndex(location);

      if (location && index !== null) {
        this.entries.set(index, location.pathname);
      }
    }
  }

  /** Caminho da entrada imediatamente anterior à de índice `index`. */
  previousOf(index: number | null): string | null {
    return index === null || index <= 0 ? null : (this.entries.get(index - 1) ?? null);
  }
}

/** Trilha única do app (o router também é único). */
export const navTrail = new NavTrail();

const SCREEN_LABELS: ReadonlyArray<readonly [prefix: string, label: string]> = [
  ["/transactions", "Transações"],
  ["/accounts", "Contas"],
  ["/credit-cards", "Cartões"],
  ["/analytics", "Análises"],
  ["/connections", "Conexões"],
  ["/settings", "Configurações"],
  ["/more", "Mais"],
];

/** Nome curto da tela para o rótulo do botão voltar. */
export function screenLabel(pathname: string): string {
  if (pathname === "/") {
    return "Visão geral";
  }

  const found = SCREEN_LABELS.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  return found ? found[1] : "Voltar";
}
