/**
 * Logos reais dos bancos para os avatares de instituição.
 *
 * Fonte: catálogo de conectores do Pluggy (`GET /connectors?countries=BR`),
 * campo `imageUrl` servido por `https://cdn.pluggy.ai` (o `img-src` da CSP já
 * libera `https://*.pluggy.ai`). A URL é guardada inteira, e não montada a
 * partir do id, porque o arquivo do ícone nem sempre é o id do conector
 * (ex.: Bradesco 603 usa `203.svg`; C6 Bank 626 usa `726.svg`).
 *
 * As chaves são os nomes que o mapper de instituição pode gravar em
 * `accounts.institution_name` (`KNOWN_ACCOUNT_BANK_NAMES` em
 * `@fd/financial-providers`, COMPE + alias de cartão) e os nomes dos conectores
 * de banco (`GET /connectors`). O item MeuPluggy (conector 200) e o Pluggy Bank
 * (2) devolvem `connector-icons/sandbox.svg`, que NÃO é logo de banco: por isso
 * a resolução trabalha com o banco da conta e essa tabela só contém bancos
 * reais.
 *
 * A contrapartida verificável desta tabela é `fixtures/pluggy-bank-logos.json`
 * (captura real do catálogo); `institution-logo.test.ts` compara as duas e
 * confere todo nome de `KNOWN_ACCOUNT_BANK_NAMES`.
 */
export const PLUGGY_CONNECTOR_ICON_BASE = "https://cdn.pluggy.ai/assets/connector-icons";

/** Nome normalizado do banco → arquivo do ícone no catálogo do Pluggy. */
const BANK_ICON_FILES: Readonly<Record<string, string>> = {
  // 611 Banco do Brasil
  "banco do brasil": "211.svg",
  // 608 Santander
  santander: "208.svg",
  // 659 Banrisul
  banrisul: "659.svg",
  // 215 Inter (o mapper grava "Banco Inter"; o conector chama "Inter")
  "banco inter": "215.svg",
  inter: "215.svg",
  // 619 Caixa Econômica Federal
  "caixa economica federal": "219.svg",
  // 787 Stone Pagamentos (o mapper grava "Stone")
  stone: "787.svg",
  "stone pagamentos": "787.svg",
  // 214 BTGPactual (mapper: "BTG Pactual")
  "btg pactual": "214.svg",
  btgpactual: "214.svg",
  // 603 Bradesco
  bradesco: "203.svg",
  // 612 Nubank
  nubank: "212.svg",
  // 692 PagBank
  pagbank: "692.svg",
  // 206 Mercado Pago
  "mercado pago": "206.svg",
  // 626 C6 Bank
  "c6 bank": "726.svg",
  // 601 Itaú
  itau: "201.svg",
  "itau unibanco": "201.svg",
  // 202 XP Investimentos / 602 XP Banking
  "xp investimentos": "202.svg",
  "xp banking": "202.svg",
  // 651 PicPay
  picpay: "651.svg",
  // 742 Banco Mercantil
  "banco mercantil": "742.svg",
  // 629 Safra (mapper: "Banco Safra")
  "banco safra": "629.svg",
  safra: "629.svg",
  // 661 Sicredi
  sicredi: "661.svg",
  // 658 Sicoob
  sicoob: "228.svg",
  // 689 Neon (o mapper grava "Neon")
  neon: "689.svg",
  // 656 Next (o mapper grava "Next")
  next: "656.svg",
};

/** Aliases com logo verificado (o teste confronta a lista com a fixture do catálogo). */
export const INSTITUTION_LOGO_ALIASES: readonly string[] = Object.keys(BANK_ICON_FILES);

/** Minúsculas, sem acento, sem pontuação e com espaços colapsados. */
export function normalizeInstitutionName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[,/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * URL do logo real do banco, ou `null` quando não há logo verificado (demo,
 * MeuPluggy, bancos sem conector no catálogo) — o avatar cai para as iniciais.
 *
 * A comparação é exata após normalização: nomes compostos de cartão
 * ("Cartão Internacional") não podem casar por substring com "Inter".
 */
export function resolveInstitutionLogo(name: string | null | undefined): string | null {
  if (!name) return null;
  const file = BANK_ICON_FILES[normalizeInstitutionName(name)];
  return file ? `${PLUGGY_CONNECTOR_ICON_BASE}/${file}` : null;
}
