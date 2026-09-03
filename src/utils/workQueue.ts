import {
  Student,
  AcademicYearRecord,
  GeneratedTimeline,
  WorkQueueItem,
  AcademicPeriod,
  AcademicPeriodOperationalStatus,
} from '../types';
import { getStudentHistoricalTrajectory } from './studentPhotoHistory';
import { getPedagogicalPosition } from './pedagogicalStructure';
import { getActiveAcademicYear } from './academicYears';

/**
 * Builds the canonical Work Queue dataset from students, records and saved timelines.
 * Single source of truth for B.16/B.17, B.20, B.21, B.22, B.23 and B.28.3-F.
 */
export function buildWorkQueueData(
  students: Student[],
  records: AcademicYearRecord[],
  timelines: GeneratedTimeline[],
  maxSlots: number,
  periods: AcademicPeriod[] = [],
  targetYear?: string
): WorkQueueItem[] {
  // Determine effective operational target year (either explicit targetYear or active academic period)
  const activeYear = targetYear || getActiveAcademicYear(periods) || undefined;

  // If activeYear is provided, filter students who have a confirmed record in activeYear
  const studentsWithRecords = students.filter((s) => {
    const isCollab = s.personType === 'collaborator';
    if (activeYear) {
      if (isCollab) {
        return records.some(
          (r) => r.studentId === s.id && String(r.year) === String(activeYear)
        );
      }
      return records.some(
        (r) => r.studentId === s.id && String(r.year) === String(activeYear) && r.className
      );
    }
    if (isCollab) {
      return records.some((r) => r.studentId === s.id && r.year);
    }
    return records.some((r) => r.studentId === s.id && r.year && r.className);
  });

  const items: WorkQueueItem[] = studentsWithRecords.map((std) => {
    const isCollab = std.personType === 'collaborator';
    // If activeYear is specified, only consider records up to and including activeYear
    const studentRecords = activeYear
      ? records.filter((r) => {
          if (r.studentId !== std.id || !r.year) return false;
          if (!isCollab && !r.className) return false;
          const numR = Number(r.year);
          const numT = Number(activeYear);
          if (!isNaN(numR) && !isNaN(numT)) {
            return numR <= numT;
          }
          return String(r.year).localeCompare(String(activeYear)) <= 0;
        })
      : records.filter((r) => {
          if (r.studentId !== std.id || !r.year) return false;
          if (!isCollab && !r.className) return false;
          return true;
        });

    const traj = getStudentHistoricalTrajectory(std.id, studentRecords, maxSlots, activeYear, periods, std.personType);
    const latestRecord = traj.primaryRecord;
    const latestYear = latestRecord ? String(latestRecord.year) : (activeYear || '—');
    const latestClass = latestRecord ? (latestRecord.className || '—') : '—';
    const pedagogicalPos = isCollab ? 999 : (getPedagogicalPosition(latestClass) ?? 999);
    
    const recordsCount = traj.totalRecordsCount;
    const photosCount = traj.allChronologicalSlots.filter((s) => s.hasPhoto).length;
    const hasLatestPhoto = traj.hasLatestPhoto;
    const isEligibleForTimeline = traj.isEligibleForTimeline;
    const missingSlots = traj.allChronologicalSlots.filter((s) => !s.hasPhoto);
    const missingPhotosCount = missingSlots.length;
    const hasMissingPhotos = missingPhotosCount > 0;
    const hasExceeding = traj.hasExceedingRecords;
    const usedSlotsCount = traj.availableSlots.length;
    const capacity = traj.capacity;

    const existingSavedTimeline = activeYear
      ? (timelines.find((t) => t.studentId === std.id && String(t.year) === String(activeYear)) || null)
      : (timelines.find((t) => t.studentId === std.id && String(t.year) === latestYear) || null);

    const isSaved = !!existingSavedTimeline;

    let hasNewHistoryAfterSave = false;
    let hasNewPhotoAfterSave = false;

    if (isSaved && existingSavedTimeline) {
      const savedPhotoItems = existingSavedTimeline.photoItems || [];
      const hasSlotMissingInSaved = traj.allChronologicalSlots.some(
        (slot) =>
          !savedPhotoItems.some(
            (p) =>
              String(p.year) === String(slot.year) &&
              (isCollab || (p.className || '') === (slot.className || ''))
          )
      );
      hasNewHistoryAfterSave = hasSlotMissingInSaved;

      const hasPhotoNewlyAvailable = savedPhotoItems.some((savedItem) => {
        if (!savedItem.photoUrl || savedItem.photoUrl.trim() === '') {
          return studentRecords.some(
            (r) =>
              r.studentId === std.id &&
              String(r.year) === String(savedItem.year) &&
              (isCollab || (r.className || '') === (savedItem.className || '')) &&
              r.photoUrl &&
              r.photoUrl.trim() !== ''
          );
        }
        return false;
      });
      hasNewPhotoAfterSave = hasPhotoNewlyAvailable;
    }

    const isSavedWithPending =
      isSaved && (hasMissingPhotos || hasNewHistoryAfterSave || hasNewPhotoAfterSave || hasExceeding);
    const isReadyForPdf = isSaved && !isSavedWithPending;

    // ETAPA B.28.8 Simplified Unified Flow:
    // ALUNO -> MATRICULA -> FOTO -> COMPOSICAO SALVA -> REVISAO -> APROVADO -> IMPRESSAO / PDF
    const isReviewed = existingSavedTimeline?.reviewStatus === 'reviewed';
    const reviewStatus: 'pending' | 'reviewed' = isReviewed ? 'reviewed' : 'pending';
    const reviewedAt = existingSavedTimeline?.reviewedAt;
    const reviewedBy = existingSavedTimeline?.reviewedBy;
    const reviewChecklist = existingSavedTimeline?.reviewChecklist;
    const isReviewPending = isSaved && !isReviewed;
    const isReadyForPrint = isSaved && isReviewed && !isSavedWithPending;

    // Period Closure information preserved for historical reference (no longer blocks printing)
    const matchingPeriod = periods.find((p) => String(p.name) === String(latestYear));
    const isPeriodClosed = matchingPeriod?.status === 'closed';
    const periodStatus: AcademicPeriodOperationalStatus = matchingPeriod?.status || 'in_production';
    const isEligibleForOfficialPdf = isReadyForPrint;

    return {
      student: std,
      latestRecord,
      latestYear,
      latestClass,
      pedagogicalPos,
      recordsCount,
      photosCount,
      hasLatestPhoto,
      isEligibleForTimeline,
      missingSlots,
      missingPhotosCount,
      hasMissingPhotos,
      hasExceeding,
      usedSlotsCount,
      capacity,
      isSaved,
      savedTimeline: existingSavedTimeline || null,
      status: isSaved ? ('saved' as const) : ('pending' as const),
      hasNewHistoryAfterSave,
      hasNewPhotoAfterSave,
      isSavedWithPending,
      isReadyForPdf,
      reviewStatus,
      reviewedAt,
      reviewedBy,
      reviewChecklist,
      isReviewed,
      isReadyForPrint,
      isReviewPending,
      isPeriodClosed,
      periodStatus,
      isEligibleForOfficialPdf,
    };
  });

  // Sort order:
  // 1º: Current class in pedagogical order (1 to 15)
  // 2º: Student name in alphabetical order
  return items.sort((a, b) => {
    if (a.pedagogicalPos !== b.pedagogicalPos) {
      return a.pedagogicalPos - b.pedagogicalPos;
    }
    return a.student.name.localeCompare(b.student.name, 'pt-BR');
  });
}

/**
 * Identifica se o item/aluno possui uma composição da Linha do Tempo efetivamente salva.
 * Regra ÚNICA e centralizada compartilhada por:
 * - Produção (listagem, filtros e KPIs)
 * - Imprimir conferência (ReviewSheetPrintModal)
 * - Baixar Linha do Tempo (DownloadTimelineModal)
 */
export function hasSavedTimelineComposition(item: WorkQueueItem | null | undefined): boolean {
  return Boolean(item && item.savedTimeline && item.savedTimeline.id);
}

export {
  getActiveAcademicPeriod,
  getActiveAcademicYear,
  getPreviousAcademicPeriods,
  isCompositionInCurrentActivePeriod,
} from './academicYears';
