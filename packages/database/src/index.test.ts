import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import migrationSql from "../migrations/0000_init.sql?raw";
import categorySourceMigrationSql from "../migrations/0001_transaction_category_source.sql?raw";
import seedSql from "../seed.sql?raw";
import { createDb, schema } from "./index";

const expectedTables = [
  "users",
  "sessions",
  "institutions",
  "connections",
  "accounts",
  "credit_cards",
  "bills",
  "categories",
  "transactions",
  "balance_snapshots",
  "sync_runs",
  "investments",
  "settings",
  "login_attempts",
  "budget_groups",
  "budget_category_groups",
  "card_payment_plans",
] as const;

const expectedCategorySlugs = [
  "mercado",
  "restaurantes",
  "transporte",
  "moradia",
  "contas-e-servicos",
  "saude",
  "educacao",
  "lazer",
  "compras",
  "assinaturas",
  "viagem",
  "pets",
  "impostos-e-taxas",
  "transferencias",
  "salario",
  "freelance",
  "rendimentos",
  "pix-recebido",
  "outros",
] as const;

const expectedUniqueIndexes = [
  "users_email_unique",
  "users_github_login_unique",
  "institutions_provider_external_id_unique",
  "accounts_connection_external_id_unique",
  "bills_account_external_id_unique",
  "transactions_account_external_id_unique",
  "investments_connection_external_id_unique",
] as const;

const expectedIndexes = [
  "transactions_user_id_date_idx",
  "transactions_account_id_date_idx",
  "transactions_category_id_idx",
] as const;

const expectedForeignKeys = [
  "FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade",
  "FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade",
  "FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade",
  "FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE set null",
] as const;

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function bytesToBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

describe("@fd/database schema", () => {
  it("exporta todas as tabelas do domínio com o nome SQL esperado", () => {
    const tableNames = Object.values(schema)
      .map((table) => getTableName(table))
      .sort();

    expect(tableNames).toEqual([...expectedTables].sort());
  });

  it("exporta a factory createDb", () => {
    expect(createDb).toBeTypeOf("function");
  });
});

describe("migration 0000_init", () => {
  it.each(
    expectedTables.filter(
      (table) => !table.startsWith("budget_") && table !== "card_payment_plans",
    ),
  )("cria a tabela %s", (table) => {
    expect(migrationSql).toContain(`CREATE TABLE \`${table}\` (`);
  });

  it("cria as uniques e índices principais", () => {
    for (const indexName of [...expectedUniqueIndexes, ...expectedIndexes]) {
      expect(migrationSql).toContain(`INDEX \`${indexName}\``);
    }
  });

  it("usa ON DELETE nos relacionamentos", () => {
    for (const foreignKey of expectedForeignKeys) {
      expect(migrationSql).toContain(foreignKey);
    }
  });

  it("usa statement-breakpoint entre statements (compatível com wrangler d1)", () => {
    expect(migrationSql).toContain("--> statement-breakpoint");
  });
});

describe("migration 0001_transaction_category_source", () => {
  it("adiciona a coluna category_source com default provider", () => {
    expect(categorySourceMigrationSql).toContain("`category_source`");
    expect(categorySourceMigrationSql).toContain("DEFAULT 'provider'");
  });
});

describe("seed local", () => {
  it("cria o usuário demo", () => {
    expect(seedSql).toContain("'11111111-1111-4111-8111-111111111111'");
    expect(seedSql).toContain("'demo@finance.local'");
    expect(seedSql).toContain("'Demo'");
    expect(seedSql).toContain("INSERT OR IGNORE INTO users");
  });

  it("semeia as 19 categorias de sistema", () => {
    const categorySlugs = [...seedSql.matchAll(/'cat_([a-z0-9-]+)'/g)].map((match) => match[1]);

    expect(categorySlugs).toHaveLength(expectedCategorySlugs.length);
    expect(new Set(categorySlugs).size).toBe(expectedCategorySlugs.length);
    expect([...categorySlugs].sort()).toEqual([...expectedCategorySlugs].sort());
    expect(seedSql).toContain("INSERT OR IGNORE INTO categories");
  });

  it("tem hash PBKDF2 válido para a senha demo1234", async () => {
    const hashMatch = seedSql.match(/pbkdf2\$(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)/);

    expect(hashMatch).not.toBeNull();

    const [, iterationsRaw, saltB64, expectedHash] = hashMatch ?? [];

    expect(iterationsRaw).toBe("100000");
    expect(saltB64).toBeTypeOf("string");
    expect(expectedHash).toBeTypeOf("string");

    if (!iterationsRaw || !saltB64 || !expectedHash) {
      throw new Error("hash do seed em formato inesperado");
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("demo1234"),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const derived = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: base64ToBytes(saltB64),
        iterations: Number(iterationsRaw),
      },
      key,
      256,
    );

    expect(bytesToBase64(derived)).toBe(expectedHash);
  });
});
