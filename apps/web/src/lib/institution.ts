/** Identidade visual de instituições: iniciais e cores determinísticas. */

export interface InstitutionTone {
  background: string;
  foreground: string;
}

const TONES: readonly InstitutionTone[] = [
  {
    background: "linear-gradient(140deg, oklch(0.64 0.13 165), oklch(0.48 0.1 190))",
    foreground: "oklch(0.98 0.01 165)",
  },
  {
    background: "linear-gradient(140deg, oklch(0.6 0.11 215), oklch(0.45 0.1 245))",
    foreground: "oklch(0.98 0.01 215)",
  },
  {
    background: "linear-gradient(140deg, oklch(0.6 0.13 295), oklch(0.46 0.12 320))",
    foreground: "oklch(0.98 0.01 295)",
  },
  {
    background: "linear-gradient(140deg, oklch(0.64 0.16 25), oklch(0.48 0.15 15))",
    foreground: "oklch(0.99 0.005 25)",
  },
  {
    background: "linear-gradient(140deg, oklch(0.68 0.12 75), oklch(0.52 0.11 55))",
    foreground: "oklch(0.2 0.03 75)",
  },
  {
    background: "linear-gradient(140deg, oklch(0.6 0.14 350), oklch(0.46 0.12 330))",
    foreground: "oklch(0.98 0.01 350)",
  },
  {
    background: "linear-gradient(140deg, oklch(0.55 0.03 260), oklch(0.4 0.02 260))",
    foreground: "oklch(0.97 0.004 260)",
  },
  {
    background: "linear-gradient(140deg, oklch(0.62 0.12 140), oklch(0.46 0.1 120))",
    foreground: "oklch(0.98 0.01 140)",
  },
];

const STOP_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "&"]);

/** "Banco Aurora" → "BA"; "Cooperativa Horizonte de Crédito" → "CH"; "Nuvem" → "NU". */
export function getInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return "?";
  }

  const significant = words.filter(
    (word) => !STOP_WORDS.has(word.toLowerCase().replace(/[.!]/g, "")),
  );
  const source = significant.length > 0 ? significant : words;

  if (source.length === 1) {
    return source[0]!.slice(0, 2).toUpperCase();
  }

  return `${source[0]![0]}${source[1]![0]}`.toUpperCase();
}

export function institutionTone(name: string): InstitutionTone {
  let hash = 2166136261;

  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return TONES[Math.abs(hash) % TONES.length]!;
}

/** Hex (#rgb/#rrggbb) suficientemente claro pede texto escuro por contraste. */
export function isLightHexColor(value: string): boolean {
  const hex = value.trim().replace(/^#/, "");
  const expanded =
    hex.length === 3
      ? hex
          .split("")
          .map((char) => char + char)
          .join("")
      : hex;

  if (!/^[0-9a-f]{6}$/i.test(expanded)) {
    return false;
  }

  const red = Number.parseInt(expanded.slice(0, 2), 16) / 255;
  const green = Number.parseInt(expanded.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(expanded.slice(4, 6), 16) / 255;

  const toLinear = (channel: number) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

  const luminance = 0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue);

  return luminance > 0.55;
}
