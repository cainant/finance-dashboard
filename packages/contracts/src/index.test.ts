import { describe, expect, it } from "vitest";

import { API_PREFIX, apiRoutes } from "./index";

describe("@fd/contracts", () => {
  it("expõe o prefixo da API", () => {
    expect(API_PREFIX).toBe("/api");
  });
});

describe("apiRoutes", () => {
  it("usa o prefixo /api nas rotas públicas", () => {
    expect(apiRoutes.health).toBe("/api/health");
    expect(apiRoutes.auth.login).toBe("/api/auth/login");
    expect(apiRoutes.webhooks.pluggy).toBe("/api/webhooks/pluggy");
  });

  it("monta rotas com id e faz encode do parâmetro", () => {
    expect(apiRoutes.account("acc_1")).toBe("/api/accounts/acc_1");
    expect(apiRoutes.creditCardBills("acc_1")).toBe("/api/credit-cards/acc_1/bills");
    expect(apiRoutes.billTransactions("bill/1")).toBe("/api/bills/bill%2F1/transactions");
    expect(apiRoutes.connectionSyncRuns("conn 1")).toBe("/api/connections/conn%201/sync-runs");
  });

  it("cobre analytics, providers e settings", () => {
    expect(apiRoutes.analytics.cashflow).toBe("/api/analytics/cashflow");
    expect(apiRoutes.analytics.netWorth).toBe("/api/analytics/net-worth");
    expect(apiRoutes.providers).toBe("/api/providers");
    expect(apiRoutes.pluggyConnectToken).toBe("/api/providers/pluggy/connect-token");
    expect(apiRoutes.settings).toBe("/api/settings");
  });
});
