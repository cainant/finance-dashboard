/**
 * Fonte do valor por tamanho do texto: a grade 2×2 tem ~134px úteis por tile em
 * 360px, então valores longos (R$ 123.456,78) encolhem em vez de truncar.
 */
export function kpiValueSizeClass(text: string): string {
  if (text.length <= 11) {
    return "text-xl leading-7";
  }

  return text.length <= 13 ? "text-lg leading-7" : "text-base leading-7";
}
