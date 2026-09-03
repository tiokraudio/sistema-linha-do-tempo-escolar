import React, { useState, useEffect, useMemo } from 'react';
import {
  Student,
  AcademicYearRecord,
  LayoutModel,
  GeneratedTimeline,
  SchoolConfig,
  CropSettings,
  AcademicPeriod,
  WorkQueueItem,
  ClassRecord,
  PersonType,
} from '../types';
import { A4TimelinePreview, TimelinePhotoItemForPreview } from './A4TimelinePreview';
import { PhotoCropperModal } from './PhotoCropperModal';
import { DownloadTimelineModal } from './DownloadTimelineModal';
import { ReviewSheetPrintModal } from './ReviewSheetPrintModal';
import { TimelinePreviewModal } from './TimelinePreviewModal';
import { CarometroModal } from './CarometroModal';
import { downloadA4Pdf } from '../utils/pdfGenerator';
import {
  getStudentHistoricalTrajectory,
  buildTimelineItemsFromTrajectory,
  StudentHistoricalSlot,
} from '../utils/studentPhotoHistory';
import {
  OFFICIAL_CLASSES,
  getPedagogicalPosition,
  mapLegacyClassToOfficial,
} from '../utils/pedagogicalStructure';
import {
  buildWorkQueueData,
  hasSavedTimelineComposition,
  isCompositionInCurrentActivePeriod,
  getActiveAcademicPeriod,
  getActiveAcademicYear,
} from '../utils/workQueue';
import { PageHeader } from './ui/PageHeader';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Alert } from './ui/Alert';
import { Toast } from './ui/Toast';
import { Modal } from './ui/Modal';
import {
  Sparkles,
  Search,
  CheckCircle2,
  AlertCircle,
  Crop,
  Save,
  RotateCcw,
  Sliders,
  Calendar,
  GraduationCap,
  Briefcase,
  Info,
  FileDown,
  ArrowLeft,
  Filter,
  Clock,
  Layers,
  ImageOff,
  History,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
  Camera,
  Check,
  CheckSquare,
  Square,
  MinusSquare,
  Users,
  Play,
  FileText,
  Printer,
  Download,
  Lock,
  Eye,
  Edit2,
  ExternalLink,
  HelpCircle,
  Trash2,
  LayoutGrid,
} from 'lucide-react';

interface GenerateTimelineProps {
  students: Student[];
  records: AcademicYearRecord[];
  classes?: ClassRecord[];
  models: LayoutModel[];
  schoolConfig: SchoolConfig;
  timelines: GeneratedTimeline[];
  periods?: AcademicPeriod[];
  onSaveTimeline: (timeline: Omit<GeneratedTimeline, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onDeleteTimeline?: (timelineId: string) => Promise<void>;
  onUpdateRecordCrop?: (recordId: string, crop: CropSettings) => Promise<void>;
  onBatchAutoFaceCrop?: (updates: Array<{ recordId: string; autoFaceCrop: CropSettings }>) => Promise<void>;
  onRefreshData?: () => Promise<void>;
  onUpdatePeriodStatus?: (periodId: string, status: any) => Promise<void>;
  onClosePeriod?: (periodId: string, stats: any) => Promise<void>;
  onOpenStudentCentral?: (student: Student) => void;
  initialStudentId?: string;
  initialStatusFilter?:
    | 'all'
    | 'pending'
    | 'editing'
    | 'saved'
    | 'missing_photo'
    | 'exceeding'
    | 'selected';
}

export const GenerateTimeline: React.FC<GenerateTimelineProps> = ({
  students,
  records,
  classes = [],
  models,
  schoolConfig,
  timelines,
  periods = [],
  onSaveTimeline,
  onDeleteTimeline,
  onUpdateRecordCrop,
  onBatchAutoFaceCrop,
  onRefreshData,
  onOpenStudentCentral,
  initialStudentId = '',
  initialStatusFilter = 'all',
}) => {
  // Canonical configured classes from Configurações -> Turmas (only active, sorted by order)
  const activeClasses = useMemo(() => {
    if (classes && classes.length > 0) {
      return [...classes]
        .filter((c) => c.active !== false)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    return OFFICIAL_CLASSES.map((cls, idx) => ({
      id: cls.id,
      name: cls.name,
      stage: cls.stage,
      stageName: cls.stageName,
      position: cls.position,
      active: true,
      order: idx + 1,
      createdAt: cls.createdAt,
    }));
  }, [classes]);

  // Mode: Selected Student for Editor (ESTADO B) vs Production Hub (ESTADO A)
  const [selectedStudentId, setSelectedStudentId] = useState<string>(initialStudentId || '');

  // Tab State: Produção Atual ('current') vs Consultar Anos Anteriores ('history')
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');

  // 1. Identify currently active academic period from centralized source
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

  // Target operational period: strictly current period for 'current' tab, or chosen historical year
  const activeTargetPeriod = activeTab === 'current' ? currentActivePeriodName : selectedHistoricalPeriod;
  const isHistorical = activeTab === 'history';

  // Context: 'student' (default) | 'collaborator'
  const [activePersonType, setActivePersonType] = useState<PersonType>('student');

  // Work Queue Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    | 'all'
    | 'pending'
    | 'editing'
    | 'saved'
    | 'missing_photo'
    | 'exceeding'
    | 'selected'
  >(initialStatusFilter || 'all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 12;

  // Batch Multi-Selection State
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [showOnlyPendencies, setShowOnlyPendencies] = useState<boolean>(false);

  // Modals State
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState<boolean>(false);
  const [isReviewPrintModalOpen, setIsReviewPrintModalOpen] = useState<boolean>(false);
  const [isCarometroModalOpen, setIsCarometroModalOpen] = useState<boolean>(false);
  const [previewModalItem, setPreviewModalItem] = useState<WorkQueueItem | null>(null);

  // Continuous Production Queue & Unsaved Changes State
  const [workingQueueStudentIds, setWorkingQueueStudentIds] = useState<string[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [initialCompositionSnapshot, setInitialCompositionSnapshot] = useState<string>('');
  const [showUnsavedModal, setShowUnsavedModal] = useState<boolean>(false);
  const [pendingNavigationTarget, setPendingNavigationTarget] = useState<'hub' | 'prev' | 'next' | string | null>(null);

  // Single layout model
  const selectedModel = models.length > 0 ? models[0] : null;

  // Selected student object for ESTADO B
  const selectedStudent = students.find((s) => s.id === selectedStudentId) || null;
  const maxSlots = schoolConfig.photoHistorySlots ?? 10;

  // Derive historical trajectory for selected student
  const studentTrajectory = useMemo(() => {
    if (!selectedStudent) return null;
    return getStudentHistoricalTrajectory(
      selectedStudent.id,
      records,
      maxSlots,
      activeTargetPeriod,
      periods,
      selectedStudent.personType
    );
  }, [selectedStudent, records, maxSlots, activeTargetPeriod, periods]);

  const studentRecords = studentTrajectory ? studentTrajectory.allChronologicalSlots : [];
  const primaryRecord = studentTrajectory ? studentTrajectory.primaryRecord : null;
  const secondarySlotsCount = studentTrajectory ? studentTrajectory.secondarySlots.length : 0;
  const automaticConfigIndex = Math.max(secondarySlotsCount, 0);
  const hasLatestPhoto = Boolean(primaryRecord && primaryRecord.photoUrl && primaryRecord.photoUrl.trim().length > 0);

  // Editor State (ESTADO B)
  const [compositionItems, setCompositionItems] = useState<TimelinePhotoItemForPreview[]>([]);
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState<number>(0);
  const [cropperModalIndex, setCropperModalIndex] = useState<number | null>(null);
  const [existingComposition, setExistingComposition] = useState<GeneratedTimeline | null>(null);
  const [activeModelSnapshot, setActiveModelSnapshot] = useState<LayoutModel | null>(null);

  // Status & Saved state
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isReopened, setIsReopened] = useState(false);
  const [isCompositionSaved, setIsCompositionSaved] = useState(false);

  // Verificação de elegibilidade do período letivo ativo para exclusão de composição
  const isCurrentPeriod = useMemo(() => {
    const refYear = existingComposition?.year || activeTargetPeriod || primaryRecord?.year;
    return isCompositionInCurrentActivePeriod(refYear, periods);
  }, [existingComposition, activeTargetPeriod, primaryRecord, periods]);

  // Contextual students isolation based on activePersonType ('student' | 'collaborator')
  const contextualStudents = useMemo(() => {
    return students.filter((s) => (s.personType || 'student') === activePersonType);
  }, [students, activePersonType]);

  const studentCount = useMemo(() => {
    return students.filter((s) => (s.personType || 'student') === 'student').length;
  }, [students]);

  const collaboratorCount = useMemo(() => {
    return students.filter((s) => s.personType === 'collaborator').length;
  }, [students]);

  // Build Canonical Work Queue dataset for the active target period (current or selected historical)
  const workQueueData = useMemo(() => {
    return buildWorkQueueData(
      contextualStudents,
      records,
      timelines,
      maxSlots,
      periods,
      activeTargetPeriod || undefined
    );
  }, [contextualStudents, records, timelines, maxSlots, periods, activeTargetPeriod]);

  // Dynamic available classes for the active period (strictly derived from enrollment records of that year)
  const availableClassesInPeriod = useMemo(() => {
    const classSet = new Set<string>();
    workQueueData.forEach((it) => {
      if (it.latestClass && it.latestClass.trim() !== '' && it.latestClass !== '—') {
        classSet.add(it.latestClass.trim());
      }
    });
    return Array.from(classSet).sort((a, b) => {
      const posA = getPedagogicalPosition(a) ?? 999;
      const posB = getPedagogicalPosition(b) ?? 999;
      if (posA !== posB) return posA - posB;
      return a.localeCompare(b, 'pt-BR');
    });
  }, [workQueueData]);

  // Reset class filter and selections when switching tabs or changing historical year or person type
  useEffect(() => {
    setClassFilter('all');
    setSelectedStudentIds([]);
    setCurrentPage(1);
    setSearchTerm('');
  }, [activeTab, selectedHistoricalPeriod, activePersonType]);

  // KPIs Calculations for the active target period
  const pendingCount = useMemo(
    () => workQueueData.filter((d) => !hasSavedTimelineComposition(d)).length,
    [workQueueData]
  );
  const savedCount = useMemo(
    () => workQueueData.filter((d) => hasSavedTimelineComposition(d)).length,
    [workQueueData]
  );
  const missingPhotoCount = useMemo(
    () => workQueueData.filter((d) => d.hasMissingPhotos).length,
    [workQueueData]
  );
  const exceedingCount = useMemo(
    () => workQueueData.filter((d) => d.hasExceeding).length,
    [workQueueData]
  );
  const totalCount = workQueueData.length;

  const periodProgressPercent = totalCount > 0 ? Math.round((savedCount / totalCount) * 100) : 0;

  // Filtered Work Queue items
  const filteredWorkQueue = useMemo(() => {
    return workQueueData.filter((item) => {
      // Search by student name or enrollment
      const query = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !query ||
        item.student.name.toLowerCase().includes(query) ||
        item.student.enrollment.toLowerCase().includes(query);

      // Situation Filter (Regra Única: Composição Efetivamente Salva)
      let matchesStatus = true;
      if (statusFilter === 'pending') {
        matchesStatus = !hasSavedTimelineComposition(item);
      } else if (statusFilter === 'editing') {
        matchesStatus = !hasSavedTimelineComposition(item);
      } else if (statusFilter === 'saved') {
        matchesStatus = hasSavedTimelineComposition(item);
      } else if (statusFilter === 'missing_photo') {
        matchesStatus = item.hasMissingPhotos;
      } else if (statusFilter === 'exceeding') {
        matchesStatus = item.hasExceeding;
      } else if (statusFilter === 'selected') {
        matchesStatus = selectedStudentIds.includes(item.student.id);
        if (matchesStatus && showOnlyPendencies) {
          matchesStatus = !hasSavedTimelineComposition(item) || item.hasMissingPhotos || item.hasExceeding;
        }
      }

      // Class Filter
      let matchesClass = true;
      if (classFilter !== 'all') {
        matchesClass = item.latestClass.trim().toLowerCase() === classFilter.trim().toLowerCase();
      }

      return matchesSearch && matchesStatus && matchesClass;
    });
  }, [workQueueData, searchTerm, statusFilter, classFilter, selectedStudentIds, showOnlyPendencies]);

  // Derived Selection Summary Data
  const selectedItemsInWorkQueue = useMemo(() => {
    return workQueueData.filter((item) => selectedStudentIds.includes(item.student.id));
  }, [workQueueData, selectedStudentIds]);

  const selectedInFiltered = useMemo(() => {
    return filteredWorkQueue.filter((item) => selectedStudentIds.includes(item.student.id));
  }, [filteredWorkQueue, selectedStudentIds]);

  const isAllFilteredSelected = useMemo(() => {
    if (filteredWorkQueue.length === 0) return false;
    return filteredWorkQueue.every((item) => selectedStudentIds.includes(item.student.id));
  }, [filteredWorkQueue, selectedStudentIds]);

  const isSomeFilteredSelected = useMemo(() => {
    if (filteredWorkQueue.length === 0) return false;
    return (
      filteredWorkQueue.some((item) => selectedStudentIds.includes(item.student.id)) &&
      !isAllFilteredSelected
    );
  }, [filteredWorkQueue, selectedStudentIds, isAllFilteredSelected]);

  // Batch Multi-Selection Actions
  const handleToggleSelectStudent = (studentId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const handleToggleSelectAllFiltered = () => {
    if (isAllFilteredSelected) {
      const filteredIds = new Set(filteredWorkQueue.map((item) => item.student.id));
      setSelectedStudentIds((prev) => prev.filter((id) => !filteredIds.has(id)));
    } else {
      const currentSelected = new Set(selectedStudentIds);
      filteredWorkQueue.forEach((item) => currentSelected.add(item.student.id));
      setSelectedStudentIds(Array.from(currentSelected));
    }
  };

  const handleClearSelection = () => {
    setSelectedStudentIds([]);
    if (statusFilter === 'selected') {
      setStatusFilter('all');
      setShowOnlyPendencies(false);
    }
  };

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredWorkQueue.length / pageSize));
  const paginatedWorkQueue = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return filteredWorkQueue.slice(startIdx, startIdx + pageSize);
  }, [filteredWorkQueue, currentPage, pageSize]);

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, classFilter, showOnlyPendencies]);

  const handleClearFilters = () => {
    setStatusFilter('all');
    setClassFilter('all');
    setSearchTerm('');
    setShowOnlyPendencies(false);
    setCurrentPage(1);
  };

  // Select student and open Editor (ESTADO B)
  const handleSelectStudent = (studentId: string) => {
    const currentQueueIds = filteredWorkQueue.map((item) => item.student.id);
    setWorkingQueueStudentIds(currentQueueIds);
    setSelectedStudentId(studentId);
  };

  // Single PDF Download
  const handleDownloadPdf = async (timeline: GeneratedTimeline, studentName: string) => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await downloadA4Pdf(
        'timeline-modal-download-canvas',
        `linha_do_tempo_${studentName.replace(/\s+/g, '_')}`
      );
      setSuccessMsg('Linha do tempo baixada.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao gerar arquivo PDF.');
    }
  };

  // ==========================================
  // ESTADO B (EDITOR) SYNC & HANDLERS
  // ==========================================
  useEffect(() => {
    if (!selectedStudent || !studentTrajectory || studentTrajectory.totalRecordsCount === 0) {
      setCompositionItems([]);
      setIsReopened(false);
      setExistingComposition(null);
      setIsCompositionSaved(false);
      setHasUnsavedChanges(false);
      setInitialCompositionSnapshot('');
      return;
    }

    const targetYr = activeTargetPeriod || (primaryRecord ? String(primaryRecord.year) : '');
    const existing = targetYr
      ? (timelines.find((t) => t.studentId === selectedStudent.id && String(t.year) === String(targetYr)) || null)
      : null;

    if (existing) {
      setExistingComposition(existing);
      setIsReopened(true);
      setIsCompositionSaved(true);
      setActiveModelSnapshot(existing.modelSnapshot || selectedModel);

      const items: TimelinePhotoItemForPreview[] = (existing.photoItems || []).map((p) => ({
        recordId: p.recordId,
        year: p.year,
        className: p.className,
        photoUrl: p.photoUrl,
        cropSettings: p.cropSettings,
        isPrimary: p.isPrimary,
      }));
      setCompositionItems(items);
      setInitialCompositionSnapshot(JSON.stringify(items));
      setHasUnsavedChanges(false);
    } else {
      setExistingComposition(null);
      setIsReopened(false);
      setIsCompositionSaved(false);
      setActiveModelSnapshot(selectedModel);

      const items = buildTimelineItemsFromTrajectory(studentTrajectory);
      setCompositionItems(items);
      setInitialCompositionSnapshot('');
      setHasUnsavedChanges(true);
    }
  }, [selectedStudent, studentTrajectory, timelines, selectedModel, primaryRecord, activeTargetPeriod]);

  const activeModelToUse = activeModelSnapshot || selectedModel;

  const handleUpdateCurrentCrop = (field: keyof CropSettings, value: number) => {
    if (compositionItems[selectedPhotoIdx]) {
      const updated = [...compositionItems];
      updated[selectedPhotoIdx] = {
        ...updated[selectedPhotoIdx],
        cropSettings: {
          ...updated[selectedPhotoIdx].cropSettings,
          [field]: value,
        },
      };
      setCompositionItems(updated);
      setHasUnsavedChanges(JSON.stringify(updated) !== initialCompositionSnapshot);
    }
  };

  const handleResetCurrentCrop = () => {
    if (compositionItems[selectedPhotoIdx]) {
      const updated = [...compositionItems];
      updated[selectedPhotoIdx] = {
        ...updated[selectedPhotoIdx],
        cropSettings: { x: 50, y: 50, zoom: 1.0 },
      };
      setCompositionItems(updated);
      setHasUnsavedChanges(JSON.stringify(updated) !== initialCompositionSnapshot);
    }
  };

  const handleSaveComposition = async () => {
    if (!selectedStudent || !activeModelToUse || compositionItems.length === 0 || !primaryRecord) {
      setErrorMsg('Não há dados suficientes para salvar a composição.');
      return;
    }

    if (!isCurrentPeriod) {
      setErrorMsg('Não é possível salvar uma composição de período letivo anterior.');
      return;
    }

    if (!hasLatestPhoto) {
      setErrorMsg(
        'A fotografia do período letivo mais recente está pendente. Adicione a fotografia do aluno na Ficha do Aluno antes de produzir a Linha do Tempo.'
      );
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    setIsSaving(true);

    try {
      await onSaveTimeline({
        studentId: selectedStudent.id,
        studentName: selectedStudent.name,
        studentEnrollment: selectedStudent.enrollment,
        personType: (selectedStudent.personType === 'collaborator' ? 'collaborator' : 'student') as PersonType,
        year: activeTargetPeriod || primaryRecord.year,
        modelId: activeModelToUse.id,
        modelTitle: activeModelToUse.title,
        modelVersion: activeModelToUse.version,
        modelSnapshot: activeModelToUse,
        photoItems: compositionItems.map((item) => {
          const isDataOrBlobUrl =
            typeof item.photoUrl === 'string' &&
            (item.photoUrl.startsWith('data:') || item.photoUrl.startsWith('blob:'));
          return {
            recordId: item.recordId,
            year: item.year,
            className: item.className,
            photoUrl: isDataOrBlobUrl ? '' : item.photoUrl,
            cropSettings: item.cropSettings,
            isPrimary: !!item.isPrimary,
          };
        }),
        status: 'finalized',
        reviewStatus: 'pending',
        reviewedAt: undefined,
        reviewedBy: undefined,
        reviewChecklist: undefined,
      });

      setSuccessMsg('Composição salva com sucesso!');
      setIsReopened(true);
      setIsCompositionSaved(true);
      setInitialCompositionSnapshot(JSON.stringify(compositionItems));
      setHasUnsavedChanges(false);
      // Retorno automático para a tela principal de Produção (ESTADO A)
      setSelectedStudentId('');
    } catch (err: any) {
      setErrorMsg('Não foi possível salvar a composição: ' + (err?.message || ''));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteComposition = async () => {
    if (!existingComposition || !onDeleteTimeline) return;
    if (!isCurrentPeriod) {
      setErrorMsg('Não é possível excluir uma composição de período letivo anterior.');
      setShowDeleteModal(false);
      return;
    }
    setIsDeleting(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await onDeleteTimeline(existingComposition.id);
      setSuccessMsg('Composição excluída com sucesso! Os dados do aluno, histórico escolar e fotografias foram preservados.');
      setShowDeleteModal(false);
      setIsCompositionSaved(false);
      setExistingComposition(null);
      setIsReopened(false);
      if (studentTrajectory) {
        const items = buildTimelineItemsFromTrajectory(studentTrajectory);
        setCompositionItems(items);
        setInitialCompositionSnapshot(JSON.stringify(items));
      }
      setHasUnsavedChanges(false);
      // Retorno automático para a tela principal de Produção (ESTADO A)
      setSelectedStudentId('');
    } catch (err: any) {
      setErrorMsg('Erro ao excluir composição: ' + (err?.message || ''));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportSinglePdf = async () => {
    if (!selectedStudent) return;
    if (!isCompositionSaved) {
      setErrorMsg('Salve a composição antes de gerar o PDF.');
      return;
    }
    try {
      setIsExportingPdf(true);
      setErrorMsg('');
      await new Promise((resolve) => setTimeout(resolve, 100));
      await downloadA4Pdf(
        'timeline-editor-export-a4-canvas',
        `linha_do_tempo_${selectedStudent.name.replace(/\s+/g, '_')}`
      );
      setSuccessMsg('Linha do tempo baixada.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao gerar PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Continuous Queue Navigation
  const effectiveWorkingQueueIds = useMemo(() => {
    if (workingQueueStudentIds.length > 0 && workingQueueStudentIds.includes(selectedStudentId)) {
      return workingQueueStudentIds;
    }
    return filteredWorkQueue.map((item) => item.student.id);
  }, [workingQueueStudentIds, filteredWorkQueue, selectedStudentId]);

  const currentIndex = effectiveWorkingQueueIds.indexOf(selectedStudentId);
  const totalInQueue = effectiveWorkingQueueIds.length;
  const currentPositionNumber = currentIndex !== -1 ? currentIndex + 1 : 1;

  const handleRequestNavigate = (target: 'hub' | 'prev' | 'next' | string) => {
    if (hasUnsavedChanges) {
      setPendingNavigationTarget(target);
      setShowUnsavedModal(true);
    } else {
      executeNavigate(target);
    }
  };

  const executeNavigate = (target: 'hub' | 'prev' | 'next' | string) => {
    setShowUnsavedModal(false);
    setHasUnsavedChanges(false);

    if (target === 'hub') {
      setSelectedStudentId('');
      return;
    }

    if (target === 'prev') {
      if (currentIndex > 0) {
        setSelectedStudentId(effectiveWorkingQueueIds[currentIndex - 1]);
      }
      return;
    }

    if (target === 'next') {
      if (currentIndex < effectiveWorkingQueueIds.length - 1) {
        setSelectedStudentId(effectiveWorkingQueueIds[currentIndex + 1]);
      }
      return;
    }

    setSelectedStudentId(target);
  };

  // =========================================================================
  // RENDER: ESTADO B (EDITOR VISUAL A4)
  // =========================================================================
  if (selectedStudentId && selectedStudent) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Navigation & Breadcrumb Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleRequestNavigate('hub')}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-extrabold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar para Produção</span>
            </button>

            <span className="text-slate-300">|</span>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black text-slate-900 uppercase tracking-tight">
                  {selectedStudent.name}
                </h1>
                {onOpenStudentCentral && (
                  <button
                    type="button"
                    onClick={() => onOpenStudentCentral(selectedStudent)}
                    className="text-[10px] text-blue-600 hover:underline font-bold"
                  >
                    Ver Ficha
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500 font-mono">
                Matrícula: {selectedStudent.enrollment} •{' '}
                {selectedStudent.personType === 'collaborator'
                  ? `Período ${primaryRecord?.year || '—'}`
                  : `${primaryRecord?.className || '—'} (${primaryRecord?.year || '—'})`}
              </p>
            </div>
          </div>

          {/* Continuous Queue Navigation (Prev / Next) */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-bold mr-2">
              {activePersonType === 'collaborator' ? 'Colaborador' : 'Aluno'} {currentPositionNumber} de {totalInQueue}
            </span>

            <button
              type="button"
              disabled={currentIndex <= 0}
              onClick={() => handleRequestNavigate('prev')}
              className="p-2 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Aluno Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              disabled={currentIndex >= totalInQueue - 1}
              onClick={() => handleRequestNavigate('next')}
              className="p-2 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Próximo Aluno"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Feedback Notifications */}
        {successMsg && (
          <Toast message={successMsg} onClose={() => setSuccessMsg('')} />
        )}

        {errorMsg && (
          <Alert variant="error" onClose={() => setErrorMsg('')}>
            {errorMsg}
          </Alert>
        )}

        {/* Main Editor Layout: Canvas on Left / Controls on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* A4 Live Canvas Container */}
          <div className="lg:col-span-8 flex flex-col items-center justify-center bg-slate-200/80 p-6 rounded-3xl border border-slate-300 min-h-[560px] overflow-hidden">
            {/* Canvas Toolbar */}
            <div className="w-full flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowGrid(!showGrid)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    showGrid
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-2xs'
                  }`}
                  title="Alternar grade visual de referência (5%)"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Grade: {showGrid ? 'Ligada' : 'Desligada'}</span>
                </button>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                Grade de referência visual (5%)
              </span>
            </div>

            <div
              id="timeline-editor-canvas-container"
              className="shadow-2xl rounded-xl overflow-hidden bg-white border border-slate-300 relative"
            >
              {activeModelToUse && (
                <A4TimelinePreview
                  studentName={selectedStudent.name}
                  studentEnrollment={selectedStudent.enrollment}
                  model={activeModelToUse}
                  schoolConfig={schoolConfig}
                  photoItems={compositionItems}
                  scale={0.65}
                  selectedPhotoIndex={selectedPhotoIdx}
                  onSelectPhotoIndex={(idx) => setSelectedPhotoIdx(idx)}
                  onEditPhotoCrop={(idx) => setCropperModalIndex(idx)}
                  interactive={true}
                  showGrid={showGrid}
                  personType={selectedStudent.personType || 'student'}
                />
              )}
            </div>
          </div>

          {/* Right Controls Panel */}
          <div className="lg:col-span-4 space-y-4">
            {/* Slot Photo Thumbnails & Selection */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-600" />
                  Fotos do Histórico ({compositionItems.length})
                </span>
                <span className="text-[10px] text-slate-400 font-bold">
                  Config. {automaticConfigIndex}
                </span>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {compositionItems.map((item, idx) => {
                  const isSelected = selectedPhotoIdx === idx;
                  const isPrimary = !!item.isPrimary;
                  return (
                    <div
                      key={idx}
                      className={`w-full p-2 rounded-2xl border flex items-center justify-between gap-2 transition-all ${
                        isSelected
                          ? 'bg-blue-50 border-blue-500 shadow-xs'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedPhotoIdx(idx)}
                        className="flex-1 text-left flex items-center gap-2.5 min-w-0 cursor-pointer"
                      >
                        <div className="w-9 h-9 rounded-xl bg-slate-200 border border-slate-300 overflow-hidden shrink-0 flex items-center justify-center">
                          {item.photoUrl ? (
                            <img
                              src={item.photoUrl}
                              alt="Foto"
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <ImageOff className="w-4 h-4 text-slate-400" />
                          )}
                        </div>

                        <div className="truncate">
                          <span className="text-xs font-extrabold text-slate-900 block truncate">
                            {item.year}{item.className ? ` • ${item.className}` : ''}
                          </span>
                          <span className="text-[10px] text-slate-500 block truncate">
                            {isPrimary ? 'Foto Principal (Atual)' : `Posição ${idx}`}
                          </span>
                        </div>
                      </button>

                      {item.photoUrl && (
                        <button
                          type="button"
                          onClick={() => setCropperModalIndex(idx)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-white rounded-lg transition-colors cursor-pointer shrink-0"
                          title="Ajustar enquadramento"
                        >
                          <Crop className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Crop / Zoom Controls for Selected Slot */}
            {compositionItems[selectedPhotoIdx] && compositionItems[selectedPhotoIdx].photoUrl && (
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-blue-600" />
                    Ajuste Fino ({compositionItems[selectedPhotoIdx].year})
                  </span>
                  <button
                    type="button"
                    onClick={handleResetCurrentCrop}
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    Resetar
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  {/* Zoom */}
                  <div>
                    <div className="flex items-center justify-between text-slate-500 font-bold mb-1">
                      <span>Zoom</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.05"
                          min="1"
                          max="3"
                          value={compositionItems[selectedPhotoIdx].cropSettings.zoom}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) handleUpdateCurrentCrop('zoom', val);
                          }}
                          className="w-14 px-1.5 py-0.5 text-[11px] border border-slate-300 rounded text-center font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="text-[11px] text-slate-400">x</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="3"
                      step="0.05"
                      value={compositionItems[selectedPhotoIdx].cropSettings.zoom}
                      onChange={(e) => handleUpdateCurrentCrop('zoom', parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>

                  {/* Horizontal Position */}
                  <div>
                    <div className="flex items-center justify-between text-slate-500 font-bold mb-1">
                      <span>Posição Horizontal</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          max="100"
                          value={compositionItems[selectedPhotoIdx].cropSettings.x}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val)) handleUpdateCurrentCrop('x', val);
                          }}
                          className="w-14 px-1.5 py-0.5 text-[11px] border border-slate-300 rounded text-center font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="text-[11px] text-slate-400">%</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={compositionItems[selectedPhotoIdx].cropSettings.x}
                      onChange={(e) => handleUpdateCurrentCrop('x', parseInt(e.target.value, 10))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>

                  {/* Vertical Position */}
                  <div>
                    <div className="flex items-center justify-between text-slate-500 font-bold mb-1">
                      <span>Posição Vertical</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          max="100"
                          value={compositionItems[selectedPhotoIdx].cropSettings.y}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val)) handleUpdateCurrentCrop('y', val);
                          }}
                          className="w-14 px-1.5 py-0.5 text-[11px] border border-slate-300 rounded text-center font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="text-[11px] text-slate-400">%</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={compositionItems[selectedPhotoIdx].cropSettings.y}
                      onChange={(e) => handleUpdateCurrentCrop('y', parseInt(e.target.value, 10))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons: Save & Export */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3">
              {!hasLatestPhoto && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span className="text-[11px] leading-relaxed">
                    <strong>Fotografia Pendente:</strong> A fotografia do período mais recente ({primaryRecord?.year || 'atual'}) ainda não foi cadastrada. Adicione a fotografia na Ficha do Aluno para habilitar o salvamento e a produção da Linha do Tempo.
                  </span>
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveComposition}
                disabled={isSaving || !hasLatestPhoto || !hasUnsavedChanges}
                className={`w-full py-3 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md ${
                  !hasLatestPhoto || !hasUnsavedChanges
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                }`}
                title={
                  !hasLatestPhoto
                    ? 'Foto do período mais recente pendente'
                    : !hasUnsavedChanges
                    ? 'Nenhuma alteração para salvar'
                    : 'Salvar Composição'
                }
              >
                <Save className="w-4 h-4" />
                <span>
                  {isSaving
                    ? 'Salvando...'
                    : !hasLatestPhoto
                    ? 'Foto do Período Recente Pendente'
                    : 'Salvar Composição'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleExportSinglePdf}
                disabled={isExportingPdf || !isCompositionSaved}
                className={`w-full py-3 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md ${
                  !isCompositionSaved
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                    : 'bg-slate-900 hover:bg-black text-white cursor-pointer'
                }`}
                title={
                  !isCompositionSaved
                    ? 'Salve a composição antes de gerar o PDF'
                    : 'Baixar Linha do Tempo'
                }
              >
                <FileDown className="w-4 h-4" />
                <span>
                  {isExportingPdf ? 'Gerando...' : 'Baixar Linha do Tempo'}
                </span>
              </button>

              {/* Action: Excluir Composição */}
              {isCompositionSaved && onDeleteTimeline && (
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => isCurrentPeriod && setShowDeleteModal(true)}
                    disabled={isDeleting || isSaving || !isCurrentPeriod}
                    className={`w-full py-2.5 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                      !isCurrentPeriod
                        ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                        : 'text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 cursor-pointer'
                    }`}
                    title={
                      !isCurrentPeriod
                        ? 'Composições de períodos anteriores não podem ser excluídas.'
                        : 'Excluir o trabalho gráfico desta composição (mantém o aluno, fotos e matrículas)'
                    }
                  >
                    <Trash2 className={`w-4 h-4 ${!isCurrentPeriod ? 'text-slate-400' : 'text-rose-600'}`} />
                    <span>Excluir Composição</span>
                  </button>
                  {!isCurrentPeriod && (
                    <p className="text-[11px] text-slate-500 font-medium text-center">
                      Composições de períodos anteriores não podem ser excluídas.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cropper Modal */}
        {cropperModalIndex !== null && compositionItems[cropperModalIndex] && (
          <PhotoCropperModal
            isOpen={true}
            photoUrl={compositionItems[cropperModalIndex].photoUrl}
            initialCrop={compositionItems[cropperModalIndex].cropSettings}
            frameOverlayUrl={
              !compositionItems[cropperModalIndex].isPrimary
                ? activeModelToUse.secondaryFrameUrl
                : undefined
            }
            isPrimary={!!compositionItems[cropperModalIndex].isPrimary}
            onClose={() => setCropperModalIndex(null)}
            onSave={(newCrop) => {
              const updated = [...compositionItems];
              updated[cropperModalIndex] = {
                ...updated[cropperModalIndex],
                cropSettings: newCrop,
              };
              setCompositionItems(updated);
              setHasUnsavedChanges(JSON.stringify(updated) !== initialCompositionSnapshot);
              setCropperModalIndex(null);
            }}
          />
        )}

        {/* Delete Composition Confirmation Modal (B.28.5) */}
        <Modal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          title="Excluir composição salva?"
          size="sm"
          footer={
            <div className="flex items-center justify-end gap-2 w-full">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleDeleteComposition}
                isLoading={isDeleting}
              >
                Excluir
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              Esta ação removerá a composição salva da Linha do Tempo de <strong>{selectedStudent?.name}</strong>.
            </p>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
              O aluno, histórico de matrículas e fotos originais serão preservados.
            </div>
          </div>
        </Modal>

        {/* Unsaved Changes Confirmation Modal */}
        <Modal
          isOpen={showUnsavedModal}
          onClose={() => setShowUnsavedModal(false)}
          title="Alterações não salvas"
          size="sm"
          footer={
            <div className="flex items-center justify-end gap-2 w-full">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowUnsavedModal(false)}
              >
                Continuar editando
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => executeNavigate(pendingNavigationTarget || 'hub')}
              >
                Descartar
              </Button>
            </div>
          }
        >
          <p className="text-xs text-slate-600">
            Você possui ajustes de enquadramento não salvos. Se sair agora, as alterações serão descartadas.
          </p>
        </Modal>

        {/* Hidden Offscreen 1:1 Scale A4 Container for High-Resolution PDF Export from Editor */}
        {selectedStudent && activeModelToUse && (
          <div
            style={{
              position: 'fixed',
              top: '-99999px',
              left: '-99999px',
              width: '794px',
              height: '1123px',
              pointerEvents: 'none',
              zIndex: -9999,
            }}
            aria-hidden="true"
          >
            <div id="timeline-editor-export-a4-canvas" style={{ width: '794px', height: '1123px' }}>
              <A4TimelinePreview
                id="timeline-editor-export-element"
                studentName={selectedStudent.name}
                studentEnrollment={selectedStudent.enrollment}
                model={activeModelToUse}
                schoolConfig={schoolConfig}
                photoItems={compositionItems}
                scale={1}
                interactive={false}
                showGrid={false}
                personType={selectedStudent.personType || 'student'}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // RENDER: ESTADO A (CENTRAL OPERACIONAL DE PRODUÇÃO DA LINHA DO TEMPO)
  // =========================================================================
  return (
    <div className="space-y-4">
      {/* SELETOR DE MODO / PERÍODO LETIVO (PADRÃO CARÔMETRO ESCOLAR) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1 border-b border-slate-200">
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('current')}
            className={`px-3.5 py-1.5 rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'current'
                ? 'bg-white text-slate-900 shadow-xs font-bold ring-1 ring-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span>Produção Atual ({currentActivePeriodName || '—'})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-1.5 rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-white text-slate-900 shadow-xs font-bold ring-1 ring-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <History className="w-3.5 h-3.5 text-amber-600" />
            <span>Consultar anos anteriores</span>
          </button>
        </div>

        {/* Informações contextuais do período ativo / histórico */}
        <div className="flex items-center gap-2">
          {activeTab === 'current' ? (
            <Badge variant="success" size="sm">
              Período Letivo Ativo: {currentActivePeriodName || 'Não configurado'}
            </Badge>
          ) : (
            <Badge variant="warning" size="sm">
              Modo Consulta: {selectedHistoricalPeriod || 'Nenhum ano anterior'}
            </Badge>
          )}
        </div>
      </div>

      {/* Cabeçalho Padronizado */}
      <PageHeader
        title={activeTab === 'current' ? 'Produção' : 'Histórico de Produção'}
        subtitle={
          activeTab === 'current'
            ? `Linha do tempo dos ${activePersonType === 'collaborator' ? 'colaboradores' : 'alunos'} no período letivo atual.`
            : 'Consulta e exportação de composições de anos letivos anteriores.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* GRUPO 1 — LINHA DO TEMPO */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80">
              <Button
                variant="ghost"
                size="sm"
                icon={FileText}
                disabled={savedCount === 0}
                onClick={() => setIsReviewPrintModalOpen(true)}
                title="Imprimir conferência das composições salvas"
                className="text-slate-700 hover:text-slate-900 hover:bg-white text-xs font-semibold"
              >
                Imprimir conferência
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={Download}
                disabled={savedCount === 0}
                onClick={() => setIsDownloadModalOpen(true)}
                title="Baixar Linha do Tempo em PDF único ou ZIP individual"
                className="text-xs font-semibold shadow-xs"
              >
                Baixar Linha do Tempo
              </Button>
            </div>

            {activeTab === 'current' && (
              <>
                {/* Divisor Visual entre Módulos */}
                <div className="hidden sm:block h-6 w-px bg-slate-200" aria-hidden="true" />

                {/* GRUPO 2 — CARÔMETRO ESCOLAR */}
                <div className="flex items-center p-1 bg-slate-100/90 rounded-xl border border-slate-200/80">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={LayoutGrid}
                    onClick={() => setIsCarometroModalOpen(true)}
                    title="Carômetro Escolar: Composição e impressão de fotografias dos alunos"
                    className="text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 text-xs font-semibold border-slate-200"
                  >
                    Compor Carômetro
                  </Button>
                </div>
              </>
            )}
          </div>
        }
      />

      {/* AVISO DO MODO HISTÓRICO */}
      {isHistorical && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-amber-950 shadow-2xs">
          <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            <p className="font-bold text-amber-900">
              Modo Histórico — Somente Consulta e Exportação ({selectedHistoricalPeriod || '—'})
            </p>
            <p className="text-amber-800 text-[11px] leading-relaxed">
              Você está visualizando os registros do ano letivo de <strong>{selectedHistoricalPeriod}</strong>. Neste modo, as composições são exibidas apenas para consulta, conferência e download. Não é permitido criar, alterar ou excluir composições de períodos anteriores.
            </p>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {successMsg && (
        <Toast message={successMsg} onClose={() => setSuccessMsg('')} />
      )}

      {/* Error Alert */}
      {errorMsg && (
        <Alert variant="error" onClose={() => setErrorMsg('')}>
          {errorMsg}
        </Alert>
      )}

      {/* KPIS DE PRODUÇÃO / HISTÓRICO */}
      <div className="space-y-2.5">
        {/* 3 KPIs Principais */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* 1. Pendentes / Sem composição */}
          <button
            type="button"
            onClick={() => {
              setStatusFilter('pending');
              setShowOnlyPendencies(false);
            }}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              statusFilter === 'pending'
                ? 'bg-amber-50 border-amber-300 text-amber-950 ring-2 ring-amber-400/20 shadow-xs'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800 shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-slate-500">
                {isHistorical ? 'Sem composição' : 'Pendentes'}
              </span>
              <Clock className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <p className="text-xl font-bold text-slate-900">{pendingCount}</p>
            <span className="text-[11px] text-slate-500">
              {isHistorical ? 'Composição não realizada naquele ano' : 'Aguardando composição'}
            </span>
          </button>

          {/* 2. Salvas */}
          <button
            type="button"
            onClick={() => {
              setStatusFilter('saved');
              setShowOnlyPendencies(false);
            }}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              statusFilter === 'saved'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950 ring-2 ring-emerald-400/20 shadow-xs'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800 shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-slate-500">Salvas</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <p className="text-xl font-bold text-slate-900">{savedCount}</p>
            <span className="text-[11px] text-slate-500">Composição realizada</span>
          </button>

          {/* 3. Foto pendente (no Atual) ou Total (no Histórico) */}
          {isHistorical ? (
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white text-left shadow-2xs">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-slate-500">
                  Total de {activePersonType === 'collaborator' ? 'Colaboradores' : 'Alunos'}
                </span>
                <GraduationCap className="w-3.5 h-3.5 text-blue-500" />
              </div>
              <p className="text-xl font-bold text-slate-900">{totalCount}</p>
              <span className="text-[11px] text-slate-500">Registrados em {selectedHistoricalPeriod || '—'}</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('missing_photo');
                setShowOnlyPendencies(false);
              }}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                statusFilter === 'missing_photo'
                  ? 'bg-rose-50 border-rose-300 text-rose-950 ring-2 ring-rose-400/20 shadow-xs'
                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-slate-500">Foto pendente</span>
                <ImageOff className="w-3.5 h-3.5 text-rose-500" />
              </div>
              <p className="text-xl font-bold text-slate-900">{missingPhotoCount}</p>
              <span className="text-[11px] text-slate-500">Fotografia ausente no período</span>
            </button>
          )}
        </div>

        {/* Filtros rápidos secundários & Indicador de Progresso */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setShowOnlyPendencies(false);
              }}
              className={`px-2.5 py-1 rounded-lg border text-xs transition-colors cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white border-slate-900 font-medium'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Todos ({totalCount})
            </button>

            {!isHistorical && exceedingCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('exceeding');
                  setShowOnlyPendencies(false);
                }}
                className={`px-2.5 py-1 rounded-lg border text-xs transition-colors cursor-pointer flex items-center gap-1 ${
                  statusFilter === 'exceeding'
                    ? 'bg-purple-600 text-white border-purple-600 font-medium'
                    : 'bg-purple-50/70 text-purple-700 border-purple-200 hover:bg-purple-100/70'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>Histórico excedente ({exceedingCount})</span>
              </button>
            )}

            {selectedStudentIds.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('selected');
                  setShowOnlyPendencies(false);
                }}
                className={`px-2.5 py-1 rounded-lg border text-xs transition-colors cursor-pointer flex items-center gap-1 ${
                  statusFilter === 'selected'
                    ? 'bg-blue-600 text-white border-blue-600 font-medium'
                    : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                }`}
              >
                <CheckSquare className="w-3 h-3" />
                <span>Selecionados ({selectedStudentIds.length})</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
            <span>Progresso: {periodProgressPercent}% ({savedCount}/{totalCount})</span>
            <div className="w-24 bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${periodProgressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS UNIFICADA */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs space-y-2.5">
        {/* Context Selector: Alunos / Colaboradores */}
        <div className="inline-flex p-1 bg-slate-100/90 rounded-lg border border-slate-200/80">
          <button
            type="button"
            onClick={() => {
              setActivePersonType('student');
              setCurrentPage(1);
            }}
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activePersonType === 'student'
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
              setActivePersonType('collaborator');
              setCurrentPage(1);
            }}
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activePersonType === 'collaborator'
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

        <div className={`grid grid-cols-1 sm:grid-cols-2 ${isHistorical ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-2.5`}>
          {/* Seletor de Período Histórico (apenas no modo Histórico) */}
          {isHistorical && (
            <div>
              <select
                value={selectedHistoricalPeriod}
                onChange={(e) => setSelectedHistoricalPeriod(e.target.value)}
                className="w-full px-3 py-2 bg-amber-50/60 hover:bg-amber-100/70 focus:bg-white border border-amber-300 rounded-lg text-xs font-bold text-amber-950 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-colors cursor-pointer"
              >
                {previousPeriods.length === 0 ? (
                  <option value="">Nenhum período anterior</option>
                ) : (
                  previousPeriods.map((period) => (
                    <option key={period} value={period}>
                      Ano letivo: {period} (Histórico)
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          {/* Turma (turmas dinâmicas daquele período) */}
          <div>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors cursor-pointer"
            >
              <option value="all">Todas as turmas ({availableClassesInPeriod.length})</option>
              {availableClassesInPeriod.map((clsName) => (
                <option key={clsName} value={clsName}>
                  {clsName}
                </option>
              ))}
            </select>
          </div>

          {/* Situação */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors cursor-pointer"
            >
              <option value="all">Situação: Todas</option>
              <option value="pending">
                {isHistorical ? 'Situação: Sem composição' : 'Situação: Pendentes'}
              </option>
              <option value="saved">Situação: Salvas</option>
              {!isHistorical && <option value="missing_photo">Situação: Foto pendente</option>}
              {!isHistorical && exceedingCount > 0 && (
                <option value="exceeding">Situação: Histórico excedente</option>
              )}
              {selectedStudentIds.length > 0 && (
                <option value="selected">Situação: Selecionados ({selectedStudentIds.length})</option>
              )}
            </select>
          </div>

          {/* Busca */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder={
                activePersonType === 'collaborator'
                  ? 'Buscar colaborador por nome ou código...'
                  : 'Buscar aluno por nome ou matrícula...'
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
            />
          </div>
        </div>

        {/* Atalho para limpar filtros ativos */}
        {(searchTerm || classFilter !== 'all' || statusFilter !== 'all') && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500">
              Mostrando <strong>{filteredWorkQueue.length}</strong> de <strong>{totalCount}</strong>{' '}
              {activePersonType === 'collaborator' ? 'colaboradores' : 'alunos'}.
            </span>
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpar filtros</span>
            </button>
          </div>
        )}
      </div>

      {/* TABELA PRINCIPAL DE PRODUÇÃO */}
      {filteredWorkQueue.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center space-y-3 shadow-2xs">
          <CheckCircle2 className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="font-bold text-slate-700 text-sm">
            Nenhum {activePersonType === 'collaborator' ? 'colaborador' : 'aluno'} encontrado para os filtros selecionados.
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {isHistorical
              ? `Tente alterar o período histórico, turma ou situação para visualizar outros ${activePersonType === 'collaborator' ? 'colaboradores' : 'alunos'}.`
              : `Tente alterar a turma ou situação para visualizar outros ${activePersonType === 'collaborator' ? 'colaboradores' : 'alunos'}.`}
          </p>
          <Button variant="secondary" size="sm" icon={RotateCcw} onClick={handleClearFilters}>
            Ver todos os {activePersonType === 'collaborator' ? 'colaboradores' : 'alunos'}
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          {/* Barra de Status do Topo da Tabela */}
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 text-xs">
            <button
              type="button"
              onClick={handleToggleSelectAllFiltered}
              className="flex items-center gap-2 text-slate-700 hover:text-blue-600 font-medium transition-colors cursor-pointer"
            >
              {isAllFilteredSelected ? (
                <CheckSquare className="w-4 h-4 text-blue-600" />
              ) : isSomeFilteredSelected ? (
                <MinusSquare className="w-4 h-4 text-blue-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>
                {isAllFilteredSelected ? 'Desmarcar todos' : `Selecionar todos (${filteredWorkQueue.length})`}
              </span>
            </button>

            <span className="text-slate-400 text-[11px]">
              Exibindo <strong>{paginatedWorkQueue.length}</strong> de <strong>{filteredWorkQueue.length}</strong>{' '}
              {activePersonType === 'collaborator' ? 'colaboradores' : 'alunos'}
            </span>
          </div>

          {/* Conteúdo da Tabela */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-3 w-10 text-center">Sel.</th>
                  <th className="py-2.5 px-3">{activePersonType === 'collaborator' ? 'Colaborador' : 'Aluno'}</th>
                  <th className="py-2.5 px-3">Turma</th>
                  <th className="py-2.5 px-3">Fotografias</th>
                  <th className="py-2.5 px-3 text-center">Composição</th>
                  <th className="py-2.5 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {paginatedWorkQueue.map((item) => {
                  const isSelected = selectedStudentIds.includes(item.student.id);
                  const isSaved = item.isSaved;

                  return (
                    <tr
                      key={item.student.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => handleToggleSelectStudent(item.student.id, e)}
                          className="p-1 rounded text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300" />
                          )}
                        </button>
                      </td>

                      {/* Aluno & Matrícula */}
                      <td className="py-2.5 px-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 uppercase">
                              {item.student.name}
                            </span>
                            {!isHistorical && onOpenStudentCentral && (
                              <button
                                type="button"
                                onClick={() => onOpenStudentCentral(item.student)}
                                className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                              >
                                Ficha
                              </button>
                            )}
                          </div>
                          <span className="text-[11px] font-mono text-slate-400">
                            Matrícula: {item.student.enrollment}
                          </span>
                        </div>
                      </td>

                      {/* Turma Oficial */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-800">{item.latestClass}</span>
                          <span className="text-[10px] text-slate-400">Ano: {item.latestYear}</span>
                        </div>
                      </td>

                      {/* Fotografias */}
                      <td className="py-2.5 px-3">
                        {item.missingSlots.length === 0 ? (
                          <Badge variant="success" size="sm" icon={CheckCircle2}>
                            {item.photosCount}/{item.recordsCount} fotos
                          </Badge>
                        ) : (
                          <Badge variant="warning" size="sm" icon={AlertTriangle}>
                            {item.missingPhotosCount} ausente{item.missingPhotosCount > 1 ? 's' : ''}
                          </Badge>
                        )}
                      </td>

                      {/* Composição */}
                      <td className="py-2.5 px-3 text-center">
                        {isSaved ? (
                          <Badge variant="success" size="sm" icon={CheckCircle2}>
                            Salva
                          </Badge>
                        ) : (
                          <Badge variant="warning" size="sm" icon={Clock}>
                            Pendente
                          </Badge>
                        )}
                      </td>

                      {/* Ações por Aluno */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isHistorical ? (
                            isSaved ? (
                              <Button
                                variant="outline"
                                size="sm"
                                icon={Eye}
                                onClick={() => setPreviewModalItem(item)}
                                title="Visualizar Composição do Período Anterior"
                              >
                                Visualizar
                              </Button>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic pr-2">
                                Não composta
                              </span>
                            )
                          ) : (
                            <>
                              {!item.hasLatestPhoto ? (
                                <Button
                                  variant="danger"
                                  size="sm"
                                  icon={AlertTriangle}
                                  onClick={() => onOpenStudentCentral?.(item.student)}
                                  title="Foto do período mais recente pendente. Clique para abrir a Ficha do Aluno."
                                >
                                  Foto pendente
                                </Button>
                              ) : (
                                <Button
                                  variant={isSaved ? 'secondary' : 'primary'}
                                  size="sm"
                                  icon={Edit2}
                                  onClick={() => handleSelectStudent(item.student.id)}
                                >
                                  {isSaved ? 'Editar' : 'Compor'}
                                </Button>
                              )}

                              <Button
                                variant="outline"
                                size="sm"
                                icon={Eye}
                                onClick={() => isSaved && setPreviewModalItem(item)}
                                disabled={!isSaved}
                                title={
                                  isSaved
                                    ? 'Visualizar prévia da composição salva'
                                    : 'Prévia indisponível: este aluno não possui composição salva'
                                }
                              >
                                Prévia
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação da Tabela */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50 text-xs">
              <span className="text-slate-500">
                Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
              </span>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hidden container for single PDF download from table */}
      <div
        style={{
          position: 'fixed',
          top: '-99999px',
          left: '-99999px',
          width: '794px',
          height: '1123px',
          pointerEvents: 'none',
          zIndex: -9999,
        }}
        aria-hidden="true"
      >
        {previewModalItem?.savedTimeline && (
          <div id="timeline-modal-download-canvas" style={{ width: '794px', height: '1123px' }}>
            <A4TimelinePreview
              studentName={previewModalItem.student.name}
              studentEnrollment={previewModalItem.student.enrollment}
              model={previewModalItem.savedTimeline.modelSnapshot}
              schoolConfig={schoolConfig}
              photoItems={(previewModalItem.savedTimeline.photoItems || []).map((p) => ({
                year: p.year,
                className: p.className,
                photoUrl: p.photoUrl,
                cropSettings: p.cropSettings,
                isPrimary: p.isPrimary,
              }))}
              scale={1}
              interactive={false}
              showGrid={false}
              personType={previewModalItem.savedTimeline.personType || previewModalItem.student.personType || 'student'}
            />
          </div>
        )}
      </div>

      {/* MODAL 1: Download Timeline Modal (Single PDF or Individual ZIP) */}
      {isDownloadModalOpen && (
        <DownloadTimelineModal
          isOpen={true}
          selectedItems={
            selectedStudentIds.length > 0
              ? workQueueData.filter((item) => selectedStudentIds.includes(item.student.id))
              : filteredWorkQueue
          }
          allWorkQueueItems={filteredWorkQueue.length > 0 ? filteredWorkQueue : workQueueData}
          schoolConfig={schoolConfig}
          activeClassFilter={classFilter}
          activePeriodFilter={activeTargetPeriod}
          onClose={() => setIsDownloadModalOpen(false)}
        />
      )}

      {/* MODAL 2: Review Sheet Print Modal (4 per A4 page in 2x2 grid) */}
      {isReviewPrintModalOpen && (
        <ReviewSheetPrintModal
          isOpen={true}
          selectedItems={
            selectedStudentIds.length > 0
              ? workQueueData.filter((item) => selectedStudentIds.includes(item.student.id))
              : workQueueData.filter((item) => hasSavedTimelineComposition(item))
          }
          allWorkQueueItems={workQueueData}
          schoolConfig={schoolConfig}
          defaultModel={selectedModel}
          activePeriodFilter={activeTargetPeriod}
          activeClassFilter={classFilter !== 'all' ? classFilter : undefined}
          onClose={() => setIsReviewPrintModalOpen(false)}
        />
      )}

      {/* MODAL 3: Timeline Preview Modal (Somente Leitura da Composição Salva) */}
      {previewModalItem && (
        <TimelinePreviewModal
          isOpen={true}
          item={previewModalItem}
          schoolConfig={schoolConfig}
          onClose={() => setPreviewModalItem(null)}
        />
      )}

      {/* MODAL 4: Carômetro Modal */}
      {isCarometroModalOpen && (
        <CarometroModal
          isOpen={true}
          students={students}
          records={records}
          classes={classes}
          periods={periods}
          schoolConfig={schoolConfig}
          timelines={timelines}
          initialClass={classFilter !== 'all' ? classFilter : 'all'}
          initialPeriod={currentActivePeriodName || undefined}
          onClose={() => setIsCarometroModalOpen(false)}
          onUpdateRecordCrop={onUpdateRecordCrop}
          onBatchAutoFaceCrop={onBatchAutoFaceCrop}
          onRefreshData={onRefreshData}
        />
      )}

      {/* Notificações Toasts Globais */}
      {successMsg && (
        <Toast
          message={successMsg}
          type="success"
          onClose={() => setSuccessMsg('')}
        />
      )}

      {errorMsg && (
        <Toast
          message={errorMsg}
          type="error"
          onClose={() => setErrorMsg('')}
        />
      )}
    </div>
  );
};
