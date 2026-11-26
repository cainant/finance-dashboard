import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { summarizeAccounts } from "@/lib/accounts";

import { AccountsSummaryCard } from "./accounts-summary";

const summary = summarizeAccounts(
  [
    {
      id: "a1",
      userId: "u1",
      connectionId: "c1",
      externalId: "ext-a1",
      type: "checking",
      subtype: null,
      name: "Conta",
      numberMasked: null,
      currency: "BRL",
      balanceCents: 100_000,
      availableCents: null,
      updatedAt: "2026-11-10T12:00:00.000Z",
    },
  ],
  [{ balanceCents: 854 }],
);

describe("AccountsSummaryCard", () => {
  it("explica que as posições de investimento não entram nos cards por instituição", () => {
    const html = renderToStaticMarkup(<AccountsSummaryCard summary={summary} />);

    expect(html).toContain("posições de investimento");
    expect(html).toContain("não entram nos cards por instituição");
    expect(html).toContain("8,54");
    expect(html).not.toContain("indisponíveis");
  });

  it("degrada só o resumo quando as posições não carregam", () => {
    const withoutPositions = summarizeAccounts([
      {
        id: "a1",
        userId: "u1",
        connectionId: "c1",
        externalId: "ext-a1",
        type: "checking",
        subtype: null,
        name: "Conta",
        numberMasked: null,
        currency: "BRL",
        balanceCents: 100_000,
        availableCents: null,
        updatedAt: "2026-11-10T12:00:00.000Z",
      },
    ]);
    const html = renderToStaticMarkup(
      <AccountsSummaryCard
        summary={withoutPositions}
        investmentsUnavailable
        onRetryInvestments={() => {}}
      />,
    );

    // O patrimônio continua visível, agora sem as posições, com aviso discreto.
    expect(html).toContain("1.000,00");
    expect(html).toContain("Posições de investimento indisponíveis");
    expect(html).toContain("Tentar de novo");
  });
});
