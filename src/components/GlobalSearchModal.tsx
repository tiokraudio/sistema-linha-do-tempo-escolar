import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Student,
  AcademicYearRecord,
  SavedComposition,
  AcademicPeriod,
  SchoolConfig,
  ClassRecord,
} from '../types';
import {
  Search,
  X,
  Sparkles,
  ShieldCheck,
  Printer,
  Lock,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  FileText,
  UserCheck,
  ImageOff,
  SlidersHorizontal,
} from 'lucide-react';
import { buildWorkQueueData } from '../utils/workQueue';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { selectClasses } from './ui/FormField';

export interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  records: AcademicYearRecord[];
  classes?: ClassRecord[];
  timelines: SavedComposition[];
  periods: AcademicPeriod[];
  schoolConfig: SchoolConfig;
  onOpenStudentCentral: (student: Student) => void;
  onOpenTimeline?: (studentId: string) => void;
  onOpenReview?: (studentId: string) => void;
  onConfirmPeriod?: (student: Student) => void;
}

interface SearchStudentItem {
  student: Student;
  enrollment: string;
  name: string;
  latestClass: string;
  latestYear: string;
  pedagogicalPos: number | null;
  isClosed: boolean;
  isReadyForPrint: boolean;
  isSaved: boolean;
  isReviewPending: boolean;
  isReviewed: boolean;
  hasMissingPhotos: boolean;
  hasExceeding: boolean;
  missingPhotosCount: number;
  hasNoRecords: boolean;
  statusLabel: string;
  statusVariant: 'success' | 'warning' | 'info' | 'error' | 'neutral';
  statusIcon: React.ElementType;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  students,
  records,
  classes = [],
  timelines,
  periods,
  schoolConfig,
  onOpenStudentCentral,
  onOpenTimeline,
  onOpenReview,
  onConfirmPeriod,
}) => {
  // Sort classes for dropdown
  const activeClasses = useMemo(() => {
    return classes.filter((c) => c.active !== false);
  }, [classes]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [displayLimit, setDisplayLimit] = useState<number>(25);

  // Auto-reset class filter if selected class is deactivated or removed
  useEffect(() => {
    if (selectedClass !== 'all') {
      const exists = activeClasses.some(
        (c) => c.name === selectedClass || c.id === selectedClass || String(c.position) === String(selectedClass)
      );
      if (!exists) {
        setSelectedClass('all');
      }
    }
  }, [activeClasses, selectedClass]);

  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setSearchTerm('');
      setSelectedClass('all');
      setSelectedYear('all');
      setSelectedStatus('all');
      setShowFilters(false);
      setDisplayLimit(25);
    }
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const maxSlots = schoolConfig.photoHistorySlots ?? 10;

  // Build canonical dataset using existing buildWorkQueueData logic
  const allSearchableItems: SearchStudentItem[] = useMemo(() => {
    const workQueueItems = buildWorkQueueData(students, records, timelines, maxSlots, periods);
    const mappedQueueMap = new Map<string, SearchStudentItem>();

    workQueueItems.forEach((item) => {
      const periodObj = periods.find((p) => String(p.name) === String(item.latestYear));
      const isClosed = periodObj?.status === 'closed';

      let statusLabel = 'Composição Pendente';
      let statusVariant: 'success' | 'warning' | 'info' | 'error' | 'neutral' = 'info';
      let statusIcon: React.ElementType = Sparkles;

      if (item.isReadyForPrint) {
        statusLabel = 'Pronta para Impressão';
        statusVariant = 'success';
        statusIcon = Printer;
      } else if (item.isReviewed && item.isSavedWithPending) {
        statusLabel = 'Revisada com Pendência';
        statusVariant = 'warning';
        statusIcon = AlertTriangle;
      } else if (item.isReviewed) {
        statusLabel = 'Revisada';
        statusVariant = 'info';
        statusIcon = CheckCircle2;
      } else if (item.isSaved && item.isSavedWithPending) {
        statusLabel = 'Salva com Pendência';
        statusVariant = 'warning';
        statusIcon = AlertCircle;
      } else if (item.isSaved) {
        statusLabel = 'Composição Salva';
        statusVariant = 'info';
        statusIcon = CheckCircle2;
      } else if (item.photosCount === 0) {
        statusLabel = 'Sem Fotografia';
        statusVariant = 'neutral';
        statusIcon = ImageOff;
      }

      mappedQueueMap.set(item.student.id, {
        student: item.student,
        enrollment: String(item.student.enrollment || '').trim(),
        name: item.student.name,
        latestClass: item.latestClass,
        latestYear: item.latestYear,
        pedagogicalPos: item.pedagogicalPos,
        isClosed,
        isReadyForPrint: item.isReadyForPrint,
        isSaved: item.isSaved,
        isReviewPending: item.isReviewPending,
        isReviewed: item.isReviewed,
        hasMissingPhotos: item.hasMissingPhotos,
        hasExceeding: item.hasExceeding,
        missingPhotosCount: item.missingPhotosCount,
        hasNoRecords: false,
        statusLabel,
        statusVariant,
        statusIcon,
      });
    });

    const result: SearchStudentItem[] = [];
    students.forEach((s) => {
      if (mappedQueueMap.has(s.id)) {
        result.push(mappedQueueMap.get(s.id)!);
      } else {
        result.push({
          student: s,
          enrollment: String(s.enrollment || '').trim(),
          name: s.name,
          latestClass: 'Sem turma',
          latestYear: 'Sem período',
          pedagogicalPos: 999,
          isClosed: false,
          isReadyForPrint: false,
          isSaved: false,
          isReviewPending: false,
          isReviewed: false,
          hasMissingPhotos: false,
          hasExceeding: false,
          missingPhotosCount: 0,
          hasNoRecords: true,
          statusLabel: 'Período Pendente',
          statusVariant: 'neutral',
          statusIcon: UserCheck,
        });
      }
    });

    return result;
  }, [students, records, timelines, periods, maxSlots]);

  // Helper text normalization
  const normalize = (txt: string) => {
    return txt
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  };

  const isQueryEmpty = searchTerm.trim().length === 0;

  // Filtered results
  const searchResults = useMemo(() => {
    const queryNorm = normalize(searchTerm);
    const rawQuery = searchTerm.trim();

    return allSearchableItems.filter((item) => {
      if (!isQueryEmpty) {
        const itemEnrollment = item.enrollment.toLowerCase();
        const itemNameNorm = normalize(item.name);

        const matchEnrollment = itemEnrollment.includes(rawQuery.toLowerCase());
        const matchName = itemNameNorm.includes(queryNorm);

        if (!matchEnrollment && !matchName) return false;
      }

      if (selectedClass !== 'all') {
        if (item.latestClass !== selectedClass) return false;
      }

      if (selectedYear !== 'all') {
        if (String(item.latestYear) !== String(selectedYear)) return false;
      }

      if (selectedStatus !== 'all') {
        if (selectedStatus === 'ready_for_print' && !item.isReadyForPrint) return false;
        if (selectedStatus === 'saved' && !item.isSaved) return false;
        if (selectedStatus === 'reviewed' && !item.isReviewed) return false;
        if (selectedStatus === 'review_pending' && !item.isReviewPending) return false;
        if (selectedStatus === 'no_composition' && item.isSaved) return false;
        if (selectedStatus === 'missing_photo' && !item.hasMissingPhotos) return false;
        if (selectedStatus === 'exceeding' && !item.hasExceeding) return false;
        if (selectedStatus === 'closed' && !item.isClosed) return false;
        if (selectedStatus === 'pending_period' && !item.hasNoRecords) return false;
      }

      return true;
    });
  }, [allSearchableItems, searchTerm, isQueryEmpty, selectedClass, selectedYear, selectedStatus]);

  const displayedResults = useMemo(() => {
    return searchResults.slice(0, displayLimit);
  }, [searchResults, displayLimit]);

  const hasActiveFilters =
    selectedClass !== 'all' || selectedYear !== 'all' || selectedStatus !== 'all';

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden my-auto">
        {/* ================================================== */}
        {/* 1. BARRA DE ENTRADA DA PESQUISA */}
        {/* ================================================== */}
        <div className="p-3.5 sm:p-4 border-b border-slate-200 flex items-center gap-3 bg-white">
          <Search className="w-5 h-5 text-blue-600 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, código ou matrícula..."
            className="w-full text-sm sm:text-base font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-hidden bg-transparent"
          />

          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="Limpar pesquisa"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <Button
            type="button"
            variant={showFilters || hasActiveFilters ? 'primary' : 'secondary'}
            size="sm"
            icon={SlidersHorizontal}
            onClick={() => setShowFilters(!showFilters)}
          >
            <span>Filtros</span>
          </Button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Fechar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ================================================== */}
        {/* 2. FILTROS AVANÇADOS (EXPANSÍVEIS) */}
        {/* ================================================== */}
        {showFilters && (
          <div className="bg-slate-50 p-3.5 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Turma
              </label>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className={selectClasses}
              >
                <option value="all">Todas as Turmas</option>
                {activeClasses.map((cls) => (
                  <option key={cls.id || cls.name} value={cls.name}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Ano Letivo / Período
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className={selectClasses}
              >
                <option value="all">Todos os Anos / Períodos</option>
                {[...periods]
                  .sort((a, b) => Number(b.name) - Number(a.name))
                  .map((p) => (
                    <option key={p.id || p.name} value={String(p.name)}>
                      {p.name} {p.active === false ? '(Inativo)' : ''}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Situação / Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className={selectClasses}
              >
                <option value="all">Todas as Situações</option>
                <option value="ready_for_print">Pronta para Impressão</option>
                <option value="saved">Composição Salva</option>
                <option value="reviewed">Revisada</option>
                <option value="review_pending">Revisão Pendente</option>
                <option value="no_composition">Sem Composição</option>
                <option value="missing_photo">Pendência de Foto</option>
                <option value="exceeding">Histórico Excedente</option>
                <option value="closed">Ano Fechado</option>
                <option value="pending_period">Período Pendente</option>
              </select>
            </div>

            {hasActiveFilters && (
              <div className="sm:col-span-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClass('all');
                    setSelectedYear('all');
                    setSelectedStatus('all');
                  }}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                >
                  Limpar todos os filtros
                </button>
              </div>
            )}
          </div>
        )}

        {/* ================================================== */}
        {/* 3. RESULTADOS DA PESQUISA */}
        {/* ================================================== */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-slate-50/50">
          {isQueryEmpty && !hasActiveFilters && (
            <div className="py-12 text-center text-slate-400 space-y-1.5">
              <Search className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs font-semibold text-slate-600">
                Digite um nome, código ou matrícula para pesquisar.
              </p>
              <p className="text-[11px] text-slate-400">
                Ou utilize os filtros para localizar por turma, ano ou situação.
              </p>
            </div>
          )}

          {(!isQueryEmpty || hasActiveFilters) && searchResults.length === 0 && (
            <div className="py-12 text-center text-slate-500 space-y-1.5">
              <AlertCircle className="w-8 h-8 mx-auto text-amber-500" />
              <p className="text-xs font-bold text-slate-800">
                Nenhum cadastro encontrado.
              </p>
              <p className="text-[11px] text-slate-500">
                Verifique o nome, código ou matrícula informada.
              </p>
            </div>
          )}

          {displayedResults.map((item) => {
            const StatusIcon = item.statusIcon;
            const isColab = item.student.personType === 'collaborator';

            return (
              <div
                key={item.student.id}
                className="bg-white rounded-xl border border-slate-200 p-3.5 hover:border-blue-300 hover:shadow-2xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-sm tracking-tight truncate">
                      {item.name}
                    </h3>

                    {isColab && (
                      <Badge variant="neutral" size="sm">
                        Colaborador
                      </Badge>
                    )}

                    <Badge variant={item.statusVariant} size="sm">
                      <span className="flex items-center gap-1">
                        <StatusIcon className="w-3 h-3" />
                        {item.statusLabel}
                      </span>
                    </Badge>

                    {item.hasMissingPhotos && !item.isClosed && (
                      <Badge variant="error" size="sm">
                        Pendência de foto
                      </Badge>
                    )}

                    {item.hasExceeding && (
                      <Badge variant="warning" size="sm">
                        Histórico excedente
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    <span>
                      {isColab ? 'Código / Matrícula:' : 'Matrícula:'}{' '}
                      <strong className="font-mono text-slate-800 font-semibold">
                        {item.enrollment}
                      </strong>
                    </span>
                    {!isColab && item.latestClass && (
                      <>
                        <span>·</span>
                        <span>
                          Turma:{' '}
                          <strong className="text-slate-800">{item.latestClass}</strong>
                        </span>
                      </>
                    )}
                    <span>·</span>
                    <span>
                      {isColab ? 'Período:' : 'Ano:'}{' '}
                      <strong className="text-slate-800">{item.latestYear}</strong>
                    </span>
                  </div>
                </div>

                {/* Ações Contextuais */}
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={FileText}
                    onClick={() => {
                      onClose();
                      onOpenStudentCentral(item.student);
                    }}
                  >
                    Ver ficha
                  </Button>

                  {onOpenTimeline && !item.hasNoRecords && (
                    <Button
                      variant={item.isClosed ? 'secondary' : item.isSaved ? 'secondary' : 'primary'}
                      size="sm"
                      icon={item.isClosed ? Lock : Sparkles}
                      onClick={() => {
                        onClose();
                        onOpenTimeline(item.student.id);
                      }}
                    >
                      {item.isClosed ? 'Ver Composição' : 'Linha do Tempo'}
                    </Button>
                  )}

                  {onOpenReview && item.isSaved && !item.isClosed && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={ShieldCheck}
                      onClick={() => {
                        onClose();
                        onOpenReview(item.student.id);
                      }}
                    >
                      Revisão
                    </Button>
                  )}

                  {onConfirmPeriod && item.hasNoRecords && (
                    <Button
                      variant="primary"
                      size="sm"
                      icon={UserCheck}
                      onClick={() => {
                        onClose();
                        onConfirmPeriod(item.student);
                      }}
                    >
                      Confirmar Matrícula
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {searchResults.length > displayLimit && (
            <div className="text-center pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDisplayLimit((prev) => prev + 25)}
              >
                Carregar mais resultados ({searchResults.length - displayLimit} restantes)
              </Button>
            </div>
          )}
        </div>

        {/* ================================================== */}
        {/* 4. RODAPÉ DE STATUS & ATALHOS */}
        {/* ================================================== */}
        <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            {searchResults.length > 0 ? (
              <span>
                Mostrando <strong>{displayedResults.length}</strong> de{' '}
                <strong>{searchResults.length}</strong> pessoa
                {searchResults.length === 1 ? '' : 's'} encontrada
                {searchResults.length === 1 ? '' : 's'}
              </span>
            ) : (
              <span>Pesquisa Global • Digite um nome ou código para pesquisar</span>
            )}
          </div>

          <div className="text-[11px] text-slate-400">
            <span className="hidden sm:inline">
              Pressione <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-700 font-mono">Esc</kbd> para fechar
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
