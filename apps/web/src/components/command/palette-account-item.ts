import type { Account, Connection } from "@fd/contracts";

import { isMeuPluggyConnection } from "@/components/connections/connection-view";
import type { MoneyFormatter } from "@/components/privacy/privacy-context";
import { accountDisplayCents, stripDiacritics, transactionAccountParts } from "@/lib/accounts";

/**
 * Linha de conta na paleta de comandos (Ctrl/Cmd+K).
 *
 * A paleta tem uma linha só por conta: mostra a instituição como âncora (o
 * nome cru do provedor sozinho não identifica o banco) e, quando o nome da
 * conta repete o banco ou não existe, o número mascarado. O valor usa o
 * formatador global — BRL completo, com o sinal do cartão invertido — e a
 * máscara de "Ocultar valores".
 */

export interface PaletteAccountItem {
  /** Nome curto: "Nubank · Nu Pagamentos S.A. …", "GOLD · 1111". */
  label: string;
  /** Texto extra de busca (`cmdk`): rótulo, número e instituição sem acentos. */
  searchText: string;
  /** Valor exibido: cartão é dívida no domínio (positiva), então aparece negativo. */
  amountCents: number;
  /** Valor formatado pelo formatador global, ou a máscara quando oculto. */
  amountLabel: string;
}

/**
 * Instituição da conta sem o conector: em itens MeuPluggy o nome da conexão é
 * o próprio conector, então o banco só vem de `accounts.institution_name`
 * (COMPE ou nome do cartão). Cartões sem banco caem no nome do produto.
 */
function accountInstitution(account: Account, connection: Connection | null): string | null {
  const own = account.institutionName?.trim();
  if (own) {
    return own;
  }

  if (!connection || isMeuPluggyConnection(connection)) {
    return null;
  }

  const connectionInstitution = connection.institution?.name?.trim();
  return connectionInstitution && connectionInstitution.toLowerCase() !== "pluggy"
    ? connectionInstitution
    : null;
}

export function paletteAccountItem(
  account: Account,
  connections: readonly Connection[],
  money: Pick<MoneyFormatter, "formatCurrency">,
): PaletteAccountItem {
  const connection = connections.find((item) => item.id === account.connectionId) ?? null;
  const institution = accountInstitution(account, connection);
  const parts = transactionAccountParts({
    institutionName: institution,
    name: account.name,
    numberMasked: account.numberMasked,
  });

  // Sem nome próprio (ou sem instituição), o número é o que diferencia a linha:
  // "Banco Exemplo · 00012345-6", "GOLD · 1111".
  const useNumber = parts.accountName === null || parts.institutionName === null;
  const label =
    (useNumber ? [parts.label, parts.numberMasked].filter(Boolean).join(" · ") : parts.label) ||
    account.name?.trim() ||
    "Conta";

  const amountCents = accountDisplayCents(account);

  // A busca precisa achar o que o rótulo mostra: banco vindo da conexão e o
  // número mascarado não estão em `accountSearchText` (que usa a conta crua).
  const searchText = [label, parts.institutionName, parts.numberMasked]
    .filter(Boolean)
    .map((value) => stripDiacritics(value!))
    .join(" ");

  return {
    label,
    searchText,
    amountCents,
    amountLabel: money.formatCurrency(amountCents),
  };
}
