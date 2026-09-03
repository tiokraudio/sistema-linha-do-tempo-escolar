import React, { useState, useMemo, useEffect } from 'react';
import {
  WorkQueueItem,
  SchoolConfig,
  GeneratedTimeline,
  ReviewChecklistState,
  DEFAULT_CHECKLIST,
} from '../types';
import { A4TimelinePreview, TimelinePhotoItemForPreview } from './A4TimelinePreview';
import {
  CheckCircle2,
  AlertTriangle,
  X,
  FileDown,
  Edit2,
  AlertCircle,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Alert } from './ui/Alert';

interface ReviewChecklistModalProps {
  isOpen: boolean;
  item: WorkQueueItem | null;
  schoolConfig: SchoolConfig;
  onClose: () => void;
  onApproveReview: (studentId: string, checklist: ReviewChecklistState) => Promise<void>;
  onOpenEditor?: (studentId: string) => void;
  onDownloadPdf?: (timeline: GeneratedTimeline, studentName: string) => Promise<void>;
}

export const ReviewChecklistModal: React.FC<ReviewChecklistModalProps> = ({
  isOpen,
  item,
  schoolConfig,
  onClose,
  onApproveReview,
  onOpenEditor,
  onDownloadPdf,
}) => {
  const [checklist, setChecklist] = useState<ReviewChecklistState>(DEFAULT_CHECKLIST);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (item && item.savedTimeline && item.savedTimeline.reviewChecklist) {
      setChecklist({
        ...DEFAULT_CHECKLIST,
        ...(item.savedTimeline.reviewChecklist as any),
      });
    } else {
      setChecklist(DEFAULT_CHECKLIST);
    }
    setSuccessMsg('');
    setErrorMsg('');
  }, [item]);

  // Diagnostics / Automatic checks
  const autoValidation = useMemo(() => {
    if (!item) return null;
    const hasSavedComposition = !!item.savedTimeline;
    const hasPrimaryPhoto =
      !!item.latestRecord?.photoUrl && item.latestRecord.photoUrl.trim() !== '';
    const hasValidName = item.student.name.trim().length > 2;
    const hasValidEnrollment =
      !!item.student.enrollment && item.student.enrollment.trim() !== '';

    const blockingReasons: string[] = [];
    if (!hasSavedComposition) blockingReasons.push('A composição ainda não foi salva no editor.');
    if (item.hasMissingPhotos)
      blockingReasons.push(`O aluno possui ${item.missingPhotosCount} foto(s) pendente(s) no histórico.`);
    if (item.hasExceeding)
      blockingReasons.push('O aluno possui registros excedentes à capacidade de slots.');
    if (item.hasNewHistoryAfterSave)
      blockingReasons.push('Novo período adicionado após o salvamento da composição.');
    if (item.hasNewPhotoAfterSave)
      blockingReasons.push('Nova foto cadastrada após o salvamento da composição.');

    const isBlocked = blockingReasons.length > 0;

    return {
      hasSavedComposition,
      hasPrimaryPhoto,
      hasValidName,
      hasValidEnrollment,
      isBlocked,
      blockingReasons,
    };
  }, [item]);

  if (!isOpen || !item) return null;

  const handleToggle = (key: keyof ReviewChecklistState) => {
    setChecklist((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSelectAll = () => {
    setChecklist({
      studentNameCorrect: true,
      photosBelongToStudent: true,
    });
  };

  const handleClearAll = () => {
    setChecklist(DEFAULT_CHECKLIST);
  };

  const handleSaveApproval = async () => {
    try {
      setIsSubmitting(true);
      setErrorMsg('');
      await onApproveReview(item.student.id, checklist);
      setSuccessMsg('Revisão aprovada com sucesso.');
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao aprovar revisão.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const previewPhotoItems: TimelinePhotoItemForPreview[] = item.savedTimeline
    ? (item.savedTimeline.photoItems || []).map((p) => ({
        year: p.year,
        className: p.className,
        photoUrl: p.photoUrl,
        cropSettings: p.cropSettings,
        isPrimary: p.isPrimary,
      }))
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">Revisão</span>
              {item.isReviewed ? (
                <Badge variant="success">Aprovada</Badge>
              ) : (
                <Badge variant="neutral">Pendente</Badge>
              )}
            </div>
            <h2 className="text-sm font-semibold text-slate-600 mt-0.5">
              {item.student.name} • {item.latestClass} ({item.latestYear})
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body: Two Columns */}
        <div className="p-5 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: A4 Live Preview & Status */}
          <div className="lg:col-span-7 space-y-3">
            <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 flex flex-col items-center justify-center min-h-[360px]">
              {item.savedTimeline ? (
                <div className="shadow-md rounded-lg overflow-hidden border border-slate-300 bg-white">
                  <A4TimelinePreview
                    studentName={item.student.name}
                    studentEnrollment={item.student.enrollment}
                    model={item.savedTimeline.modelSnapshot}
                    schoolConfig={schoolConfig}
                    photoItems={previewPhotoItems}
                    scale={0.42}
                    interactive={false}
                    personType={item.savedTimeline?.personType || item.student.personType || 'student'}
                  />
                </div>
              ) : (
                <div className="text-center p-8 text-slate-400 space-y-2">
                  <AlertCircle className="w-8 h-8 mx-auto text-amber-500" />
                  <p className="font-bold text-slate-700 text-xs">Composição não salva</p>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    Abra o aluno no Editor para compor e salvar antes de aprovar a revisão.
                  </p>
                </div>
              )}
            </div>

            {/* Actions for Left Column */}
            <div className="flex flex-wrap items-center gap-2">
              {onOpenEditor && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={Edit2}
                  onClick={() => {
                    onClose();
                    onOpenEditor(item.student.id);
                  }}
                  className="flex-1"
                >
                  Editar
                </Button>
              )}
              {onDownloadPdf && item.savedTimeline && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  icon={FileDown}
                  onClick={() => onDownloadPdf(item.savedTimeline!, item.student.name)}
                  className="flex-1"
                >
                  Baixar Linha do Tempo
                </Button>
              )}
            </div>
          </div>

          {/* Right Column: Automated Validation & Checklist */}
          <div className="lg:col-span-5 space-y-3">
            {/* Feedback Alerts */}
            {successMsg && (
              <Alert variant="success" onClose={() => setSuccessMsg('')}>
                {successMsg}
              </Alert>
            )}
            {errorMsg && (
              <Alert variant="error" onClose={() => setErrorMsg('')}>
                {errorMsg}
              </Alert>
            )}

            {/* Automated Validation Box */}
            {autoValidation && (
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Validação
                  </span>
                  {autoValidation.isBlocked ? (
                    <Badge variant="error">Pendência</Badge>
                  ) : (
                    <Badge variant="success">Pronto</Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    {autoValidation.hasSavedComposition ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    )}
                    <span className="text-slate-700">Composição</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {autoValidation.hasPrimaryPhoto ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    )}
                    <span className="text-slate-700">Foto principal</span>
                  </div>
                </div>

                {autoValidation.blockingReasons.length > 0 && (
                  <div className="p-2.5 bg-rose-50 rounded-lg border border-rose-200 text-xs text-rose-800 space-y-1 mt-2">
                    <span className="font-bold block">Pendências:</span>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {autoValidation.blockingReasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Operator Quality Checklist */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Conferência
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-[11px] font-semibold text-slate-700 hover:text-slate-900 cursor-pointer"
                  >
                    Marcar todos
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    Limpar
                  </button>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                {/* 1. Nome do aluno conferido e correto */}
                <label
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    checklist.studentNameCorrect
                      ? 'bg-slate-50 border-slate-300 text-slate-900 font-semibold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!checklist.studentNameCorrect}
                    onChange={() => handleToggle('studentNameCorrect')}
                    className="w-4 h-4 rounded text-slate-900 focus:ring-slate-500 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-semibold block">Nome do aluno conferido</span>
                    <span className="text-[11px] text-slate-500 font-normal">
                      Grafia: <strong>{item.student.name}</strong>
                    </span>
                  </div>
                </label>

                {/* 2. Fotografias correspondem ao aluno */}
                <label
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    checklist.photosBelongToStudent
                      ? 'bg-slate-50 border-slate-300 text-slate-900 font-semibold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!checklist.photosBelongToStudent}
                    onChange={() => handleToggle('photosBelongToStudent')}
                    className="w-4 h-4 rounded text-slate-900 focus:ring-slate-500 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-semibold block">Fotografias correspondem ao aluno</span>
                    <span className="text-[11px] text-slate-500 font-normal">
                      Foto principal e histórico pertencem ao aluno
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {item.reviewedAt && (
              <span>
                Aprovada em {new Date(item.reviewedAt).toLocaleDateString('pt-BR')} por{' '}
                <strong>{item.reviewedBy || 'Operador'}</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
            >
              Fechar
            </Button>

            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={CheckCircle2}
              onClick={handleSaveApproval}
              isLoading={isSubmitting}
              disabled={isSubmitting || !item.savedTimeline || (autoValidation?.isBlocked ?? false)}
            >
              {item.isReviewed ? 'Atualizar aprovação' : 'Aprovar revisão'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
