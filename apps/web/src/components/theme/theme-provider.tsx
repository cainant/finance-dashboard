import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  THEME_STORAGE_KEY,
  ThemeContext,
  type Theme,
  type ThemeContextValue,
} from "./theme-context";

function readStoredTheme(fallback: Theme): Theme {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") {
      return stored;
    }
  } catch {
    /* localStorage indisponível (modo privado restrito): usa o fallback. */
  }

  return document.documentElement.classList.contains("dark") ? "dark" : fallback;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;

  const scheme = document.querySelector('meta[name="color-scheme"]');
  scheme?.setAttribute("content", theme);

  const themeColor = document.querySelector('meta[name="theme-color"]');
  themeColor?.setAttribute("content", theme === "dark" ? "#030303" : "#ffffff");
}

export interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
}

/**
 * Tema persistido em localStorage. O script inline do index.html aplica a classe
 * antes do primeiro paint; aqui apenas mantemos React e DOM em sincronia.
 */
export function ThemeProvider({ children, defaultTheme = "dark" }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme(defaultTheme));

  useEffect(() => {
    applyTheme(theme);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* Persistência é melhor esforço; o tema segue aplicado na sessão. */
    }
  }, [theme]);

  // Mantém abas abertas em sincronia quando o usuário troca o tema em outra.
  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== THEME_STORAGE_KEY) {
        return;
      }

      if (event.newValue === "dark" || event.newValue === "light") {
        setThemeState(event.newValue);
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setTheme = useCallback<ThemeContextValue["setTheme"]>((next) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
