import { useEffect, useState } from "react";

/**
 * `true` quando o título grande da página (primeiro `h1` dentro do seletor)
 * já saiu da tela por cima da barra superior. Usa scroll passivo + rAF e só
 * atualiza o estado quando o booleano muda: nada de re-render por pixel.
 * `resetKey` reavalia a cada navegação (a página nova monta depois da URL).
 */
export function useTitleOffscreen(resetKey: string): boolean {
  const [offscreen, setOffscreen] = useState(false);

  useEffect(() => {
    let frame = 0;

    function evaluate() {
      frame = 0;
      const heading = document.querySelector<HTMLElement>("main h1");
      // Sem h1 (estados de erro/carregando) a barra não mostra título duplicado.
      // Altura real da barra (3.5rem + área segura do topo), lida só aqui.
      const bar = document.querySelector<HTMLElement>('[data-slot="app-topbar"]');
      const barBottom = bar ? bar.getBoundingClientRect().bottom : 56;
      const next = heading ? heading.getBoundingClientRect().bottom <= barBottom : false;
      setOffscreen((current) => (current === next ? current : next));
    }

    function schedule() {
      if (frame === 0) {
        frame = window.requestAnimationFrame(evaluate);
      }
    }

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });

    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [resetKey]);

  return offscreen;
}
