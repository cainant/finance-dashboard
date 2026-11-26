import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme/theme-context";
import { Button } from "@/components/ui/button";

/** Alterna dark/light; o estado persiste em localStorage via ThemeProvider. */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const next = theme === "dark" ? "claro" : "escuro";

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      onClick={toggleTheme}
      aria-label={`Ativar tema ${next}`}
      title={`Ativar tema ${next}`}
    >
      <Sun
        aria-hidden="true"
        className="size-4 rotate-0 scale-100 transition-transform duration-200 dark:-rotate-90 dark:scale-0"
      />
      <Moon
        aria-hidden="true"
        className="absolute size-4 rotate-90 scale-0 transition-transform duration-200 dark:rotate-0 dark:scale-100"
      />
    </Button>
  );
}
