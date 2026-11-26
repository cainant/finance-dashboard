import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, XIcon } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { registerOpenBottomSheet } from "@/components/ui/bottom-sheet-state";
import {
  clampDragDistance,
  DRAG_START_SLOP_PX,
  dragVelocity,
  keyboardInset,
  scrimOpacityForDrag,
  shouldDismissSheet,
  type DragSample,
} from "@/lib/sheet-drag";
import { cn } from "@/lib/utils";

/**
 * Bottom sheet mobile (uso abaixo de `lg`; no desktop continue com `Sheet`).
 *
 * Base: Radix Dialog — role="dialog", `aria-modal`, foco preso e devolvido ao
 * gatilho, Esc e fundo inerte (`aria-hidden` nos irmãos + bloqueio de
 * ponteiro/rolagem) vêm dele. O que é nosso: o gesto de arrasto (só
 * `transform` via variável CSS, sem `setState` por evento), a mola de entrada,
 * o respeito ao teclado virtual e à safe area. Tudo animado é `transform` e
 * `opacity`; as regras ficam em `styles.css` (bloco "bottom-sheet").
 *
 * Navegação em dois níveis: o consumidor troca o conteúdo e passa `onBack` ao
 * `BottomSheetHeader` — o cabeçalho mostra o botão voltar e mantém o título.
 */

interface BottomSheetContextValue {
  requestClose: () => void;
}

const BottomSheetContext = createContext<BottomSheetContextValue | null>(null);

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function BottomSheet({ open, onOpenChange, children }: BottomSheetProps) {
  const contextValue = useMemo<BottomSheetContextValue>(
    () => ({ requestClose: () => onOpenChange(false) }),
    [onOpenChange],
  );

  return (
    <BottomSheetContext.Provider value={contextValue}>
      <DialogPrimitive.Root data-slot="bottom-sheet" open={open} onOpenChange={onOpenChange}>
        {children}
      </DialogPrimitive.Root>
    </BottomSheetContext.Provider>
  );
}

export function BottomSheetTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="bottom-sheet-trigger" {...props} />;
}

export function BottomSheetClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="bottom-sheet-close" {...props} />;
}

interface DragState {
  pointerId: number;
  startY: number;
  started: boolean;
  previous: DragSample;
  last: DragSample;
  height: number;
}

/** Controles que mantêm o próprio toque mesmo dentro da zona de arrasto. */
const INTERACTIVE_SELECTOR = "button, a, input, textarea, select, [role='button']";

export type BottomSheetContentProps = Omit<
  ComponentProps<typeof DialogPrimitive.Content>,
  "aria-describedby"
> & {
  /** Descrição opcional; sem ela o Radix não recebe `aria-describedby`. */
  "aria-describedby"?: string;
};

export function BottomSheetContent({
  className,
  children,
  style,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onInteractOutside,
  ref,
  ...props
}: BottomSheetContentProps) {
  const context = useContext(BottomSheetContext);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<DragState | null>(null);

  // Ref com cleanup (React 19): acompanha o teclado virtual enquanto montado.
  const setContentRef = useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node;

      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }

      if (!node) {
        return;
      }

      const viewport = window.visualViewport;
      // Avisa o `Toaster` enquanto o sheet existe (aberto ou animando a saída).
      const release = registerOpenBottomSheet();
      let frame = 0;

      const update = () => {
        if (!viewport) {
          return;
        }

        window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(() => {
          const inset = keyboardInset({
            layoutHeight: window.innerHeight,
            visualHeight: viewport.height,
            visualOffsetTop: viewport.offsetTop,
          });
          node.style.setProperty("--bs-kb", `${inset}px`);

          // O campo em foco não pode ficar atrás do teclado.
          const active = document.activeElement;
          if (
            inset > 0 &&
            active instanceof HTMLElement &&
            node.contains(active) &&
            active.matches("input, textarea, [contenteditable='true']")
          ) {
            active.scrollIntoView({ block: "nearest" });
          }
        });
      };

      viewport?.addEventListener("resize", update, { passive: true });
      viewport?.addEventListener("scroll", update, { passive: true });
      update();

      return () => {
        viewport?.removeEventListener("resize", update);
        viewport?.removeEventListener("scroll", update);
        window.cancelAnimationFrame(frame);
        document.documentElement.style.removeProperty("--bs-scrim");
        release();
      };
    },
    [ref],
  );

  function applyDrag(distance: number, height: number) {
    contentRef.current?.style.setProperty("--bs-drag", `${distance}px`);
    const scrim = String(scrimOpacityForDrag(distance, height));
    overlayRef.current?.style.setProperty("--bs-scrim", scrim);
    // A calha de rolagem (pintada no `html`) acompanha o scrim durante o arrasto.
    document.documentElement.style.setProperty("--bs-scrim", scrim);
  }

  function resetDrag() {
    contentRef.current?.style.removeProperty("--bs-drag");
    overlayRef.current?.style.removeProperty("--bs-scrim");
    document.documentElement.style.removeProperty("--bs-scrim");
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    onPointerDown?.(event);

    const target = event.target as Element;
    if (
      event.defaultPrevented ||
      (event.pointerType === "mouse" && event.button !== 0) ||
      !target.closest("[data-bottom-sheet-drag]") ||
      target.closest(INTERACTIVE_SELECTOR)
    ) {
      return;
    }

    const sample = { y: event.clientY, time: event.timeStamp };
    drag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      started: false,
      previous: sample,
      last: sample,
      height: 0,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    onPointerMove?.(event);

    const state = drag.current;
    if (!state || event.pointerId !== state.pointerId) {
      return;
    }

    const delta = event.clientY - state.startY;

    if (!state.started) {
      if (Math.abs(delta) < DRAG_START_SLOP_PX) {
        return;
      }

      state.started = true;
      state.height = contentRef.current?.offsetHeight ?? 0;
      contentRef.current?.setAttribute("data-dragging", "true");

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ponteiro sintético/encerrado: o arrasto segue sem captura.
      }
    }

    state.previous = state.last;
    state.last = { y: event.clientY, time: event.timeStamp };
    applyDrag(clampDragDistance(delta), state.height);
  }

  function finishDrag(event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) {
    const state = drag.current;
    if (!state || event.pointerId !== state.pointerId) {
      return;
    }

    drag.current = null;

    if (!state.started) {
      return;
    }

    contentRef.current?.removeAttribute("data-dragging");

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Já liberado.
    }

    const distance = clampDragDistance(event.clientY - state.startY);
    const velocity = dragVelocity(state.previous, state.last, event.timeStamp);

    if (!cancelled && shouldDismissSheet({ distance, velocity })) {
      // `--bs-drag` fica no valor atual: a animação de saída parte dele.
      context?.requestClose();
      return;
    }

    resetDrag();
  }

  // Fechou por outro caminho (botão, Esc, scrim): limpa o estado do gesto.
  useEffect(() => {
    return () => {
      drag.current = null;
    };
  }, []);

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        ref={overlayRef}
        data-slot="bottom-sheet-overlay"
        className="bottom-sheet-scrim fixed inset-0 z-50"
      />
      <DialogPrimitive.Content
        ref={setContentRef}
        data-slot="bottom-sheet-content"
        aria-modal="true"
        aria-describedby={props["aria-describedby"]}
        className={cn(
          "bottom-sheet fixed inset-x-0 z-50 flex flex-col overflow-hidden text-card-foreground outline-none sm:mx-auto sm:max-w-[560px]",
          className,
        )}
        style={style}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => {
          onPointerUp?.(event);
          finishDrag(event, false);
        }}
        onPointerCancel={(event) => {
          onPointerCancel?.(event);
          finishDrag(event, true);
        }}
        // Toque no toast ("Desfazer") não conta como clique fora do sheet.
        onInteractOutside={(event) => {
          onInteractOutside?.(event);

          const target = event.target;
          if (target instanceof Element && target.closest("[data-sonner-toaster]")) {
            event.preventDefault();
          }
        }}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export interface BottomSheetHeaderProps {
  /** Título do diálogo (nome acessível). */
  title: ReactNode;
  /** Presente na página filha: mostra o botão voltar no cabeçalho. */
  onBack?: () => void;
  /** Rótulo acessível do botão voltar. */
  backLabel?: string;
  className?: string;
}

/**
 * Alça + título + fechar. A região inteira (menos os botões) é a zona de
 * arrasto; a rolagem do corpo não é afetada.
 */
export function BottomSheetHeader({
  title,
  onBack,
  backLabel = "Voltar",
  className,
}: BottomSheetHeaderProps) {
  return (
    <div
      data-slot="bottom-sheet-header"
      data-bottom-sheet-drag=""
      className={cn(
        "bottom-sheet-drag-zone shrink-0 pt-2 pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))]",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="mx-auto h-[5px] w-9 rounded-full bg-foreground/25"
        data-slot="bottom-sheet-handle"
      />
      <div className="grid min-h-12 grid-cols-[2.75rem_1fr_2.75rem] items-center">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="grid size-11 place-items-center rounded-full text-primary transition-opacity active:opacity-50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ChevronLeft aria-hidden="true" className="size-6" />
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
        <DialogPrimitive.Title
          data-slot="bottom-sheet-title"
          className="truncate text-center text-base leading-6 font-semibold text-foreground"
        >
          {title}
        </DialogPrimitive.Title>
        <DialogPrimitive.Close
          data-slot="bottom-sheet-close-icon"
          aria-label="Fechar"
          className="grid size-11 place-items-center rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="grid size-8 place-items-center rounded-full bg-foreground/8 text-muted-foreground">
            <XIcon aria-hidden="true" className="size-4" />
          </span>
        </DialogPrimitive.Close>
      </div>
    </div>
  );
}

/** Corpo rolável: altura máxima do sheet + rolagem interna, respeitando a safe area. */
export function BottomSheetBody({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="bottom-sheet-body"
      className={cn(
        "min-h-0 flex-1 overflow-y-auto overscroll-contain pt-1 pr-[max(1.25rem,env(safe-area-inset-right))] pb-[max(1.25rem,env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))]",
        className,
      )}
      {...props}
    />
  );
}
