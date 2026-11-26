import type { NetWorthPoint } from "@fd/contracts";
import { memo, useEffect, useId, useMemo, useRef } from "react";

import { useMoneyFormatter } from "@/components/privacy/privacy-context";
import {
  buildScrubGeometry,
  nearestIndex,
  pointerFraction,
  type ScrubLayout,
} from "@/lib/chart-scrub";
import { formatDate, formatDayMonth } from "@/lib/format";

const LAYOUT: ScrubLayout = { width: 340, height: 132, padX: 6, padTop: 10, padBottom: 22 };

export interface NetWorthScrubChartProps {
  data: readonly NetWorthPoint[];
  /**
   * Índice do ponto sob o dedo, ou `null` ao soltar. Chamado só quando o ponto
   * muda (no máximo uma vez por frame): o pai atualiza só o texto de destaque.
   */
  onScrub: (index: number | null) => void;
}

/**
 * Patrimônio líquido do período com scrub por toque.
 *
 * Não usa Recharts: o tooltip dele guarda o ponto ativo em estado do gráfico
 * inteiro, então cada movimento do dedo reconstruiria o SVG. Aqui a linha e a
 * área são desenhadas uma vez (componente memoizado) e o marcador (linha
 * vertical + ponto) é movido por `setAttribute` num `requestAnimationFrame`.
 * `touch-action: pan-y` deixa a rolagem vertical da página com o navegador;
 * só o gesto horizontal chega aqui.
 */
export const NetWorthScrubChart = memo(function NetWorthScrubChart({
  data,
  onScrub,
}: NetWorthScrubChartProps) {
  const money = useMoneyFormatter();
  const gradientId = `scrub-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const geometry = useMemo(
    () =>
      buildScrubGeometry(
        data.map((point) => point.netWorthCents),
        LAYOUT,
      ),
    [data],
  );

  const hostRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const onScrubRef = useRef(onScrub);
  const state = useRef({ index: null as number | null, frame: 0, clientX: 0 });

  useEffect(() => {
    onScrubRef.current = onScrub;
  }, [onScrub]);

  const lastIndex = geometry.count - 1;

  function moveMarker(index: number) {
    const line = lineRef.current;
    const dot = dotRef.current;
    const x = geometry.xs[index];
    const y = geometry.ys[index];

    if (!line || !dot || x === undefined || y === undefined) {
      return;
    }

    const xText = x.toFixed(1);
    line.setAttribute("x1", xText);
    line.setAttribute("x2", xText);
    dot.setAttribute("cx", xText);
    dot.setAttribute("cy", y.toFixed(1));
  }

  function setActive(active: boolean) {
    lineRef.current?.setAttribute("visibility", active ? "visible" : "hidden");
  }

  function flush() {
    const current = state.current;
    current.frame = 0;
    const host = hostRef.current;

    if (!host || geometry.count === 0) {
      return;
    }

    const rect = host.getBoundingClientRect();
    const index = nearestIndex(
      pointerFraction(current.clientX, rect.left, rect.width),
      geometry.count,
    );

    if (index === current.index) {
      return;
    }

    current.index = index;
    moveMarker(index);
    setActive(true);
    onScrubRef.current(index);
  }

  function schedule(clientX: number) {
    state.current.clientX = clientX;

    if (state.current.frame === 0) {
      state.current.frame = requestAnimationFrame(flush);
    }
  }

  function release() {
    const current = state.current;

    if (current.frame !== 0) {
      cancelAnimationFrame(current.frame);
      current.frame = 0;
    }

    if (current.index === null) {
      return;
    }

    current.index = null;
    moveMarker(lastIndex);
    setActive(false);
    onScrubRef.current(null);
  }

  useEffect(() => {
    const current = state.current;

    return () => {
      if (current.frame !== 0) {
        cancelAnimationFrame(current.frame);
      }
    };
  }, []);

  const first = data[0];
  const last = data[lastIndex];
  const label =
    first && last
      ? money.hidden
        ? `Evolução do patrimônio de ${formatDate(first.date)} a ${formatDate(last.date)}. Valores ocultos.`
        : `Evolução do patrimônio de ${formatDate(first.date)} a ${formatDate(last.date)}: de ${money.formatCurrency(first.netWorthCents)} para ${money.formatCurrency(last.netWorthCents)}. Arraste horizontalmente para ver cada dia.`
      : "Evolução do patrimônio";

  return (
    <div
      ref={hostRef}
      data-slot="net-worth-scrub"
      className="relative touch-pan-y select-none"
      // Mouse: o hover já escrubba; toque: só depois do slop horizontal, quando
      // o navegador não assumiu a rolagem vertical (aí vem `pointercancel`).
      onPointerMove={(event) => schedule(event.clientX)}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse") {
          schedule(event.clientX);
        }
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
    >
      <svg
        viewBox={`0 0 ${LAYOUT.width} ${LAYOUT.height}`}
        role="img"
        aria-label={label}
        className="block h-auto w-full"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.16} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {[10, 60, 110].map((y) => (
          <line
            key={y}
            x1={LAYOUT.padX}
            x2={LAYOUT.width - LAYOUT.padX}
            y1={y}
            y2={y}
            stroke="var(--border-subtle)"
            strokeWidth={1}
          />
        ))}
        <path d={geometry.areaPath} fill={`url(#${gradientId})`} />
        <path
          d={geometry.linePath}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          ref={lineRef}
          x1={geometry.xs[lastIndex] ?? 0}
          x2={geometry.xs[lastIndex] ?? 0}
          y1={LAYOUT.padTop}
          y2={LAYOUT.height - LAYOUT.padBottom}
          stroke="var(--muted-foreground)"
          strokeWidth={1}
          strokeDasharray="3 3"
          visibility="hidden"
        />
        <circle
          ref={dotRef}
          cx={geometry.xs[lastIndex] ?? 0}
          cy={geometry.ys[lastIndex] ?? 0}
          r={4}
          fill="var(--chart-1)"
          stroke="var(--card)"
          strokeWidth={2}
        />
        {first ? (
          <text x={LAYOUT.padX} y={LAYOUT.height - 4} fontSize={11} fill="var(--muted-foreground)">
            {formatDayMonth(first.date)}
          </text>
        ) : null}
        {last && geometry.count > 1 ? (
          <text
            x={LAYOUT.width - LAYOUT.padX}
            y={LAYOUT.height - 4}
            fontSize={11}
            textAnchor="end"
            fill="var(--muted-foreground)"
          >
            {formatDayMonth(last.date)}
          </text>
        ) : null}
      </svg>
    </div>
  );
});
