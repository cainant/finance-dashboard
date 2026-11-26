import { describe, expect, it } from "vitest";

import {
  bankNameFromAccountName,
  bankNameFromCompe,
  deriveMeuPluggyInstitutionName,
  inferCategoryFromDescription,
  mapPluggyAccount,
  mapPluggyAccountType,
  mapPluggyBill,
  mapPluggyCategory,
  mapPluggyConnectorToInstitution,
  mapPluggyCreditCard,
  mapPluggyInvestment,
  mapPluggyInvestmentType,
  mapPluggyItemStatus,
  mapPluggyItemToConnection,
  mapPluggyTransaction,
  resolveMeuPluggyInstitutionNames,
  toSaoPauloDate,
  KNOWN_ACCOUNT_BANK_NAMES,
  type PluggyItem,
  type PluggyTransaction,
  type ProviderCategoryHint,
} from "../src";
import accountsFixture from "./fixtures/pluggy/accounts.json";
import interGoldFixture from "./fixtures/pluggy/accounts-meupluggy-inter-gold.json";
import nubankPlatinumFixture from "./fixtures/pluggy/accounts-meupluggy-nubank-platinum.json";
import billsFixture from "./fixtures/pluggy/bills.json";
import investmentsFixture from "./fixtures/pluggy/investments.json";
import itemLoginError from "./fixtures/pluggy/item-login-error.json";
import itemPartial from "./fixtures/pluggy/item-partial.json";
import itemSuccess from "./fixtures/pluggy/item-success.json";
import itemWaitingInput from "./fixtures/pluggy/item-waiting-input.json";
import page1 from "./fixtures/pluggy/transactions-page-1.json";
import page2 from "./fixtures/pluggy/transactions-page-2.json";

const BANK_ACCOUNT_ID = "b1a2c3d4-0001-4a5b-8c9d-000000000001";
const CARD_ACCOUNT_ID = "b1a2c3d4-0002-4a5b-8c9d-000000000002";
const BANK_ACCOUNT = accountsFixture.results[0]!;
const CARD_ACCOUNT = accountsFixture.results[1]!;
const TODAY = "2026-11-10";

describe("mappers Pluggy — item/conexão", () => {
  it("mapeia UPDATED/SUCCESS para active com instituição normalizada", () => {
    const connection = mapPluggyItemToConnection(itemSuccess);

    expect(connection).toMatchObject({
      externalId: "item-sandbox-001",
      provider: "pluggy",
      status: "active",
      institution: {
        externalId: "1",
        name: "Pluggy Bank",
        logoUrl: "https://cdn.example.test/pluggy-bank.png",
        primaryColor: "#ef294b",
        type: "bank",
      },
      lastSyncedAt: "2026-11-10T12:00:05.000Z",
      consentExpiresAt: "2027-11-10T12:00:00.000Z",
    });
    expect(connection.statusDetail).toBeUndefined();
  });

  it("mapeia PARTIAL_SUCCESS para active com statusDetail", () => {
    const connection = mapPluggyItemToConnection(itemPartial);
    expect(connection.status).toBe("active");
    expect(connection.statusDetail).toBe("PARTIAL_SUCCESS");
  });

  it("mapeia LOGIN_ERROR/INVALID_CREDENTIALS para login_required", () => {
    const connection = mapPluggyItemToConnection(itemLoginError);
    expect(connection.status).toBe("login_required");
    expect(connection.statusDetail).toBe("INVALID_CREDENTIALS");
  });

  it("mapeia WAITING_USER_INPUT para login_required", () => {
    expect(mapPluggyItemToConnection(itemWaitingInput).status).toBe("login_required");
  });

  it.each([
    ["UPDATING", "TRANSACTIONS_IN_PROGRESS", "syncing"],
    ["UPDATED", "LOGIN_IN_PROGRESS", "syncing"],
    ["UPDATED", "SUCCESS", "active"],
    ["UPDATED", "PARTIAL_SUCCESS", "active"],
    ["UPDATED", "ERROR", "error"],
    ["UPDATED", "MERGE_ERROR", "error"],
    ["UPDATED", "SITE_NOT_AVAILABLE", "error"],
    ["UPDATED", "CONNECTION_ERROR", "error"],
    ["UPDATED", "INVALID_CREDENTIALS", "login_required"],
    ["UPDATED", "ACCOUNT_LOCKED", "login_required"],
    ["UPDATED", "USER_AUTHORIZATION_REVOKED", "login_required"],
    ["WAITING_USER_INPUT", "WAITING_USER_INPUT", "login_required"],
    ["LOGIN_ERROR", "SUCCESS", "login_required"],
    ["OUTDATED", "SUCCESS", "outdated"],
    ["UPDATED", null, "active"],
    ["DESCONHECIDO", "DESCONHECIDO", "error"],
  ])("mapeia %s + %s -> %s", (status, executionStatus, expected) => {
    const item: PluggyItem = {
      id: "item-x",
      status,
      executionStatus,
    };
    expect(mapPluggyItemStatus(item).status).toBe(expected);
  });

  it("tolerará item sem connector", () => {
    const institution = mapPluggyConnectorToInstitution(null);
    expect(institution).toEqual({ externalId: "unknown", name: "Instituição", type: "other" });
  });
});

describe("mappers Pluggy — conta/cartão", () => {
  it("mapeia conta corrente em centavos", () => {
    const account = mapPluggyAccount(BANK_ACCOUNT);

    expect(account).toMatchObject({
      externalId: BANK_ACCOUNT_ID,
      connectionExternalId: "item-sandbox-001",
      type: "checking",
      subtype: "CHECKING_ACCOUNT",
      name: "Conta Corrente",
      numberMasked: "0001/12345-0",
      currency: "BRL",
      balanceCents: 2_154_460,
      availableCents: null,
    });
  });

  it("mapeia cartão com limite disponível e dia de fechamento/vencimento", () => {
    const account = mapPluggyAccount(CARD_ACCOUNT);
    const card = mapPluggyCreditCard(CARD_ACCOUNT);

    expect(account).toMatchObject({
      type: "credit_card",
      balanceCents: 245_075,
      availableCents: 1_254_925,
    });
    expect(card).toMatchObject({
      accountExternalId: CARD_ACCOUNT_ID,
      brand: "MASTERCARD",
      level: "BLACK",
      limitCents: 1_500_000,
      availableLimitCents: 1_254_925,
      closingDay: 5,
      dueDay: 12,
      currency: "BRL",
    });
  });

  it("deriva a instituição da conta pelo COMPE e pelo nome do cartão", () => {
    expect(bankNameFromCompe("341/0001/12345-0")).toBe("Itaú");
    expect(bankNameFromCompe("260 / 0001 / 12345-6")).toBe("Nubank");
    expect(bankNameFromCompe("999/0001/12345-0")).toBeNull();
    expect(bankNameFromCompe(null)).toBeNull();
    expect(bankNameFromAccountName("Itau Uniclass 2.0 Mastercard Platinum")).toBe("Itaú");
    expect(bankNameFromAccountName("Conta Corrente")).toBeNull();

    expect(
      deriveMeuPluggyInstitutionName({
        ...BANK_ACCOUNT,
        bankData: { ...BANK_ACCOUNT.bankData, transferNumber: "237/0001/12345-0" },
      }),
    ).toBe("Bradesco");
    expect(mapPluggyAccount(BANK_ACCOUNT, { institutionName: "Itaú" })).toMatchObject({
      institutionName: "Itaú",
    });
  });

  it.each([
    ["BANK", "CHECKING_ACCOUNT", "checking"],
    ["BANK", "SAVINGS_ACCOUNT", "savings"],
    ["CREDIT", "CREDIT_CARD", "credit_card"],
    ["BANK", "PAYMENT_ACCOUNT", "checking"],
    ["INVESTMENT", "CDB", "investment"],
    ["OUTRO", "OUTRO", "other"],
  ])("mapeia tipo %s/%s -> %s", (type, subtype, expected) => {
    expect(mapPluggyAccountType(type, subtype)).toBe(expected);
  });
});

describe("mappers Pluggy — instituição por item", () => {
  it.each([
    ["Banco Inter", interGoldFixture],
    ["Nubank", nubankPlatinumFixture],
  ])("herda %s para o cartão sem COMPE e com nome genérico", (bank, fixture) => {
    const institutionNames = resolveMeuPluggyInstitutionNames(fixture.results);

    expect(institutionNames.at(-1)).toBe(bank);
    expect(institutionNames.slice(0, -1).every((name) => name === bank)).toBe(true);
  });

  it("devolve null quando o item só tem o cartão", () => {
    const onlyCard = nubankPlatinumFixture.results[1]!;

    expect(resolveMeuPluggyInstitutionNames([onlyCard])).toEqual([null]);
  });

  it("não herda banco no item Pluggy Bank (COMPE e nome sem banco)", () => {
    // `accounts.json` é o item do conector sandbox Pluggy Bank: o COMPE 123 não
    // está no mapa e o cartão "Cartão de Crédito" não cita banco.
    expect(resolveMeuPluggyInstitutionNames(accountsFixture.results)).toEqual([null, null]);
  });

  it("mantém null quando o item mistura duas instituições distintas", () => {
    const interChecking = interGoldFixture.results[0]!;
    const nubankChecking = nubankPlatinumFixture.results[0]!;
    const interCard = interGoldFixture.results[2]!;

    expect(resolveMeuPluggyInstitutionNames([interChecking, nubankChecking, interCard])).toEqual([
      "Banco Inter",
      "Nubank",
      null,
    ]);
  });

  it("mantém a instituição derivada do nome do cartão mesmo com item misto", () => {
    const interChecking = interGoldFixture.results[0]!;
    const nubankCard = {
      ...nubankPlatinumFixture.results[1]!,
      name: "Nubank Platinum",
      marketingName: "Nubank Platinum",
    };

    expect(resolveMeuPluggyInstitutionNames([interChecking, nubankCard])).toEqual([
      "Banco Inter",
      "Nubank",
    ]);
  });
});

describe("mappers Pluggy — transações", () => {
  it("usa o type para o sinal: conta corrente", () => {
    const debit = mapPluggyTransaction(page1.results[0]!, {
      accountExternalId: BANK_ACCOUNT_ID,
      accountType: "BANK",
    });
    const credit = mapPluggyTransaction(page1.results[1]!, {
      accountExternalId: BANK_ACCOUNT_ID,
      accountType: "BANK",
    });

    expect(debit).toMatchObject({
      amountCents: -5_590,
      type: "expense",
      status: "posted",
      categoryHint: "assinaturas",
      description: "NETFLIX.COM",
      date: "2026-11-04",
      merchant: "Netflix",
    });
    expect(credit).toMatchObject({
      amountCents: 850_000,
      type: "income",
      categoryHint: "salario",
      date: "2026-11-05",
    });
  });

  it("no cartão, amount positivo + DEBIT é despesa (não use Math.sign)", () => {
    const purchase = mapPluggyTransaction(page1.results[2]!, {
      accountExternalId: CARD_ACCOUNT_ID,
      accountType: "CREDIT",
    });

    expect(purchase).toMatchObject({
      amountCents: -33_540,
      type: "expense",
      categoryHint: "compras",
      billExternalId: "bill-credit-2026-10",
      installmentNumber: 2,
      totalInstallments: 6,
      date: "2026-11-03",
    });
  });

  it("no cartão, CREDIT é pagamento/estorno (transferência detectada)", () => {
    const payment = mapPluggyTransaction(page1.results[3]!, {
      accountExternalId: CARD_ACCOUNT_ID,
      accountType: "CREDIT",
    });

    expect(payment).toMatchObject({
      amountCents: 245_075,
      type: "transfer",
      status: "posted",
      categoryHint: "transferencias",
      date: "2026-11-02",
    });

    const withoutDetection = mapPluggyTransaction(page1.results[3]!, {
      accountExternalId: CARD_ACCOUNT_ID,
      accountType: "CREDIT",
      detectTransfers: false,
    });
    // Pagamento de fatura é reconhecido pelo sinal forte (descrição/categoria),
    // independentemente da heurística genérica de transferência.
    expect(withoutDetection.type).toBe("transfer");
  });

  it("mapeia pendentes e o sinal do cartão na segunda página", () => {
    const uber = mapPluggyTransaction(page2.results[0]!, {
      accountExternalId: BANK_ACCOUNT_ID,
      accountType: "BANK",
    });
    const pharmacy = mapPluggyTransaction(page2.results[1]!, {
      accountExternalId: CARD_ACCOUNT_ID,
      accountType: "CREDIT",
    });

    expect(uber).toMatchObject({
      amountCents: -3_290,
      status: "pending",
      categoryHint: "transporte",
      date: "2026-11-09",
    });
    expect(pharmacy).toMatchObject({
      amountCents: -8_990,
      status: "pending",
      categoryHint: "saude",
      installmentNumber: 1,
      totalInstallments: 1,
    });
  });

  it("cai para o sinal bruto quando o fornecedor omite type", () => {
    const base: PluggyTransaction = {
      id: "tx-sem-type",
      description: "COMPRA",
      amount: 10,
      date: "2026-11-10T12:00:00.000Z",
      accountId: CARD_ACCOUNT_ID,
    };

    // Sem convenção/pagamento explícito, o default seguro é compra (despesa).
    expect(mapPluggyTransaction(base, { accountType: "CREDIT" }).amountCents).toBe(-1_000);
    expect(
      mapPluggyTransaction(
        { ...base, amount: -10 },
        { accountType: "CREDIT", amountSignConvention: "purchase_negative" },
      ).amountCents,
    ).toBe(-1_000);
    expect(mapPluggyTransaction(base, { accountType: "BANK" }).amountCents).toBe(1_000);
    expect(
      mapPluggyTransaction({ ...base, amount: -10 }, { accountType: "BANK" }).amountCents,
    ).toBe(-1_000);
  });

  it("converte timestamp UTC para America/Sao_Paulo antes de truncar", () => {
    expect(toSaoPauloDate("2026-11-05T02:59:00.000Z")).toBe("2026-11-04");
    expect(toSaoPauloDate("2026-11-05T03:00:00.000Z")).toBe("2026-11-05");
    expect(toSaoPauloDate("2026-11-05")).toBe("2026-11-05");
  });

  it("valida campos obrigatórios e valores", () => {
    const invalidAmount = {
      id: "tx-invalida",
      description: "X",
      amount: Number.NaN,
      date: "2026-11-10T12:00:00.000Z",
      accountId: BANK_ACCOUNT_ID,
    } as PluggyTransaction;

    expect(() => mapPluggyTransaction(invalidAmount)).toThrowError(
      expect.objectContaining({ code: "invalid_response" }),
    );
    expect(() => mapPluggyTransaction({ ...invalidAmount, amount: 1, id: "" })).toThrowError(
      expect.objectContaining({ code: "invalid_response" }),
    );
    expect(() => mapPluggyTransaction({ ...invalidAmount, amount: 1, date: "" })).toThrowError(
      expect.objectContaining({ code: "invalid_response" }),
    );
  });
});

describe("mappers Pluggy — movimentação entre contas próprias", () => {
  const bankTx = (description: string, amount: number): PluggyTransaction => ({
    id: "tx-interna",
    description,
    amount,
    date: "2026-11-10T12:00:00.000Z",
    accountId: BANK_ACCOUNT_ID,
  });
  const options = { accountExternalId: BANK_ACCOUNT_ID, accountType: "BANK" as const };
  const HOLDER = ["Ana Souza"];

  it("transferência creditada do titular é transfer, não receita", () => {
    // Crédito entre contas da mesma pessoa: inflava RECEITAS na Visão geral.
    const credit = mapPluggyTransaction(
      bankTx("Transferência Recebida|ANA SOUZA E SILVA", 4700.0),
      {
        ...options,
        holderNames: HOLDER,
      },
    );
    const debit = mapPluggyTransaction(bankTx("Pix enviado  - Ana Souza E Silva", -4700.0), {
      ...options,
      holderNames: HOLDER,
    });

    expect(credit).toMatchObject({ amountCents: 470_000, type: "transfer" });
    expect(debit).toMatchObject({ amountCents: -470_000, type: "transfer" });
  });

  it("sem o nome do titular (provider puro) mantém o sinal da conta corrente", () => {
    expect(
      mapPluggyTransaction(bankTx("Transferência Recebida|ANA SOUZA E SILVA", 4700.0), {
        ...options,
        holderNames: [],
      }).type,
    ).toBe("income");
  });

  it("pix de terceiro continua receita/despesa", () => {
    expect(
      mapPluggyTransaction(bankTx("Pix recebido - Diego Furlan", 50), {
        ...options,
        holderNames: HOLDER,
      }).type,
    ).toBe("income");
    expect(
      mapPluggyTransaction(bankTx("Pix enviado  - 99 Food Ltda", -47.37), {
        ...options,
        holderNames: HOLDER,
      }).type,
    ).toBe("expense");
  });

  it("pagamento de fatura no cartão segue transfer (não vira receita)", () => {
    const payment = mapPluggyTransaction(
      { ...bankTx("Pagamento recebido", 4500.0), accountId: CARD_ACCOUNT_ID },
      { accountExternalId: CARD_ACCOUNT_ID, accountType: "CREDIT" },
    );
    expect(payment).toMatchObject({ amountCents: 450_000, type: "transfer" });
  });
});

describe("mappers Pluggy — categoria", () => {
  it("mapeia a tabela de categorias (pt/en) e não inventa para desconhecidas", () => {
    expect(mapPluggyCategory("Supermarket")).toBe("mercado");
    expect(mapPluggyCategory("Salário")).toBe("salario");
    expect(mapPluggyCategory("Video Streaming")).toBe("assinaturas");
    expect(mapPluggyCategory("Eletrônicos")).toBe("compras");
    expect(mapPluggyCategory("Categoria Inventada")).toBeNull();
    expect(mapPluggyCategory(null, "Restaurante")).toBe("restaurantes");
  });

  it("cai para heurística de descrição quando não há categoria", () => {
    expect(inferCategoryFromDescription("PIX RECEBIDO - MARIA")).toBe("pix-recebido");
    expect(inferCategoryFromDescription("SUPERMERCADO BOM PRECO")).toBe("mercado");
    expect(inferCategoryFromDescription("UBER *TRIP")).toBe("transporte");
    expect(inferCategoryFromDescription("PAGAMENTO FATURA CARTAO")).toBe("transferencias");
    expect(inferCategoryFromDescription("TRANSFERENCIA ENTRE CONTAS")).toBe("transferencias");
    expect(inferCategoryFromDescription("DESPESA MISTERIOSA")).toBe("outros");
  });
});

describe("mappers Pluggy — categorização de descrições reais", () => {
  // Descrições como o Pluggy/MeuPluggy entrega em produção, com prefixo de
  // adquirente ("Dl*", "Dl *", "Mp *") e ruído de pontuação. Sem sinal
  // conhecido (`inferCategoryFromDescription` isolado).
  const descriptionCases: readonly [string, ProviderCategoryHint][] = [
    // Casos reais de produção que motivaram o PR.
    ["UBER UBER TRIP HELP.U SAO PAULO BRA", "transporte"],
    ["Uber Uber *Trip Help.U", "transporte"],
    ["Dl *Uberrides", "transporte"],
    ["Dl*Uberrides", "transporte"],
    ["UBERRIDES", "transporte"],
    ["99 SAO PAULO BRA", "transporte"],
    ["DL*99APP", "transporte"],
    ["Dl *99 TECNOLOGIA", "transporte"],
    ["Mp *Spotify", "assinaturas"],
    ["Spotify BR", "assinaturas"],
    // Uber Eats é comida, não corrida.
    ["UBER Eats *PEDIDO", "restaurantes"],
    ["99 FOOD CENTRO", "restaurantes"],
    // 99 só no início: número no meio ou fim de descrição não é a marca.
    ["PADARIA 99", "mercado"],
    ["MERCADO 99 SAO PAULO", "mercado"],
    ["PARC 03/99", "outros"],
    ["PAG*99", "outros"],
    // Assinatura só com o sufixo Plus; o resto é nome comum.
    ["Disney World Orlando", "outros"],
    ["Paramount Hotel", "viagem"],
    ["HBOARTE LOJA", "compras"],
  ];

  it.each(descriptionCases)("%s → %s", (description, expected) => {
    expect(inferCategoryFromDescription(description)).toBe(expected);
  });

  // Precedência real, com a categoria que o Pluggy manda e o sinal da
  // transação: é aqui que o bug do item 1 aparecia.
  const mapperCases: readonly [string, string | null, number, ProviderCategoryHint][] = [
    // Marca vence categoria genérica do Pluggy, só em despesa.
    ["Spotify", "Utilities", -19.9, "assinaturas"],
    ["Dl*Spotify", "Telecom", -19.9, "assinaturas"],
    ["99 SAO PAULO BRA", "Telecom", -24.9, "transporte"],
    ["Dl*Uberrides", "Telecom", -18.5, "transporte"],
    ["Compra Netflix PIX", "Entertainment", -55.9, "assinaturas"],
    // Categoria do Pluggy vence descrição fraca (PIX/TED/DOC soltos).
    ["PIX ENVIADO PADARIA DO ZE", "Food", -42, "restaurantes"],
    ["Pix Mercado Livre", "Shopping", -120, "compras"],
    ["DOC DROGARIA", "Health", -25, "saude"],
    // Entrada só quando o sinal é de entrada.
    ["SALARIO - EMPRESA EXEMPLO", "Salary", 8_500, "salario"],
    ["Juros e encargos", null, -12, "outros"],
    ["JUROS ROTATIVO FATURA", null, -50, "outros"],
    ["LOJA DO SALARIO", null, -30, "compras"],
    ["TAXA SALARIO", null, -8, "impostos-taxas"],
    // Estorno de assinatura é entrada, não assinatura.
    ["ESTORNO NETFLIX", null, 55.9, "outros"],
    // Disney/Paramount sem Plus não são assinatura; o Pluggy decide.
    ["Disney World Orlando", "Travel", -900, "viagem"],
    ["Paramount Hotel", "Travel", -400, "viagem"],
    // Transferência inequívoca vence a categoria do Pluggy.
    ["PIX RECEBIDO - UBER", "Transfer", 100, "pix-recebido"],
    ["PAGAMENTO FATURA CARTAO", null, 2_450.75, "transferencias"],
    // Repasse de motorista não vira corrida.
    ["PIX RECEBIDO - UBER", null, 150, "pix-recebido"],
  ];

  it.each(mapperCases)(
    "Pluggy %s (%s) com sinal %d → %s",
    (description, category, amount, expected) => {
      const transaction = {
        id: `tx-${description}-${amount}`,
        description,
        amount,
        date: "2026-11-10T12:00:00.000Z",
        accountId: BANK_ACCOUNT_ID,
        category,
      } as PluggyTransaction;

      expect(
        mapPluggyTransaction(transaction, {
          accountExternalId: BANK_ACCOUNT_ID,
          accountType: "BANK",
        }).categoryHint,
      ).toBe(expected);
    },
  );

  it("categoria do Pluggy continua vencendo quando não há marca conhecida", () => {
    const transaction: PluggyTransaction = {
      id: "tx-sem-marca",
      description: "PADARIA DO ZE",
      amount: -12,
      date: "2026-11-10T12:00:00.000Z",
      accountId: BANK_ACCOUNT_ID,
      category: "Utilities",
    };

    expect(
      mapPluggyTransaction(transaction, {
        accountExternalId: BANK_ACCOUNT_ID,
        accountType: "BANK",
      }).categoryHint,
    ).toBe("contas-servicos");
  });

  it("não confunde nomes que apenas começam com 99/UBER", () => {
    // Uberaba é cidade; 1999 é um número. Nenhum dos dois é a marca.
    expect(inferCategoryFromDescription("UBERABA PADARIA")).toBe("mercado");
    expect(inferCategoryFromDescription("1999 LOJA")).toBe("compras");
  });
});

describe("mappers Pluggy — faturas", () => {
  it("deriva paid e closed/overdue/open a partir de pagamentos e datas", () => {
    const paid = mapPluggyBill(billsFixture.results[0]!, {
      accountExternalId: CARD_ACCOUNT_ID,
      today: TODAY,
    });
    expect(paid).toMatchObject({
      externalId: "bill-credit-2026-09",
      dueDate: "2026-10-12",
      closingDate: "2026-10-05",
      totalCents: 245_075,
      minimumPaymentCents: 24_508,
      currency: "BRL",
      status: "paid",
    });

    const openBill = billsFixture.results[1]!;
    expect(
      mapPluggyBill(openBill, { accountExternalId: CARD_ACCOUNT_ID, today: "2026-11-04" }).status,
    ).toBe("open");
    expect(
      mapPluggyBill(openBill, { accountExternalId: CARD_ACCOUNT_ID, today: TODAY }).status,
    ).toBe("closed");
    expect(
      mapPluggyBill(openBill, { accountExternalId: CARD_ACCOUNT_ID, today: "2026-11-13" }).status,
    ).toBe("overdue");

    expect(
      mapPluggyBill(openBill, { accountExternalId: CARD_ACCOUNT_ID, today: TODAY }),
    ).toMatchObject({
      totalCents: 181_040,
      minimumPaymentCents: 18_104,
    });
  });

  it("valida vencimento e total", () => {
    expect(() =>
      mapPluggyBill(
        { ...billsFixture.results[1]!, dueDate: "" },
        {
          accountExternalId: CARD_ACCOUNT_ID,
          today: TODAY,
        },
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_response" }));
  });
});

describe("mappers Pluggy — investimentos", () => {
  it("mapeia tipos, saldo e lucro", () => {
    const [cdb, treasury, fund] = investmentsFixture.results;

    expect(mapPluggyInvestmentType("FIXED_INCOME")).toBe("fixed_income");
    expect(mapPluggyInvestmentType("MUTUAL_FUND")).toBe("fund");
    expect(mapPluggyInvestmentType("EQUITY")).toBe("equity");
    expect(mapPluggyInvestmentType("ETF")).toBe("etf");
    expect(mapPluggyInvestmentType("SECURITY")).toBe("security");
    expect(mapPluggyInvestmentType("COE")).toBe("other");

    expect(
      mapPluggyInvestment(cdb!, {
        connectionExternalId: "item-sandbox-001",
        updatedAt: "2026-11-10T12:00:00.000Z",
      }),
    ).toMatchObject({
      type: "fixed_income",
      subtype: "CDB",
      balanceCents: 850_000,
      amountProfitCents: 64_500,
      currency: "BRL",
    });
    expect(
      treasury &&
        mapPluggyInvestment(treasury, {
          connectionExternalId: "item-sandbox-001",
          updatedAt: "2026-11-10T12:00:00.000Z",
        }).type,
    ).toBe("fixed_income");
    expect(
      fund &&
        mapPluggyInvestment(fund, {
          connectionExternalId: "item-sandbox-001",
          updatedAt: "2026-11-10T12:00:00.000Z",
        }).type,
    ).toBe("fund");
  });
});

describe("KNOWN_ACCOUNT_BANK_NAMES", () => {
  it("é única e cobre COMPE + aliases que a UI precisa resolver", () => {
    expect(new Set(KNOWN_ACCOUNT_BANK_NAMES).size).toBe(KNOWN_ACCOUNT_BANK_NAMES.length);
    expect(KNOWN_ACCOUNT_BANK_NAMES).toEqual(
      expect.arrayContaining([
        "Banco do Brasil",
        "Itaú",
        "Nubank",
        "Will Bank",
        "Banco Votorantim",
      ]),
    );
  });
});
