/**
 * Rótulo de ação do `PageHeader`.
 *
 * Abaixo de `sm` o texto encurta (`Conectar conta` → `Conectar`) para as ações
 * caberem numa linha ao lado do controle de período; a partir de `sm` o rótulo
 * completo volta. O nome acessível é sempre o rótulo completo: no mobile ele
 * fica em `sr-only`, então leitores de tela (e o e2e) continuam ouvindo
 * "Conectar conta" mesmo vendo só "Conectar".
 */
export interface HeaderActionLabelProps {
  label: string;
  /** Rótulo curto do mobile; omitido, o texto é só `label`. */
  shortLabel?: string;
}

export function HeaderActionLabel({ label, shortLabel }: HeaderActionLabelProps) {
  if (!shortLabel) {
    return <>{label}</>;
  }

  return (
    <>
      <span aria-hidden="true" className="sm:hidden">
        {shortLabel}
      </span>
      <span className="max-sm:sr-only">{label}</span>
    </>
  );
}
