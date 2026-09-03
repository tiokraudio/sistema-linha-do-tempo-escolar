import {
  AcademicPeriod,
  AcademicYearClosingSummary,
  AcademicYearPendency,
  AcademicPeriodOperationalStatus,
  WorkQueueItem,
} from '../types';

/**
 * Calculates the closing summary and readiness state for a specific academic year
 * adhering strictly to B.20, B.21, and B.23 rules.
 */
export function calculateAcademicYearClosingSummary(
  year: string,
  period: AcademicPeriod | undefined,
  queueItemsForYear: WorkQueueItem[]
): AcademicYearClosingSummary {
  const operationalStatus: AcademicPeriodOperationalStatus =
    period?.status || 'in_production';
  const isClosed = operationalStatus === 'closed';

  const totalStudents = queueItemsForYear.length;
  const confirmedRecordsCount = totalStudents;
  const savedCompositionsCount = queueItemsForYear.filter((i) => i.isSaved).length;
  const reviewPendingCount = queueItemsForYear.filter((i) => i.isReviewPending).length;
  const reviewedCount = queueItemsForYear.filter((i) => i.isReviewed).length;
  const readyForPrintCount = queueItemsForYear.filter((i) => i.isReadyForPrint).length;
  const missingPhotosCount = queueItemsForYear.filter((i) => i.hasMissingPhotos).length;
  const exceedingCount = queueItemsForYear.filter((i) => i.hasExceeding).length;
  const newHistoryCount = queueItemsForYear.filter(
    (i) => i.isSaved && (i.hasNewHistoryAfterSave || i.hasNewPhotoAfterSave)
  ).length;
  const withPendencyCount = queueItemsForYear.filter(
    (i) =>
      i.hasMissingPhotos ||
      i.isSavedWithPending ||
      i.hasExceeding ||
      i.hasNewHistoryAfterSave ||
      i.hasNewPhotoAfterSave ||
      !i.isSaved
  ).length;

  // Completion percentage using B.20 standard formula (Saved / Total)
  const completionPercent =
    totalStudents > 0 ? Math.round((savedCompositionsCount / totalStudents) * 100) : 0;

  // Calculate Blocking Pendencies
  const blockingPendencies: AcademicYearPendency[] = [];
  const informativePendencies: AcademicYearPendency[] = [];

  // 1. Unsaved compositions
  const unsavedItems = queueItemsForYear.filter((i) => !i.isSaved);
  if (unsavedItems.length > 0) {
    blockingPendencies.push({
      type: 'blocking',
      category: 'unsaved',
      count: unsavedItems.length,
      description: `${unsavedItems.length} aluno(s) sem composição salva na Linha do Tempo`,
      studentNames: unsavedItems.map((i) => i.student.name),
      studentIds: unsavedItems.map((i) => i.student.id),
    });
  }

  // 2. Missing photos in current period
  const missingPhotoItems = queueItemsForYear.filter((i) => i.hasMissingPhotos);
  if (missingPhotoItems.length > 0) {
    blockingPendencies.push({
      type: 'blocking',
      category: 'missing_photo',
      count: missingPhotoItems.length,
      description: `${missingPhotoItems.length} aluno(s) com fotografia faltante no período`,
      studentNames: missingPhotoItems.map((i) => i.student.name),
      studentIds: missingPhotoItems.map((i) => i.student.id),
    });
  }

  // 4. New historical records or photos confirmed after composition save
  const newHistoryItems = queueItemsForYear.filter(
    (i) => i.isSaved && (i.hasNewHistoryAfterSave || i.hasNewPhotoAfterSave)
  );
  if (newHistoryItems.length > 0) {
    blockingPendencies.push({
      type: 'blocking',
      category: 'new_history',
      count: newHistoryItems.length,
      description: `${newHistoryItems.length} composição(ões) com histórico ou fotos atualizados após salvar snapshot`,
      studentNames: newHistoryItems.map((i) => i.student.name),
      studentIds: newHistoryItems.map((i) => i.student.id),
    });
  }

  // 5. Exceeding history
  const exceedingItems = queueItemsForYear.filter((i) => i.hasExceeding);
  if (exceedingItems.length > 0) {
    blockingPendencies.push({
      type: 'blocking',
      category: 'exceeding',
      count: exceedingItems.length,
      description: `${exceedingItems.length} aluno(s) com histórico escolar excedendo os slots do modelo`,
      studentNames: exceedingItems.map((i) => i.student.name),
      studentIds: exceedingItems.map((i) => i.student.id),
    });
  }

  // Informative pendencies (students with older historical slots without photos, but current period photo is present)
  const studentsWithOlderMissingPhotos = queueItemsForYear.filter(
    (i) => i.photosCount < i.recordsCount && !i.hasMissingPhotos
  );
  if (studentsWithOlderMissingPhotos.length > 0) {
    informativePendencies.push({
      type: 'informative',
      category: 'missing_photo',
      count: studentsWithOlderMissingPhotos.length,
      description: `${studentsWithOlderMissingPhotos.length} aluno(s) possuem anos anteriores sem foto arquivada (não impeditivo para este ano)`,
      studentNames: studentsWithOlderMissingPhotos.map((i) => i.student.name),
      studentIds: studentsWithOlderMissingPhotos.map((i) => i.student.id),
    });
  }

  // Calculate readiness:
  // Must have at least 1 student, 0 blocking pendencies, and 100% ready for print
  const isReadyToClose =
    !isClosed &&
    totalStudents > 0 &&
    blockingPendencies.length === 0 &&
    readyForPrintCount === totalStudents;

  let displayStatus: 'in_production' | 'in_review' | 'ready_to_close' | 'closed';
  if (isClosed) {
    displayStatus = 'closed';
  } else if (isReadyToClose) {
    displayStatus = 'ready_to_close';
  } else if (operationalStatus === 'in_review') {
    displayStatus = 'in_review';
  } else {
    displayStatus = 'in_production';
  }

  return {
    year,
    operationalStatus,
    displayStatus,
    isReadyToClose,
    isClosed,
    totalStudents,
    confirmedRecordsCount,
    savedCompositionsCount,
    reviewPendingCount,
    reviewedCount,
    readyForPrintCount,
    withPendencyCount,
    missingPhotosCount,
    exceedingCount,
    newHistoryCount,
    completionPercent,
    blockingPendencies,
    informativePendencies,
    closedAt: period?.closedAt,
    closedBy: period?.closedBy,
  };
}
