/**
 * Slugs de categoria sugeridos pelos providers.
 *
 * O provider financeiro não conhece o `user_id` nem as categorias criadas pelo
 * usuário: ele só devolve uma dica (`categoryHint`) com um slug de sistema.
 * A camada de sincronização decide se usa a dica, se aplica uma regra do
 * usuário ou se cai em "outros".
 *
 * Estes slugs são os mesmos do seed de `@fd/database` e da arquitetura.
 */
export const PROVIDER_CATEGORY_HINTS = [
  "mercado",
  "restaurantes",
  "transporte",
  "moradia",
  "contas-servicos",
  "saude",
  "educacao",
  "lazer",
  "compras",
  "assinaturas",
  "viagem",
  "pets",
  "impostos-taxas",
  "transferencias",
  "salario",
  "freelance",
  "rendimentos",
  "pix-recebido",
  "outros",
] as const;

export type ProviderCategoryHint = (typeof PROVIDER_CATEGORY_HINTS)[number];

export type ProviderCategoryKind = "income" | "expense" | "transfer";

export interface ProviderCategoryHintInfo {
  slug: ProviderCategoryHint;
  /** Nome em pt-BR usado no seed / UI. */
  label: string;
  kind: ProviderCategoryKind;
}

/**
 * Metadados das categorias de sistema. Útil para a UI montar filtros e para o
 * SyncService validar a dica antes de gravar `category_id`.
 */
export const PROVIDER_CATEGORY_HINT_INFO: readonly ProviderCategoryHintInfo[] = [
  { slug: "mercado", label: "Mercado", kind: "expense" },
  { slug: "restaurantes", label: "Restaurantes", kind: "expense" },
  { slug: "transporte", label: "Transporte", kind: "expense" },
  { slug: "moradia", label: "Moradia", kind: "expense" },
  { slug: "contas-servicos", label: "Contas e serviços", kind: "expense" },
  { slug: "saude", label: "Saúde", kind: "expense" },
  { slug: "educacao", label: "Educação", kind: "expense" },
  { slug: "lazer", label: "Lazer", kind: "expense" },
  { slug: "compras", label: "Compras", kind: "expense" },
  { slug: "assinaturas", label: "Assinaturas", kind: "expense" },
  { slug: "viagem", label: "Viagem", kind: "expense" },
  { slug: "pets", label: "Pets", kind: "expense" },
  { slug: "impostos-taxas", label: "Impostos e taxas", kind: "expense" },
  { slug: "transferencias", label: "Transferências", kind: "transfer" },
  { slug: "salario", label: "Salário", kind: "income" },
  { slug: "freelance", label: "Freelance", kind: "income" },
  { slug: "rendimentos", label: "Rendimentos", kind: "income" },
  { slug: "pix-recebido", label: "Pix recebido", kind: "income" },
  { slug: "outros", label: "Outros", kind: "expense" },
];

const CATEGORY_HINT_SET: ReadonlySet<string> = new Set(PROVIDER_CATEGORY_HINTS);

export function isProviderCategoryHint(value: string): value is ProviderCategoryHint {
  return CATEGORY_HINT_SET.has(value);
}

const CATEGORY_KIND_BY_SLUG: ReadonlyMap<ProviderCategoryHint, ProviderCategoryKind> = new Map(
  PROVIDER_CATEGORY_HINT_INFO.map((info) => [info.slug, info.kind]),
);

export function providerCategoryKind(slug: ProviderCategoryHint): ProviderCategoryKind {
  return CATEGORY_KIND_BY_SLUG.get(slug) ?? "expense";
}
