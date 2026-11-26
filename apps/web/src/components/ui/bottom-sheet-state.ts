import { useSyncExternalStore } from "react";

/**
 * Quantos bottom sheets estão abertos. O `Toaster` lê isto para subir os
 * toasts ao topo da tela enquanto um sheet ocupa a base (o toast nunca fica
 * atrás do sheet nem cobre o conteúdo dele).
 */
let openCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

/** Registra um sheet aberto; devolve a função que o desregistra. */
export function registerOpenBottomSheet(): () => void {
  openCount += 1;
  emit();

  let released = false;

  return () => {
    if (released) {
      return;
    }

    released = true;
    openCount -= 1;
    emit();
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function useBottomSheetOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => openCount > 0,
    () => false,
  );
}
