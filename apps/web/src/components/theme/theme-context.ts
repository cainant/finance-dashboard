import { createContext, useContext } from "react";

export type Theme = "dark" | "light";

/** Chave compartilhada com o script inline do index.html (sem flash no load). */
export const THEME_STORAGE_KEY = "lumen:theme";

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme deve ser usado dentro de <ThemeProvider>.");
  }

  return context;
}
