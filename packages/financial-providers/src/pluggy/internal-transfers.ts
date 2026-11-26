/**
 * Movimentação interna entre contas do próprio titular.
 *
 * Transferência entre contas da mesma pessoa (ex.: "Transferência
 * Recebida|<titular>" na conta A e "Pix enviado - <titular>" na conta B) e
 * pagamento de fatura de cartão NÃO são receita nem despesa: só movem dinheiro
 * entre bolsos. O agregado (Visão geral, Análises, fluxo de caixa, gastos por
 * categoria) já ignora `type = 'transfer'`; esta regra existe para que o
 * classificador marque esses lançamentos como `transfer` em vez de
 * `income`/`expense`.
 *
 * Sinais usados (estruturais, sem tabela de nomes no código):
 * - a descrição é de uma transferência/pagamento conhecido (Pix, TED, DOC,
 *   transferência, pagamento, resgate, aplicação);
 * - a contraparte vem depois do separador que o extrato usa (`|` no Open
 *   Finance, ` - ` no conector do banco);
 * - todos os tokens significativos do nome do titular cadastrado
 *   (`users.name`) aparecem na contraparte. Exigimos ao menos dois tokens para
 *   não casar com homônimos ("Ana" sozinho casaria com qualquer Ana).
 *
 * As amostras em `test/internal-transfers.test.ts` são o formato real de um
 * item MeuPluggy (nomes fictícios). Nenhum nome fixo mora no código: o titular
 * chega por `holderNames`, do banco.
 */

/** Separador entre a descrição e a contraparte: `|` (Open Finance) ou ` - `. */
const COUNTERPARTY_SEPARATOR = /\s*\|\s*|\s+-\s+/;

/**
 * Descrições que carregam contraparte. "COMPRA"/"ESTORNO" ficam de fora: nelas
 * o texto depois do separador é o estabelecimento, não uma pessoa.
 *
 * Sobreposição com `isTransferDescription` (mappers.ts): lá QUALQUER
 * `RESGATE`/`APLICACAO` já vira `transfer` sem olhar a contraparte. Aqui esses
 * tokens só importam no backfill, que revisa linhas antigas gravadas como
 * `income`/`expense` antes daquela heurística existir; para linhas novas a
 * classificação já veio do mapper. `DEPOSITO` é o único token exclusivo deste
 * template: "Depósito - <titular>" é dinheiro vindo dele mesmo (cash → conta),
 * não receita.
 */
const TRANSFER_TEMPLATE =
  /\b(PIX|TED|DOC|TRANSFERENCIA|TRANSFER|PAGAMENTO|PAGTO|RESGATE|APLICACAO|DEPOSITO)\b/;

/** Tokens menores que isso são conectores ("e", "da", "de") e ruído. */
const MIN_TOKEN_LENGTH = 3;
/** Abaixo disso o nome do titular não distingue ninguém de um homônimo. */
export const HOLDER_NAME_MIN_TOKENS = 2;

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

/**
 * Tokens significativos de um nome: sem acento, sem caixa, sem pontuação e sem
 * conectores curtos ("Ana Souza e Silva" → ANA, SOUZA, SILVA). Tokens de 1–2
 * caracteres somem: um sobrenome curto ("Li") não distingue homônimos, então é
 * melhor a regra não casar do que casar errado — o efeito colateral (nome com
 * um único token significativo desliga a regra) está documentado em
 * docs/architecture.md.
 */
export function normalizeNameTokens(name: string): string[] {
  return normalizeText(name)
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

/**
 * Contraparte da descrição, quando ela é uma transferência/pagamento e o
 * separador existe. Devolve `null` para compras, estornos e descrições sem
 * contraparte.
 */
export function counterpartyFromDescription(description: string): string | null {
  if (!TRANSFER_TEMPLATE.test(normalizeText(description))) return null;
  const parts = description.split(COUNTERPARTY_SEPARATOR);
  if (parts.length < 2) return null;
  const counterparty = parts[parts.length - 1]!.trim();
  return counterparty.length > 0 ? counterparty : null;
}

/**
 * `true` quando a descrição é uma transferência cuja contraparte é o próprio
 * titular — isto é, movimentação entre contas dele e não receita/despesa.
 */
/**
 * `true` quando a descrição é uma transferência cuja contraparte é o próprio
 * titular — isto é, movimentação entre contas dele e não receita/despesa.
 *
 * Conveniência para chamadas pontuais (mapper, testes). Em laço sobre muitas
 * linhas, normalize o titular uma vez com `holderTokenSets` e use
 * `matchesInternalMovement`: normalizar o nome a cada linha custa ~20% do
 * filtro e o backfill roda dentro do orçamento de 10 ms de CPU.
 */
export function isInternalMovement(
  description: string,
  holderNames?: readonly string[] | null,
): boolean {
  return matchesInternalMovement(description, holderTokenSets(holderNames));
}

/** Conjuntos de tokens do titular, já normalizados (um por nome válido). */
export type HolderTokenSet = ReadonlyArray<readonly string[]>;

/**
 * Normaliza os nomes do titular uma única vez. Nomes com menos de
 * `HOLDER_NAME_MIN_TOKENS` tokens ficam de fora — a regra não se aplica a eles.
 */
export function holderTokenSets(holderNames?: readonly string[] | null): HolderTokenSet {
  if (!holderNames || holderNames.length === 0) return [];
  const sets: string[][] = [];
  for (const holderName of holderNames) {
    const tokens = normalizeNameTokens(holderName);
    if (tokens.length >= HOLDER_NAME_MIN_TOKENS) sets.push(tokens);
  }
  return sets;
}

/** Mesma regra de `isInternalMovement`, com os tokens do titular já prontos. */
export function matchesInternalMovement(
  description: string,
  holderTokens: HolderTokenSet,
): boolean {
  if (holderTokens.length === 0) return false;
  const counterparty = counterpartyFromDescription(description);
  if (!counterparty) return false;

  const counterpartyTokens = new Set(normalizeNameTokens(counterparty));
  return holderTokens.some((tokens) => tokens.every((token) => counterpartyTokens.has(token)));
}
