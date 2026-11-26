/**
 * Hash de senha com PBKDF2-SHA256/WebCrypto.
 *
 * Formato: `pbkdf2$<iterações>$<saltB64>$<hashB64>`.
 * As iterações são fixas em 100.000: é o teto do workerd em produção
 * (`100_001` lança erro) e o custo (~40 ms CPU) é o motivo de o login por
 * senha existir apenas em desenvolvimento/teste.
 */
const ITERATIONS = 100_000;
const HASH = "SHA-256";
const SALT_BYTES = 16;
const KEY_BITS = 256;

/** Hash fixo usado para equalizar o tempo quando o e-mail não existe. */
const DUMMY_HASH =
  "pbkdf2$100000$rym1KmLHTiFMx+oUWGVxCg==$9W5BgFTu4tFjcSDdBkHnOENRI5Cm74TdXWecD9MbKEw=";

export interface ParsedPasswordHash {
  iterations: number;
  salt: Uint8Array;
  hash: Uint8Array;
}

export function parsePasswordHash(stored: string | null | undefined): ParsedPasswordHash | null {
  if (!stored) return null;
  const parts = stored.split("$");
  if (parts.length !== 4) return null;
  const [scheme, iterationsRaw, saltB64, hashB64] = parts;
  if (scheme !== "pbkdf2" || !iterationsRaw || !saltB64 || !hashB64) return null;

  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > ITERATIONS) return null;

  try {
    return {
      iterations,
      salt: base64ToBytes(saltB64),
      hash: base64ToBytes(hashB64),
    };
  } catch {
    return null;
  }
}

export async function hashPassword(password: string, salt?: Uint8Array): Promise<string> {
  const actualSalt = salt ?? crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derive(password, actualSalt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${bytesToBase64(actualSalt)}$${bytesToBase64(derived)}`;
}

export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  const parsed = parsePasswordHash(stored);
  if (!parsed) {
    await verifyDummy(password);
    return false;
  }

  const derived = await derive(password, parsed.salt, parsed.iterations);
  return timingSafeEqual(derived, parsed.hash);
}

async function verifyDummy(password: string): Promise<void> {
  const parsed = parsePasswordHash(DUMMY_HASH);
  if (!parsed) return;
  await derive(password, parsed.salt, parsed.iterations);
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: HASH, salt: salt as BufferSource, iterations },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** Comparação em tempo constante (comprimentos diferentes não vazam prefixo). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return diff === 0;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
