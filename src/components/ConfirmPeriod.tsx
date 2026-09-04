import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Student, AcademicYearRecord, AcademicPeriod, ClassRecord, CropSettings, GeneratedTimeline } from '../types';
import {
  Search,
  UserCheck,
  Upload,
  CheckCircle2,
  AlertCircle,
  History,
  Image as ImageIcon,
  GraduationCap,
  ArrowRight,
  Trash2,
  Plus,
  Eye,
  Lock,
  X,
  AlertTriangle,
  BookOpen,
  Crop,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Alert } from './ui/Alert';
import { Toast } from './ui/Toast';
import { Badge } from './ui/Badge';
import { PageHeader } from './ui/PageHeader';
import { Modal } from './ui/Modal';
import { FormField, inputClasses, selectClasses } from './ui/FormField';
import { AdjustPhotoModal } from './AdjustPhotoModal';
import { getActiveAcademicYear } from '../utils/academicYears';
import { apiFetch } from '../utils/api';
import {
  OFFICIAL_CLASSES,
  sortClassesPedagogically,
  getPedagogicalPosition,
  getPedagogicalLabel,
  getPedagogicalStage,
  validateStudentProgression,
  getStudentAllowedProgressionInfo,
} from '../utils/pedagogicalStructure';

interface ConfirmPeriodProps {
  currentYear: string | number;
  periods: AcademicPeriod[];
  timelines?: GeneratedTimeline[];
  classes: ClassRecord[];
  students: Student[];
  records: AcademicYearRecord[];
  onConfirmStudentPeriod: (payload: {
    year: string | number;
    enrollment: string;
    name?: string;
    className: string;
    photoUrl?: string;
    cropSettings?: CropSettings;
  }) => Promise<any>;
  onDeleteRecord?: (recordId: string) => Promise<void>;
  onUpdateRecordCrops?: (
    recordId: string,
    crops: {
      timelinePrimaryCrop?: CropSettings;
      timelineSecondaryCrop?: CropSettings;
      carometroCrop?: CropSettings;
    }
  ) => Promise<any>;
  preselectedStudent?: Student | null;
  onNavigateTab?: (tab: string) => void;
  onAddStudent?: (data: { enrollment: string; name: string }) => Promise<void>;
}

export const ConfirmPeriod: React.FC<ConfirmPeriodProps> = ({
  currentYear,
  periods,
  timelines = [],
  classes,
  students,
  records,
  onConfirmStudentPeriod,
  onDeleteRecord,
  onUpdateRecordCrops,
  preselectedStudent = null,
  onNavigateTab,
}) => {
  // Active academic year derived from canonical Configurações -> Ano letivo
  const activeAcademicYear = useMemo(() => {
    return getActiveAcademicYear(periods) || '';
  }, [periods]);

  // Generate available years list: active periods only (active !== false)
  const activePeriods = useMemo(() => {
    return periods.filter((p) => p.active !== false);
  }, [periods]);

  const availableYears = useMemo(() => {
    if (activePeriods.length > 0) {
      return activePeriods
        .map((p) => p.name)
        .filter((name) => /^\d{4}$/.test(name))
        .sort((a, b) => Number(b) - Number(a));
    }
    return activeAcademicYear ? [activeAcademicYear] : [];
  }, [activePeriods, activeAcademicYear]);

  // Selected Student
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(preselectedStudent);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Period (default to canonical active academic year)
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    return getActiveAcademicYear(periods) || '';
  });

  // Keep selectedPeriod in sync with activeAcademicYear when available
  useEffect(() => {
    if (activeAcademicYear && !selectedPeriod) {
      setSelectedPeriod(activeAcademicYear);
    }
  }, [activeAcademicYear, selectedPeriod]);

  // Form states for NEW record
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [photoUrl, setPhotoUrl] = useState<string>('');

  // Feedback states
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Deletion Modal state
  const [recordToDelete, setRecordToDelete] = useState<AcademicYearRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Photo Adjust Modal state
  const [adjustingRecord, setAdjustingRecord] = useState<AcademicYearRecord | null>(null);

  // Paginação em "Matrículas Confirmadas" (10, 20, 30)
  const [recordsPageSize, setRecordsPageSize] = useState<number>(10);
  const [recordsCurrentPage, setRecordsCurrentPage] = useState<number>(1);

  // Copy name state & handler
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCopyName = async (id: string, name: string) => {
    if (!name) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(name);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = name;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedId(id);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopiedId(null);
      }, 2000);
    } catch (err) {
      console.error('Falha ao copiar nome:', err);
    }
  };

  const renderCopyButton = (id: string, name: string) => {
    const isCopied = copiedId === id;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleCopyName(id, name);
        }}
        title={isCopied ? 'Copiado!' : 'Copiar nome'}
        className="relative inline-flex items-center justify-center w-6 h-6 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/70 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer shrink-0"
        aria-label="Copiar nome para a área de transferência"
      >
        {isCopied ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-600 animate-in zoom-in-75 duration-150" />
            <span className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-slate-800 text-white text-[10px] font-medium rounded shadow-sm whitespace-nowrap pointer-events-none animate-in fade-in duration-150 z-30">
              Copiado!
            </span>
          </>
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    );
  };

  // As turmas ativas do catálogo ordenadas
  const orderedClasses = useMemo(() => {
    if (classes && classes.length > 0) {
      return [...classes]
        .filter((c) => c.active !== false)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    return OFFICIAL_CLASSES;
  }, [classes]);

  // Student's complete historical records sorted from newest to oldest
  const studentRecords = useMemo(() => {
    if (!selectedStudent) return [];
    return records
      .filter((r) => r.studentId === selectedStudent.id)
      .sort((a, b) => String(b.year).localeCompare(String(a.year)));
  }, [selectedStudent?.id, records]);

  // Paginação dinâmica para Matrículas Confirmadas
  const totalRecordsPages = Math.max(1, Math.ceil(studentRecords.length / recordsPageSize));

  const paginatedStudentRecords = useMemo(() => {
    const startIndex = (recordsCurrentPage - 1) * recordsPageSize;
    return studentRecords.slice(startIndex, startIndex + recordsPageSize);
  }, [studentRecords, recordsCurrentPage, recordsPageSize]);

  // Reseta página ao trocar de aluno
  useEffect(() => {
    setRecordsCurrentPage(1);
  }, [selectedStudent?.id]);

  // Ajusta página caso exclusões reduzam a contagem
  useEffect(() => {
    if (recordsCurrentPage > totalRecordsPages) {
      setRecordsCurrentPage(totalRecordsPages);
    }
  }, [recordsCurrentPage, totalRecordsPages]);

  // Check if student already has a record for selected period
  const existingRecordForPeriod = useMemo(() => {
    if (!selectedStudent) return undefined;
    return studentRecords.find((r) => String(r.year) === String(selectedPeriod));
  }, [selectedStudent?.id, selectedPeriod, studentRecords]);

  // Pedagogical Progression Status for the current student and selected period
  const progressionInfo = useMemo(() => {
    return getStudentAllowedProgressionInfo(selectedPeriod, studentRecords);
  }, [selectedPeriod, studentRecords]);

  // Validation result for the currently selected class in the form
  const selectedClassProgression = useMemo(() => {
    if (!selectedClass || existingRecordForPeriod) return { isValid: true };
    return validateStudentProgression(selectedPeriod, selectedClass, studentRecords);
  }, [selectedPeriod, selectedClass, studentRecords, existingRecordForPeriod]);

  // Update selection defaults when student or period changes
  useEffect(() => {
    if (!selectedStudent) {
      setSelectedClass('');
      setPhotoUrl('');
      setErrorMsg('');
      setSuccessMsg('');
      return;
    }

    if (existingRecordForPeriod) {
      setSelectedClass(existingRecordForPeriod.className || '');
      setPhotoUrl(existingRecordForPeriod.photoUrl || '');
    } else {
      setPhotoUrl('');
      // Find first valid class according to pedagogical progression rules
      const validClass = orderedClasses.find((c) => {
        const check = validateStudentProgression(selectedPeriod, c.name, studentRecords);
        return check.isValid;
      });
      setSelectedClass(validClass ? validClass.name : (orderedClasses[0]?.name || ''));
    }
    setErrorMsg('');
  }, [selectedStudent?.id, selectedPeriod, existingRecordForPeriod, orderedClasses, studentRecords]);

  // Reset form to confirm another period for the same student
  const handleConfirmAnotherPeriod = () => {
    setErrorMsg('');
    setSuccessMsg('');

    // Find first year from availableYears that student DOES NOT have a record for yet
    const unusedYear =
      availableYears.find(
        (y) => !studentRecords.some((r) => String(r.year) === String(y))
      ) || availableYears[0];

    setSelectedPeriod(unusedYear);

    // Pick first valid class
    const validClass = orderedClasses.find((c) => {
      const check = validateStudentProgression(unusedYear, c.name, studentRecords);
      return check.isValid;
    });
    setSelectedClass(validClass ? validClass.name : (orderedClasses[0]?.name || ''));
    setPhotoUrl('');
  };

  // Execute record removal after modal confirmation
  const handleConfirmDeleteRecord = async () => {
    if (!recordToDelete || !onDeleteRecord) return;
    setIsDeleting(true);
    setErrorMsg('');
    try {
      await onDeleteRecord(recordToDelete.id);
      setSuccessMsg(`Registro do período ${recordToDelete.year} removido com sucesso.`);
      setRecordToDelete(null);

      // If the deleted record was currently selected, reset for new confirmation
      if (String(recordToDelete.year) === String(selectedPeriod)) {
        setPhotoUrl('');
        const validClass = orderedClasses.find((c) => {
          const check = validateStudentProgression(selectedPeriod, c.name, studentRecords.filter(r => r.id !== recordToDelete.id));
          return check.isValid;
        });
        setSelectedClass(validClass ? validClass.name : (orderedClasses[0]?.name || ''));
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao remover registro do período.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle image file upload for new record
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 30 * 1024 * 1024) {
        setErrorMsg('A imagem é muito grande. Escolha uma foto de até 30MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setPhotoUrl(result);
        setErrorMsg('');
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle final form submission for new record
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedStudent) {
      setErrorMsg('Selecione um aluno para continuar.');
      return;
    }

    if (!selectedPeriod) {
      setErrorMsg('Selecione um período letivo para continuar.');
      return;
    }

    // Rule 1: Cannot re-confirm an already confirmed period
    if (existingRecordForPeriod) {
      setErrorMsg('Este aluno já está confirmado neste período.');
      return;
    }

    if (!selectedClass.trim()) {
      setErrorMsg('Selecione a turma do aluno para este período.');
      return;
    }

    const cleanClassName = selectedClass.trim().toUpperCase();

    // Rule 2: Validate pedagogical progression (allows repetência & progression, blocks regression & leaps)
    const progressionCheck = validateStudentProgression(
      selectedPeriod,
      cleanClassName,
      studentRecords
    );

    if (!progressionCheck.isValid) {
      setErrorMsg(progressionCheck.errorMessage || 'Progressão escolar inválida.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onConfirmStudentPeriod({
        year: selectedPeriod,
        enrollment: selectedStudent.enrollment,
        className: cleanClassName,
        photoUrl: photoUrl || '',
        cropSettings: { x: 50, y: 50, zoom: 1.0 },
      });

      if (result?.timelineRemoved) {
        setSuccessMsg(
          result.message ||
            'Matrícula confirmada. A composição da Linha do Tempo do período letivo atual foi excluída e deverá ser criada novamente.'
        );
      } else {
        setSuccessMsg(
          `Confirmação de matrícula realizada com sucesso para o período ${selectedPeriod}!`
        );
      }
    } catch (err: any) {
      const rawMsg = err?.message || '';
      if (
        rawMsg.includes('Failed to fetch') ||
        rawMsg.includes('conectar ao servidor') ||
        err?.name === 'TypeError'
      ) {
        setErrorMsg('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
      } else if (rawMsg) {
        setErrorMsg(rawMsg);
      } else {
        setErrorMsg('Ocorreu um erro inesperado ao confirmar a matrícula. Tente novamente.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter students strictly for students (excluding collaborators)
  const studentsOnly = useMemo(
    () => students.filter((s) => (s.personType || 'student') === 'student'),
    [students]
  );

  // Filter students matching search query
  const matchingStudents = searchQuery.trim()
    ? studentsOnly.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
          s.enrollment.toLowerCase().includes(searchQuery.toLowerCase().trim())
      )
    : [];

  // ==========================================
  // EMPTY STATE CHECKS
  // ==========================================
  if (studentsOnly.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Confirmar Matrícula"
          subtitle="Associe aluno, período letivo, turma e fotografia."
        />

        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-2xs max-w-xl mx-auto my-8 space-y-4">
          <GraduationCap className="w-12 h-12 text-slate-300 mx-auto" />
          <div>
            <h3 className="text-base font-bold text-slate-800">Nenhum aluno cadastrado.</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Cadastre um aluno na tela de Alunos antes de confirmar a matrícula.
            </p>
          </div>
          {onNavigateTab && (
            <Button
              type="button"
              variant="primary"
              onClick={() => onNavigateTab('students')}
              icon={ArrowRight}
            >
              Ir para Alunos
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <PageHeader
        title="Confirmar Matrícula"
        subtitle="Associe aluno, período letivo, turma e fotografia."
      />

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

      {/* STEP 1: BUSCAR E SELECIONAR ALUNO */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <label className="block text-xs font-semibold text-slate-700">
          Passo 1 — Selecionar Aluno
        </label>

        {!selectedStudent ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar aluno por nome ou matrícula..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                autoFocus
              />
            </div>

            {/* Matching Students List */}
            {searchQuery.trim() !== '' && (
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-md max-h-56 overflow-y-auto divide-y divide-slate-100">
                {matchingStudents.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-500">
                    Nenhum aluno encontrado para "{searchQuery}".
                  </div>
                ) : (
                  matchingStudents.map((std) => (
                    <div
                      key={std.id}
                      className="w-full text-left p-2.5 hover:bg-blue-50/60 transition-colors flex items-center justify-between gap-3 group"
                    >
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => {
                          setSelectedStudent(std);
                          setSearchQuery('');
                          setSuccessMsg('');
                          setErrorMsg('');
                        }}
                      >
                        <div className="inline-flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-xs sm:text-sm text-slate-800">
                            {std.name}
                          </span>
                          {renderCopyButton(`search-${std.id}`, std.name)}
                        </div>
                        <p className="text-xs font-mono text-slate-500">
                          Matrícula: {std.enrollment}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStudent(std);
                          setSearchQuery('');
                          setSuccessMsg('');
                          setErrorMsg('');
                        }}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded border border-blue-200 transition-colors cursor-pointer shrink-0"
                      >
                        Selecionar
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ) : (
          /* Selected Student Card */
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="inline-block bg-blue-50 text-blue-700 text-[10px] font-semibold px-2 py-0.5 rounded border border-blue-200">
                {selectedStudent.personType === 'collaborator' ? 'Colaborador Selecionado' : 'Aluno Selecionado'}
              </span>
              <div className="inline-flex items-center gap-1.5 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900">{selectedStudent.name}</h3>
                {renderCopyButton(`selected-${selectedStudent.id}`, selectedStudent.name)}
              </div>
              <p className="text-xs text-slate-500">
                {selectedStudent.personType === 'collaborator' ? 'Código / Matrícula' : 'Matrícula'}:{' '}
                <span className="font-mono font-semibold text-slate-800">{selectedStudent.enrollment}</span>
              </p>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSelectedStudent(null);
                setSearchQuery('');
                setSuccessMsg('');
                setErrorMsg('');
              }}
            >
              Trocar Aluno
            </Button>
          </div>
        )}
      </div>

      {/* STEP 2 & 3: PAINEL DO PERÍODO & MATRÍCULAS CONFIRMADAS */}
      {selectedStudent && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* HIERARQUIA SUPERIOR (AÇÃO IMEDIATA): MAIN PANEL FOR SELECTED PERIOD */}

          {/* CASE A: REGISTRO EXISTENTE (SOMENTE LEITURA / IMUTÁVEL) */}
          {existingRecordForPeriod ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
              {/* Immutability Banner */}
              <div className="bg-amber-50 border border-amber-200/90 text-amber-900 p-4 rounded-2xl text-xs font-bold flex items-start gap-3 shadow-2xs">
                <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-sm font-extrabold text-amber-950">
                    Este aluno já está confirmado neste período.
                  </p>
                  <p className="text-amber-800 font-medium">
                    O registro confirmado é permanente e não permite edições. Para alterar a turma ou fotografia, remova o registro deste período e faça um novo cadastro.
                  </p>
                </div>
              </div>

              {/* Read-Only Record Content */}
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                  <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-blue-600" />
                    <span>Registro do Período {existingRecordForPeriod.year}</span>
                  </h3>
                  <span className="bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1">
                    <Lock className="w-3 h-3 text-slate-500" />
                    Somente Leitura
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      Período Letivo
                    </span>
                    <p className="text-lg font-black text-slate-900">
                      {existingRecordForPeriod.year}
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      Turma Vinculada
                    </span>
                    <p className="text-lg font-black text-slate-900">
                      {existingRecordForPeriod.className}
                    </p>
                  </div>
                </div>

                {/* Photo Display */}
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                    Fotografia do Período
                  </span>
                  <div className="w-44 h-52 rounded-2xl border-2 border-slate-200 bg-slate-900 overflow-hidden flex items-center justify-center shadow-md">
                    {existingRecordForPeriod.photoUrl ? (
                      <img
                        src={existingRecordForPeriod.photoUrl}
                        alt={`Foto de ${selectedStudent.name} (${existingRecordForPeriod.year})`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-center p-4 text-slate-500 text-xs">
                        <ImageIcon className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                        <span>Sem foto vinculada</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Read-Only Action Footer */}
                <div className="border-t border-slate-100 pt-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {onDeleteRecord && (
                      <button
                        type="button"
                        onClick={() => setRecordToDelete(existingRecordForPeriod)}
                        className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs px-4 py-2.5 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4 text-rose-600" />
                        <span>Remover registro do período</span>
                      </button>
                    )}

                    {existingRecordForPeriod.photoUrl && (
                      <button
                        type="button"
                        onClick={() => setAdjustingRecord(existingRecordForPeriod)}
                        className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs px-4 py-2.5 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
                      >
                        <Crop className="w-4 h-4 text-blue-600" />
                        <span>Ajustar Foto</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmAnotherPeriod}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-md shadow-blue-600/20 cursor-pointer flex items-center gap-2 ml-auto"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Confirmar outro período</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* CASE B: FORMULÁRIO PARA NOVO REGISTRO */
            <form
              onSubmit={handleSubmit}
              className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6"
            >
              <div className="border-b border-slate-100 pb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-slate-900 text-base">
                    Confirmar no período {selectedPeriod}
                  </h3>
                  <span className="text-xs font-semibold text-slate-500">
                    • {selectedStudent.name} ({selectedStudent.personType === 'collaborator' ? 'Colaborador' : 'Matrícula'}: {selectedStudent.enrollment})
                  </span>
                </div>
                <span className="bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold px-2.5 py-0.5 rounded-full">
                  Novo Registro
                </span>
              </div>

              {/* Pedagogical Trajectory Guidance Banner */}
              <div className={`p-4 rounded-2xl border text-xs flex items-start gap-3 shadow-2xs ${
                progressionInfo.isFirstRecord
                  ? 'bg-blue-50/70 border-blue-200/80 text-blue-950'
                  : 'bg-indigo-50/70 border-indigo-200/80 text-indigo-950'
              }`}>
                <GraduationCap className="w-5 h-5 shrink-0 mt-0.5 text-blue-600" />
                <div className="space-y-0.5 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold uppercase text-[10px] tracking-wider text-slate-500">
                      {progressionInfo.isFirstRecord ? 'Início de Trajetória' : 'Progressão Pedagógica Oficial'}
                    </span>
                    {!progressionInfo.isFirstRecord && progressionInfo.prevRecord && (
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100/70 px-2 py-0.5 rounded-md">
                        Base: {progressionInfo.prevRecord.year} ({progressionInfo.prevRecord.className})
                      </span>
                    )}
                  </div>
                  <p className="font-bold text-xs leading-relaxed text-slate-800">
                    {progressionInfo.statusText}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Select Period */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Período letivo <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedPeriod}
                    onChange={(e) => {
                      setSelectedPeriod(e.target.value);
                      setErrorMsg('');
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    {availableYears.map((y) => {
                      const isAlreadyConfirmed = studentRecords.some(
                        (r) => String(r.year) === String(y)
                      );
                      return (
                        <option key={y} value={y}>
                          {y} {y === activeAcademicYear ? '(Período Ativo)' : ''}{' '}
                          {isAlreadyConfirmed ? '— (Já confirmado)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Select Turma */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Turma <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedClass}
                    onChange={(e) => {
                      setSelectedClass(e.target.value);
                      setErrorMsg('');
                    }}
                    className={`w-full bg-slate-50 border rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                      !selectedClassProgression.isValid
                        ? 'border-rose-300 bg-rose-50/50 text-rose-900'
                        : 'border-slate-300'
                    }`}
                  >
                    <option value="">Selecione a turma oficial...</option>
                    {orderedClasses.map((c) => {
                      const pos = getPedagogicalPosition(c.name);
                      const validation = validateStudentProgression(
                        selectedPeriod,
                        c.name,
                        studentRecords
                      );
                      const isInvalid = !validation.isValid;

                      let note = '';
                      if (isInvalid) {
                        if (validation.previousRecord && pos !== null) {
                          const prevPos = getPedagogicalPosition(validation.previousRecord.className);
                          if (prevPos !== null && pos < prevPos) {
                            note = ' [Bloqueado: Regressão]';
                          } else if (prevPos !== null && pos > prevPos + 1) {
                            note = ' [Bloqueado: Salto de Etapa]';
                          } else {
                            note = ' [Bloqueado]';
                          }
                        } else if (validation.nextRecord) {
                          note = ' [Bloqueado: Inconsistência Temporal]';
                        } else {
                          note = ' [Bloqueado]';
                        }
                      }

                      return (
                        <option
                          key={c.id}
                          value={c.name}
                          disabled={isInvalid}
                          className={isInvalid ? 'text-slate-400 bg-slate-100' : 'text-slate-900'}
                        >
                          {c.name}{note}
                        </option>
                      );
                    })}
                  </select>

                  {/* Specific Error if selected class is invalid for this student/period */}
                  {!selectedClassProgression.isValid && (
                    <p className="mt-1.5 text-xs text-rose-600 font-bold flex items-start gap-1">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{selectedClassProgression.errorMessage}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Photo Upload Section */}
              <div className="border-t border-slate-100 pt-5 space-y-3">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Foto do período <span className="text-slate-400 font-semibold lowercase">(opcional)</span>
                </label>

                <div className="flex flex-col sm:flex-row items-start gap-6">
                  {/* Preview Container */}
                  <div className="w-40 h-48 rounded-xl border-2 border-slate-200 bg-slate-900 overflow-hidden flex items-center justify-center shrink-0 shadow-inner">
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt="Fotografia do Período"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-center p-4 text-slate-500 text-xs">
                        <ImageIcon className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                        <span>Sem fotografia selecionada</span>
                      </div>
                    )}
                  </div>

                  {/* Upload Action */}
                  <div className="space-y-3 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer">
                        <Upload className="w-4 h-4 text-blue-400" />
                        <span>{photoUrl ? 'Substituir Foto' : 'Carregar Foto'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>

                      {photoUrl && (
                        <button
                          type="button"
                          onClick={() => setPhotoUrl('')}
                          className="text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-2.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remover</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Action: perfeitamente alinhado na extremidade direita do rodapé */}
              <div className="border-t border-slate-100 pt-3 flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedClassProgression.isValid}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm px-6 py-2.5 rounded-xl transition-all shadow-md shadow-blue-600/20 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? 'Salvando...'
                      : selectedStudent.personType === 'collaborator'
                      ? 'Salvar período'
                      : 'Confirmar matrícula'}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* HIERARQUIA INFERIOR (HISTÓRICO E CONFERÊNCIA): TABELA DE MATRÍCULAS CONFIRMADAS */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <History className="w-4 h-4 text-slate-400" />
                {selectedStudent.personType === 'collaborator' ? 'Períodos Registrados' : 'Matrículas Confirmadas'} ({studentRecords.length} período(s))
              </h3>

              <div className="flex flex-wrap items-center gap-3">
                {studentRecords.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                    <span>Períodos por página:</span>
                    <select
                      value={recordsPageSize}
                      onChange={(e) => {
                        setRecordsPageSize(Number(e.target.value));
                        setRecordsCurrentPage(1);
                      }}
                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={30}>30</option>
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleConfirmAnotherPeriod}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Confirmar outro período</span>
                </button>
              </div>
            </div>

            {studentRecords.length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                Nenhum registro histórico encontrado para este aluno.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5">Período</th>
                      <th className="px-4 py-2.5">Turma</th>
                      <th className="px-4 py-2.5">Foto</th>
                      <th className="px-4 py-2.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedStudentRecords.map((rec) => {
                      const isCurrentlySelected = String(rec.year) === String(selectedPeriod);
                      const isRecPeriodClosed = periods.find((p) => String(p.name) === String(rec.year))?.status === 'closed';
                      const activeAcademicYear = getActiveAcademicYear(periods);
                      const isActivePeriod = activeAcademicYear !== null && String(rec.year) === activeAcademicYear;
                      const hasSavedTimeline = Boolean(
                        timelines &&
                        selectedStudent &&
                        timelines.some((t) => t.studentId === selectedStudent.id && String(t.year) === String(rec.year))
                      );

                      return (
                        <tr
                          key={rec.id}
                          className={`hover:bg-slate-50 transition-colors ${
                            isCurrentlySelected ? 'bg-blue-50/60 font-bold' : ''
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 font-extrabold text-slate-900">
                              <span>{rec.year}</span>
                              {isRecPeriodClosed && (
                                <span className="inline-flex items-center gap-1 bg-slate-900 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-2xs">
                                  <Lock className="w-2.5 h-2.5 text-amber-400" />
                                  FECHADO
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-700">
                            {rec.className}
                          </td>
                          <td className="px-4 py-3">
                            {rec.photoUrl ? (
                              <img
                                src={rec.photoUrl}
                                alt={`Foto ${rec.year}`}
                                className="w-10 h-10 object-cover rounded-lg border border-slate-300 shadow-2xs"
                              />
                            ) : (
                              <div className="w-10 h-10 bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center">
                                <ImageIcon className="w-4 h-4 text-slate-400" />
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPeriod(String(rec.year));
                                  setErrorMsg('');
                                  setSuccessMsg('');
                                }}
                                className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg border cursor-pointer ${
                                  isCurrentlySelected
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'text-slate-700 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 border-slate-200'
                                }`}
                              >
                                <Eye className="w-3 h-3" />
                                <span>Visualizar</span>
                              </button>

                              {/* Ação Ajustar foto disponível EXCLUSIVAMENTE para o período letivo ativo */}
                              {isActivePeriod && rec.photoUrl && (
                                <button
                                  type="button"
                                  onClick={() => setAdjustingRecord(rec)}
                                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 cursor-pointer transition-colors"
                                  title={
                                    hasSavedTimeline
                                      ? 'Este período possui uma composição salva e não pode mais ter o enquadramento alterado.'
                                      : 'Ajustar enquadramento da fotografia para Linha do Tempo e Carômetro'
                                  }
                                >
                                  <Crop className="w-3 h-3" />
                                  <span>Ajustar foto</span>
                                </button>
                              )}

                              {onDeleteRecord && (
                                <button
                                  type="button"
                                  onClick={() => setRecordToDelete(rec)}
                                  className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg border border-rose-200 cursor-pointer transition-colors"
                                  title="Excluir Matrícula deste Período"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Excluir</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Controles de Paginação */}
            {totalRecordsPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-600">
                <button
                  type="button"
                  onClick={() => setRecordsCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={recordsCurrentPage <= 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs"
                >
                  ‹ Anterior
                </button>

                <span className="text-xs font-medium text-slate-600">
                  Página <strong className="text-slate-800">{recordsCurrentPage}</strong> de{' '}
                  <strong className="text-slate-800">{totalRecordsPages}</strong>
                </span>

                <button
                  type="button"
                  onClick={() => setRecordsCurrentPage((prev) => Math.min(totalRecordsPages, prev + 1))}
                  disabled={recordsCurrentPage >= totalRecordsPages}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs"
                >
                  Próxima ›
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE REMOÇÃO DO REGISTRO */}
      {recordToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-900">
                  Excluir a matrícula deste período?
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  Essa ação excluirá a matrícula e a fotografia associada a este período. Deseja continuar?
                </p>
              </div>
            </div>

            {/* Record Summary Box */}
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs space-y-1">
              <div className="text-slate-700 flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-slate-500">Aluno:</span>
                <strong className="text-slate-900">{selectedStudent?.name}</strong>
                {selectedStudent?.name && renderCopyButton(`del-${selectedStudent.id}`, selectedStudent.name)}
                <span className="font-mono text-slate-500">({selectedStudent?.enrollment})</span>
              </div>
              <p className="text-slate-700">
                <span className="font-bold text-slate-500">Período letivo:</span>{' '}
                <strong className="text-slate-900">{recordToDelete.year}</strong>
              </p>
              <p className="text-slate-700">
                <span className="font-bold text-slate-500">Turma:</span>{' '}
                <strong className="text-slate-900">{recordToDelete.className}</strong>
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRecordToDelete(null)}
                disabled={isDeleting}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteRecord}
                disabled={isDeleting}
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-md shadow-rose-600/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <span>Excluindo...</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Photo Framing Modal */}
      {adjustingRecord && selectedStudent && (
        <AdjustPhotoModal
          isOpen={Boolean(adjustingRecord)}
          student={selectedStudent}
          record={adjustingRecord}
          isLocked={Boolean(
            timelines &&
            timelines.some((t) => t.studentId === selectedStudent.id && String(t.year) === String(adjustingRecord.year))
          )}
          lockReason="Este período possui uma composição salva e não pode mais ter o enquadramento alterado."
          onSaveCrops={async (recordId, crops) => {
            if (onUpdateRecordCrops) {
              await onUpdateRecordCrops(recordId, crops);
            } else {
              const res = await apiFetch(`/api/records/${recordId}/crops`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(crops),
              });
              if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Erro ao salvar ajustes.');
              }
            }
            // Update local adjustingRecord state
            setAdjustingRecord((prev) => (prev && prev.id === recordId ? { ...prev, ...crops } : prev));
          }}
          onClose={() => setAdjustingRecord(null)}
        />
      )}
    </div>
  );
};
