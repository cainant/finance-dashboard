/**
 * Gera os ícones PWA em `public/icons/` a partir da marca (o "L" branco sobre o azul do
 * favicon de `index.html`), renderizando SVG no Chromium do Playwright (já dependência do e2e).
 *
 * Uso: `pnpm --filter @fd/web icons` (os PNGs são commitados; rode só se a marca mudar).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const BLUE = "#0e6ee6";
const L_PATH = "M9 23V9h3.4v11.2H23V23H9Z";

/** Marca com cantos arredondados e fundo transparente (purpose "any"). */
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="${BLUE}"/><path d="${L_PATH}" fill="#fff"/></svg>`;

/**
 * Quadrado sem transparência e sem cantos (maskable e apple-touch-icon): o SO aplica a máscara.
 * O "L" ocupa 14/32 do lado, centrado: cabe com folga no círculo da zona segura (80% do ícone).
 */
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="${BLUE}"/><path d="${L_PATH}" fill="#fff"/></svg>`;

const icons = [
  { file: "icon-192.png", size: 192, svg: rounded, transparent: true },
  { file: "icon-512.png", size: 512, svg: rounded, transparent: true },
  { file: "icon-maskable-512.png", size: 512, svg: fullBleed, transparent: false },
  { file: "apple-touch-icon.png", size: 180, svg: fullBleed, transparent: false },
];

const outDir = fileURLToPath(new URL("../public/icons/", import.meta.url));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
try {
  for (const { file, size, svg, transparent } of icons) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    const png = await page.screenshot({ omitBackground: transparent, type: "png" });
    writeFileSync(`${outDir}${file}`, png);
    await page.close();
    console.log(`${file} ${size}x${size}${transparent ? "" : " (opaco)"}`);
  }
} finally {
  await browser.close();
}
