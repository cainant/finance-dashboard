/**
 * Imports `?raw` do Vite/Vitest para arquivos SQL (migrations e seed).
 */
declare module "*.sql?raw" {
  const content: string;
  export default content;
}
