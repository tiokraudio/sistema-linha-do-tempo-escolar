import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Student,
  AcademicYearRecord,
  AcademicPeriod,
  ClassRecord,
  CropSettings,
  GeneratedTimeline,
  PersonType,
} from '../types';
import {
  Upload,
  Trash2,
  AlertCircle,
  Crop,
  Copy,
  Check,
  UserCheck,
} from 'lucide-react';
import {
  OFFICIAL_CLASSES,
  validateStudentProgression,
} from '../utils/pedagogicalStructure';
import { sortRecordsChronologically } from '../utils/studentPhotoHistory';
import { getActiveAcademicYear } from '../utils/academicYears';
import { apiFetch } from '../utils/api';
import { Button } from './ui/Button';
import { Alert } from './ui/Alert';
import { AdjustPhotoModal } from './AdjustPhotoModal';

export interface ConfirmStudentEnrollmentModalProps {
  isOpen: boolean;
  student: Student | null;
  records: AcademicYearRecord[];
  periods: AcademicPeriod[];
  timelines?: GeneratedTimeline[];
  classes?: ClassRecord[];
  onClose: () => void;
  onConfirmStudentPeriod: (payload: {
    year: string | number;
    enrollment: string;
    name?: string;
    className: string;
    photoUrl?: string;
    cropSettings?: CropSettings;
    personType?: PersonType;
  }) => Promise<any>;
  onRegisterCollaboratorPeriod?: (payload: {
    studentId: string;
    year: string | number;
    photoUrl?: string;
    cropSettings?: CropSettings;
  }) => Promise<any>;
  onDeleteRecord?: (recordId: string) => Promise<any>;
  onUpdateRecordCrops?: (
    recordId: string,
    crops: {
      timelinePrimaryCrop?: CropSettings;
      timelineSecondaryCrop?: CropSettings;
      carometroCrop?: CropSettings;
    }
  ) => Promise<any>;
  onSuccess?: (message: string) => void;
}

export const ConfirmStudentEnrollmentModal: React.FC<ConfirmStudentEnrollmentModalProps> = ({
  isOpen,
  student,
  records,
  periods,
  timelines = [],
  classes = [],
  onClose,
  onConfirmStudentPeriod,
  onRegisterCollaboratorPeriod,
  onDeleteRecord,
  onUpdateRecordCrops,
  onSuccess,
}) => {
  const [confirmPeriod, setConfirmPeriod] = useState<string>('');
  const [confirmClass, setConfirmClass] = useState<string>('');
  const [confirmPhotoUrl, setConfirmPhotoUrl] = useState<string>('');
  const [confirmErrorMsg, setConfirmErrorMsg] = useState<string>('');
  const [confirmSuccessMsg, setConfirmSuccessMsg] = useState<string | null>(null);
  const [confirmIsSubmitting, setConfirmIsSubmitting] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<AcademicYearRecord | null>(null);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);
  const [adjustingRecord, setAdjustingRecord] = useState<AcademicYearRecord | null>(null);
  const [confirmedPageSize, setConfirmedPageSize] = useState<number>(10);
  const [confirmedCurrentPage, setConfirmedCurrentPage] = useState<number>(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevIsOpenRef = useRef(false);
  const prevStudentIdRef = useRef<string | null>(null);

  // Active catalog classes or fallback
  const activeClasses = useMemo(() => {
    if (classes && classes.length > 0) {
      return [...classes]
        .filter((c) => c.active !== false)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    return OFFICIAL_CLASSES;
  }, [classes]);

  // Chronological records of this student
  const chronologicalRecords = useMemo(() => {
    if (!student) return [];
    const studentRecords = records.filter(
      (r) => r.studentId === student.id && r.year
    );
    return sortRecordsChronologically(studentRecords);
  }, [student, records]);

  // Active periods available for selection
  const availablePeriods = useMemo(() => {
    return periods.filter((p) => p.active !== false);
  }, [periods]);

  // Matrículas confirmadas estritamente em ordem DESC de período letivo
  const sortedConfirmedRecords = useMemo(() => {
    return [...chronologicalRecords].sort((a, b) => Number(b.year) - Number(a.year));
  }, [chronologicalRecords]);

  const isCollaborator = Boolean(student?.personType === 'collaborator');

  // Copy name state
  const [copiedName, setCopiedName] = useState(false);
  const copyTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleCopyName = async () => {
    if (!student?.name) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(student.name);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = student.name;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedName(true);
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => {
        setCopiedName(false);
      }, 2000);
    } catch (err) {
      console.error('Falha ao copiar nome:', err);
    }
  };

  // Total de páginas calculada dinamicamente
  const totalConfirmedPages = Math.max(
    1,
    Math.ceil(sortedConfirmedRecords.length / confirmedPageSize)
  );

  // Paginação dos registros confirmados (renderização estrita somente dos itens da página)
  const paginatedConfirmedRecords = useMemo(() => {
    const startIndex = (confirmedCurrentPage - 1) * confirmedPageSize;
    return sortedConfirmedRecords.slice(startIndex, startIndex + confirmedPageSize);
  }, [sortedConfirmedRecords, confirmedCurrentPage, confirmedPageSize]);

  // Se uma exclusão reduzir o número de páginas, reposiciona para a última página válida
  useEffect(() => {
    if (confirmedCurrentPage > totalConfirmedPages) {
      setConfirmedCurrentPage(totalConfirmedPages);
    }
  }, [confirmedCurrentPage, totalConfirmedPages]);

  // Initialize form defaults when modal opens or student changes
  useEffect(() => {
    const isOpeningNow = isOpen && !prevIsOpenRef.current;
    const isStudentChanged = student && student.id !== prevStudentIdRef.current;
    prevIsOpenRef.current = isOpen;
    prevStudentIdRef.current = student?.id || null;

    if (isOpen && student && (isOpeningNow || isStudentChanged)) {
      setConfirmErrorMsg('');
      setConfirmSuccessMsg(null);
      setConfirmPhotoUrl('');
      setConfirmPeriod('');
      setConfirmClass('');
      setConfirmedCurrentPage(1);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen, student]);

  // Dynamic pedagogical progression validation feedback (ignoring collaborators)
  const progressionFeedback = useMemo(() => {
    if (!confirmPeriod || isCollaborator || !confirmClass || !student) return null;
    const studentRecords = records.filter((r) => r.studentId === student.id);
    return validateStudentProgression(confirmPeriod, confirmClass, studentRecords);
  }, [confirmPeriod, confirmClass, records, student, isCollaborator]);

  // Determina se há uma nova matrícula válida pronta para ser confirmada
  const isFormValid = useMemo(() => {
    if (!student) return false;
    if (!confirmPeriod || confirmPeriod.trim() === '') return false;
    if (isCollaborator) {
      return true;
    }
    if (!confirmClass || confirmClass.trim() === '') return false;
    if (progressionFeedback && !progressionFeedback.isValid) return false;
    return true;
  }, [student, confirmPeriod, confirmClass, progressionFeedback, isCollaborator]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 30 * 1024 * 1024) {
        setConfirmErrorMsg('A imagem é muito grande. Escolha uma foto de até 30MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setConfirmPhotoUrl(result);
        setConfirmErrorMsg('');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmIsSubmitting) return;

    setConfirmErrorMsg('');
    setConfirmSuccessMsg(null);

    if (!student) return;

    if (!confirmPeriod) {
      setConfirmErrorMsg(isCollaborator ? 'Selecione o período letivo.' : 'Selecione o período letivo para confirmar a matrícula.');
      return;
    }

    if (!isCollaborator && !confirmClass) {
      setConfirmErrorMsg('Selecione a turma oficial do aluno.');
      return;
    }

    const studentRecords = records.filter((r) => r.studentId === student.id);

    if (!isCollaborator) {
      const progressionCheck = validateStudentProgression(
        confirmPeriod,
        confirmClass,
        studentRecords
      );

      if (!progressionCheck.isValid) {
        setConfirmErrorMsg(progressionCheck.errorMessage || 'Progressão escolar inválida.');
        return;
      }
    }

    const submittedYear = confirmPeriod;
    const submittedClass = confirmClass.trim().toUpperCase();

    setConfirmIsSubmitting(true);
    try {
      let result: any;
      if (isCollaborator) {
        if (onRegisterCollaboratorPeriod) {
          result = await onRegisterCollaboratorPeriod({
            studentId: student.id,
            year: submittedYear,
            photoUrl: confirmPhotoUrl || '',
            cropSettings: { x: 50, y: 50, zoom: 1.0 },
          });
        } else {
          const res = await apiFetch('/api/records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              studentId: student.id,
              year: submittedYear,
              className: '',
              photoUrl: confirmPhotoUrl || '',
              cropSettings: { x: 50, y: 50, zoom: 1.0 },
            }),
          });
          if (!res.ok) {
            let errMessage = 'Erro ao registrar período do colaborador.';
            try {
              const err = await res.json();
              if (err && (err.error || err.message)) {
                errMessage = err.error || err.message;
              }
            } catch {}
            throw new Error(errMessage);
          }
          result = await res.json();
        }
      } else {
        result = await onConfirmStudentPeriod({
          year: submittedYear,
          enrollment: student.enrollment,
          name: student.name,
          className: submittedClass,
          photoUrl: confirmPhotoUrl || '',
          cropSettings: { x: 50, y: 50, zoom: 1.0 },
          personType: 'student',
        });
      }

      let successText = isCollaborator
        ? `Período ${submittedYear} do colaborador registrado com sucesso.`
        : `Matrícula do período ${submittedYear} confirmada com sucesso.`;
      if (result?.timelineRemoved) {
        successText =
          result.message ||
          'Matrícula confirmada. A composição da Linha do Tempo do período letivo atual foi excluída e deverá ser criada novamente.';
      }

      setConfirmSuccessMsg(successText);
      if (onSuccess) {
        onSuccess(successText);
      }

      // Limpa fotografia e reseta campos para o próximo registro
      setConfirmPhotoUrl('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setConfirmPeriod('');
      setConfirmClass('');
    } catch (err: any) {
      const rawMsg = err?.message || '';
      if (
        rawMsg.includes('Failed to fetch') ||
        rawMsg.includes('conectar ao servidor') ||
        err?.name === 'TypeError'
      ) {
        setConfirmErrorMsg(
          'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
        );
      } else if (rawMsg) {
        setConfirmErrorMsg(rawMsg);
      } else {
        setConfirmErrorMsg(
          'Ocorreu um erro inesperado ao salvar. Tente novamente.'
        );
      }
    } finally {
      setConfirmIsSubmitting(false);
    }
  };

  const handleConfirmDeleteRecord = async () => {
    if (!recordToDelete || !onDeleteRecord) return;
    setIsDeletingRecord(true);
    setConfirmErrorMsg('');
    setConfirmSuccessMsg(null);

    const deletedYear = String(recordToDelete.year);

    try {
      await onDeleteRecord(recordToDelete.id);
      const successText = isCollaborator
        ? `Período ${deletedYear} e fotografia associada excluídos com sucesso.`
        : `Matrícula e fotografia do período ${deletedYear} excluídas com sucesso.`;
      setConfirmSuccessMsg(successText);
      if (onSuccess) {
        onSuccess(successText);
      }
      setRecordToDelete(null);

      // Reseta os campos para que o estado permaneça limpo e desabilitado
      setConfirmPeriod('');
      setConfirmClass('');
      setConfirmPhotoUrl('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      const rawMsg = err?.message || '';
      setConfirmErrorMsg(rawMsg || 'Erro ao excluir período.');
    } finally {
      setIsDeletingRecord(false);
    }
  };

  if (!isOpen || !student) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header do Modal */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900 uppercase">
              {isCollaborator ? 'REGISTRAR PERÍODO DO COLABORADOR' : 'CONFIRMAR MATRÍCULA'}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500 flex-wrap min-w-0">
              <span className="font-semibold text-slate-800 break-words line-clamp-2 max-w-sm" title={student.name}>
                {student.name}
              </span>
              <button
                type="button"
                onClick={handleCopyName}
                title={copiedName ? 'Copiado!' : 'Copiar nome completo'}
                className="relative inline-flex items-center justify-center w-5 h-5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer shrink-0"
                aria-label="Copiar nome para a área de transferência"
              >
                {copiedName ? (
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
              <span>·</span>
              <span>
                {isCollaborator ? 'Código / Matrícula' : 'Matrícula'}{' '}
                <strong className="font-mono text-slate-700">{student.enrollment}</strong>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                if (!confirmIsSubmitting) {
                  onClose();
                }
              }}
              disabled={confirmIsSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                if (!confirmIsSubmitting) {
                  onClose();
                }
              }}
              disabled={confirmIsSubmitting}
            >
              Finalizar
            </Button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleConfirmSubmit} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {confirmSuccessMsg && (
            <Alert variant="success">{confirmSuccessMsg}</Alert>
          )}

          {confirmErrorMsg && (
            <Alert variant="error">{confirmErrorMsg}</Alert>
          )}

          {/* HIERARQUIA SUPERIOR (AÇÃO IMEDIATA): Seção: Nova matrícula / Novo período */}
          <div className="space-y-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                {isCollaborator ? 'Novo período letivo' : 'Nova matrícula'}
              </span>
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                {isCollaborator ? 'Colaborador' : 'Aluno'}: {student?.name}
              </span>
            </div>

            {/* Linha com os campos: Período, Turma (se aluno) e Foto */}
            <div className={`grid grid-cols-1 ${isCollaborator ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-3.5 items-start`}>
              {/* 1. Período Letivo */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Período letivo
                </label>
                <select
                  value={confirmPeriod}
                  onChange={(e) => {
                    setConfirmPeriod(e.target.value);
                    setConfirmSuccessMsg(null);
                  }}
                  disabled={confirmIsSubmitting}
                  className="w-full h-10 bg-slate-50/50 hover:bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer transition-colors shadow-2xs"
                  required
                >
                  <option value="">Selecione...</option>
                  {[...availablePeriods]
                    .sort((a, b) => Number(b.name) - Number(a.name))
                    .map((p) => {
                      const isAlreadyConfirmed = chronologicalRecords.some(
                        (r) => String(r.year) === String(p.name)
                      );
                      const isActive = p.name === getActiveAcademicYear(periods);
                      return (
                        <option
                          key={p.id}
                          value={p.name}
                        >
                          {p.name} {isActive ? '(Período Ativo)' : ''} {isAlreadyConfirmed ? (isCollaborator ? '— (Já registrado)' : '— (Já matriculado)') : ''}
                        </option>
                      );
                    })}
                </select>
              </div>

              {/* 2. Turma (apenas para alunos) */}
              {!isCollaborator && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Turma
                  </label>
                  <select
                    value={confirmClass}
                    onChange={(e) => {
                      setConfirmClass(e.target.value);
                      setConfirmSuccessMsg(null);
                    }}
                    disabled={confirmIsSubmitting}
                    className="w-full h-10 bg-slate-50/50 hover:bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors shadow-2xs"
                    required
                  >
                    <option value="">Selecione...</option>
                    {activeClasses.map((cls) => (
                      <option key={cls.id || cls.name} value={cls.name}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 3. Foto do período */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Foto do período
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                  disabled={confirmIsSubmitting}
                />

                {confirmPhotoUrl ? (
                  <div className="flex items-center justify-between gap-2 h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl shadow-2xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-slate-200 overflow-hidden border border-slate-300 shrink-0">
                        <img
                          src={confirmPhotoUrl}
                          alt="Foto selecionada"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-800 truncate">
                        Foto pronta
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmPhotoUrl('');
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                      title="Remover foto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={Upload}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={confirmIsSubmitting}
                    className="w-full h-10 justify-center text-xs font-semibold bg-slate-50 hover:bg-slate-100 border-slate-300 rounded-xl shadow-2xs"
                  >
                    Carregar foto
                  </Button>
                )}
              </div>
            </div>

            {/* Feedback de Validação Pedagógica */}
            {!isCollaborator && progressionFeedback && !progressionFeedback.isValid && (
              <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1 mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {progressionFeedback.errorMessage}
              </p>
            )}

            {/* Alinhamento do Botão de Ação: perfeitamente alinhado na extremidade direita do rodapé do card */}
            <div className="flex justify-end pt-3 border-t border-slate-100">
              <Button
                type="submit"
                variant="primary"
                size="md"
                icon={UserCheck}
                isLoading={confirmIsSubmitting}
                disabled={!isFormValid || confirmIsSubmitting}
                className="font-bold text-xs shadow-xs"
              >
                {confirmIsSubmitting ? 'Salvando...' : isCollaborator ? 'Salvar período' : 'Confirmar matrícula'}
              </Button>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* HIERARQUIA INFERIOR (HISTÓRICO E CONFERÊNCIA): Matrículas / Períodos confirmados */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                {isCollaborator ? 'Períodos registrados' : 'Matrículas confirmadas'}
              </span>
              {sortedConfirmedRecords.length > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span>Períodos por página:</span>
                  <select
                    value={confirmedPageSize}
                    onChange={(e) => {
                      setConfirmedPageSize(Number(e.target.value));
                      setConfirmedCurrentPage(1);
                    }}
                    className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={30}>30</option>
                  </select>
                </div>
              )}
            </div>

            {sortedConfirmedRecords.length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                {isCollaborator
                  ? 'Nenhum período registrado anteriormente.'
                  : 'Nenhuma matrícula confirmada anteriormente.'}
              </p>
            ) : (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  {paginatedConfirmedRecords.map((rec) => {
                    const activeAcademicYear = getActiveAcademicYear(periods);
                    const isActivePeriod = activeAcademicYear !== null && String(rec.year) === activeAcademicYear;
                    const hasSavedTimeline = Boolean(
                      timelines &&
                      student &&
                      timelines.some((t) => t.studentId === student.id && String(t.year) === String(rec.year))
                    );

                    return (
                      <div
                        key={rec.id || `${rec.year}-${rec.className}`}
                        className="flex items-center justify-between bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200/80 text-xs text-slate-800"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-slate-900">{rec.year}</span>
                          {!isCollaborator && (
                            <>
                              <span className="text-slate-400">·</span>
                              <span className="font-medium text-slate-800">{rec.className}</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {rec.photoUrl ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-emerald-700 font-medium">
                                Foto disponível
                              </span>
                              {/* Ação Ajustar foto disponível EXCLUSIVAMENTE para o período letivo ativo */}
                              {isActivePeriod && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAdjustingRecord(rec);
                                  }}
                                  disabled={confirmIsSubmitting || isDeletingRecord}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200 cursor-pointer transition-colors"
                                  title={
                                    hasSavedTimeline
                                      ? 'Este período possui uma composição salva e não pode mais ter o enquadramento alterado.'
                                      : 'Ajustar enquadramento da fotografia para Linha do Tempo e Carômetro'
                                  }
                                >
                                  <Crop className="w-2.5 h-2.5" />
                                  <span>Ajustar foto</span>
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-medium">
                              Foto pendente
                            </span>
                          )}
                          {onDeleteRecord && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRecordToDelete(rec);
                              }}
                              disabled={confirmIsSubmitting || isDeletingRecord}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded border border-rose-200 cursor-pointer transition-colors"
                              title={isCollaborator ? 'Excluir período deste colaborador' : 'Excluir matrícula deste período'}
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                              <span>Excluir</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Controles de Paginação */}
                {totalConfirmedPages > 1 && (
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-600">
                    <button
                      type="button"
                      onClick={() => setConfirmedCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={confirmedCurrentPage <= 1}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    >
                      ‹ Anterior
                    </button>

                    <span className="text-xs font-medium text-slate-600">
                      Página {confirmedCurrentPage} de {totalConfirmedPages}
                    </span>

                    <button
                      type="button"
                      onClick={() => setConfirmedCurrentPage((prev) => Math.min(totalConfirmedPages, prev + 1))}
                      disabled={confirmedCurrentPage >= totalConfirmedPages}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    >
                      Próxima ›
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Modal de Confirmação de Exclusão de Matrícula / Período */}
      {recordToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-900">
                  {isCollaborator ? 'Excluir o período deste colaborador?' : 'Excluir a matrícula deste período?'}
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  {isCollaborator
                    ? 'Essa ação excluirá o período e a fotografia associada a este colaborador. Deseja continuar?'
                    : 'Essa ação excluirá a matrícula e a fotografia associada a este período. Deseja continuar?'}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs space-y-1.5">
              <p className="text-slate-700">
                <span className="font-bold text-slate-500">{isCollaborator ? 'Colaborador:' : 'Aluno:'}</span>{' '}
                <strong className="text-slate-900">{student.name}</strong>{' '}
                <span className="font-mono text-slate-500">({student.enrollment})</span>
              </p>
              <p className="text-slate-700">
                <span className="font-bold text-slate-500">Período letivo:</span>{' '}
                <strong className="text-slate-900">{recordToDelete.year}</strong>
              </p>
              {!isCollaborator && (
                <p className="text-slate-700">
                  <span className="font-bold text-slate-500">Turma:</span>{' '}
                  <strong className="text-slate-900">{recordToDelete.className}</strong>
                </p>
              )}
              {recordToDelete.photoUrl && (
                <p className="text-amber-700 text-[11px] font-medium pt-1">
                  ⚠️ A fotografia deste período também será excluída permanentemente.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => {
                  if (!isDeletingRecord) {
                    setRecordToDelete(null);
                  }
                }}
                disabled={isDeletingRecord}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="danger"
                size="md"
                icon={Trash2}
                onClick={handleConfirmDeleteRecord}
                isLoading={isDeletingRecord}
                disabled={isDeletingRecord}
              >
                {isDeletingRecord ? 'Excluindo...' : 'Excluir'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Ajuste de Enquadramento */}
      {adjustingRecord && student && (
        <AdjustPhotoModal
          isOpen={Boolean(adjustingRecord)}
          student={student}
          record={adjustingRecord}
          isLocked={Boolean(
            timelines &&
            timelines.some((t) => t.studentId === student.id && String(t.year) === String(adjustingRecord.year))
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
                throw new Error(err.error || 'Erro ao salvar ajuste.');
              }
            }
            setAdjustingRecord((prev) => (prev && prev.id === recordId ? { ...prev, ...crops } : prev));
          }}
          onClose={() => setAdjustingRecord(null)}
        />
      )}
    </div>
  );
};
