import { AcademicPeriod, AcademicYearRecord, CropSettings, PersonType, TimelinePhotoItem } from '../types';
import { getPedagogicalPosition, getPedagogicalLabel } from './pedagogicalStructure';

export interface StudentHistoricalSlot {
  slotIndex: number; // 1-based index representing the chronological trajectory (1, 2, 3, ...)
  recordId: string;
  studentId: string;
  year: string;
  className: string;
  photoUrl: string;
  cropSettings: CropSettings;
  hasPhoto: boolean;
  pedagogicalPosition: number | null;
  pedagogicalLabel: string;
  isExceedingCapacity: boolean;
  isPrimary?: boolean;
  createdAt?: string;
}

export interface StudentTrajectorySummary {
  studentId: string;
  totalRecordsCount: number;
  capacity: number;
  availableSlots: StudentHistoricalSlot[];
  secondarySlots: StudentHistoricalSlot[];
  exceedingSlots: StudentHistoricalSlot[];
  hasExceedingRecords: boolean;
  missingPhotosCount: number;
  hasLatestPhoto: boolean;
  isEligibleForTimeline: boolean;
  primaryRecord: AcademicYearRecord | null;
  primarySlot: StudentHistoricalSlot | null;
  allChronologicalSlots: StudentHistoricalSlot[];
}

/**
 * Compara se um ano letivo é menor ou igual ao ano-alvo.
 */
export function isYearLessOrEqual(yearA: string | number, yearB: string | number): boolean {
  const numA = Number(yearA);
  const numB = Number(yearB);
  if (!isNaN(numA) && !isNaN(numB)) {
    return numA <= numB;
  }
  return String(yearA).localeCompare(String(yearB), undefined, { numeric: true }) <= 0;
}

/**
 * Compara se um ano letivo é estritamente menor que o ano-alvo.
 */
export function isYearStrictlyLess(yearA: string | number, yearB: string | number): boolean {
  const numA = Number(yearA);
  const numB = Number(yearB);
  if (!isNaN(numA) && !isNaN(numB)) {
    return numA < numB;
  }
  return String(yearA).localeCompare(String(yearB), undefined, { numeric: true }) < 0;
}

/**
 * Ordena registros históricos rigorosamente em ordem cronológica (ano letivo crescente).
 * Em caso de múltiplos registros no mesmo ano, desempata pela data de criação.
 */
export function sortRecordsChronologically(records: AcademicYearRecord[]): AcademicYearRecord[] {
  return [...records].sort((a, b) => {
    const numA = Number(a.year);
    const numB = Number(b.year);
    if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
      return numA - numB;
    }
    const yearComp = String(a.year).localeCompare(String(b.year), undefined, { numeric: true });
    if (yearComp !== 0) return yearComp;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });
}

/**
 * Mapeia os registros históricos confirmados de um aluno para sua trajetória cronológica escolar.
 * Associa cada registro a uma posição sequencial (Slot 01, Slot 02, etc.) na escola.
 * 
 * REGRAS CRÍTICAS DE CONSISTÊNCIA:
 * 1. Período-Alvo / Período Ativo: O registro Principal DEVE corresponder ao período-alvo especificado.
 * 2. Corte Temporal: Somente registros cujo ano seja <= período-alvo podem participar da trajetória.
 *    Registros com ano posterior (> período-alvo) NÃO participam (não entram como principal, secundária ou excedente).
 * 3. Períodos Inativos: Registros pertencentes a períodos letivos inativos (active === false) não participam da trajetória operacional.
 * 4. Fotos Secundárias: EXCLUSIVAMENTE registros com ano estritamente anterior (< período-alvo) e ativos.
 */
export function getStudentHistoricalTrajectory(
  studentId: string,
  records: AcademicYearRecord[],
  photoHistorySlots: number = 10,
  activePeriodYear?: string | null,
  periods?: AcademicPeriod[],
  personType?: PersonType | string
): StudentTrajectorySummary {
  const isCollab = personType === 'collaborator';

  // 1. Determinar o período-alvo da composição
  const targetYearStr =
    activePeriodYear && String(activePeriodYear).trim() !== ''
      ? String(activePeriodYear).trim()
      : null;

  // Conjunto de períodos letivos inativos (active === false)
  const inactiveYears = new Set<string>();
  if (periods && periods.length > 0) {
    periods.forEach((p) => {
      if (p.active === false && p.name) {
        inactiveYears.add(String(p.name).trim());
      }
    });
  }

  // 2. Filtrar apenas registros confirmados pertencentes ao aluno/colaborador que atendam ao corte temporal e elegibilidade
  const studentRecords = records.filter((r) => {
    if (r.studentId !== studentId || !r.year) return false;

    // Regra da turma / classe:
    // ALUNO (personType === 'student' ou ausente): ignora registros sem className
    // COLABORADOR (personType === 'collaborator'): aceita registros sem className ou com className === '', nunca exige turma
    if (!isCollab && (!r.className || r.className.trim() === '')) {
      return false;
    }

    const yrStr = String(r.year).trim();

    // Corte Temporal: se houver período-alvo definido, registros posteriores (> targetYearStr) NÃO entram
    if (targetYearStr && !isYearLessOrEqual(yrStr, targetYearStr)) {
      return false;
    }

    // Períodos Inativos: se o período do registro estiver inativo nas configurações,
    // não pode participar da trajetória operacional de uma composição.
    if (inactiveYears.has(yrStr)) {
      // Se for consulta histórica explícita do próprio período inativo, permite apenas se for exatamente o targetYearStr
      if (!targetYearStr || yrStr !== targetYearStr) {
        return false;
      }
    }

    return true;
  });

  // 3. Ordenação cronológica rigorosa (do período mais antigo ao mais recente)
  const chronologicalRecords = sortRecordsChronologically(studentRecords);

  const totalRecordsCount = chronologicalRecords.length;
  const capacity = Math.max(photoHistorySlots, 0);

  // 4. Determinação do registro Principal baseada estritamente no Período Letivo Alvo/Ativo
  let primaryRecord: AcademicYearRecord | null = null;

  if (targetYearStr) {
    // O registro principal DEVE ser exatamente o registro correspondente ao período letivo alvo
    primaryRecord =
      chronologicalRecords.find((r) => String(r.year).trim() === targetYearStr) || null;
  } else {
    // Fallback legado de compatibilidade apenas se nenhum período ativo/alvo for informado
    if (chronologicalRecords.length > 0) {
      primaryRecord = chronologicalRecords[chronologicalRecords.length - 1];
    }
  }

  const hasLatestPhoto = Boolean(
    primaryRecord && primaryRecord.photoUrl && primaryRecord.photoUrl.trim().length > 0
  );
  const isEligibleForTimeline = Boolean(primaryRecord && hasLatestPhoto);

  // 5. Mapeamento de slots cronológicos da trajetória
  const allChronologicalSlots: StudentHistoricalSlot[] = chronologicalRecords.map((rec, index) => {
    const slotIndex = index + 1; // 1-based (Posição 01, Posição 02...)
    const pedagogicalPos = !isCollab && rec.className ? getPedagogicalPosition(rec.className) : null;
    const pedagogicalLbl =
      pedagogicalPos !== null ? getPedagogicalLabel(pedagogicalPos) : (rec.className || '—');
    const hasPhoto = Boolean(rec.photoUrl && rec.photoUrl.trim().length > 0);
    const isPrimary = primaryRecord ? rec.id === primaryRecord.id : false;

    // Distinção explícita entre papel Principal e Secundária:
    // - Papel Principal: utiliza timelinePrimaryCrop (ou cropSettings legado)
    // - Papel Secundária: utiliza timelineSecondaryCrop (nunca herda automaticamente o ajuste de Principal)
    const slotCrop: CropSettings = isPrimary
      ? rec.timelinePrimaryCrop || rec.cropSettings || { x: 50, y: 50, zoom: 1.0 }
      : rec.timelineSecondaryCrop || { x: 50, y: 50, zoom: 1.0 };

    return {
      slotIndex,
      recordId: rec.id,
      studentId: rec.studentId,
      year: String(rec.year),
      className: rec.className,
      photoUrl: rec.photoUrl || '',
      cropSettings: slotCrop,
      hasPhoto,
      pedagogicalPosition: pedagogicalPos,
      pedagogicalLabel: pedagogicalLbl,
      isExceedingCapacity: slotIndex > capacity,
      isPrimary,
      createdAt: rec.createdAt,
    };
  });

  // Slot do período principal
  const primarySlot = primaryRecord
    ? allChronologicalSlots.find((s) => s.recordId === primaryRecord!.id) || null
    : null;

  // 6. Fotos secundárias: EXCLUSIVAMENTE períodos anteriores ao período principal (< targetYearStr),
  // ordenados do mais recente anterior para o mais antigo (DESC).
  // Nunca inclui o registro principal nem períodos posteriores ou iguais.
  const previousSlots = allChronologicalSlots.filter((s) => {
    if (primaryRecord && s.recordId === primaryRecord.id) return false;
    if (targetYearStr) {
      return isYearStrictlyLess(s.year, targetYearStr);
    }
    if (primaryRecord) {
      return isYearStrictlyLess(s.year, primaryRecord.year);
    }
    return true;
  });

  // Ordenar os períodos anteriores decrescentemente: ex. [2025, 2024, 2023...]
  const sortedPreviousSlots = [...previousSlots].reverse();
  const secondarySlots = sortedPreviousSlots.slice(0, capacity);

  const availableSlots = allChronologicalSlots.slice(0, capacity);
  const exceedingSlots = allChronologicalSlots.slice(capacity);
  const hasExceedingRecords = totalRecordsCount > capacity;
  const missingPhotosCount = allChronologicalSlots.filter((s) => !s.hasPhoto).length;

  return {
    studentId,
    totalRecordsCount,
    capacity,
    availableSlots,
    secondarySlots,
    exceedingSlots,
    hasExceedingRecords,
    missingPhotosCount,
    hasLatestPhoto,
    isEligibleForTimeline,
    primaryRecord,
    primarySlot,
    allChronologicalSlots,
  };
}

/**
 * Constrói a lista canônica de itens fotográficos para a Linha do Tempo:
 * - 1 Foto Principal (isPrimary: true): SEMPRE e EXCLUSIVAMENTE o registro do período-alvo.
 * - N Fotos Secundárias (isPrimary: false): EXCLUSIVAMENTE os períodos letivos anteriores ao período-alvo.
 *
 * Regras:
 * - 1 período confirmado -> 1 foto principal + 0 fotos secundárias (Composição com 1 foto).
 * - 2 períodos confirmados -> 1 foto principal + 1 foto secundária (Composição com 2 fotos).
 * - 3 períodos confirmados -> 1 foto principal + 2 fotos secundárias (Composição com 3 fotos).
 * - O mesmo AcademicYearRecord NUNCA é duplicado como foto principal e secundária.
 * - Nenhum período com ano posterior (> período-alvo) ou inativo pode participar.
 */
export function buildTimelineItemsFromTrajectory(
  trajectory: StudentTrajectorySummary
): TimelinePhotoItem[] {
  if (!trajectory.primaryRecord) {
    return [];
  }

  // 1. Foto Principal (Sempre a fotografia do registro de matrícula do período-alvo confirmado)
  const primaryRecord = trajectory.primaryRecord;
  const primaryRecordId = primaryRecord.id;
  const primaryYear = String(primaryRecord.year).trim();

  const primaryItem: TimelinePhotoItem = {
    recordId: primaryRecordId,
    year: primaryRecord.year,
    className: primaryRecord.className,
    photoUrl: primaryRecord.photoUrl || '',
    cropSettings:
      primaryRecord.timelinePrimaryCrop ||
      primaryRecord.cropSettings ||
      { x: 50, y: 50, zoom: 1.0 },
    isPrimary: true,
  };

  // 2. Fotos Secundárias: Trajetória é a fonte canônica de verdade (trajectory.secondarySlots)
  const rawSecondarySlots = trajectory.secondarySlots || [];

  // Validação estrita: remover qualquer slot que não seja estritamente anterior ao primaryYear ou que seja o primaryRecordId
  const filteredSecondarySlots = rawSecondarySlots.filter((slot) => {
    if (slot.recordId === primaryRecordId) return false;
    if (String(slot.year).trim() === primaryYear) return false;
    return isYearStrictlyLess(slot.year, primaryYear);
  });

  const seenIds = new Set<string>([primaryRecordId]);
  const secondaryItems: TimelinePhotoItem[] = [];

  for (const slot of filteredSecondarySlots) {
    if (seenIds.has(slot.recordId)) {
      console.warn('[Linha do Tempo] Slot secundário duplicado ignorado:', {
        recordId: slot.recordId,
        year: slot.year,
        isPrimary: false,
      });
      continue;
    }
    seenIds.add(slot.recordId);

    secondaryItems.push({
      recordId: slot.recordId,
      year: slot.year,
      className: slot.className,
      photoUrl: slot.photoUrl || '',
      cropSettings: slot.cropSettings || { x: 50, y: 50, zoom: 1.0 },
      isPrimary: false,
    });
  }

  const allItems = [primaryItem, ...secondaryItems];

  // Diagnóstico leve de desenvolvimento (apenas metadados, nunca Base64)
  if (typeof window !== 'undefined' && (window as any).__DEV_TIMELINE_LOGS__) {
    console.info(
      '[buildTimelineItemsFromTrajectory]',
      allItems.map((i) => ({ recordId: i.recordId, year: i.year, isPrimary: i.isPrimary }))
    );
  }

  return allItems;
}

/**
 * Ordena slots ou fotografias estritamente do período mais recente para o mais antigo (DESC).
 * Critério principal: Período letivo numérico decrescente (ex: 2026, 2025, 2024, 2023...).
 * Critério secundário (mesmo período): Data de criação/fotografia mais recente primeiro (DESC).
 */
export function sortPhotoSlotsByPeriodDesc(slots: StudentHistoricalSlot[]): StudentHistoricalSlot[] {
  return [...slots].sort((a, b) => {
    const numA = Number(a.year);
    const numB = Number(b.year);
    if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
      return numB - numA; // Período letivo DESC
    }
    const yearComp = String(b.year).localeCompare(String(a.year), undefined, { numeric: true });
    if (yearComp !== 0) return yearComp;
    return (b.createdAt || '').localeCompare(a.createdAt || ''); // Data mais recente primeiro DESC
  });
}

