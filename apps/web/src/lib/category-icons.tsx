import {
  ArrowLeftRight,
  Briefcase,
  Car,
  CircleEllipsis,
  Gamepad2,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  PawPrint,
  Plane,
  QrCode,
  ReceiptText,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  Tag,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { createElement, type ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Ícones de categoria vêm do banco como nome lucide (`ShoppingCart`).
 * O mapa é explícito para o bundle não incluir a biblioteca inteira; nomes
 * desconhecidos caem em `Tag`.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  ArrowLeftRight,
  Briefcase,
  Car,
  CircleEllipsis,
  Gamepad2,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  PawPrint,
  Plane,
  QrCode,
  ReceiptText,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  Tag,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
};

export function categoryIcon(name: string | null | undefined): LucideIcon {
  if (!name) {
    return Tag;
  }

  return CATEGORY_ICONS[name] ?? Tag;
}

/** Normaliza uma cor de categoria para `#RRGGBB` (o seed pode vir sem `#`). */
export function categoryColor(color: string | null | undefined): string {
  if (!color) {
    return "#71717a";
  }

  return color.startsWith("#") ? color : `#${color}`;
}

export interface CategoryIconProps extends Omit<ComponentProps<"svg">, "color" | "name"> {
  name: string | null | undefined;
  color?: string | null;
}

/** Ícone da categoria, colorido pelo token vindo do banco. */
export function CategoryIcon({ name, color, className, style, ...props }: CategoryIconProps) {
  const Icon = categoryIcon(name);

  return createElement(Icon, {
    "aria-hidden": true,
    className: cn("size-4 shrink-0", className),
    style: { color: categoryColor(color), ...style },
    ...props,
  });
}
