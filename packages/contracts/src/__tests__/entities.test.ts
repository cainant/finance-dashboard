import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  accountSchema,
  billSchema,
  categorySchema,
  connectionSchema,
  creditCardSchema,
  institutionSchema,
  investmentSchema,
  settingsSchema,
  transactionSchema,
  userSchema,
} from "../index";

const timestamps = {
  createdAt: "2026-11-10T12:00:00.000Z",
  updatedAt: "2026-11-10T12:00:00.000Z",
};

const user = {
  id: "user_1",
  email: "demo@finance.local",
  name: "Demo",
  githubLogin: null,
  avatarUrl: null,
  createdAt: timestamps.createdAt,
};

const institution = {
  id: "inst_1",
  provider: "demo",
  externalId: "aurora",
  name: "Banco Aurora",
  logoUrl: null,
  primaryColor: "22c55e",
  type: "PERSONAL_BANK",
};

const accountSummary = {
  id: "acc_1",
  name: "Conta Corrente",
  numberMasked: "1234",
  currency: "BRL",
  balanceCents: 215_446,
  availableCents: null,
  provider: "demo",
  institutionName: "Banco Aurora",
  institutionLogoUrl: null,
};

describe("userSchema", () => {
  it("faz parse do usuário público", () => {
    expect(userSchema.parse(user)).toEqual(user);
  });

  it("nunca expõe password_hash (chaves desconhecidas são descartadas)", () => {
    const parsed = userSchema.parse({ ...user, passwordHash: "pbkdf2$..." });

    expect(parsed).not.toHaveProperty("passwordHash");
  });

  it("rejeita avatar que não é URL", () => {
    expect(userSchema.safeParse({ ...user, avatarUrl: "avatar.png" }).success).toBe(false);
  });
});

describe("institutionSchema", () => {
  it("aceita provider hex sem # e type livre", () => {
    expect(institutionSchema.parse(institution)).toEqual(institution);
  });

  it("rejeita provider desconhecido", () => {
    expect(institutionSchema.safeParse({ ...institution, provider: "belvo" }).success).toBe(false);
  });
});

describe("connectionSchema", () => {
  it("aceita conexão sem instituição (embed opcional)", () => {
    const connection = {
      id: "conn_1",
      provider: "pluggy",
      externalId: "item_1",
      institutionId: null,
      status: "syncing",
      statusDetail: null,
      lastSyncedAt: null,
      providerUpdatedAt: "2026-11-10T12:00:00.000Z",
      ...timestamps,
    };

    expect(connectionSchema.parse(connection)).toEqual(connection);
  });

  it("rejeita status desconhecido", () => {
    const result = connectionSchema.safeParse({
      id: "conn_1",
      provider: "pluggy",
      externalId: "item_1",
      institutionId: null,
      status: "expired",
      statusDetail: null,
      lastSyncedAt: null,
      ...timestamps,
    });

    expect(result.success).toBe(false);
  });
});

describe("accountSchema", () => {
  const account = {
    id: "acc_1",
    userId: "user_1",
    connectionId: "conn_1",
    externalId: "ext_acc_1",
    type: "checking",
    subtype: "CHECKING_ACCOUNT",
    name: "Conta Corrente",
    numberMasked: null,
    currency: "BRL",
    balanceCents: 215_446,
    availableCents: null,
    updatedAt: timestamps.updatedAt,
    provider: "demo",
  };

  it("faz parse de conta com centavos inteiros", () => {
    expect(accountSchema.parse(account)).toEqual(account);
  });

  it("rejeita dinheiro fracionado e tipo desconhecido", () => {
    expect(accountSchema.safeParse({ ...account, balanceCents: 12.5 }).success).toBe(false);
    expect(accountSchema.safeParse({ ...account, type: "crypto" }).success).toBe(false);
  });
});

describe("creditCardSchema", () => {
  it("aceita cartão com resumo de conta", () => {
    const card = {
      accountId: "acc_1",
      brand: "MASTERCARD",
      level: "BLACK",
      limitCents: 3_000_000,
      availableLimitCents: 2_500_000,
      closingDay: 7,
      dueDay: 15,
      account: accountSummary,
    };

    expect(creditCardSchema.parse(card)).toEqual(card);
  });

  it("rejeita dia de fechamento fora de 1-31", () => {
    const card = {
      accountId: "acc_1",
      brand: null,
      level: null,
      limitCents: null,
      availableLimitCents: null,
      closingDay: 32,
      dueDay: null,
      account: accountSummary,
    };

    expect(creditCardSchema.safeParse(card).success).toBe(false);
  });
});

describe("billSchema", () => {
  const bill = {
    id: "bill_1",
    accountId: "acc_card",
    externalId: "ext_bill_1",
    dueDate: "2026-11-15",
    closingDate: "2026-11-07",
    totalCents: 100_076,
    minimumPaymentCents: 30_000,
    status: "open",
  };

  it("aceita fatura válida", () => {
    expect(billSchema.parse(bill)).toEqual(bill);
  });

  it("rejeita status não derivado", () => {
    expect(billSchema.safeParse({ ...bill, status: "pending" }).success).toBe(false);
  });
});

describe("categorySchema", () => {
  const category = {
    id: "cat_mercado",
    userId: null,
    name: "Mercado",
    slug: "mercado",
    icon: "ShoppingCart",
    color: "#22c55e",
    kind: "expense",
    parentId: null,
  };

  it("aceita categoria de sistema (userId null)", () => {
    expect(categorySchema.parse(category)).toEqual(category);
  });

  it("rejeita cor sem #", () => {
    expect(categorySchema.safeParse({ ...category, color: "22c55e" }).success).toBe(false);
  });
});

describe("transactionSchema", () => {
  const transaction = {
    id: "tx_1",
    userId: "user_1",
    accountId: "acc_1",
    connectionId: "conn_1",
    externalId: "ext_tx_1",
    date: "2026-11-01",
    description: "NETFLIX.COM",
    amountCents: -5_590,
    currency: "BRL",
    type: "expense",
    categoryId: "cat_assinaturas",
    status: "posted",
    billId: null,
    merchant: "Netflix",
    notes: null,
    installmentNumber: null,
    totalInstallments: null,
    budgetGroupId: null,
    ...timestamps,
  };

  it("preserva o sinal de amountCents", () => {
    const parsed = transactionSchema.parse(transaction);

    expect(parsed.amountCents).toBe(-5_590);
    expect(parsed.type).toBe("expense");
  });

  it("aceita embeds opcionais de categoria e conta", () => {
    const parsed = transactionSchema.parse({
      ...transaction,
      category: {
        id: "cat_assinaturas",
        userId: null,
        name: "Assinaturas",
        slug: "assinaturas",
        icon: "Repeat",
        color: "#a855f7",
        kind: "expense",
        parentId: null,
      },
      account: accountSummary,
    });

    expect(parsed.category?.name).toBe("Assinaturas");
    expect(parsed.account?.id).toBe("acc_1");
  });

  it("rejeita centavos fracionados e status inválido", () => {
    expect(transactionSchema.safeParse({ ...transaction, amountCents: -55.9 }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...transaction, status: "canceled" }).success).toBe(false);
  });
});

describe("investmentSchema", () => {
  it("aceita investimento com amountProfitCents nulo", () => {
    const investment = {
      id: "inv_1",
      userId: "user_1",
      connectionId: "conn_1",
      externalId: "ext_inv_1",
      type: "fixed_income",
      name: "CDB 110% CDI",
      balanceCents: 200_000,
      amountProfitCents: null,
      currency: "BRL",
      updatedAt: timestamps.updatedAt,
      provider: "pluggy",
      institution,
    };

    expect(investmentSchema.parse(investment)).toEqual(investment);
  });

  it("rejeita tipo desconhecido", () => {
    const result = investmentSchema.safeParse({
      id: "inv_1",
      userId: "user_1",
      connectionId: "conn_1",
      externalId: "ext_inv_1",
      type: "crypto",
      name: "BTC",
      balanceCents: 100,
      amountProfitCents: null,
      currency: "BRL",
      updatedAt: timestamps.updatedAt,
    });

    expect(result.success).toBe(false);
  });
});

describe("settingsSchema", () => {
  it("faz parse dos defaults", () => {
    expect(settingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it("rejeita tema inválido", () => {
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, theme: "blue" }).success).toBe(false);
  });
});
