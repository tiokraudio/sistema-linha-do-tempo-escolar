import React, { useState, useMemo, useEffect } from 'react';
import {
  Student,
  AcademicYearRecord,
  SavedComposition,
  AcademicPeriod,
  SchoolConfig,
  CropSettings,
  ClassRecord,
  PersonType,
} from '../types';
import {
  Search,
  X,
  FileText,
  RotateCcw,
  Calendar,
  GraduationCap,
  Briefcase,
  Users,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { PageHeader } from './ui/PageHeader';
import { inputClasses, selectClasses } from './ui/FormField';
import {
  OFFICIAL_CLASSES,
  getPedagogicalPosition,
} from '../utils/pedagogicalStructure';
import { getActiveAcademicPeriod, getActiveAcademicYear } from '../utils/academicYears';

export interface PhotoManagementCenterProps {
  students: Student[];
  records: AcademicYearRecord[];
  classes?: ClassRecord[];
  timelines?: SavedComposition[];
  periods: AcademicPeriod[];
  schoolConfig: SchoolConfig;
  onOpenStudentCentral: (student: Student) => void;
  onNavigateToTimeline?: (studentId: string) => void;
  onNavigateToReview?: (studentId: string) => void;
  onNavigateToConfirmPeriod?: (student: Student) => void;
  onUpdateRecordPhoto?: (
    recordId: string,
    photoUrl: string,
    cropSettings?: CropSettings
  ) => Promise<any>;
}

export const PhotoManagementCenter: React.FC<PhotoManagementCenterProps> = ({
  students,
  records,
  classes = [],
  periods,
  onOpenStudentCentral,
}) => {
  // 1. Identificar o período letivo ativo oficial
  const currentActivePeriodName = useMemo(() => {
    return getActiveAcademicYear(periods) || '';
  }, [periods]);

  // Context: 'student' | 'collaborator' | 'all'
  const [activeContext, setActiveContext] = useState<'student' | 'collaborator' | 'all'>('student');

  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [photoStatusFilter, setPhotoStatusFilter] = useState<'all' | 'with_photo' | 'without_photo'>('all');
  const [pageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const isCollaboratorMode = activeContext === 'collaborator';

  // Counts for context tabs
  const studentCount = useMemo(() => {
    if (!currentActivePeriodName) return 0;
    const activeStudentIds = new Set(
      records
        .filter((r) => String(r.year) === String(currentActivePeriodName))
        .map((r) => r.studentId)
    );
    return students.filter(
      (s) => (s.personType || 'student') === 'student' && activeStudentIds.has(s.id)
    ).length;
  }, [students, records, currentActivePeriodName]);

  const collaboratorCount = useMemo(() => {
    if (!currentActivePeriodName) return 0;
    const activeStudentIds = new Set(
      records
        .filter((r) => String(r.year) === String(currentActivePeriodName))
        .map((r) => r.studentId)
    );
    return students.filter(
      (s) => s.personType === 'collaborator' && activeStudentIds.has(s.id)
    ).length;
  }, [students, records, currentActivePeriodName]);

  const totalCount = studentCount + collaboratorCount;

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

  // Processa SOMENTE as matrículas pertencentes ao período letivo ativo e do contexto ativo
  const enrichedStudents = useMemo(() => {
    if (!currentActivePeriodName) return [];

    const items: Array<{
      student: Student;
      record: AcademicYearRecord;
      year: string;
      className: string;
    }> = [];

    const targetStudents = students.filter((s) => {
      const type = s.personType || 'student';
      if (activeContext === 'all') return true;
      return type === activeContext;
    });

    targetStudents.forEach((student) => {
      const matchingRecords = records.filter(
        (r) => r.studentId === student.id && String(r.year) === String(currentActivePeriodName)
      );

      if (matchingRecords.length > 0) {
        const rec = matchingRecords[0];
        items.push({
          student,
          record: rec,
          year: String(rec.year),
          className: rec.className,
        });
      }
    });

    return items.sort((a, b) => a.student.name.localeCompare(b.student.name));
  }, [students, records, currentActivePeriodName, activeContext]);

  // Reset filter when switching context (student <-> collaborator)
  useEffect(() => {
    setSelectedClass('all');
    setSearchTerm('');
    setPhotoStatusFilter('all');
    setCurrentPage(1);
  }, [activeContext]);

  // Normalização sem acentos para busca
  const normalizeText = (text: string) => {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  };

  // Filtragem dos Alunos / Colaboradores (Busca + Turma + Status da Foto)
  const filteredStudents = useMemo(() => {
    const rawQuery = searchTerm.trim();
    const queryNorm = normalizeText(rawQuery);
    const isQueryEmpty = rawQuery.length === 0;

    return enrichedStudents.filter((item) => {
      const hasPhoto = Boolean(item.record.photoUrl && item.record.photoUrl.trim() !== '');

      // 1. Filtro de Status da Foto
      if (photoStatusFilter === 'with_photo' && !hasPhoto) return false;
      if (photoStatusFilter === 'without_photo' && hasPhoto) return false;

      // 2. Busca por nome ou matrícula
      if (!isQueryEmpty) {
        const itemEnrollment = String(item.student.enrollment || '').trim();
        const itemNameNorm = normalizeText(item.student.name);

        const matchEnrollment =
          itemEnrollment.toLowerCase().includes(rawQuery.toLowerCase()) ||
          itemEnrollment === rawQuery;
        const matchName = itemNameNorm.includes(queryNorm);

        if (!matchEnrollment && !matchName) return false;
      }

      // 3. Filtro de Turma (Apenas quando não está no modo exclusivo de colaborador)
      if (!isCollaboratorMode && selectedClass !== 'all') {
        const targetClass = activeClasses.find(
          (c) => c.name === selectedClass || c.id === selectedClass || String(c.position) === String(selectedClass)
        );
        if (targetClass) {
          const itemPos = getPedagogicalPosition(item.className);
          const targetPos = targetClass.position ?? getPedagogicalPosition(targetClass.name);
          const matchesExactName = item.className === targetClass.name;
          const matchesPedagogicalPos =
            targetPos !== null && itemPos !== null && itemPos !== 999 && itemPos === targetPos;
          if (!matchesExactName && !matchesPedagogicalPos) return false;
        } else {
          if (item.className !== selectedClass) return false;
        }
      }

      return true;
    });
  }, [enrichedStudents, searchTerm, selectedClass, photoStatusFilter, activeClasses, isCollaboratorMode]);

  // Paginação
  const totalPages = Math.ceil(filteredStudents.length / pageSize) || 1;
  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredStudents.slice(startIndex, startIndex + pageSize);
  }, [filteredStudents, currentPage, pageSize]);

  const handleFilterChange = () => {
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedClass('all');
    setPhotoStatusFilter('all');
    setCurrentPage(1);
  };

  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    (!isCollaboratorMode && selectedClass !== 'all') ||
    photoStatusFilter !== 'all';

  return (
    <div className="space-y-4">
      {/* 1. CABEÇALHO */}
      <PageHeader
        title={
          isCollaboratorMode
            ? 'Fotografias de Colaboradores'
            : activeContext === 'all'
            ? 'Fotografias Escolares'
            : 'Fotografias de Alunos'
        }
        subtitle={
          isCollaboratorMode
            ? 'Gestão operacional dos colaboradores ativos no período letivo atual.'
            : activeContext === 'all'
            ? 'Gestão operacional de todas as fotografias no período letivo atual.'
            : 'Gestão operacional dos alunos matriculados no período letivo atual.'
        }
        action={
          <Badge variant="success" size="md">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>Período letivo atual: <strong>{currentActivePeriodName || 'Não configurado'}</strong></span>
            </span>
          </Badge>
        }
      />

      {/* 2. SELETOR DE CONTEXTO [ ALUNOS | COLABORADORES | TODOS ] & FILTROS */}
      <div className="bg-white rounded-xl p-3 sm:p-4 border border-slate-200 shadow-2xs space-y-3">
        <div className="inline-flex p-1 bg-slate-100/90 rounded-lg border border-slate-200/80">
          <button
            type="button"
            onClick={() => {
              setActiveContext('student');
              setCurrentPage(1);
              setSearchTerm('');
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
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
              setCurrentPage(1);
              setSearchTerm('');
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
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

          <button
            type="button"
            onClick={() => {
              setActiveContext('all');
              setCurrentPage(1);
              setSearchTerm('');
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activeContext === 'all'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Todos</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600">
              {totalCount}
            </span>
          </button>
        </div>

        <div className={`grid grid-cols-1 ${isCollaboratorMode ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-3`}>
          {/* Busca por Nome / Matrícula */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {isCollaboratorMode ? 'Buscar colaborador' : 'Buscar por nome ou matrícula'}
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  handleFilterChange();
                }}
                placeholder={isCollaboratorMode ? 'Nome ou código...' : 'Nome ou matrícula...'}
                className={`${inputClasses} pl-9 pr-8`}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    handleFilterChange();
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Filtro de Status da Foto (Com foto / Sem foto / Todos) */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Status da fotografia
            </label>
            <select
              value={photoStatusFilter}
              onChange={(e) => {
                setPhotoStatusFilter(e.target.value as any);
                handleFilterChange();
              }}
              className={selectClasses}
            >
              <option value="all">Todas as fotografias</option>
              <option value="with_photo">Com fotografia</option>
              <option value="without_photo">Pendente (sem fotografia)</option>
            </select>
          </div>

          {/* Filtro de Turma (OCULTADO para Colaboradores) */}
          {!isCollaboratorMode && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Turma
              </label>
              <select
                value={selectedClass}
                onChange={(e) => {
                  setSelectedClass(e.target.value);
                  handleFilterChange();
                }}
                className={selectClasses}
              >
                <option value="all">Todas as turmas ({activeClasses.length})</option>
                {activeClasses.map((cls) => (
                  <option key={cls.id || cls.name} value={cls.name}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500">
              Exibindo <strong>{filteredStudents.length}</strong> de <strong>{enrichedStudents.length}</strong> {isCollaboratorMode ? 'colaboradores' : 'cadastros'}
            </span>
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      {/* 3. LISTAGEM */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {filteredStudents.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <p className="text-sm font-medium text-slate-700">
              {hasActiveFilters
                ? `Nenhum ${isCollaboratorMode ? 'colaborador' : 'cadastro'} encontrado com os filtros selecionados.`
                : `Nenhum ${isCollaboratorMode ? 'colaborador ativo' : 'aluno matriculado'} no período letivo atual (${currentActivePeriodName || '—'}).`}
            </p>
            {hasActiveFilters && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleClearFilters}
                className="mt-2"
              >
                Limpar filtros
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 w-16">Foto</th>
                  <th className="px-4 py-3">{isCollaboratorMode ? 'Código / Matrícula' : 'Matrícula'}</th>
                  <th className="px-4 py-3">Nome completo</th>
                  {!isCollaboratorMode && <th className="px-4 py-3">Turma</th>}
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedStudents.map((item) => {
                  const hasPhoto = Boolean(item.record.photoUrl && item.record.photoUrl.trim() !== '');

                  return (
                    <tr
                      key={`${item.student.id}-${item.record.id}`}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      {/* Miniatura da Foto */}
                      <td className="px-4 py-3">
                        <div className="w-10 h-12 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                          {hasPhoto ? (
                            <img
                              src={item.record.photoUrl}
                              alt={item.student.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-[10px] text-slate-400 font-medium text-center px-1">
                              Sem foto
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Matrícula */}
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {item.student.enrollment}
                      </td>

                      {/* Nome */}
                      <td className="px-4 py-3 font-medium text-slate-800 max-w-[260px]">
                        <div
                          className={`break-words line-clamp-2 ${
                            item.student.name.length > 30 ? 'text-xs leading-snug' : 'text-sm'
                          }`}
                          title={item.student.name}
                        >
                          {item.student.name}
                        </div>
                      </td>

                      {/* Turma (apenas se não for colaborador) */}
                      {!isCollaboratorMode && (
                        <td className="px-4 py-3 text-slate-600">
                          {item.className}
                        </td>
                      )}

                      {/* Status */}
                      <td className="px-4 py-3">
                        {hasPhoto ? (
                          <Badge variant="success" size="sm">
                            Com foto
                          </Badge>
                        ) : (
                          <Badge variant="error" size="sm">
                            Pendente
                          </Badge>
                        )}
                      </td>

                      {/* Ação: Abrir Ficha */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={FileText}
                          onClick={() => onOpenStudentCentral(item.student)}
                          className="font-semibold text-xs text-slate-700 hover:text-slate-900 border-slate-200"
                        >
                          Ficha
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 4. PAGINAÇÃO */}
        {filteredStudents.length > pageSize && (
          <div className="p-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
            <div>
              Página <span className="font-semibold">{currentPage}</span> de{' '}
              <span className="font-semibold">{totalPages}</span> ({filteredStudents.length} {isCollaboratorMode ? 'colaboradores' : 'cadastros'})
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
              >
                Anterior
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
