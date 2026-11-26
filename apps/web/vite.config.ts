import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from "vite";

const apiTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8787";

const securityHeadersPath = fileURLToPath(new URL("./public/_headers", import.meta.url));

/**
 * Lê a seção global (`/*`) de `public/_headers` e devolve nome → valor.
 * Esse arquivo é a fonte única dos headers: o Cloudflare Pages o consome no
 * deploy e o plugin abaixo replica os mesmos valores em dev/preview.
 */
function readSecurityHeaders(path = securityHeadersPath): Record<string, string> {
  const headers: Record<string, string> = {};
  let globalSection = false;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (!/^\s/.test(line)) {
      globalSection = trimmed === "/*";
      continue;
    }

    if (!globalSection) {
      continue;
    }

    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }

    headers[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }

  return headers;
}

const INLINE_SCRIPT_PATTERN = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

/** Hashes CSP (sha256) dos scripts inline que o Vite injeta apenas em dev. */
function collectInlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];

  for (const [, attributes = "", content = ""] of html.matchAll(INLINE_SCRIPT_PATTERN)) {
    if (/\bsrc\s*=/i.test(attributes) || !content.trim()) {
      continue;
    }

    const digest = createHash("sha256").update(content, "utf8").digest("base64");
    hashes.push(`'sha256-${digest}'`);
  }

  return hashes;
}

/** Acrescenta os hashes ao `script-src` da CSP lida de `_headers`. */
function addScriptHashes(contentSecurityPolicy: string, hashes: string[]): string {
  if (hashes.length === 0) {
    return contentSecurityPolicy;
  }

  return contentSecurityPolicy
    .split(";")
    .map((directive) => {
      const [name] = directive.trim().split(/\s+/);
      return name === "script-src" ? `${directive.trimEnd()} ${hashes.join(" ")}` : directive;
    })
    .join(";");
}

/**
 * Aplica os headers de `_headers` em dev e em preview.
 *
 * No dev, o React Refresh injeta um preamble inline no HTML; para manter
 * `script-src 'self'` sem `'unsafe-inline'`, o hash desse script é calculado
 * a cada HTML transformado e anexado à CSP no momento do writeHead.
 */
function applySecurityHeaders(
  server: ViteDevServer | PreviewServer,
  getDevScriptHashes?: () => string[],
) {
  const headers = readSecurityHeaders();
  const contentSecurityPolicy = headers["Content-Security-Policy"];

  server.middlewares.use((_request, response, next) => {
    for (const [name, value] of Object.entries(headers)) {
      response.setHeader(name, value);
    }

    if (getDevScriptHashes && contentSecurityPolicy) {
      const originalWriteHead = response.writeHead;
      response.writeHead = ((...args: Parameters<typeof originalWriteHead>) => {
        response.setHeader(
          "Content-Security-Policy",
          addScriptHashes(contentSecurityPolicy, getDevScriptHashes()),
        );
        return Reflect.apply(originalWriteHead, response, args);
      }) as typeof response.writeHead;
    }

    next();
  });
}

function securityHeadersPlugin(): Plugin {
  let devScriptHashes: string[] = [];

  return {
    name: "lumen:security-headers",
    apply: "serve",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        devScriptHashes = collectInlineScriptHashes(html);
        return html;
      },
    },
    configureServer(server) {
      applySecurityHeaders(server, () => devScriptHashes);
    },
    configurePreviewServer(server) {
      applySecurityHeaders(server);
    },
  };
}

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    securityHeadersPlugin(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
