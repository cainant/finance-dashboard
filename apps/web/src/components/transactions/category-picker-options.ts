import type { Category, TransactionType } from "@fd/contracts";

/** Natureza de categoria compatível com o tipo derivado do lançamento. */
export function kindForType(type: TransactionType): Category["kind"] {
  return type === "income" ? "income" : type === "transfer" ? "transfer" : "expense";
}

/** Rótulo curto da natureza, usado na indicação discreta da categoria fixada. */
export const CATEGORY_KIND_LABEL: Record<Category["kind"], string> = {
  income: "Receita",
  expense: "Despesa",
  transfer: "Transferência",
};

/**
 * `true` quando a categoria é de outra natureza que o tipo do lançamento — o
 * que o filtro do seletor esconderia e precisa fixar no topo.
 */
export function isForeignCategory(category: Category, type: TransactionType): boolean {
  return category.kind !== kindForType(type);
}

export interface BuildCategoryOptionsInput {
  categories: readonly Category[];
  /** Categoria atual do lançamento (embutida ou resolvida por `categoryId`). */
  current: Category | null;
  /** Tipo derivado do lançamento (`income` | `expense` | `transfer`). */
  type: TransactionType;
  /**
   * Categoria de outra natureza que a linha tinha antes da última troca. Fica
   * fixada no topo para a troca ser reversível (o filtro por natureza não a
   * mostraria e ela sumiria para sempre da lista).
   */
  origin?: Category | null;
  /** Busca digitada no popover. */
  query?: string;
}

export interface CategoryPickerOptions {
  /** Categoria de outra natureza fixada no topo; `null` quando não há. */
  pinned: Category | null;
  /** Categorias da natureza do lançamento, ordenadas e filtradas pela busca. */
  options: Category[];
}

/**
 * Monta a lista do seletor de categoria.
 *
 * O filtro por natureza existe para não classificar receita como despesa, mas
 * ele não pode esconder a categoria que está (ou estava) no lançamento: o sync
 * aplica categorias de outra natureza (ex.: Pix enviado a terceiro é `expense`
 * e cai em "Transferências", `kind: transfer`), e sem a fixada o usuário
 * trocaria de categoria e não conseguiria conferir nem voltar. A fixada não
 * entra na busca (fica sempre alcançável); as demais continuam filtradas pela
 * natureza e pelo termo.
 */
export function buildCategoryOptions({
  categories,
  current,
  type,
  origin = null,
  query = "",
}: BuildCategoryOptionsInput): CategoryPickerOptions {
  const kind = kindForType(type);
  const term = query.trim().toLowerCase();

  const options = categories
    .filter((category) => category.kind === kind)
    .filter((category) => (term ? category.name.toLowerCase().includes(term) : true))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  // A atual tem precedência: é ela que precisa aparecer marcada. Sem ela, a de
  // origem segura a volta depois de uma troca.
  const pinned =
    current && isForeignCategory(current, type)
      ? current
      : origin && isForeignCategory(origin, type) && origin.id !== current?.id
        ? origin
        : null;

  return { pinned, options };
}
