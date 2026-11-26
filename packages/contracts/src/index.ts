/**
 * @fd/contracts — fonte única dos contratos da API (Zod 4 + tipos TS).
 *
 * Convenções (ver docs/architecture.md):
 * - dinheiro sempre inteiro em centavos (`amountCents` / `*Cents`);
 * - datas civis `YYYY-MM-DD`, timestamps ISO 8601 em UTC (`...Z`);
 * - `amountCents` positivo = entrada, negativo = saída;
 * - schemas de entidade usam sufixo `Schema`, bodies `Body`, respostas
 *   `Response`, queries `Query`; os tipos são o `z.infer` correspondente.
 *
 * Organização:
 * - `common`   — dinheiro, datas, paginação, envelope de erro;
 * - `enums`    — enums de domínio e seus tipos;
 * - `entities` — DTOs por entidade;
 * - `queries`  — validação de query string (período, filtros, paginação);
 * - `bodies`   — corpos de requisição;
 * - `responses`— respostas agregadas e listas;
 * - `routes`   — mapa tipado de rotas.
 */
export * from "./common";
export * from "./enums";

export * from "./entities/account";
export * from "./entities/bill";
export * from "./entities/budget";
export * from "./entities/card-reserve";
export * from "./entities/category";
export * from "./entities/connection";
export * from "./entities/credit-card";
export * from "./entities/institution";
export * from "./entities/investment";
export * from "./entities/settings";
export * from "./entities/sync-run";
export * from "./entities/transaction";
export * from "./entities/user";

export * from "./queries";
export * from "./bodies";
export * from "./responses";
export * from "./routes";
