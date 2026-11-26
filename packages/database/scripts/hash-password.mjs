#!/usr/bin/env node
/**
 * Gera hash de senha no formato usado pela API:
 *   pbkdf2$<iteracoes>$<saltB64>$<hashB64>
 *
 * Uso: node scripts/hash-password.mjs <senha> [iteracoes] [saltB64]
 *
 * Default: 100.000 iterações (teto aceito pelo workerd/Workers Free) e salt
 * aleatório de 16 bytes. Passe um salt fixo em base64 para reproduzir o hash
 * do seed local.
 */
import { webcrypto } from "node:crypto";

const DEFAULT_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

const [, , password, iterationsArg, saltArg] = process.argv;

if (!password) {
  console.error("Uso: node scripts/hash-password.mjs <senha> [iteracoes] [saltB64]");
  process.exit(1);
}

const iterations = iterationsArg === undefined ? DEFAULT_ITERATIONS : Number(iterationsArg);

if (!Number.isInteger(iterations) || iterations <= 0) {
  console.error("iteracoes deve ser um inteiro positivo");
  process.exit(1);
}

if (iterations > DEFAULT_ITERATIONS) {
  console.warn(
    `aviso: ${iterations} iterações excedem o teto de ${DEFAULT_ITERATIONS} do workerd em produção`,
  );
}

const salt =
  saltArg === undefined
    ? webcrypto.getRandomValues(new Uint8Array(SALT_BYTES))
    : new Uint8Array(Buffer.from(saltArg, "base64"));

if (salt.length === 0) {
  console.error("saltB64 inválido");
  process.exit(1);
}

const key = await webcrypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(password),
  "PBKDF2",
  false,
  ["deriveBits"],
);

const hash = await webcrypto.subtle.deriveBits(
  { name: "PBKDF2", hash: "SHA-256", salt, iterations },
  key,
  HASH_BITS,
);

console.log(
  `pbkdf2$${iterations}$${Buffer.from(salt).toString("base64")}$${Buffer.from(hash).toString("base64")}`,
);
