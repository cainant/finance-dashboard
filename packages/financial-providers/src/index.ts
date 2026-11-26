/**
 * @fd/financial-providers — contrato normalizado de providers financeiros.
 *
 * Pacote autocontido: tipos `Provider*` próprios, sem `@fd/contracts`, sem
 * Drizzle e sem APIs Node. Roda em Cloudflare Workers com `fetch`,
 * `AbortSignal`, `setTimeout` e Web APIs padrão.
 *
 * Ver `README.md` para uso e para o passo a passo de um novo provider.
 */
export * from "./types";
export * from "./categories";
export * from "./errors";
export type { KeyValueCache } from "./cache";
export * from "./bills";
export * from "./registry";
export * from "./demo";
export * from "./pluggy";
