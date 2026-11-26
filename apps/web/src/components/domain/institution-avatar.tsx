import { useState, type ComponentProps } from "react";

import { getInitials, institutionTone, isLightHexColor } from "@/lib/institution";
import { resolveInstitutionLogo } from "@/lib/institution-logo";
import { cn } from "@/lib/utils";

const SIZE_CLASS: Record<NonNullable<InstitutionAvatarProps["size"]>, string> = {
  xs: "size-5 rounded-[5px] text-[9px]",
  sm: "size-8 rounded-md text-[11px]",
  md: "size-10 rounded-lg text-xs",
  lg: "size-12 rounded-xl text-sm",
};

type LogoStatus = "loading" | "loaded" | "error";

interface LogoState {
  src: string;
  status: LogoStatus;
}

export interface InstitutionAvatarProps extends Omit<ComponentProps<"span">, "color"> {
  name: string;
  /** Cor de marca vinda do provider (hex). Sem ela, a cor é derivada do nome. */
  color?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  /**
   * Avatar ao lado do nome do banco: sai da árvore de acessibilidade para o
   * leitor de tela não anunciar a instituição duas vezes.
   */
  decorative?: boolean;
}

/**
 * Avatar de instituição: logo real do banco (catálogo do Pluggy) quando o nome
 * casa com um banco conhecido, com as iniciais em bloco colorido determinístico
 * como base e fallback. As iniciais ficam atrás da imagem e a imagem só aparece
 * (com fundo branco) depois do `onLoad`: o bloco nunca fica branco enquanto o
 * CDN carrega, não muda de tamanho e, se a imagem falhar, `onError` mantém as
 * iniciais. O logo é identidade, não valor: "Ocultar valores" não o esconde.
 */
export function InstitutionAvatar({
  name,
  color,
  size = "md",
  decorative = false,
  className,
  style,
  ...props
}: InstitutionAvatarProps) {
  const tone = institutionTone(name);
  const hasBrandColor = typeof color === "string" && /^#?[0-9a-f]{3,8}$/i.test(color.trim());
  const background = hasBrandColor ? color! : tone.background;
  const foreground = hasBrandColor
    ? isLightHexColor(color!)
      ? "oklch(0.18 0.02 260)"
      : "oklch(0.99 0 0)"
    : tone.foreground;

  const logoUrl = resolveInstitutionLogo(name);
  const [logoState, setLogoState] = useState<LogoState | null>(null);
  const logoStatus: LogoStatus | null = logoUrl
    ? logoState?.src === logoUrl
      ? logoState.status
      : "loading"
    : null;
  const showLogo = logoStatus !== null && logoStatus !== "error";
  const logoLoaded = logoStatus === "loaded";

  return (
    <span
      data-slot="institution-avatar"
      data-logo={showLogo ? "true" : "false"}
      data-logo-state={showLogo ? logoStatus : undefined}
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": `Instituição ${name}`, title: name })}
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden font-semibold text-white",
        SIZE_CLASS[size],
        className,
      )}
      style={{ background, color: foreground, ...style }}
      {...props}
    >
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
        {getInitials(name)}
      </span>
      {showLogo && logoUrl ? (
        <img
          data-slot="institution-logo"
          src={logoUrl}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLogoState({ src: logoUrl, status: "loaded" })}
          onError={() => setLogoState({ src: logoUrl, status: "error" })}
          className={cn(
            "relative size-full rounded-[inherit] object-contain p-[6%] transition-opacity duration-150",
            logoLoaded ? "bg-white opacity-100" : "bg-transparent opacity-0",
          )}
        />
      ) : null}
      {/* O anel fica acima da imagem para o logo não escondê-lo. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-black/10 ring-inset dark:ring-white/15"
      />
    </span>
  );
}
