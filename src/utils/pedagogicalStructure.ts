import { AcademicYearRecord, ClassRecord } from '../types';

export interface PedagogicalStageInfo {
  position: number;
  code: string;
  stage: 'EI' | 'EFAI' | 'EFAF' | 'EM';
  stageName: string;
  label: string;
  standardName: string;
}

export interface OfficialClassRecord {
  id: string;
  name: string;
  position: number;
  stage: 'EI' | 'EFAI' | 'EFAF' | 'EM';
  stageName: string;
  active?: boolean;
  order?: number;
  createdAt: string;
}

export const PEDAGOGICAL_STAGES: PedagogicalStageInfo[] = [
  { position: 1, code: 'EI_3', stage: 'EI', stageName: 'Educação Infantil', label: 'EI | 3 Anos', standardName: 'EI | 3 Anos' },
  { position: 2, code: 'EI_4', stage: 'EI', stageName: 'Educação Infantil', label: 'EI | 4 Anos', standardName: 'EI | 4 Anos' },
  { position: 3, code: 'EI_5', stage: 'EI', stageName: 'Educação Infantil', label: 'EI | 5 Anos', standardName: 'EI | 5 Anos' },
  
  { position: 4, code: 'EFAI_1', stage: 'EFAI', stageName: 'Ensino Fundamental - Anos Iniciais', label: 'EFAI | 1º Ano', standardName: 'EFAI | 1º Ano' },
  { position: 5, code: 'EFAI_2', stage: 'EFAI', stageName: 'Ensino Fundamental - Anos Iniciais', label: 'EFAI | 2º Ano', standardName: 'EFAI | 2º Ano' },
  { position: 6, code: 'EFAI_3', stage: 'EFAI', stageName: 'Ensino Fundamental - Anos Iniciais', label: 'EFAI | 3º Ano', standardName: 'EFAI | 3º Ano' },
  { position: 7, code: 'EFAI_4', stage: 'EFAI', stageName: 'Ensino Fundamental - Anos Iniciais', label: 'EFAI | 4º Ano', standardName: 'EFAI | 4º Ano' },
  { position: 8, code: 'EFAI_5', stage: 'EFAI', stageName: 'Ensino Fundamental - Anos Iniciais', label: 'EFAI | 5º Ano', standardName: 'EFAI | 5º Ano' },
  
  { position: 9, code: 'EFAF_6', stage: 'EFAF', stageName: 'Ensino Fundamental - Anos Finais', label: 'EFAF | 6º Ano', standardName: 'EFAF | 6º Ano' },
  { position: 10, code: 'EFAF_7', stage: 'EFAF', stageName: 'Ensino Fundamental - Anos Finais', label: 'EFAF | 7º Ano', standardName: 'EFAF | 7º Ano' },
  { position: 11, code: 'EFAF_8', stage: 'EFAF', stageName: 'Ensino Fundamental - Anos Finais', label: 'EFAF | 8º Ano', standardName: 'EFAF | 8º Ano' },
  { position: 12, code: 'EFAF_9', stage: 'EFAF', stageName: 'Ensino Fundamental - Anos Finais', label: 'EFAF | 9º Ano', standardName: 'EFAF | 9º Ano' },
  
  { position: 13, code: 'EM_1', stage: 'EM', stageName: 'Ensino Médio', label: 'EM | 1ª Série', standardName: 'EM | 1ª Série' },
  { position: 14, code: 'EM_2', stage: 'EM', stageName: 'Ensino Médio', label: 'EM | 2ª Série', standardName: 'EM | 2ª Série' },
  { position: 15, code: 'EM_3', stage: 'EM', stageName: 'Ensino Médio', label: 'EM | 3ª Série', standardName: 'EM | 3ª Série' },
];

export const OFFICIAL_CLASSES: OfficialClassRecord[] = [
  { id: 'cls_01_ei_3', position: 1, name: 'EI | 3 Anos', stage: 'EI', stageName: 'Educação Infantil', active: true, order: 1, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cls_02_ei_4', position: 2, name: 'EI | 4 Anos', stage: 'EI', stageName: 'Educação Infantil', active: true, order: 2, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cls_03_ei_5', position: 3, name: 'EI | 5 Anos', stage: 'EI', stageName: 'Educação Infantil', active: true, order: 3, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cls_04_efai_1', position: 4, name: 'EFAI | 1º Ano', stage: 'EFAI', stageName: 'Ensino Fundamental - Anos Iniciais', active: true, order: 4, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cls_05_efai_2', position: 5, name: 'EFAI | 2º Ano', stage: 'EFAI', stageName: 'Ensino Fundamental - Anos Iniciais', active: true, order: 5, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cls_06_efai_3', position: 6, name: 'EFAI | 3º Ano', stage: 'EFAI', stageName: 'Ensino Fundamental - Anos Iniciais', active: true, order: 6, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cls_07_efai_4', position: 7, name: 'EFAI | 4º Ano', stage: 'EFAI', stageName: 'Ensino Fundamental - Anos Iniciais', active: true, order: 7, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cls_08_efai_5', position: 8, name: 'EFAI | 5º Ano', stage: 'EFAI', stageName: 'Ensino Fundamental - Anos Iniciais', active: true, order: 8, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cls_09_efaf_6', position: 9, name: 'EFAF | 6º Ano', stage: 'EFAF', stageName: 'Ensino Fundamental - Anos Finais', active: true, order: 9, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cls_10_efaf_7', position: 10, name: 'EFAF | 7º Ano', stage: 'EFAF', stageName: 'Ensino Fundamental - Anos Finais', active: true, order: 10, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cls_11_efaf_8', position: 11, name: 'EFAF | 8º Ano', stage: 'EFAF', stageName: 'Ensino Fundamental - Anos Finais', active: true, order: 11, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cls_12_efaf_9', position: 12, name: 'EFAF | 9º Ano', stage: 'EFAF', stageName: 'Ensino Fundamental - Anos Finais', active: true, order: 12, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cls_13_em_1', position: 13, name: 'EM | 1ª Série', stage: 'EM', stageName: 'Ensino Médio', active: true, order: 13, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cls_14_em_2', position: 14, name: 'EM | 2ª Série', stage: 'EM', stageName: 'Ensino Médio', active: true, order: 14, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cls_15_em_3', position: 15, name: 'EM | 3ª Série', stage: 'EM', stageName: 'Ensino Médio', active: true, order: 15, createdAt: '2026-01-01T00:00:00.000Z' },
];

/**
 * Mapeia nomes antigos de turmas (ou variações) para a nomenclatura oficial.
 */
export function mapLegacyClassToOfficial(className: string): string {
  if (!className) return '';
  const pos = getPedagogicalPosition(className);
  if (pos !== null) {
    return getPedagogicalLabel(pos);
  }
  return className;
}

/**
 * Identifica a posição pedagógica oficial (1..15) a partir do nome da turma.
 * Suporta formatos canônicos ("EFAF | 6º Ano") e variações escolares ("6º ANO A", "1ª SÉRIE-B", etc.).
 */
export function getPedagogicalPosition(className: string): number | null {
  if (!className) return null;
  const raw = className.trim();
  const upper = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  // 1. Verificação direta contra os 15 nomes canônicos
  for (const s of PEDAGOGICAL_STAGES) {
    const sNorm = s.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (upper === sNorm) return s.position;
  }

  // 2. Ensino Médio (EM / Série)
  if (upper.includes('EM') || upper.includes('MEDIO') || upper.includes('SERIE') || upper.includes('SÉRIE')) {
    if (/\b(1|1A|1ª|1º|1O|PRIMEIR[AO])\b/.test(upper) || upper.includes('1ª') || upper.includes('1A SERIE') || upper.includes('1ª SERIE') || upper.includes('1º ANO EM') || upper.includes('1 ANO EM')) {
      return 13;
    }
    if (/\b(2|2A|2ª|2º|2O|SEGUND[AO])\b/.test(upper) || upper.includes('2ª') || upper.includes('2A SERIE') || upper.includes('2ª SERIE') || upper.includes('2º ANO EM') || upper.includes('2 ANO EM')) {
      return 14;
    }
    if (/\b(3|3A|3ª|3º|3O|TERCEIR[AO])\b/.test(upper) || upper.includes('3ª') || upper.includes('3A SERIE') || upper.includes('3ª SERIE') || upper.includes('3º ANO EM') || upper.includes('3 ANO EM')) {
      return 15;
    }
  }

  // 3. Educação Infantil (EI / Anos de idade)
  if (upper.includes('EI') || upper.includes('INFANTIL') || upper.includes('MATERNAL') || upper.includes('JARDIM')) {
    if (upper.includes('3') || upper.includes('TRES') || upper.includes('TRÊS')) return 1;
    if (upper.includes('4') || upper.includes('QUATRO')) return 2;
    if (upper.includes('5') || upper.includes('CINCO')) return 3;
  }

  // 4. EFAF / Anos Finais (6º ao 9º ano)
  if (upper.includes('EFAF') || upper.includes('ANOS FINAIS') || upper.includes('FUNDAMENTAL II') || upper.includes('FUNDAMENTAL 2')) {
    if (upper.includes('6')) return 9;
    if (upper.includes('7')) return 10;
    if (upper.includes('8')) return 11;
    if (upper.includes('9')) return 12;
  }

  // 5. EFAI / Anos Iniciais (1º ao 5º ano)
  if (upper.includes('EFAI') || upper.includes('ANOS INICIAIS') || upper.includes('FUNDAMENTAL I') || upper.includes('FUNDAMENTAL 1')) {
    if (upper.includes('1')) return 4;
    if (upper.includes('2')) return 5;
    if (upper.includes('3')) return 6;
    if (upper.includes('4')) return 7;
    if (upper.includes('5')) return 8;
  }

  // 6. Correspondência por números de série/ano sem prefixo de etapa explícito
  // Anos Finais (6º ao 9º)
  if (/\b6[º°ªaA]?\s*(ANO|SERIE)?\b/.test(upper) || upper.includes('6º ANO') || upper.includes('6 ANO')) return 9;
  if (/\b7[º°ªaA]?\s*(ANO|SERIE)?\b/.test(upper) || upper.includes('7º ANO') || upper.includes('7 ANO')) return 10;
  if (/\b8[º°ªaA]?\s*(ANO|SERIE)?\b/.test(upper) || upper.includes('8º ANO') || upper.includes('8 ANO')) return 11;
  if (/\b9[º°ªaA]?\s*(ANO|SERIE)?\b/.test(upper) || upper.includes('9º ANO') || upper.includes('9 ANO')) return 12;

  // Anos Iniciais (1º ao 5º)
  if (/\b1[º°]?\s*ANO\b/.test(upper) || upper.includes('1º ANO') || upper.includes('1 ANO')) return 4;
  if (/\b2[º°]?\s*ANO\b/.test(upper) || upper.includes('2º ANO') || upper.includes('2 ANO')) return 5;
  if (/\b3[º°]?\s*ANO\b/.test(upper) || upper.includes('3º ANO') || upper.includes('3 ANO')) return 6;
  if (/\b4[º°]?\s*ANO\b/.test(upper) || upper.includes('4º ANO') || upper.includes('4 ANO')) return 7;
  if (/\b5[º°]?\s*ANO\b/.test(upper) || upper.includes('5º ANO') || upper.includes('5 ANO')) return 8;

  // Séries do Ensino Médio
  if (/\b1[ªaA]?\s*SERIE\b/.test(upper) || upper.includes('1ª SERIE') || upper.includes('1A SERIE')) return 13;
  if (/\b2[ªaA]?\s*SERIE\b/.test(upper) || upper.includes('2ª SERIE') || upper.includes('2A SERIE')) return 14;
  if (/\b3[ªaA]?\s*SERIE\b/.test(upper) || upper.includes('3ª SERIE') || upper.includes('3A SERIE')) return 15;

  // Idades da Educação Infantil isoladas
  if (upper.includes('3 ANOS') || upper.includes('3 ANO')) return 1;
  if (upper.includes('4 ANOS') || upper.includes('4 ANO')) return 2;
  if (upper.includes('5 ANOS')) return 3;

  return null;
}

/**
 * Retorna o rótulo legível da posição pedagógica (ex: "EFAF | 6º Ano").
 */
export function getPedagogicalLabel(position: number): string {
  const stage = PEDAGOGICAL_STAGES.find((s) => s.position === position);
  return stage ? stage.label : `Posição ${position}`;
}

/**
 * Retorna o nome da etapa macro (EI, EFAI, EFAF, EM) da posição.
 */
export function getPedagogicalStage(position: number): 'EI' | 'EFAI' | 'EFAF' | 'EM' | 'OUTRA' {
  const stage = PEDAGOGICAL_STAGES.find((s) => s.position === position);
  return stage ? stage.stage : 'OUTRA';
}

/**
 * Ordena turmas de acordo com a ordem pedagógica oficial (1..15) e alfabeticamente para sub-turmas.
 */
export function sortClassesPedagogically<T extends { name: string }>(classes: T[]): T[] {
  return [...classes].sort((a, b) => {
    const posA = getPedagogicalPosition(a.name);
    const posB = getPedagogicalPosition(b.name);

    if (posA !== null && posB !== null) {
      if (posA !== posB) {
        return posA - posB;
      }
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    }

    if (posA !== null) return -1;
    if (posB !== null) return 1;

    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export interface ProgressionValidationResult {
  isValid: boolean;
  errorMessage?: string;
  previousRecord?: AcademicYearRecord;
  nextRecord?: AcademicYearRecord;
  targetPosition?: number | null;
}

/**
 * Validação rigorosa da progressão pedagógica do aluno entre períodos letivos.
 *
 * Regras:
 * 1. Primeiro registro do aluno: SEMPRE PERMITIDO (qualquer turma).
 * 2. Em relação ao período anterior cronológico:
 *    - Posição igual (Repetência): PERMITIDO.
 *    - Posição igual + 1 (Progressão Normal): PERMITIDO.
 *    - Posição inferior (Regressão): BLOQUEADO.
 *    - Posição superior em 2 ou mais (Salto de Etapas): BLOQUEADO.
 * 3. Em relação ao período posterior cronológico (cadastro retroativo de ano passado):
 *    - Não pode ser maior que o período posterior (regressão futura): BLOQUEADO.
 *    - Não pode haver salto até o período posterior: BLOQUEADO.
 */
export function validateStudentProgression(
  targetYear: string | number,
  targetClassName: string,
  existingRecords: AcademicYearRecord[],
  excludeRecordId?: string
): ProgressionValidationResult {
  const cleanTargetYear = String(targetYear).trim();
  const cleanTargetClass = String(targetClassName).trim().toUpperCase();

  // Filtrar registros do aluno excluindo o que está sendo editado (se houver)
  const relevantRecords = existingRecords
    .filter((r) => !excludeRecordId || r.id !== excludeRecordId)
    .filter((r) => r.year && r.className);

  // Não permitir duplicidade de período para o mesmo aluno
  const sameYearRecord = relevantRecords.find((r) => String(r.year) === cleanTargetYear);
  if (sameYearRecord) {
    return {
      isValid: false,
      errorMessage: `Este aluno já está confirmado no período letivo ${cleanTargetYear}.`,
    };
  }

  // Se não há registros históricos anteriores/posteriores: PERMITIDO (Regra 10: Primeiro registro do aluno)
  if (relevantRecords.length === 0) {
    return { isValid: true };
  }

  const targetPos = getPedagogicalPosition(cleanTargetClass);
  if (targetPos === null) {
    // Turma customizada fora da matriz 1..15: permitir sem bloquear
    return { isValid: true, targetPosition: null };
  }

  // Ordenar registros cronologicamente
  const sortedRecords = [...relevantRecords].sort((a, b) => {
    const numA = Number(a.year);
    const numB = Number(b.year);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    return String(a.year).localeCompare(String(b.year), undefined, { numeric: true });
  });

  const targetYearNum = Number(cleanTargetYear);
  const isTargetYearNum = !isNaN(targetYearNum);

  // Localizar o registro imediatamente anterior (ano < targetYear mais próximo)
  let prevRecord: AcademicYearRecord | undefined = undefined;
  for (let i = sortedRecords.length - 1; i >= 0; i--) {
    const rec = sortedRecords[i];
    const recYearNum = Number(rec.year);
    const isEarlier =
      isTargetYearNum && !isNaN(recYearNum)
        ? recYearNum < targetYearNum
        : String(rec.year).localeCompare(cleanTargetYear, undefined, { numeric: true }) < 0;

    if (isEarlier) {
      prevRecord = rec;
      break;
    }
  }

  // Localizar o registro imediatamente posterior (ano > targetYear mais próximo)
  let nextRecord: AcademicYearRecord | undefined = undefined;
  for (let i = 0; i < sortedRecords.length; i++) {
    const rec = sortedRecords[i];
    const recYearNum = Number(rec.year);
    const isLater =
      isTargetYearNum && !isNaN(recYearNum)
        ? recYearNum > targetYearNum
        : String(rec.year).localeCompare(cleanTargetYear, undefined, { numeric: true }) > 0;

    if (isLater) {
      nextRecord = rec;
      break;
    }
  }

  // Validação contra o período anterior imediato
  if (prevRecord) {
    const prevPos = getPedagogicalPosition(prevRecord.className);
    if (prevPos !== null) {
      // 1. Regressão (targetPos < prevPos)
      if (targetPos < prevPos) {
        const prevLabel = getPedagogicalLabel(prevPos);
        return {
          isValid: false,
          previousRecord: prevRecord,
          targetPosition: targetPos,
          errorMessage: `Não é possível confirmar ${cleanTargetClass}. Em ${prevRecord.year}, o aluno estava em ${prevRecord.className} (${prevLabel}). A turma selecionada representa uma regressão na trajetória escolar.`,
        };
      }

      // 2. Salto de etapas (targetPos > prevPos + 1)
      if (targetPos > prevPos + 1) {
        const prevLabel = getPedagogicalLabel(prevPos);
        const allowedNextLabel = prevPos < 15 ? getPedagogicalLabel(prevPos + 1) : prevLabel;
        return {
          isValid: false,
          previousRecord: prevRecord,
          targetPosition: targetPos,
          errorMessage: `Não é possível confirmar este período. Em ${prevRecord.year}, o aluno estava em ${prevRecord.className}. Para este período (${cleanTargetYear}), a progressão permitida é ${prevLabel} (repetência) ou ${allowedNextLabel} (progressão normal). Não é permitido avançar diretamente para ${cleanTargetClass}.`,
        };
      }
    }
  }

  // Validação contra o período posterior imediato (no caso de inserção retroativa)
  if (nextRecord) {
    const nextPos = getPedagogicalPosition(nextRecord.className);
    if (nextPos !== null) {
      // Se targetPos for maior que o registro do ano posterior, haveria regressão histórica
      if (targetPos > nextPos) {
        const nextLabel = getPedagogicalLabel(nextPos);
        return {
          isValid: false,
          nextRecord: nextRecord,
          targetPosition: targetPos,
          errorMessage: `Não é possível confirmar este período. Já existe o registro de ${nextRecord.year} em ${nextRecord.className} (${nextLabel}). A turma selecionada para ${cleanTargetYear} (${cleanTargetClass}) criaria uma inconsistência temporal (regressão na trajetória histórica do aluno).`,
        };
      }

      // Se o período posterior estiver adiantado em mais de 1 posição em relação ao novo registro
      if (nextPos > targetPos + 1) {
        const nextLabel = getPedagogicalLabel(nextPos);
        return {
          isValid: false,
          nextRecord: nextRecord,
          targetPosition: targetPos,
          errorMessage: `Não é possível confirmar este período. Já existe o registro de ${nextRecord.year} em ${nextRecord.className} (${nextLabel}). A turma selecionada para ${cleanTargetYear} (${cleanTargetClass}) criaria um salto de etapas não permitido até o período de ${nextRecord.year}.`,
        };
      }
    }
  }

  return { isValid: true, targetPosition: targetPos };
}

/**
 * Retorna os dados de progressão permitida para auxílio visual no formulário.
 */
export function getStudentAllowedProgressionInfo(
  targetYear: string | number,
  existingRecords: AcademicYearRecord[],
  excludeRecordId?: string
): {
  isFirstRecord: boolean;
  prevRecord?: AcademicYearRecord;
  nextRecord?: AcademicYearRecord;
  allowedPositions: number[];
  statusText: string;
} {
  const cleanTargetYear = String(targetYear).trim();
  const relevantRecords = existingRecords
    .filter((r) => !excludeRecordId || r.id !== excludeRecordId)
    .filter((r) => r.year && r.className);

  if (relevantRecords.length === 0) {
    return {
      isFirstRecord: true,
      allowedPositions: PEDAGOGICAL_STAGES.map((s) => s.position),
      statusText: 'Primeiro registro do aluno: qualquer turma inicial é permitida.',
    };
  }

  const sortedRecords = [...relevantRecords].sort((a, b) => {
    const numA = Number(a.year);
    const numB = Number(b.year);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return String(a.year).localeCompare(String(b.year), undefined, { numeric: true });
  });

  const targetYearNum = Number(cleanTargetYear);
  const isTargetYearNum = !isNaN(targetYearNum);

  let prevRecord: AcademicYearRecord | undefined = undefined;
  for (let i = sortedRecords.length - 1; i >= 0; i--) {
    const rec = sortedRecords[i];
    const recYearNum = Number(rec.year);
    const isEarlier =
      isTargetYearNum && !isNaN(recYearNum)
        ? recYearNum < targetYearNum
        : String(rec.year).localeCompare(cleanTargetYear, undefined, { numeric: true }) < 0;

    if (isEarlier) {
      prevRecord = rec;
      break;
    }
  }

  let nextRecord: AcademicYearRecord | undefined = undefined;
  for (let i = 0; i < sortedRecords.length; i++) {
    const rec = sortedRecords[i];
    const recYearNum = Number(rec.year);
    const isLater =
      isTargetYearNum && !isNaN(recYearNum)
        ? recYearNum > targetYearNum
        : String(rec.year).localeCompare(cleanTargetYear, undefined, { numeric: true }) > 0;

    if (isLater) {
      nextRecord = rec;
      break;
    }
  }

  const prevPos = prevRecord ? getPedagogicalPosition(prevRecord.className) : null;
  const nextPos = nextRecord ? getPedagogicalPosition(nextRecord.className) : null;

  let allowedPositions: number[] = [];

  if (prevPos !== null && nextPos !== null) {
    const fromPrev = [prevPos, Math.min(prevPos + 1, 15)];
    const fromNext = [Math.max(nextPos - 1, 1), nextPos];
    allowedPositions = fromPrev.filter((p) => fromNext.includes(p));
  } else if (prevPos !== null) {
    allowedPositions = [prevPos, Math.min(prevPos + 1, 15)];
  } else if (nextPos !== null) {
    allowedPositions = [Math.max(nextPos - 1, 1), nextPos];
  } else {
    allowedPositions = PEDAGOGICAL_STAGES.map((s) => s.position);
  }

  let statusText = '';
  if (prevRecord && prevPos !== null) {
    const prevLabel = getPedagogicalLabel(prevPos);
    const nextLabel = prevPos < 15 ? getPedagogicalLabel(prevPos + 1) : prevLabel;
    statusText = `Último registro em ${prevRecord.year}: ${prevRecord.className}. Permitido: ${prevLabel} (repetência) ou ${nextLabel} (progressão).`;
  } else if (nextRecord && nextPos !== null) {
    const nextLabel = getPedagogicalLabel(nextPos);
    const prevAllowedLabel = nextPos > 1 ? getPedagogicalLabel(nextPos - 1) : nextLabel;
    statusText = `Registro posterior em ${nextRecord.year}: ${nextRecord.className}. Permitido para ${cleanTargetYear}: ${prevAllowedLabel} ou ${nextLabel}.`;
  } else {
    statusText = 'Progresso regular disponível.';
  }

  return {
    isFirstRecord: false,
    prevRecord,
    nextRecord,
    allowedPositions,
    statusText,
  };
}
