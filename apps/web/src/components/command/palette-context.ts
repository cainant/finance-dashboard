import { createContext, useContext } from "react";

export interface CommandPaletteControls {
  open: () => void;
}

export const CommandPaletteContext = createContext<CommandPaletteControls | null>(null);

/** Abre a paleta de comandos a partir de qualquer tela do shell (ex.: "Mais"). */
export function useCommandPalette(): CommandPaletteControls {
  const context = useContext(CommandPaletteContext);

  if (!context) {
    throw new Error("useCommandPalette deve ser usado dentro do AppShell.");
  }

  return context;
}
