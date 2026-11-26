/**
 * Cache chave/valor mínimo, compatível com Cloudflare KV.
 *
 * O KV do Workers Free aceita ~1.000 escritas/dia, então ele é usado apenas
 * para cache de leitura (ex.: apiKey do Pluggy). Implementações devem tratar
 * falhas como cache miss — o provider continua funcionando sem cache.
 *
 * `ttlSeconds` é obrigatório em `put` para deixar explícito que nenhum valor
 * sensível deve ficar indefinidamente no cache.
 *
 * Adapter para KV:
 * ```ts
 * const cache: KeyValueCache = {
 *   get: (key) => env.CACHE.get(key),
 *   put: (key, value, ttlSeconds) => env.CACHE.put(key, value, { expirationTtl: ttlSeconds }),
 *   delete: (key) => env.CACHE.delete(key),
 * };
 * ```
 */
export interface KeyValueCache {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ttlSeconds: number): Promise<void>;
  /**
   * Opcional. Usado para descartar uma apiKey que o provider rejeitou (401).
   * Implementações devem ser best-effort; falha não deve quebrar o request.
   */
  delete?(key: string): Promise<void>;
}
