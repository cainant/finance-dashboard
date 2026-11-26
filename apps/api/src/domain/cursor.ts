import type { TransactionSort } from "@fd/contracts";

export interface TransactionCursor {
  v: 1;
  sort: TransactionSort;
  id: string;
  /** Data para sorts por data. */
  date?: string;
  /** Valor em centavos para sorts por valor. */
  amount?: number;
}

export function encodeCursor(payload: TransactionCursor): string {
  const json = JSON.stringify(payload);
  let binary = "";
  for (const byte of new TextEncoder().encode(json)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeCursor(value: string | undefined): TransactionCursor | null {
  if (!value) return null;
  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const cursor = parsed as Partial<TransactionCursor>;
    if (cursor.v !== 1 || typeof cursor.id !== "string" || !cursor.sort) return null;
    if (cursor.date !== undefined && typeof cursor.date !== "string") return null;
    if (cursor.amount !== undefined && typeof cursor.amount !== "number") return null;
    return cursor as TransactionCursor;
  } catch {
    return null;
  }
}
