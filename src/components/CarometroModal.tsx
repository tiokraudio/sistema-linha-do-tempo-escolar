import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Student,
  AcademicYearRecord,
  ClassRecord,
  AcademicPeriod,
  SchoolConfig,
  CropSettings,
  CarometroCropSettings,
  GeneratedTimeline,
  PersonType,
} from '../types';
import {
  CarometroStudentItem,
  CarometroItemStatus,
  CarometroNamingFormat,
  CarometroExportFormat,
  hasSavedCarometroAdjustment,
  generateCarometroZip,
} from '../utils/carometroUtils';
import { getActiveAcademicPeriod, getActiveAcademicYear } from '../utils/academicYears';
import { CarometroCropperModal } from './CarometroCropperModal';
import { CarometroA4Sheet } from './CarometroA4Sheet';
import { autoDetectFaceCrop } from '../utils/faceDetector';
import {
  captureA4ElementToPng,
  createA4JsPdf,
  addPngPageToA4Pdf,
  saveA4Pdf,
  A4_PRINT_WIDTH_PX,
  A4_PRINT_HEIGHT_PX,
  A4_PRINT_SCALE,
  A4_LANDSCAPE_WIDTH_PX,
  A4_LANDSCAPE_HEIGHT_PX,
  A4_LANDSCAPE_PRINT_SCALE,
} from '../utils/pdfGenerator';
import { apiFetch } from '../utils/api';
import {
  X,
  Search,
  Download,
  FileText,
  Sparkles,
  CheckSquare,
  Square,
  MinusSquare,
  Edit2,
  ImageOff,
  RotateCcw,
  Loader2,
  Eye,
  ChevronLeft,
  ChevronRight,
  List,
  AlertCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  History,
  Calendar,
  Layers,
  Archive,
  GraduationCap,
  Briefcase,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Alert } from './ui/Alert';
import { inputClasses, selectClasses } from './ui/FormField';

interface CarometroModalProps {
  isOpen?: boolean;
  isInline?: boolean;
  students: Student[];
  records: AcademicYearRecord[];
  classes: ClassRecord[];
  periods: AcademicPeriod[];
  schoolConfig: SchoolConfig;
  timelines?: GeneratedTimeline[];
  initialClass?: string;
  initialPeriod?: string;
  onClose?: () => void;
  onUpdateRecordCrop?: (recordId: string, crop: CropSettings) => Promise<void>;
  onBatchAutoFaceCrop?: (updates: Array<{ recordId: string; autoFaceCrop: CropSettings }>) => Promise<void>;
  onRefreshData?: () => Promise<void>;
}

export const CarometroModal: React.FC<CarometroModalProps> = ({
  isOpen = true,
  isInline = false,
  students,
  records,
  classes,
  periods,
  schoolConfig,
  timelines = [],
  initialClass = 'all',
  onClose,
  onUpdateRecordCrop,
  onBatchAutoFaceCrop,
  onRefreshData,
}) => {
  // Navigation tab: 'current' (Operacional) | 'history' (Consultar anos anteriores)
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');

  // 1. Identify official active academic period (NEVER use new Date().getFullYear() or fallbacks to records)
  const currentActivePeriodObj = useMemo(() => {
    return getActiveAcademicPeriod(periods);
  }, [periods]);

  const currentActivePeriodName = useMemo(() => {
    return getActiveAcademicYear(periods) || '';
  }, [periods]);

  // 2. Identify available previous historical periods (strictly excluding current active period)
  const previousPeriods = useMemo(() => {
    const allYears = new Set<string>();
    if (periods && periods.length > 0) {
      periods.forEach((p) => {
        if (p.name) allYears.add(String(p.name));
      });
    }
    records.forEach((r) => {
      if (r.year) allYears.add(String(r.year));
    });

    const activeNum = Number(currentActivePeriodName);
    return Array.from(allYears)
      .filter((y) => {
        const yNum = Number(y);
        return !isNaN(yNum) && !isNaN(activeNum) ? yNum < activeNum : y !== currentActivePeriodName;
      })
      .sort((a, b) => Number(b) - Number(a));
  }, [periods, records, currentActivePeriodName]);

  // Selected historical period for the 'history' tab
  const [selectedHistoricalPeriod, setSelectedHistoricalPeriod] = useState<string>(
    previousPeriods[0] || ''
  );

  // Keep selectedHistoricalPeriod in sync if periods update
  useEffect(() => {
    if (previousPeriods.length > 0 && !previousPeriods.includes(selectedHistoricalPeriod)) {
      setSelectedHistoricalPeriod(previousPeriods[0]);
    }
  }, [previousPeriods, selectedHistoricalPeriod]);

  // Context: 'student' (default) | 'collaborator'
  const [activeContext, setActiveContext] = useState<PersonType>('student');

  // Target operational period: strictly current period for 'current' tab, or chosen historical year
  const activeTargetPeriod = activeTab === 'current' ? currentActivePeriodName : selectedHistoricalPeriod;
  const isHistorical = activeTab === 'history';

  // Filters State
  const [classFilter, setClassFilter] = useState<string>(initialClass);
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'saved' | 'pending' | 'timeline_pending' | 'photo_outdated' | 'missing_photo'
  >('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [viewMode, setViewMode] = useState<'list' | 'a4_preview'>('list');

  // Locally confirmed saved crops for current session
  const [savedCrops, setSavedCrops] = useState<Record<string, CarometroCropSettings>>({});

  // Temporary in-memory suggestions from auto-detection
  const [pendingAutoCrops, setPendingAutoCrops] = useState<Record<string, CropSettings>>({});

  // Reset local crop cache whenever records or timelines update from backend
  useEffect(() => {
    setSavedCrops({});
    setPendingAutoCrops({});
  }, [records, timelines]);

  // Single Crop Modal state
  const [editingStudentItem, setEditingStudentItem] = useState<CarometroStudentItem | null>(null);

  // Download ZIP Options Modal & Export Format
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState<boolean>(false);
  const [namingFormat, setNamingFormat] = useState<CarometroNamingFormat>('enrollment_name');
  const [exportFormat, setExportFormat] = useState<CarometroExportFormat>('3x4');

  // Selected Student IDs (eligible only)
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Batch / Export Progress States
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressStatus, setProgressStatus] = useState<{
    message: string;
    current: number;
    total: number;
    percent: number;
  }>({ message: '', current: 0, total: 0, percent: 0 });

  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [previewPageIndex, setPreviewPageIndex] = useState<number>(0);
  const [pageOrientation, setPageOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [activePageItemsForPdf, setActivePageItemsForPdf] = useState<CarometroStudentItem[]>([]);
  const cancelRequestedRef = useRef<boolean>(false);

  // Reset class filter when switching tab or changing historical year or person type
  useEffect(() => {
    setClassFilter('all');
    setSelectedStudentIds([]);
    setPreviewPageIndex(0);
    setSearchTerm('');
  }, [activeTab, selectedHistoricalPeriod, activeContext]);

  // Build the master Carometro Student Items list for the selected period
  const allPeriodItems = useMemo(() => {
    const items: CarometroStudentItem[] = [];
    if (!activeTargetPeriod) return items;

    const contextualStudents = students.filter(
      (s) => (s.personType || 'student') === activeContext
    );

    contextualStudents.forEach((student) => {
      // Find the record matching the exact target period
      const matchingRecords = records.filter(
        (r) => r.studentId === student.id && String(r.year) === String(activeTargetPeriod)
      );

      if (matchingRecords.length > 0) {
        const rec = matchingRecords[0];
        const savedCrop = isHistorical ? rec.carometroCrop : savedCrops[rec.id] || rec.carometroCrop;
        const pendingCrop = isHistorical ? undefined : pendingAutoCrops[rec.id];

        const hasPhoto = !!(rec.photoUrl && rec.photoUrl.trim() !== '');

        // Timeline composition must be saved for this student in this exact period
        const hasSavedTimeline = timelines.some(
          (t) => t.studentId === student.id && String(t.year) === String(rec.year)
        );

        // Check if there is a valid auto-detected face crop on the record
        const hasValidAutoFaceCrop = !!(
          hasPhoto &&
          rec.autoFaceCrop &&
          rec.autoFaceCrop.photoUrl &&
          rec.autoFaceCrop.photoUrl === rec.photoUrl
        );

        // Detect if main photo changed after carometro crop was saved
        const isPhotoOutdated = !!(
          hasPhoto &&
          hasSavedTimeline &&
          savedCrop &&
          savedCrop.photoUrl &&
          savedCrop.photoUrl !== rec.photoUrl
        );

        // Auto face detection is active if valid autoFaceCrop exists and no saved crop
        const hasAutoFaceDetection =
          hasPhoto &&
          hasSavedTimeline &&
          !savedCrop &&
          (hasValidAutoFaceCrop || !!pendingCrop);

        // Active crop for rendering / editor
        const activeCrop =
          savedCrop ||
          (hasValidAutoFaceCrop ? rec.autoFaceCrop : undefined) ||
          pendingCrop ||
          rec.cropSettings ||
          { x: 50, y: 50, zoom: 1.0 };
        const hasCustom = !!savedCrop;

        let status: CarometroItemStatus;
        let statusLabel: string;
        let canAdjust: boolean;

        if (!hasPhoto) {
          status = 'missing_photo';
          statusLabel = 'Sem foto';
          canAdjust = false;
        } else if (!hasSavedTimeline) {
          status = 'timeline_pending';
          statusLabel = 'Composição pendente';
          canAdjust = false;
        } else if (isPhotoOutdated) {
          status = 'photo_outdated';
          statusLabel = 'Foto principal alterada';
          canAdjust = !isHistorical;
        } else if (savedCrop) {
          status = 'saved';
          statusLabel = 'Ajuste salvo';
          canAdjust = !isHistorical;
        } else {
          status = 'pending';
          statusLabel = 'Pendente';
          canAdjust = !isHistorical;
        }

        // Canonical export eligibility: ONLY items with saved adjustment
        const isEligibleForExport = hasSavedCarometroAdjustment({
          hasPhoto,
          hasSavedTimeline,
          isPhotoOutdated,
          record: { ...rec, carometroCrop: savedCrop },
          status,
        });

        items.push({
          student,
          record: rec,
          className: rec.className || '',
          year: String(rec.year),
          photoUrl: rec.photoUrl || '',
          crop: activeCrop,
          hasCustomCrop: hasCustom,
          hasPhoto,
          hasSavedTimeline,
          isPhotoOutdated,
          hasAutoFaceDetection,
          autoFaceCrop: hasValidAutoFaceCrop ? rec.autoFaceCrop : undefined,
          status,
          statusLabel,
          canAdjust,
          isEligibleForExport,
        });
      }
    });

    // Sort alphabetically by class, then by student name
    return items.sort((a, b) => {
      const clsComp = (a.className || '').localeCompare(b.className || '', 'pt-BR');
      if (clsComp !== 0) return clsComp;
      return (a.student.name || '').localeCompare(b.student.name || '', 'pt-BR');
    });
  }, [students, records, activeTargetPeriod, timelines, savedCrops, pendingAutoCrops, isHistorical, activeContext]);

  // Derive distinct classes present in the current target period items
  const availableClassesInPeriod = useMemo(() => {
    const classSet = new Set<string>();
    allPeriodItems.forEach((it) => {
      if (it.className && it.className.trim() !== '') {
        classSet.add(it.className.trim());
      }
    });
    return Array.from(classSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [allPeriodItems]);

  const studentCount = useMemo(() => {
    if (!activeTargetPeriod) return 0;
    const activeStudentIds = new Set(
      records
        .filter((r) => String(r.year) === String(activeTargetPeriod))
        .map((r) => r.studentId)
    );
    return students.filter(
      (s) => (s.personType || 'student') === 'student' && activeStudentIds.has(s.id)
    ).length;
  }, [students, records, activeTargetPeriod]);

  const collaboratorCount = useMemo(() => {
    if (!activeTargetPeriod) return 0;
    const activeStudentIds = new Set(
      records
        .filter((r) => String(r.year) === String(activeTargetPeriod))
        .map((r) => r.studentId)
    );
    return students.filter(
      (s) => s.personType === 'collaborator' && activeStudentIds.has(s.id)
    ).length;
  }, [students, records, activeTargetPeriod]);

  // Filtered items based on active UI filters (Turma, Situação, Busca)
  const filteredItems = useMemo(() => {
    return allPeriodItems.filter((item) => {
      // 1. Turma filter (apenas para alunos)
      if (activeContext !== 'collaborator' && classFilter !== 'all') {
        const itemCls = (item.className || '').trim().toLowerCase();
        const targetCls = classFilter.trim().toLowerCase();
        if (itemCls !== targetCls) {
          return false;
        }
      }

      // 2. Situação filter
      if (statusFilter === 'saved' && item.status !== 'saved') {
        return false;
      }
      if (statusFilter === 'pending' && item.status !== 'pending') {
        return false;
      }
      if (statusFilter === 'timeline_pending' && item.status !== 'timeline_pending') {
        return false;
      }
      if (statusFilter === 'photo_outdated' && item.status !== 'photo_outdated') {
        return false;
      }
      if (statusFilter === 'missing_photo' && item.status !== 'missing_photo') {
        return false;
      }

      // 3. Search term filter (Name, Enrollment)
      if (searchTerm.trim() !== '') {
        const q = searchTerm.toLowerCase().trim();
        const matchesName = item.student.name.toLowerCase().includes(q);
        const matchesEnrollment = (item.student.enrollment || '').toLowerCase().includes(q);
        const matchesClass = activeContext !== 'collaborator' && item.className.toLowerCase().includes(q);
        if (!matchesName && !matchesEnrollment && !matchesClass) return false;
      }

      return true;
    });
  }, [allPeriodItems, classFilter, statusFilter, searchTerm, activeContext]);

  // Sync selected IDs: preserve only selected students that exist in filteredItems and are eligible
  useEffect(() => {
    setSelectedStudentIds((prev) =>
      prev.filter((id) => filteredItems.some((it) => it.student.id === id && it.isEligibleForExport))
    );
  }, [filteredItems]);

  // Items currently selected by checkboxes that are eligible
  const eligibleSelectedItems = useMemo(() => {
    if (selectedStudentIds.length === 0) return [];
    return filteredItems.filter(
      (it) => selectedStudentIds.includes(it.student.id) && it.isEligibleForExport
    );
  }, [filteredItems, selectedStudentIds]);

  // Helper to obtain the strict export pool for PDF and ZIP (Respects period + class filter + selection + "Ajuste salvo")
  const getTargetExportPool = (): CarometroStudentItem[] => {
    if (eligibleSelectedItems.length > 0) {
      return eligibleSelectedItems;
    }
    return filteredItems.filter((it) => it.isEligibleForExport);
  };

  // Pagination for A4 PDF / Preview: 20 students (Retrato: 4 rows x 5 cols) or 24 (Paisagem: 4 rows x 6 cols)
  const STUDENTS_PER_A4_PAGE = pageOrientation === 'landscape' ? 24 : 20;
  const a4Pages = useMemo(() => {
    const pool = getTargetExportPool();
    const pages: CarometroStudentItem[][] = [];
    for (let i = 0; i < pool.length; i += STUDENTS_PER_A4_PAGE) {
      pages.push(pool.slice(i, i + STUDENTS_PER_A4_PAGE));
    }
    return pages;
  }, [eligibleSelectedItems, filteredItems, STUDENTS_PER_A4_PAGE]);

  const totalA4Pages = Math.max(1, a4Pages.length);

  // Selection handlers
  const handleToggleSelectAll = () => {
    const eligibleIds = filteredItems.filter((it) => it.isEligibleForExport).map((it) => it.student.id);
    if (selectedStudentIds.length === eligibleIds.length && eligibleIds.length > 0) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(eligibleIds);
    }
  };

  const handleToggleStudent = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  // Save single crop - persists to backend and transitions student to "Ajuste salvo"
  const handleSaveCrop = async (crop: CropSettings): Promise<void> => {
    if (!editingStudentItem || isHistorical) return;
    const recId = editingStudentItem.record.id;
    const currentPhotoUrl = editingStudentItem.photoUrl;

    try {
      if (onUpdateRecordCrop) {
        await onUpdateRecordCrop(recId, crop);
      } else {
        const res = await apiFetch(`/api/records/${recId}/carometro-crop`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ carometroCrop: crop }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Falha ao salvar no servidor.');
        }
      }

      // Persist in local savedCrops state ONLY after backend confirmation
      setSavedCrops((prev) => ({
        ...prev,
        [recId]: {
          ...crop,
          photoUrl: currentPhotoUrl,
          updatedAt: new Date().toISOString(),
        },
      }));

      // Remove from temporary pendingAutoCrops
      setPendingAutoCrops((prev) => {
        const next = { ...prev };
        delete next[recId];
        return next;
      });

      setToastMsg({
        type: 'success',
        text: `Ajuste salvo com sucesso para ${editingStudentItem.student.name}.`,
      });
    } catch (err: any) {
      console.error('Erro ao salvar enquadramento:', err);
      setToastMsg({
        type: 'error',
        text: err.message || 'Não foi possível salvar o ajuste. Tente novamente.',
      });
      // CRITICAL: Re-throw error so CropperModal knows save failed and stays open
      throw err;
    }
  };

  // Batch face auto-detection (Current period only)
  const handleAutoDetectAll = async () => {
    if (isHistorical) return;

    // Process ONLY students with photo + timeline saved + NOT already saved + NOT outdated + NOT already auto-detected for current photo
    const itemsToDetect = filteredItems.filter(
      (it) =>
        it.hasPhoto &&
        it.hasSavedTimeline &&
        it.status === 'pending' &&
        !it.isPhotoOutdated &&
        !it.hasAutoFaceDetection
    );

    if (itemsToDetect.length === 0) {
      setToastMsg({
        type: 'error',
        text:
          activeContext === 'collaborator'
            ? 'Nenhum colaborador pendente para identificação automática. Colaboradores com Ajuste salvo ou com rosto já identificado são preservados.'
            : 'Nenhum aluno pendente para identificação automática. Alunos com Ajuste salvo ou com rosto já identificado são preservados.',
      });
      return;
    }

    setIsProcessing(true);
    cancelRequestedRef.current = false;

    const updates: Array<{ recordId: string; autoFaceCrop: CropSettings }> = [];
    const newPending: Record<string, CropSettings> = { ...pendingAutoCrops };
    let count = 0;
    const total = itemsToDetect.length;

    for (const it of itemsToDetect) {
      if (cancelRequestedRef.current) break;
      count++;
      setProgressStatus({
        message: `Identificando rosto: ${it.student.name}`,
        current: count,
        total,
        percent: Math.round((count / total) * 100),
      });

      try {
        const detected = await autoDetectFaceCrop(it.photoUrl);
        updates.push({ recordId: it.record.id, autoFaceCrop: detected });
        newPending[it.record.id] = detected;
      } catch (e) {
        console.error('Erro na detecção facial:', e);
      }
    }

    setPendingAutoCrops(newPending);

    if (updates.length > 0) {
      try {
        if (onBatchAutoFaceCrop) {
          await onBatchAutoFaceCrop(updates);
        } else {
          const res = await apiFetch('/api/carometro/batch-auto-face-crop', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates }),
          });
          if (!res.ok) {
            throw new Error('Falha ao salvar identificações automáticas no servidor.');
          }
        }
        if (onRefreshData) {
          await onRefreshData();
        }
      } catch (err: any) {
        console.error('Erro ao persistir batch auto-face:', err);
      }
    }

    setIsProcessing(false);
    setProgressStatus({ message: '', current: 0, total: 0, percent: 0 });

    setToastMsg({
      type: 'success',
      text: `Rostos identificados automaticamente para ${updates.length} ${activeContext === 'collaborator' ? 'colaborador(es)' : 'aluno(s)'}. Situação permanece "Pendente" até que cada ajuste seja conferido e salvo no editor.`,
    });
  };

  // Open ZIP Download Options Modal
  const handleOpenDownloadModal = () => {
    const targetPool = getTargetExportPool();

    if (targetPool.length === 0) {
      setToastMsg({
        type: 'error',
        text: `Nenhum ${activeContext === 'collaborator' ? 'colaborador' : 'aluno'} com Ajuste salvo disponível para download.`,
      });
      return;
    }

    setIsDownloadModalOpen(true);
  };

  // Execute ZIP Export with chosen format & naming format
  const handleConfirmDownloadZip = async () => {
    setIsDownloadModalOpen(false);

    const isCircular = exportFormat === 'circular';
    const targetPool = getTargetExportPool();

    if (targetPool.length === 0) {
      setToastMsg({
        type: 'error',
        text: `Nenhum ${activeContext === 'collaborator' ? 'colaborador' : 'aluno'} com Ajuste salvo disponível para download.`,
      });
      return;
    }

    setIsProcessing(true);
    cancelRequestedRef.current = false;

    const periodLabel = activeTargetPeriod || 'Geral';
    const classLabel = classFilter !== 'all' ? classFilter : 'Todas_Turmas';
    const formatSuffix =
      exportFormat === 'circular'
        ? '_Circular'
        : exportFormat === 'models'
        ? '_Modelos'
        : '_3x4';
    const zipName = `Carometro_${periodLabel}_${classLabel}${formatSuffix}`;

    try {
      await generateCarometroZip(targetPool, {
        groupByClass: classFilter === 'all' && activeContext !== 'collaborator',
        zipFilename: zipName,
        namingFormat,
        exportFormat,
        isCircular,
        onProgress: (current, total, studentName) => {
          setProgressStatus({
            message: `Gerando imagem (${current}/${total}): ${studentName}`,
            current,
            total,
            percent: Math.round((current / total) * 100),
          });
        },
      });

      setToastMsg({
        type: 'success',
        text: `Pacote ZIP (${
          exportFormat === 'circular'
            ? 'Circular para perfil'
            : exportFormat === 'models'
            ? 'Modelos'
            : '3×4'
        }) com ${targetPool.length} fotografia(s) gerado com sucesso!`,
      });
    } catch (err: any) {
      console.error('Erro na exportação ZIP:', err);
      setToastMsg({ type: 'error', text: err.message || 'Falha na geração do pacote ZIP.' });
    } finally {
      setIsProcessing(false);
      setProgressStatus({ message: '', current: 0, total: 0, percent: 0 });
    }
  };

  // Export A4 PDF in native 300 DPI - ONLY includes students with status === 'saved'
  const handleExportPdf = async () => {
    const targetPool = getTargetExportPool();

    if (targetPool.length === 0) {
      setToastMsg({
        type: 'error',
        text: `Nenhum ${activeContext === 'collaborator' ? 'colaborador' : 'aluno'} com Ajuste salvo disponível para o PDF.`,
      });
      return;
    }

    setIsProcessing(true);
    cancelRequestedRef.current = false;

    const pages: CarometroStudentItem[][] = [];
    for (let i = 0; i < targetPool.length; i += STUDENTS_PER_A4_PAGE) {
      pages.push(targetPool.slice(i, i + STUDENTS_PER_A4_PAGE));
    }

    try {
      const isLandscape = pageOrientation === 'landscape';
      const pdf = createA4JsPdf(pageOrientation);
      const totalPages = pages.length;
      const exportW = isLandscape ? A4_LANDSCAPE_WIDTH_PX : A4_PRINT_WIDTH_PX;
      const exportH = isLandscape ? A4_LANDSCAPE_HEIGHT_PX : A4_PRINT_HEIGHT_PX;

      for (let pIdx = 0; pIdx < totalPages; pIdx++) {
        if (cancelRequestedRef.current) break;

        const pageStudents = pages[pIdx];
        setActivePageItemsForPdf(pageStudents);

        setProgressStatus({
          message: `Rasterizando folha A4 em 300 DPI (${pIdx + 1}/${totalPages})`,
          current: pIdx + 1,
          total: totalPages,
          percent: Math.round(((pIdx + 1) / totalPages) * 100),
        });

        // Aguarda estabilização do DOM e desenho dos canvases de alta resolução
        await new Promise((resolve) => setTimeout(resolve, 100));

        const containerEl = document.getElementById('carometro-export-a4-canvas');
        if (!containerEl) {
          throw new Error('Elemento de captura da folha A4 não encontrado.');
        }

        const pngDataUrl = await captureA4ElementToPng('carometro-export-a4-canvas', {
          orientation: pageOrientation,
          width: exportW,
          height: exportH,
          pixelRatio: 1,
        });
        addPngPageToA4Pdf(pdf, pngDataUrl, pIdx === 0, pageOrientation);
      }

      if (!cancelRequestedRef.current) {
        const periodLabel = activeTargetPeriod || 'Geral';
        const classLabel = classFilter !== 'all' ? classFilter : 'Todas_Turmas';
        const orientationSuffix = isLandscape ? '_Paisagem' : '_Retrato';
        saveA4Pdf(pdf, `Carometro_${periodLabel}_${classLabel}${orientationSuffix}`);

        setToastMsg({
          type: 'success',
          text: `PDF do Carômetro gerado em 300 DPI com sucesso (${totalPages} página${totalPages > 1 ? 's' : ''})!`,
        });
      }
    } catch (err: any) {
      console.error('Erro na exportação do PDF:', err);
      setToastMsg({ type: 'error', text: 'Falha na geração do PDF.' });
    } finally {
      setIsProcessing(false);
      setActivePageItemsForPdf([]);
      setProgressStatus({ message: '', current: 0, total: 0, percent: 0 });
    }
  };

  // Export current A4 page as a standalone 300 DPI PNG image
  const handleExportPngCurrentPage = async () => {
    const currentPageStudents = a4Pages[previewPageIndex] || [];
    if (currentPageStudents.length === 0) {
      setToastMsg({
        type: 'error',
        text: 'Nenhum aluno com Ajuste salvo nesta folha para exportar.',
      });
      return;
    }

    setIsProcessing(true);
    cancelRequestedRef.current = false;
    setActivePageItemsForPdf(currentPageStudents);

    try {
      setProgressStatus({
        message: `Renderizando folha ${previewPageIndex + 1} em 300 DPI nativos...`,
        current: 1,
        total: 1,
        percent: 50,
      });

      await new Promise((resolve) => setTimeout(resolve, 120));

      const containerEl = document.getElementById('carometro-export-a4-canvas');
      if (!containerEl) {
        throw new Error('Elemento de captura da folha A4 não encontrado.');
      }

      const isLandscape = pageOrientation === 'landscape';
      const exportW = isLandscape ? A4_LANDSCAPE_WIDTH_PX : A4_PRINT_WIDTH_PX;
      const exportH = isLandscape ? A4_LANDSCAPE_HEIGHT_PX : A4_PRINT_HEIGHT_PX;

      const pngDataUrl = await captureA4ElementToPng('carometro-export-a4-canvas', {
        orientation: pageOrientation,
        width: exportW,
        height: exportH,
        pixelRatio: 1,
      });

      const periodLabel = activeTargetPeriod || 'Geral';
      const classLabel = classFilter !== 'all' ? classFilter : 'Todas_Turmas';
      const orientationSuffix = isLandscape ? '_Paisagem' : '_Retrato';
      const fileName = `Carometro_${periodLabel}_${classLabel}_Folha_${previewPageIndex + 1}${orientationSuffix}.png`;

      const link = document.createElement('a');
      link.download = fileName;
      link.href = pngDataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setToastMsg({
        type: 'success',
        text: `Folha ${previewPageIndex + 1} exportada em PNG (300 DPI, ${exportW}×${exportH} px) com sucesso!`,
      });
    } catch (err: any) {
      console.error('Erro na exportação PNG da folha:', err);
      setToastMsg({ type: 'error', text: 'Falha ao exportar imagem PNG da folha.' });
    } finally {
      setIsProcessing(false);
      setActivePageItemsForPdf([]);
      setProgressStatus({ message: '', current: 0, total: 0, percent: 0 });
    }
  };

  if (!isOpen) return null;

  // Counts for situations in the active target period
  const savedCount = allPeriodItems.filter((i) => i.status === 'saved').length;
  const pendingCount = allPeriodItems.filter((i) => i.status === 'pending').length;
  const timelinePendingCount = allPeriodItems.filter((i) => i.status === 'timeline_pending').length;
  const photoOutdatedCount = allPeriodItems.filter((i) => i.status === 'photo_outdated').length;
  const missingPhotoCount = allPeriodItems.filter((i) => i.status === 'missing_photo').length;

  const eligibleCount = filteredItems.filter((it) => it.isEligibleForExport).length;
  const pendingAutoCount = filteredItems.filter(
    (it) =>
      it.hasPhoto &&
      it.hasSavedTimeline &&
      it.status === 'pending' &&
      !it.isPhotoOutdated &&
      !it.hasAutoFaceDetection
  ).length;

  if (!isOpen && !isInline) {
    return null;
  }

  const modalInner = (
    <div
      className={`bg-white rounded-2xl border border-slate-200 w-full flex flex-col ${
        isInline
          ? 'shadow-xs'
          : 'shadow-2xl max-w-6xl h-[92vh] overflow-hidden'
      }`}
    >
      {/* Modal / Page Top Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-xs ${
                isHistorical ? 'bg-amber-600 text-white' : 'bg-blue-600 text-white'
              }`}
            >
              {isHistorical ? <Archive className="w-5 h-5" /> : <List className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Carômetro Escolar</h2>
                <Badge variant={isHistorical ? 'warning' : 'primary'} size="sm">
                  Ano Letivo: {activeTargetPeriod || 'N/D'}
                </Badge>
                {isHistorical ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-md border border-amber-300">
                    <History className="w-3 h-3" />
                    Histórico
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-300">
                    <CheckCircle2 className="w-3 h-3" />
                    Período Atual
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isHistorical
                  ? 'Consulta e exportação histórica de carômetros de anos letivos anteriores.'
                  : 'Composição, enquadramento e impressão de fotografias do período letivo atual.'}
              </p>
            </div>
          </div>

          {/* Top Actions: Tabs Navigation + View Toggle + Close */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Tab Selector: Período Atual vs Consultar Anos Anteriores */}
            <div className="flex items-center bg-slate-200/90 p-0.5 rounded-lg text-xs font-medium border border-slate-300/70">
              <button
                type="button"
                onClick={() => setActiveTab('current')}
                className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === 'current'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>Carômetro Atual ({currentActivePeriodName || '—'})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === 'history'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <History className="w-3.5 h-3.5 text-amber-600" />
                <span>Consultar anos anteriores</span>
              </button>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-200/70 p-0.5 rounded-lg text-xs font-medium">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1.5 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Lista</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('a4_preview')}
                className={`px-2.5 py-1.5 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'a4_preview'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Folha A4</span>
              </button>
            </div>

            {onClose && !isInline && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Historical Mode Notice Banner */}
        {isHistorical && (
          <div className="px-6 py-2.5 bg-amber-50/90 border-b border-amber-200 flex items-center justify-between text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Modo de Consulta Histórica (Ano Letivo {activeTargetPeriod}):</strong> Visualização e exportação de carômetros anteriores. Ações de edição e alteração ficam desabilitadas para garantir a integridade do histórico.
              </span>
            </div>
          </div>
        )}

        {/* Toast / Alert Bar */}
        {toastMsg && (
          <div className="px-6 pt-3">
            <Alert
              variant={toastMsg.type === 'success' ? 'success' : 'error'}
              onClose={() => setToastMsg(null)}
            >
              {toastMsg.text}
            </Alert>
          </div>
        )}

        {/* Filter Toolbar */}
        <div className="px-6 py-3 border-b border-slate-200 bg-white space-y-3">
          {/* Context Selector: Alunos / Colaboradores */}
          <div className="inline-flex p-1 bg-slate-100/90 rounded-lg border border-slate-200/80">
            <button
              type="button"
              onClick={() => {
                setActiveContext('student');
                setClassFilter('all');
                setSearchTerm('');
              }}
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                activeContext === 'student'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Alunos</span>
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600">
                {studentCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveContext('collaborator');
                setClassFilter('all');
                setSearchTerm('');
              }}
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                activeContext === 'collaborator'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Colaboradores</span>
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600">
                {collaboratorCount}
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 items-center">
          {/* Seletor de Período Histórico (Apenas na aba 'history') */}
          {isHistorical ? (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Ano Letivo Anterior
              </label>
              {previousPeriods.length === 0 ? (
                <div className="text-xs font-semibold text-slate-500 py-1.5 px-2 bg-slate-100 rounded-lg border border-slate-200">
                  Nenhum período anterior
                </div>
              ) : (
                <select
                  value={selectedHistoricalPeriod}
                  onChange={(e) => setSelectedHistoricalPeriod(e.target.value)}
                  className={selectClasses}
                >
                  {previousPeriods.map((p) => (
                    <option key={p} value={p}>
                      Ano Letivo: {p}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            /* Na tela principal operacional (Período Atual), o período é fixo e não possui dropdown */
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Período Operacional
              </label>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50/80 border border-blue-200 rounded-lg text-xs font-bold text-blue-950">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>Ano Letivo: {currentActivePeriodName}</span>
              </div>
            </div>
          )}

          {/* Filtro de Turma (apenas para alunos) */}
          {activeContext !== 'collaborator' && (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Turma
              </label>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className={selectClasses}
              >
                <option value="all">
                  Todas as turmas ({allPeriodItems.length} alunos)
                </option>
                {availableClassesInPeriod.map((clsName) => {
                  const count = allPeriodItems.filter((i) => (i.className || '').trim().toLowerCase() === clsName.toLowerCase()).length;
                  return (
                    <option key={clsName} value={clsName}>
                      {clsName} ({count})
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Filtro de Situação */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Situação
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className={selectClasses}
            >
              <option value="all">Todas as situações ({allPeriodItems.length})</option>
              <option value="saved">Ajuste salvo ({savedCount})</option>
              <option value="pending">Pendente ({pendingCount})</option>
              <option value="timeline_pending">Composição pendente ({timelinePendingCount})</option>
              <option value="photo_outdated">Foto principal alterada ({photoOutdatedCount})</option>
              <option value="missing_photo">Sem foto ({missingPhotoCount})</option>
            </select>
          </div>

          {/* Busca */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              {activeContext === 'collaborator' ? 'Buscar Colaborador' : 'Buscar Aluno'}
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder={activeContext === 'collaborator' ? 'Buscar por colaborador ou código...' : 'Buscar por aluno ou matrícula...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`${inputClasses} pl-9`}
              />
            </div>
          </div>
        </div>
      </div>

        {/* Selection & Quick Batch Bar */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleToggleSelectAll}
              disabled={eligibleCount === 0}
              className={`flex items-center gap-1.5 font-semibold transition-colors ${
                eligibleCount === 0
                  ? 'text-slate-400 cursor-not-allowed'
                  : 'text-slate-700 hover:text-blue-600 cursor-pointer'
              }`}
            >
              {selectedStudentIds.length === eligibleCount && eligibleCount > 0 ? (
                <CheckSquare className="w-4 h-4 text-blue-600" />
              ) : selectedStudentIds.length > 0 ? (
                <MinusSquare className="w-4 h-4 text-blue-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>
                {selectedStudentIds.length === eligibleCount && eligibleCount > 0
                  ? 'Desmarcar todos'
                  : `Selecionar todos com Ajuste salvo (${eligibleCount})`}
              </span>
            </button>

            <span className="text-slate-400">•</span>

            <span className="text-slate-600">
              <strong>{eligibleSelectedItems.length}</strong> de <strong>{eligibleCount}</strong> {activeContext === 'collaborator' ? 'colaboradores' : 'alunos'} com ajuste salvo selecionados
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Auto-detect button: ONLY on current operational period, NEVER on historical */}
            {!isHistorical && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={Sparkles}
                onClick={handleAutoDetectAll}
                disabled={isProcessing || pendingAutoCount === 0}
                title={
                  pendingAutoCount === 0
                    ? `Nenhum ${activeContext === 'collaborator' ? 'colaborador' : 'aluno'} pendente para identificação automática no período atual.`
                    : `Identificar automaticamente o enquadramento de ${pendingAutoCount} ${activeContext === 'collaborator' ? 'colaborador(es)' : 'aluno(s)'} pendente(s)`
                }
              >
                Identificar rostos automaticamente
              </Button>
            )}

            {/* Download ZIP button */}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={Download}
              onClick={handleOpenDownloadModal}
              disabled={isProcessing || eligibleCount === 0}
              title="Baixar fotografias com Ajuste salvo compactadas em arquivo ZIP"
            >
              Baixar fotos (ZIP)
            </Button>

            {/* Print PDF button */}
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={FileText}
              onClick={handleExportPdf}
              disabled={isProcessing || eligibleCount === 0}
              title={`Gerar PDF A4 oficial do Carômetro para ${activeContext === 'collaborator' ? 'colaboradores' : 'alunos'} com Ajuste salvo`}
            >
              Imprimir Carômetro (PDF)
            </Button>
          </div>
        </div>

        {/* Progress Bar (Visible during batch/export operations) */}
        {isProcessing && (
          <div className="px-6 py-2 bg-blue-50 border-b border-blue-200 animate-in fade-in duration-150">
            <div className="flex items-center justify-between text-xs text-blue-900 font-semibold mb-1">
              <span className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                {progressStatus.message}
              </span>
              <span>{progressStatus.percent}%</span>
            </div>
            <div className="w-full bg-blue-200 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-200"
                style={{ width: `${progressStatus.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto bg-slate-50/50">
          {isHistorical && previousPeriods.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-md mx-auto space-y-3 shadow-2xs mt-6">
              <Archive className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-700">Nenhum ano anterior cadastrado</h3>
              <p className="text-xs text-slate-500">
                Não existem períodos letivos anteriores registrados no sistema para consulta.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setActiveTab('current')}
              >
                Voltar para Carômetro Atual
              </Button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-md mx-auto space-y-3 shadow-2xs mt-6">
              <ImageOff className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-700">
                {activeContext === 'collaborator' ? 'Nenhum colaborador encontrado' : 'Nenhum aluno encontrado'}
              </h3>
              <p className="text-xs text-slate-500">
                {activeContext === 'collaborator'
                  ? 'Verifique os filtros selecionados ou cadastre períodos para o colaborador.'
                  : 'Verifique os filtros selecionados ou cadastre matrículas para o período.'}
              </p>
              <Button
                variant="secondary"
                size="sm"
                icon={RotateCcw}
                onClick={() => {
                  setClassFilter('all');
                  setStatusFilter('all');
                  setSearchTerm('');
                }}
              >
                Limpar filtros
              </Button>
            </div>
          ) : viewMode === 'list' ? (
            /* Lightweight Table / List */
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4 w-10 text-center">
                      <span className="sr-only">Seleção</span>
                    </th>
                    <th className="py-3 px-4">{activeContext === 'collaborator' ? 'Colaborador' : 'Aluno'}</th>
                    {activeContext !== 'collaborator' && <th className="py-3 px-4">Turma</th>}
                    <th className="py-3 px-4">Situação</th>
                    <th className="py-3 px-4 text-right pr-6 w-32">
                      {isHistorical ? 'Status' : 'Ação'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map((item) => {
                    const isSelected = selectedStudentIds.includes(item.student.id);

                    return (
                      <tr
                        key={item.student.id}
                        className={`transition-colors hover:bg-slate-50/80 ${
                          isSelected ? 'bg-blue-50/30' : ''
                        }`}
                      >
                        {/* Checkbox: ONLY enabled if student has "Ajuste salvo" */}
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            disabled={!item.isEligibleForExport}
                            onClick={() => item.isEligibleForExport && handleToggleStudent(item.student.id)}
                            className={`p-1 transition-colors ${
                              item.isEligibleForExport
                                ? 'text-slate-400 hover:text-blue-600 cursor-pointer'
                                : 'text-slate-200 cursor-not-allowed'
                            }`}
                            title={
                              item.isEligibleForExport
                                ? isSelected
                                  ? `Desmarcar ${activeContext === 'collaborator' ? 'colaborador' : 'aluno'}`
                                  : `Selecionar ${activeContext === 'collaborator' ? 'colaborador' : 'aluno'} para impressão/download`
                                : `Apenas ${activeContext === 'collaborator' ? 'colaboradores' : 'alunos'} com Ajuste salvo podem ser selecionados para impressão e download`
                            }
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-blue-600" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-300" />
                            )}
                          </button>
                        </td>

                        {/* Aluno/Colaborador (Nome + Matrícula) */}
                        <td className="py-3 px-4 max-w-[280px]">
                          <div
                            className={`font-bold text-slate-900 uppercase break-words line-clamp-2 ${
                              item.student.name.length > 30 ? 'text-xs leading-snug' : 'text-sm'
                            }`}
                            title={item.student.name}
                          >
                            {item.student.name}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5 whitespace-nowrap">
                            {activeContext === 'collaborator' ? 'Cód / Mat' : 'Mat'}: {item.student.enrollment}
                          </div>
                        </td>

                        {/* Turma (apenas se aluno) */}
                        {activeContext !== 'collaborator' && (
                          <td className="py-3 px-4 font-semibold text-slate-700">
                            {item.className || '—'}
                          </td>
                        )}

                        {/* Situação */}
                        <td className="py-3 px-4">
                          {item.status === 'saved' && (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                              Ajuste salvo
                            </span>
                          )}
                          {item.status === 'pending' && (
                            <div className="flex flex-col items-start gap-1">
                              <span
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200"
                                title="Composição da Linha do Tempo salva. Ajuste do Carômetro pendente."
                              >
                                <Clock className="w-3 h-3 text-blue-600 shrink-0" />
                                Pendente
                              </span>
                              {item.hasAutoFaceDetection && (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200/80"
                                  title="Rosto identificado automaticamente. Clique em 'Ajustar' para conferir e salvar o enquadramento."
                                >
                                  <Sparkles className="w-2.5 h-2.5 text-indigo-500 shrink-0" />
                                  Rosto identificado
                                </span>
                              )}
                            </div>
                          )}
                          {item.status === 'photo_outdated' && (
                            <span
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200"
                              title="A foto principal foi alterada após o ajuste. Reajuste necessário."
                            >
                              <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                              Foto principal alterada
                            </span>
                          )}
                          {item.status === 'timeline_pending' && (
                            <span
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200"
                              title="Composição da Linha do Tempo deve ser salva antes de ajustar o Carômetro"
                            >
                              <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                              Composição pendente
                            </span>
                          )}
                          {item.status === 'missing_photo' && (
                            <span
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200"
                              title="Foto principal não cadastrada"
                            >
                              <ImageOff className="w-3 h-3 text-slate-400 shrink-0" />
                              Sem foto
                            </span>
                          )}
                        </td>

                        {/* Ação (Apenas no período atual; histórico é somente leitura) */}
                        <td className="py-3 px-4 text-right pr-6">
                          {isHistorical ? (
                            <span
                              className="text-slate-400 text-[11px] font-medium px-2 py-1 bg-slate-100 rounded-md border border-slate-200 select-none"
                              title="Registros históricos não podem ser alterados."
                            >
                              Histórico
                            </span>
                          ) : item.canAdjust ? (
                            <Button
                              type="button"
                              variant={item.status === 'photo_outdated' ? 'primary' : 'outline'}
                              size="sm"
                              icon={Edit2}
                              onClick={() => setEditingStudentItem(item)}
                              className="text-xs"
                            >
                              Ajustar
                            </Button>
                          ) : (
                            <span
                              className="text-slate-400 font-mono text-sm px-3 select-none"
                              title={
                                item.status === 'missing_photo'
                                  ? `Cadastre a fotografia principal ${activeContext === 'collaborator' ? 'do colaborador' : 'do aluno'} antes de ajustar o Carômetro.`
                                  : 'A Linha do Tempo deve ser composta e salva antes de ajustar o Carômetro.'
                              }
                            >
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Live A4 Print Sheet Preview - Strictly eligible students with "Ajuste salvo" */
            <div className="flex flex-col items-center space-y-4">
              {/* Pagination, Orientation and Single-Page Download Controls */}
              <div className="bg-white rounded-xl border border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs w-full max-w-4xl">
                {/* Paginação */}
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={ChevronLeft}
                    disabled={previewPageIndex <= 0}
                    onClick={() => setPreviewPageIndex((p) => Math.max(0, p - 1))}
                  >
                    Página Anterior
                  </Button>
                  <span className="text-xs font-bold text-slate-700 px-1">
                    Folha {previewPageIndex + 1} de {totalA4Pages}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={ChevronRight}
                    disabled={previewPageIndex >= totalA4Pages - 1}
                    onClick={() => setPreviewPageIndex((p) => Math.min(totalA4Pages - 1, p + 1))}
                  >
                    Próxima Página
                  </Button>
                </div>

                {/* Alternador de Orientação: Retrato (2480x3508) vs Paisagem (3508x2480) */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setPageOrientation('portrait');
                      setPreviewPageIndex(0);
                    }}
                    className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      pageOrientation === 'portrait'
                        ? 'bg-white text-blue-700 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Retrato (2480×3508)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPageOrientation('landscape');
                      setPreviewPageIndex(0);
                    }}
                    className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      pageOrientation === 'landscape'
                        ? 'bg-white text-blue-700 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Paisagem (3508×2480)
                  </button>
                </div>

                {/* Botão de download PNG da folha em 300 DPI nativos */}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={Download}
                  onClick={handleExportPngCurrentPage}
                  disabled={isProcessing || totalA4Pages === 0 || !a4Pages[previewPageIndex]?.length}
                  title="Baixar imagem PNG de alta resolução (300 DPI nativos) desta folha"
                >
                  Baixar Folha (PNG 300 DPI)
                </Button>
              </div>

              {/* Scaled A4 Sheet Component para visualização de tela */}
              <div className="shadow-2xl border border-slate-300 rounded-sm overflow-hidden bg-white">
                <CarometroA4Sheet
                  items={a4Pages[previewPageIndex] || []}
                  schoolConfig={schoolConfig}
                  periodName={activeTargetPeriod || undefined}
                  className={classFilter !== 'all' ? classFilter : undefined}
                  pageIndex={previewPageIndex}
                  totalPages={totalA4Pages}
                  orientation={pageOrientation}
                  scale={pageOrientation === 'landscape' ? 0.65 : 0.82}
                />
              </div>
            </div>
          )}
        </div>

        {/* Offscreen A4 Sheet for 300 DPI Native High Resolution Rasterization (2480x3508 or 3508x2480) */}
        <div
          style={{
            position: 'fixed',
            top: '-99999px',
            left: '-99999px',
            width: pageOrientation === 'landscape' ? `${A4_LANDSCAPE_WIDTH_PX}px` : `${A4_PRINT_WIDTH_PX}px`,
            height: pageOrientation === 'landscape' ? `${A4_LANDSCAPE_HEIGHT_PX}px` : `${A4_PRINT_HEIGHT_PX}px`,
            pointerEvents: 'none',
            zIndex: -9999,
          }}
          aria-hidden="true"
        >
          {activePageItemsForPdf.length > 0 && (
            <div
              id="carometro-export-a4-canvas"
              style={{
                width: pageOrientation === 'landscape' ? `${A4_LANDSCAPE_WIDTH_PX}px` : `${A4_PRINT_WIDTH_PX}px`,
                height: pageOrientation === 'landscape' ? `${A4_LANDSCAPE_HEIGHT_PX}px` : `${A4_PRINT_HEIGHT_PX}px`,
                transform: 'none',
              }}
            >
              <CarometroA4Sheet
                items={activePageItemsForPdf}
                schoolConfig={schoolConfig}
                periodName={activeTargetPeriod || undefined}
                className={classFilter !== 'all' ? classFilter : undefined}
                pageIndex={progressStatus.current > 0 ? progressStatus.current - 1 : previewPageIndex}
                totalPages={progressStatus.total > 0 ? progressStatus.total : totalA4Pages}
                orientation={pageOrientation}
                isPrintMode={true}
                scale={pageOrientation === 'landscape' ? A4_LANDSCAPE_PRINT_SCALE : A4_PRINT_SCALE}
              />
            </div>
          )}
        </div>

        {/* Individual Student Cropper Modal (Current period only) */}
        {editingStudentItem && !isHistorical && (
          <CarometroCropperModal
            isOpen={true}
            student={editingStudentItem.student}
            photoUrl={editingStudentItem.photoUrl}
            initialCrop={editingStudentItem.crop}
            hasSavedCrop={editingStudentItem.status === 'saved'}
            onSave={handleSaveCrop}
            onClose={() => setEditingStudentItem(null)}
          />
        )}

        {/* Download ZIP Naming & Format Options Modal */}
        {isDownloadModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">
                      Baixar fotos do Carômetro (ZIP)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Escolha o formato e a convenção de nomenclatura dos arquivos
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDownloadModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-5 overflow-y-auto">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    <strong>{getTargetExportPool().length}</strong> {activeContext === 'collaborator' ? 'colaborador(es)' : 'aluno(s)'} com <strong>Ajuste salvo</strong> serão exportados.
                  </span>
                </div>

                {/* 1. Escolha de Formato */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Formato de Exportação
                  </label>

                  <div className="space-y-2">
                    {/* Option: 3x4 */}
                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        exportFormat === '3x4'
                          ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="carometroExportFormat"
                        value="3x4"
                        checked={exportFormat === '3x4'}
                        onChange={() => setExportFormat('3x4')}
                        className="mt-0.5 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="text-xs">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>3×4 (Retangular)</span>
                          <span className="text-[10px] bg-slate-100 font-mono px-1.5 py-0.5 rounded text-slate-600 font-normal">
                            .JPG
                          </span>
                        </div>
                        <div className="text-slate-500 mt-0.5 text-[11px] leading-relaxed">
                          Exportação padrão 3×4 em alta resolução (300 DPI), utilizando exclusivamente o enquadramento do Carômetro 3×4.
                        </div>
                      </div>
                    </label>

                    {/* Option: Circular para perfil */}
                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        exportFormat === 'circular'
                          ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="carometroExportFormat"
                        value="circular"
                        checked={exportFormat === 'circular'}
                        onChange={() => setExportFormat('circular')}
                        className="mt-0.5 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="text-xs">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>Circular para perfil</span>
                          <span className="text-[10px] bg-blue-100 text-blue-800 font-mono px-1.5 py-0.5 rounded font-normal">
                            .PNG Transparente
                          </span>
                        </div>
                        <div className="text-slate-500 mt-0.5 text-[11px] leading-relaxed">
                          Formato circular recortado com borda e fundo transparente, ideal para sistemas e fotos de perfil. Utiliza o enquadramento Circular.
                        </div>
                      </div>
                    </label>

                    {/* Option: Modelos */}
                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        exportFormat === 'models'
                          ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="carometroExportFormat"
                        value="models"
                        checked={exportFormat === 'models'}
                        onChange={() => setExportFormat('models')}
                        className="mt-0.5 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="text-xs">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>Modelos</span>
                          <span className="text-[10px] bg-slate-100 font-mono px-1.5 py-0.5 rounded text-slate-600 font-normal">
                            Padrão do Sistema
                          </span>
                        </div>
                        <div className="text-slate-500 mt-0.5 text-[11px] leading-relaxed">
                          Exportação formatada conforme os modelos e layouts gráficos cadastrados para crachás.
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* 2. Padrão de Nome dos Arquivos */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Nome dos arquivos
                  </label>

                  <div className="space-y-2">
                    {/* Option 1: Matrícula e nome */}
                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        namingFormat === 'enrollment_name'
                          ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="carometroNamingFormat"
                        value="enrollment_name"
                        checked={namingFormat === 'enrollment_name'}
                        onChange={() => setNamingFormat('enrollment_name')}
                        className="mt-0.5 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="text-xs">
                        <div className="font-bold text-slate-900">Matrícula e nome</div>
                        <div className="text-slate-500 mt-0.5 font-mono text-[11px]">
                          Exemplo: 1234 - JOÃO DA SILVA.{exportFormat === 'circular' ? 'png' : 'jpg'}
                        </div>
                      </div>
                    </label>

                    {/* Option 2: Somente nome */}
                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        namingFormat === 'name_only'
                          ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="carometroNamingFormat"
                        value="name_only"
                        checked={namingFormat === 'name_only'}
                        onChange={() => setNamingFormat('name_only')}
                        className="mt-0.5 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="text-xs">
                        <div className="font-bold text-slate-900">Somente nome</div>
                        <div className="text-slate-500 mt-0.5 font-mono text-[11px]">
                          Exemplo: JOÃO DA SILVA.{exportFormat === 'circular' ? 'png' : 'jpg'}
                        </div>
                      </div>
                    </label>

                    {/* Option 3: Somente matrícula */}
                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        namingFormat === 'enrollment_only'
                          ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="carometroNamingFormat"
                        value="enrollment_only"
                        checked={namingFormat === 'enrollment_only'}
                        onChange={() => setNamingFormat('enrollment_only')}
                        className="mt-0.5 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="text-xs">
                        <div className="font-bold text-slate-900">Somente matrícula</div>
                        <div className="text-slate-500 mt-0.5 font-mono text-[11px]">
                          Exemplo: 1234.{exportFormat === 'circular' ? 'png' : 'jpg'}
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsDownloadModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  icon={Download}
                  onClick={handleConfirmDownloadZip}
                >
                  Baixar ZIP
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );

  if (isInline) {
    return modalInner;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150">
      {modalInner}
    </div>
  );
};
