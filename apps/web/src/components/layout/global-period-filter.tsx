import { PeriodControl, type PeriodControlProps } from "@/components/domain/period-control";

/**
 * Alias de compatibilidade: o período deixou de viver na topbar e passou a ser
 * renderizado pelo `PeriodControl` no cabeçalho de cada página.
 */
export function GlobalPeriodFilter(props: PeriodControlProps) {
  return <PeriodControl {...props} />;
}
