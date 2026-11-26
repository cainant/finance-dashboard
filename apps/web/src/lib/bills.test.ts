import type { Bill, BillStatus } from "@fd/contracts";
import { describe, expect, it } from "vitest";

import {
  billDueLabel,
  billStatusForDisplay,
  billStatusMeta,
  dueLabel,
  upcomingBillsEmptyCopy,
  UPCOMING_BILLS_WINDOW_DAYS,
} from "./bills";

describe("upcomingBillsEmptyCopy", () => {
  it("não pede para conectar um cartão quando já existe cartão conectado", () => {
    const copy = upcomingBillsEmptyCopy(true);

    expect(copy.description).not.toMatch(/conecte/i);
    expect(copy.description).toContain(`próximos ${UPCOMING_BILLS_WINDOW_DAYS} dias`);
    expect(copy.showConnect).toBe(false);
  });

  it("fica neutro enquanto os cartões carregam", () => {
    const copy = upcomingBillsEmptyCopy(null);

    expect(copy.description).not.toMatch(/conecte/i);
    expect(copy.showConnect).toBe(false);
  });

  it("oferece conectar quando nenhum cartão foi conectado", () => {
    const copy = upcomingBillsEmptyCopy(false);

    expect(copy.description).toMatch(/conecte um cartão/i);
    expect(copy.showConnect).toBe(true);
  });

  it("deriva a janela de `days`", () => {
    expect(upcomingBillsEmptyCopy(true, 45).description).toContain("próximos 45 dias");
  });
});

describe("dueLabel", () => {
  it("descreve vencimento passado, hoje e futuro", () => {
    expect(dueLabel(-2)).toBe("venceu há 2 dias");
    expect(dueLabel(0)).toBe("vence hoje");
    expect(dueLabel(1)).toBe("vence em 1 dia");
    expect(dueLabel(7)).toBe("vence em 7 dias");
  });
});

/** Data fixa de referência: os rótulos relativos precisam ser determinísticos. */
const TODAY = "2026-11-11";

function bill(status: BillStatus, dueDate: string, closingDate: string | null = null): Bill {
  return {
    id: `bill-${status}-${dueDate}`,
    accountId: "card-1",
    externalId: `ext-${status}-${dueDate}`,
    dueDate,
    closingDate,
    totalCents: 120_000,
    minimumPaymentCents: null,
    status,
  };
}

describe("billStatusForDisplay", () => {
  it("mantém os status correntes como estão", () => {
    expect(billStatusForDisplay(bill("open", "2026-11-20", "2026-11-14"), TODAY)).toEqual(
      billStatusMeta("open"),
    );
    expect(billStatusForDisplay(bill("overdue", "2026-11-06", "2026-10-30"), TODAY)).toEqual(
      billStatusMeta("overdue"),
    );
    expect(billStatusForDisplay(bill("paid", "2026-11-07", "2026-10-30"), TODAY)).toEqual(
      billStatusMeta("paid"),
    );
  });

  it("mostra 'Fechada' quando o fechamento passou e o vencimento ainda não", () => {
    expect(billStatusForDisplay(bill("closed", "2026-11-20", "2026-11-05"), TODAY)).toEqual(
      billStatusMeta("closed"),
    );
  });

  it("mostra 'Encerrada' neutra para fatura fechada com vencimento no passado", () => {
    const display = billStatusForDisplay(bill("closed", "2026-06-22", "2026-06-15"), TODAY);

    expect(display.label).toBe("Encerrada");
    expect(display.variant).toBe("secondary");
    expect(display.description).not.toContain("aguardando pagamento");
  });
});

describe("billDueLabel", () => {
  it("data a fatura paga em vez de dizer que venceu há dias", () => {
    expect(billDueLabel(bill("paid", "2026-11-07"), TODAY)).toBe("venceu em 07/11");
  });

  it("diz apenas 'paga' quando o pagamento veio antes do vencimento", () => {
    expect(billDueLabel(bill("paid", "2026-11-20"), TODAY)).toBe("paga");
  });

  it("mantém a contagem de dias para faturas em aberto e vencidas", () => {
    expect(billDueLabel(bill("open", "2026-11-11"), TODAY)).toBe("vence hoje");
    expect(billDueLabel(bill("open", "2026-11-14"), TODAY)).toBe("vence em 3 dias");
    expect(billDueLabel(bill("overdue", "2026-11-06"), TODAY)).toBe("venceu há 5 dias");
    expect(dueLabel(1)).toBe("vence em 1 dia");
  });

  it("data o histórico encerrado sem tom de atraso", () => {
    expect(billDueLabel(bill("closed", "2026-03-22", "2026-03-15"), TODAY)).toBe("venceu em 22/03");
  });
});
