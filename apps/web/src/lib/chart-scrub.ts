/**
 * Geometria e leitura do gráfico de patrimônio com scrub (arrastar o dedo).
 * Funções puras: o componente só aplica o resultado em atributos SVG.
 */

export interface ScrubLayout {
  /** Largura do viewBox. */
  width: number;
  /** Altura do viewBox. */
  height: number;
  /** Margem horizontal interna (o ponto das pontas não encosta na borda). */
  padX: number;
  padTop: number;
  padBottom: number;
}

export interface ScrubGeometry {
  count: number;
  xs: number[];
  ys: number[];
  linePath: string;
  areaPath: string;
}

const fixed = (value: number) => value.toFixed(1);

/** Índice do ponto mais próximo de uma posição horizontal (fração 0–1 da largura). */
export function nearestIndex(fraction: number, count: number): number {
  if (count <= 1 || !Number.isFinite(fraction)) {
    return 0;
  }

  const index = Math.round(Math.min(1, Math.max(0, fraction)) * (count - 1));

  return Math.min(count - 1, Math.max(0, index));
}

/** Fração (0–1) de `clientX` dentro do elemento; 0 quando ele não tem largura. */
export function pointerFraction(clientX: number, left: number, width: number): number {
  if (!(width > 0)) {
    return 0;
  }

  return Math.min(1, Math.max(0, (clientX - left) / width));
}

/** Pontos, linha e área da série. Série constante vira uma linha no meio. */
export function buildScrubGeometry(values: readonly number[], layout: ScrubLayout): ScrubGeometry {
  const count = values.length;
  const { width, height, padX, padTop, padBottom } = layout;
  const top = padTop;
  const bottom = height - padBottom;

  if (count === 0) {
    return { count, xs: [], ys: [], linePath: "", areaPath: "" };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  // Folga vertical para a linha não encostar nas bordas.
  const pad = span === 0 ? 1 : span * 0.12;
  const lo = min - pad;
  const hi = max + pad;

  const xs = values.map((_, index) =>
    count === 1 ? width / 2 : padX + (index * (width - padX * 2)) / (count - 1),
  );
  const ys = values.map((value) => bottom - ((value - lo) / (hi - lo)) * (bottom - top));

  const points = xs.map((x, index) => `${fixed(x)},${fixed(ys[index]!)}`);
  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${fixed(xs[count - 1]!)},${fixed(bottom)} L${fixed(xs[0]!)},${fixed(bottom)} Z`;

  return { count, xs, ys, linePath, areaPath };
}
