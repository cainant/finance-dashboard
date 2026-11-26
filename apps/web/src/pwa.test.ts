import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const fromWeb = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const readPublic = (path: string) => readFileSync(fromWeb(`public/${path.replace(/^\//, "")}`));

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

const manifest = JSON.parse(readPublic("manifest.webmanifest").toString("utf8")) as {
  name?: string;
  short_name?: string;
  start_url?: string;
  scope?: string;
  display?: string;
  icons?: ManifestIcon[];
};

/** Largura e altura do chunk IHDR de um PNG (bytes 16–23). */
function pngSize(png: Buffer): string {
  expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
  return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
}

describe("manifest PWA", () => {
  it("tem os campos exigidos para instalar", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(["standalone", "fullscreen", "minimal-ui"]).toContain(manifest.display);
  });

  it("declara ícones de 192 e 512 e um maskable de 512", () => {
    const icons = manifest.icons ?? [];
    const has = (sizes: string, purpose: string) =>
      icons.some((icon) => icon.sizes === sizes && (icon.purpose ?? "any").includes(purpose));

    expect(has("192x192", "any")).toBe(true);
    expect(has("512x512", "any")).toBe(true);
    expect(has("512x512", "maskable")).toBe(true);
  });

  it("aponta só para PNGs que existem com o tamanho declarado", () => {
    for (const icon of manifest.icons ?? []) {
      expect(icon.type).toBe("image/png");
      expect(pngSize(readPublic(icon.src)), icon.src).toBe(icon.sizes);
    }
  });
});

describe("index.html", () => {
  const html = readFileSync(fromWeb("index.html"), "utf8");

  /** Atributos do primeiro <link> com o rel dado, independente da ordem. */
  function linkAttrs(rel: string): Record<string, string> {
    const tag = html.match(/<link\s[^>]*>/g)?.find((t) => t.includes(`rel="${rel}"`)) ?? "";
    return Object.fromEntries(
      [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1] ?? "", m[2] ?? ""]),
    );
  }

  it("referencia o manifest e o apple-touch-icon de 180x180 existente", () => {
    expect(linkAttrs("manifest").href).toBe("/manifest.webmanifest");

    const href = linkAttrs("apple-touch-icon").href;
    expect(href).toBeTruthy();
    expect(pngSize(readPublic(href ?? ""))).toBe("180x180");
  });

  it("estende a viewport até as áreas seguras (viewport-fit=cover)", () => {
    expect(html).toMatch(/name="viewport"[^>]*viewport-fit=cover/);
  });
});
