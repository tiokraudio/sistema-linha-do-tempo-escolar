import { AcademicPeriod } from '../types';

/**
 * Obtém o período letivo ativo do sistema.
 * 
 * REGRA OFICIAL DEFINITIVA:
 * O "Período Letivo Ativo" é o período letivo MAIS RECENTE cadastrado em:
 * Configurações → Ano Letivo que esteja com status ativo (active !== false).
 * 
 * Se não houver nenhum período cadastrado ou se todos estiverem inativos:
 * Retorna estritamente null (não inventa ano civil, nem fallback para inativo ou registros).
 */
export function getActiveAcademicPeriod(periods: AcademicPeriod[] = []): AcademicPeriod | null {
  if (!periods || periods.length === 0) return null;

  // Filtra períodos com status ativo (active !== false) e ordena pelo maior ano (DESC)
  const activePeriods = [...periods]
    .filter((p) => p.active !== false)
    .sort((a, b) => Number(b.name) - Number(a.name));

  if (activePeriods.length > 0) {
    return activePeriods[0];
  }

  // Sem período ativo válido: retorna estritamente null
  return null;
}

/**
 * Retorna o nome/ano em formato string do período letivo ativo do sistema (ex: "2027").
 * Se nenhum período estiver ativo, retorna null.
 */
export function getActiveAcademicYear(periods: AcademicPeriod[] = []): string | null {
  const active = getActiveAcademicPeriod(periods);
  return active?.name ? String(active.name) : null;
}

/**
 * Retorna todos os períodos letivos anteriores ao período ativo (estritamente < período ativo),
 * ordenados do mais recente anterior para o mais antigo (DESC).
 * 
 * O período ativo NUNCA deve aparecer nessa lista.
 */
export function getPreviousAcademicPeriods(
  periods: AcademicPeriod[] = [],
  activeYear?: string | null
): AcademicPeriod[] {
  const refYear = activeYear !== undefined ? activeYear : getActiveAcademicYear(periods);
  if (!refYear) return [];

  const refNum = Number(refYear);
  return [...periods]
    .filter((p) => {
      const pNum = Number(p.name);
      return !isNaN(pNum) && !isNaN(refNum) ? pNum < refNum : String(p.name) !== String(refYear);
    })
    .sort((a, b) => Number(b.name) - Number(a.name));
}

/**
 * Verifica se uma composição da Linha do Tempo pertence ao período letivo ativo atual.
 * Se não existir período ativo, não existe período atual válido (retorna false).
 */
export function isCompositionInCurrentActivePeriod(
  compositionYear: string | number | undefined,
  periods: AcademicPeriod[] = []
): boolean {
  if (!compositionYear) return false;
  const activeYear = getActiveAcademicYear(periods);
  if (!activeYear) return false;
  return String(compositionYear) === String(activeYear);
}
