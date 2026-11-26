import { cn } from "@/lib/utils";

const MARK_SIZE: Record<NonNullable<BrandMarkProps["size"]>, string> = {
  sm: "size-[26px] rounded-[7px] text-[14px]",
  md: "size-8 rounded-lg text-base",
  lg: "size-10 rounded-xl text-lg",
};

export interface BrandMarkProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Marca da Lumen: quadrado azul com um "L" centralizado. */
export function BrandMark({ size = "md", className }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 select-none place-items-center bg-primary font-bold text-primary-foreground",
        MARK_SIZE[size],
        className,
      )}
    >
      L
    </span>
  );
}

export interface BrandLogoProps {
  compact?: boolean;
  className?: string;
  markSize?: BrandMarkProps["size"];
}

/** Marca + nome; no topo da sidebar o nome fica em 14px/600. */
export function BrandLogo({ compact = false, className, markSize = "sm" }: BrandLogoProps) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <BrandMark size={markSize} />
      {!compact ? (
        <span className="truncate text-sm font-semibold tracking-tight text-foreground">
          Lumen Finance
        </span>
      ) : null}
    </span>
  );
}
