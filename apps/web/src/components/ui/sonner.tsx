import { Toaster as Sonner, type ToasterProps } from "sonner";

import { useTheme } from "@/components/theme/theme-context";
import { useBottomSheetOpen } from "@/components/ui/bottom-sheet-state";
import { useMediaQuery } from "@/lib/hooks";

/**
 * Abaixo de `lg` a barra de abas inferior (~84px + safe area) ocupa a base:
 * o toast fica acima dela. Com um bottom sheet aberto ele sobe ao topo, onde o
 * sheet reserva espaço (ver `max-height` em `.bottom-sheet`), para não ficar
 * atrás dele nem cobrir o conteúdo.
 */
const COMPACT_OFFSET = {
  top: "calc(env(safe-area-inset-top, 0px) + 12px)",
  bottom: "calc(84px + env(safe-area-inset-bottom, 0px) + 12px)",
  left: 16,
  right: 16,
} as const;

export function Toaster(props: ToasterProps) {
  const { theme } = useTheme();
  const isCompact = useMediaQuery("(max-width: 1023px)") === true;
  const sheetOpen = useBottomSheetOpen();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position={isCompact ? (sheetOpen ? "top-center" : "bottom-center") : "bottom-right"}
      offset={isCompact ? COMPACT_OFFSET : undefined}
      mobileOffset={isCompact ? COMPACT_OFFSET : undefined}
      closeButton
      richColors={false}
      toastOptions={{
        classNames: {
          toast:
            "group toast !rounded-xl !border-border !bg-popover !text-[13px] !font-medium !text-popover-foreground !shadow-popover",
          title: "!text-[13px] !font-medium",
          description: "!text-xs !font-normal !text-muted-foreground",
          actionButton: "!rounded-md !bg-primary !text-primary-foreground",
          cancelButton: "!rounded-md !bg-muted !text-muted-foreground",
          closeButton: "!border-border !bg-popover !text-subtle-foreground",
        },
      }}
      {...props}
    />
  );
}
