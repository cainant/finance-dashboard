import { describe, expect, it } from "vitest";

import {
  base64ToBytes,
  bytesToBase64,
  hashPassword,
  parsePasswordHash,
  timingSafeEqual,
  verifyPassword,
} from "../src/auth/password";

describe("PBKDF2 de senha", () => {
  it("usa exatamente 100.000 iterações (teto do workerd) e formato estável", async () => {
    const stored = await hashPassword("senha-super-segura");
    const parts = stored.split("$");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("pbkdf2");
    expect(parts[1]).toBe("100000");
    expect(parsePasswordHash(stored)?.iterations).toBe(100_000);

    await expect(verifyPassword("senha-super-segura", stored)).resolves.toBe(true);
    await expect(verifyPassword("senha-errada", stored)).resolves.toBe(false);
  });

  it("rejeita hash com iterações acima do teto ou inválidas", () => {
    expect(parsePasswordHash("pbkdf2$100001$c2FsdA==$aGFzaA==")).toBeNull();
    expect(parsePasswordHash("pbkdf2$0$c2FsdA==$aGFzaA==")).toBeNull();
    expect(parsePasswordHash("bcrypt$100000$c2FsdA==$aGFzaA==")).toBeNull();
    expect(parsePasswordHash(null)).toBeNull();
  });

  it("comparação em tempo constante considera tamanho e conteúdo", () => {
    const a = new Uint8Array([1, 2, 3]);
    expect(timingSafeEqual(a, new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqual(a, new Uint8Array([1, 2, 4]))).toBe(false);
    expect(timingSafeEqual(a, new Uint8Array([1, 2]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array(), new Uint8Array())).toBe(true);
  });

  it("base64 é reversível para bytes arbitrários", () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});
