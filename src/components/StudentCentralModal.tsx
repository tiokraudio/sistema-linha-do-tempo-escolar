import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Student,
  AcademicYearRecord,
  AcademicPeriod,
  SchoolConfig,
  CropSettings,
  ClassRecord,
} from '../types';
import {
  X,
  Upload,
  Camera,
  RotateCcw,
  Download,
  Move,
  Sparkles,
  ZoomIn,
  Check,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  FileText,
  UserCheck,
} from 'lucide-react';
import { autoDetectFaceCrop } from '../utils/faceDetector';
import {
  getStudentHistoricalTrajectory,
  sortRecordsChronologically,
} from '../utils/studentPhotoHistory';
import { getActiveAcademicYear } from '../utils/academicYears';
import { apiFetch } from '../utils/api';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Toast } from './ui/Toast';
import { Alert } from './ui/Alert';

export interface StudentCentralModalProps {
  isOpen: boolean;
  student: Student | null;
  records: AcademicYearRecord[];
  timelines?: any[];
  periods?: AcademicPeriod[];
  schoolConfig: SchoolConfig;
  classes?: ClassRecord[];
  originLabel?: string;
  onClose: () => void;
  onNavigateToTimeline?: (studentId: string) => void;
  onNavigateToConfirmPeriod?: (student: Student) => void;
  onConfirmStudentPeriod?: (payload: {
    year: string | number;
    enrollment: string;
    name?: string;
    className: string;
    photoUrl?: string;
    cropSettings?: CropSettings;
  }) => Promise<any>;
  onUpdateRecordPhoto?: (
    recordId: string,
    photoUrl: string,
    cropSettings?: CropSettings
  ) => Promise<any>;
}

export const StudentCentralModal: React.FC<StudentCentralModalProps> = ({
  isOpen,
  student,
  records,
  timelines = [],
  periods = [],
  schoolConfig,
  classes: _classes = [],
  onClose,
  onUpdateRecordPhoto,
}) => {
  if (!isOpen || !student) return null;

  const isCollaborator = student.personType === 'collaborator';
  const photoHistorySlots = schoolConfig.photoHistorySlots ?? 10;

  // Registros do aluno / colaborador em ordem cronológica estrita
  const chronologicalRecords = useMemo(() => {
    const studentRecords = records.filter(
      (r) => r.studentId === student.id && r.year && (isCollaborator || r.className)
    );
    return sortRecordsChronologically(studentRecords);
  }, [student.id, records, isCollaborator]);

  // Lista visual de matrículas para exibição na Ficha (ordenação estrita: período letivo DESC)
  const displayRecords = useMemo(() => {
    return [...chronologicalRecords].sort((a, b) => {
      const numA = Number(a.year);
      const numB = Number(b.year);
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
        return numB - numA;
      }
      const yearComp = String(b.year).localeCompare(String(a.year), undefined, { numeric: true });
      if (yearComp !== 0) return yearComp;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }, [chronologicalRecords]);

  // Período letivo atual (mais recente com status ativo oficial)
  const currentAcademicPeriodName = useMemo(() => {
    return getActiveAcademicYear(periods) || '';
  }, [periods]);

  // Trajetória Fotográfica e registros cronológicos (B.14)
  const trajectory = useMemo(() => {
    return getStudentHistoricalTrajectory(
      student.id,
      records,
      photoHistorySlots,
      currentAcademicPeriodName,
      periods,
      student.personType
    );
  }, [student.id, records, photoHistorySlots, currentAcademicPeriodName, periods, student.personType]);

  // Histórico fotográfico agrupado por período letivo (ordem DESC: período mais recente -> mais antigo)
  const photoHistoryByPeriod = useMemo(() => {
    const recordsWithPhoto = chronologicalRecords.filter(
      (r) => r.photoUrl && r.photoUrl.trim()
    );

    const groups: { [year: string]: AcademicYearRecord[] } = {};
    recordsWithPhoto.forEach((r) => {
      const yr = String(r.year);
      if (!groups[yr]) groups[yr] = [];
      groups[yr].push(r);
    });

    const sortedYears = Object.keys(groups).sort((a, b) => {
      const numA = Number(a);
      const numB = Number(b);
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
        return numB - numA;
      }
      return b.localeCompare(a, undefined, { numeric: true });
    });

    return sortedYears.map((yr) => {
      const sortedPhotos = [...groups[yr]].sort((a, b) => {
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
      return {
        year: yr,
        className: sortedPhotos[0]?.className || '',
        photos: sortedPhotos,
      };
    });
  }, [chronologicalRecords]);

  // Registro mais recente do aluno
  const latestRecord = trajectory.primaryRecord;

  // Estados de expansão/recolhimento controlados por período
  // Por padrão: todos os períodos iniciam recolhidos
  const [expandedTrajectoryYears, setExpandedTrajectoryYears] = useState<Record<string, boolean>>({});

  // Resetar expansão quando o aluno mudar ou o modal for reaberto
  useEffect(() => {
    setExpandedTrajectoryYears({});
  }, [student.id]);

  // Estado para visualização ampliada (Lightbox) da fotografia
  const [enlargedPhoto, setEnlargedPhoto] = useState<{
    url: string;
    studentName: string;
    year: string | number;
    className: string;
  } | null>(null);

  const toggleTrajectoryPeriod = (year: string | number) => {
    const key = String(year);
    setExpandedTrajectoryYears((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      return new Date(isoString).toLocaleDateString('pt-BR');
    } catch {
      return isoString;
    }
  };

  // ==================================================
  // ESTADOS DO MODAL CONTEXTUAL "GESTÃO DE FOTO DA MATRÍCULA"
  // ==================================================
  const [photoModalRecord, setPhotoModalRecord] = useState<AcademicYearRecord | null>(null);
  const [modalPhotoUrl, setModalPhotoUrl] = useState<string>('');
  const [modalCropSettings, setModalCropSettings] = useState<CropSettings>({ x: 50, y: 50, zoom: 1.0 });
  const [modalPhotoNaturalSize, setModalPhotoNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [photoModalErrorMsg, setPhotoModalErrorMsg] = useState<string>('');
  const [photoModalIsSubmitting, setPhotoModalIsSubmitting] = useState(false);
  const [isDetectingFace, setIsDetectingFace] = useState(false);
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const photoModalFileInputRef = useRef<HTMLInputElement>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const modalCanvasRef = useRef<HTMLCanvasElement>(null);

  // Efeito para desenhar a miniatura de resultado do crop em tempo real
  useEffect(() => {
    if (!photoModalRecord || !modalPhotoUrl || !modalCanvasRef.current) return;
    const canvas = modalCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isPrimary = Boolean(latestRecord && String(photoModalRecord.year) === String(latestRecord.year));
    const targetW = isPrimary ? 288 : 224;
    const targetH = isPrimary ? 216 : 224;
    canvas.width = targetW;
    canvas.height = targetH;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setModalPhotoNaturalSize({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      });

      ctx.clearRect(0, 0, targetW, targetH);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, targetW, targetH);

      const zoom = modalCropSettings.zoom ?? 1.0;
      const cropX = modalCropSettings.x ?? 50;
      const cropY = modalCropSettings.y ?? 50;

      const imgW = img.naturalWidth || img.width;
      const imgH = img.naturalHeight || img.height;
      if (!imgW || !imgH) return;

      const scale = Math.max(targetW / imgW, targetH / imgH);
      const srcW = targetW / (scale * zoom);
      const srcH = targetH / (scale * zoom);
      const centerX = imgW * (cropX / 100);
      const centerY = imgH * (cropY / 100);
      const srcX = centerX - srcW / 2;
      const srcY = centerY - srcH / 2;

      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH);
    };
    img.src = modalPhotoUrl;
  }, [photoModalRecord, modalPhotoUrl, modalCropSettings.x, modalCropSettings.y, modalCropSettings.zoom, latestRecord]);

  const handleOpenPhotoModal = (rec: AcademicYearRecord) => {
    const isCurrent = String(rec.year) === String(currentAcademicPeriodName);
    if (!isCurrent) {
      return;
    }
    setPhotoModalRecord(rec);
    setModalPhotoUrl(rec.photoUrl || '');
    setModalCropSettings(rec.cropSettings || { x: 50, y: 50, zoom: 1.0 });
    setPhotoModalErrorMsg('');
  };

  const handleClosePhotoModal = () => {
    if (!photoModalIsSubmitting) {
      setPhotoModalRecord(null);
      setModalPhotoUrl('');
      setPhotoModalErrorMsg('');
    }
  };

  const handleModalPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 30 * 1024 * 1024) {
        setPhotoModalErrorMsg('A imagem é muito grande. Escolha uma foto de até 30MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setModalPhotoUrl(result);
        setModalCropSettings({ x: 50, y: 50, zoom: 1.0 });
        setPhotoModalErrorMsg('');
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePhotoAutoDetect = async () => {
    if (!modalPhotoUrl) return;
    setIsDetectingFace(true);
    try {
      const detected = await autoDetectFaceCrop(modalPhotoUrl);
      setModalCropSettings(detected);
    } catch (err) {
      console.error('Auto detect error:', err);
    } finally {
      setIsDetectingFace(false);
    }
  };

  const handlePhotoMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDraggingPhoto(true);
    setDragStartPos({ x: e.clientX, y: e.clientY });
  };

  const handlePhotoMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingPhoto) return;
    const dx = e.clientX - dragStartPos.x;
    const dy = e.clientY - dragStartPos.y;
    const factor = 0.35;
    setModalCropSettings((prev) => ({
      ...prev,
      x: Math.min(Math.max(prev.x + dx * factor, 0), 100),
      y: Math.min(Math.max(prev.y + dy * factor, 0), 100),
    }));
    setDragStartPos({ x: e.clientX, y: e.clientY });
  };

  const handlePhotoMouseUp = () => {
    setIsDraggingPhoto(false);
  };

  // Download direto da fotografia original
  const handleDownloadOriginalPhoto = (slot: { year: string | number; className: string; photoUrl?: string }) => {
    if (!slot.photoUrl) return;

    const sanitizedStudentName = (student.name || 'ALUNO')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toUpperCase();

    let ext = 'jpg';
    if (slot.photoUrl.startsWith('data:image/png')) {
      ext = 'png';
    } else if (slot.photoUrl.startsWith('data:image/webp')) {
      ext = 'webp';
    } else if (slot.photoUrl.startsWith('data:image/jpeg') || slot.photoUrl.startsWith('data:image/jpg')) {
      ext = 'jpg';
    } else if (slot.photoUrl.includes('.')) {
      const parts = slot.photoUrl.split('?')[0].split('.');
      const lastPart = parts[parts.length - 1].toLowerCase();
      if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(lastPart)) {
        ext = lastPart === 'jpeg' ? 'jpg' : lastPart;
      }
    }

    const filename = `${sanitizedStudentName}_${slot.year}.${ext}`;

    const link = document.createElement('a');
    link.href = slot.photoUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSavePhotoModal = async () => {
    if (!photoModalRecord) return;
    if (!modalPhotoUrl || !modalPhotoUrl.trim()) {
      setPhotoModalErrorMsg('Selecione uma fotografia para salvar.');
      return;
    }

    setPhotoModalIsSubmitting(true);
    setPhotoModalErrorMsg('');

    try {
      let result: any = null;
      if (onUpdateRecordPhoto) {
        result = await onUpdateRecordPhoto(photoModalRecord.id, modalPhotoUrl, modalCropSettings);
      } else {
        const res = await apiFetch(`/api/records/${photoModalRecord.id}/photo`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            photoUrl: modalPhotoUrl,
            cropSettings: modalCropSettings,
          }),
        });

        if (!res.ok) {
          let errMessage = 'Erro ao atualizar fotografia.';
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

      setPhotoModalRecord(null);
      setModalPhotoUrl('');
      if (result?.timelineRemoved) {
        setSuccessToast(
          result.message ||
            'Foto alterada. A composição da Linha do Tempo do período letivo atual foi excluída e deverá ser criada novamente.'
        );
      } else {
        setSuccessToast('Fotografia salva com sucesso.');
      }
    } catch (err: any) {
      const rawMsg = err?.message || '';
      if (
        rawMsg.includes('Failed to fetch') ||
        rawMsg.includes('conectar ao servidor') ||
        rawMsg.includes('NetworkError') ||
        rawMsg.includes('network') ||
        err?.name === 'TypeError'
      ) {
        setPhotoModalErrorMsg(
          'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
        );
      } else if (rawMsg) {
        setPhotoModalErrorMsg(rawMsg);
      } else {
        setPhotoModalErrorMsg('Ocorreu um erro ao salvar a fotografia. Tente novamente.');
      }
    } finally {
      setPhotoModalIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      {/* Toast Notification */}
      {successToast && (
        <Toast message={successToast} onClose={() => setSuccessToast(null)} />
      )}

      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-150">
        {/* ================================================== */}
        {/* CABEÇALHO DA FICHA DO ALUNO */}
        {/* ================================================== */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0 bg-white">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">
                {student.name}
              </h2>
              <Badge variant={chronologicalRecords.length > 0 ? 'success' : 'neutral'} size="sm">
                {isCollaborator
                  ? chronologicalRecords.length > 0
                    ? `${chronologicalRecords.length} período${chronologicalRecords.length > 1 ? 's' : ''}`
                    : 'Sem período'
                  : chronologicalRecords.length > 0
                  ? `${chronologicalRecords.length} matrícula${chronologicalRecords.length > 1 ? 's' : ''}`
                  : 'Sem matrícula'}
              </Badge>
            </div>
            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
              <span>
                {isCollaborator ? 'Código / Matrícula' : 'Matrícula'}{' '}
                <strong className="font-mono font-semibold text-slate-700">{student.enrollment}</strong>
              </span>
              <span>·</span>
              <span>Cadastro {formatDate(student.createdAt)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              icon={X}
              className="text-xs font-semibold cursor-pointer shrink-0"
              title="Fechar (Esc)"
            >
              Fechar
            </Button>
          </div>
        </div>

        {/* ================================================== */}
        {/* CORPO DA FICHA DO ALUNO */}
        {/* ================================================== */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6 text-slate-700">
          {/* ================================================== */}
          {/* MATRÍCULAS / PERÍODOS E HISTÓRICO (EXPANSÍVEL / RECOLHÍVEL - ORDEM DESC) */}
          {/* ================================================== */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {isCollaborator ? 'Períodos e histórico' : 'Matrículas e trajetória'}
              </h3>
              <span className="text-[11px] text-slate-400">
                {displayRecords.length} período{displayRecords.length === 1 ? '' : 's'} registrado{displayRecords.length === 1 ? '' : 's'}
              </span>
            </div>

            {displayRecords.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-xs bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                {isCollaborator
                  ? 'Nenhum período registrado para este colaborador.'
                  : 'Nenhuma matrícula confirmada para este aluno.'}
              </div>
            ) : (
              <div className="space-y-2.5">
                {displayRecords.map((rec) => {
                  const key = String(rec.year);
                  const isCurrent = key === currentAcademicPeriodName;
                  const isExpanded = Boolean(expandedTrajectoryYears[key]);
                  const hasPhoto = Boolean(rec.photoUrl && rec.photoUrl.trim());

                  // Verifica se existe composição salva na Linha do Tempo para este período
                  const timelineForPeriod = timelines?.find(
                    (t) =>
                      (t.studentId === student.id || (student.enrollment && t.studentEnrollment === student.enrollment)) &&
                      String(t.year) === key
                  );

                  // Verifica ajuste do Carômetro
                  const hasCarometroAdjustment = Boolean(
                    rec.carometroCrop ||
                      (rec.cropSettings && (rec.cropSettings.zoom !== 1.0 || rec.cropSettings.x !== 50 || rec.cropSettings.y !== 50))
                  );

                  return (
                    <div
                      key={rec.id || key}
                      className="border border-slate-200 rounded-xl bg-white overflow-hidden transition-all shadow-xs"
                    >
                      {/* Cabeçalho do Período (Acordeão) */}
                      <button
                        type="button"
                        onClick={() => toggleTrajectoryPeriod(rec.year)}
                        className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50/75 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                          <span className="text-slate-400 shrink-0">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-slate-600" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            )}
                          </span>

                          <span className="font-mono font-bold text-slate-900 text-sm">
                            {rec.year}
                          </span>
                          {!isCollaborator && rec.className && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="font-semibold text-slate-800 text-sm truncate">
                                {rec.className}
                              </span>
                            </>
                          )}
                          {isCurrent && (
                            <Badge variant="info" size="sm">
                              Atual
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="success" size="sm">
                            {isCollaborator ? 'Período confirmado' : 'Matrícula confirmada'}
                          </Badge>
                        </div>
                      </button>

                      {/* Conteúdo do Período Expandido: 1 linha com 3 colunas (FOTOGRAFIA | LINHA DO TEMPO | CARÔMETRO) */}
                      {/* Renderizado sob demanda para garantir alta performance mesmo com múltiplos anos históricos */}
                      {isExpanded && (
                        <div className="px-4 py-4 border-t border-slate-100 bg-slate-50/50 text-xs">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                            {/* 1. COLUNA FOTOGRAFIA */}
                            <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-3">
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                                    Fotografia
                                  </span>
                                  {hasPhoto ? (
                                    <Badge variant="success" size="sm">
                                      Disponível
                                    </Badge>
                                  ) : (
                                    <Badge variant="neutral" size="sm">
                                      Pendente
                                    </Badge>
                                  )}
                                </div>

                                <div className="flex items-center gap-3 pt-0.5">
                                  {hasPhoto ? (
                                    <div
                                      onClick={() =>
                                        setEnlargedPhoto({
                                          url: rec.photoUrl!,
                                          studentName: student.name,
                                          year: rec.year,
                                          className: rec.className,
                                        })
                                      }
                                      className="group relative w-16 h-20 rounded-lg bg-slate-100 overflow-hidden border border-slate-300 shrink-0 cursor-pointer shadow-2xs hover:ring-2 hover:ring-blue-500/60 transition-all"
                                      title="Clique para ampliar a fotografia"
                                    >
                                      <img
                                        src={rec.photoUrl}
                                        alt={`Foto ${rec.year} - ${student.name}`}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                        referrerPolicy="no-referrer"
                                      />
                                      <div className="absolute inset-0 bg-slate-950/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                                        <ZoomIn className="w-4 h-4" />
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="w-16 h-20 rounded-lg bg-slate-100 border border-dashed border-slate-300 shrink-0 flex flex-col items-center justify-center text-slate-400">
                                      <Camera className="w-5 h-5 mb-1 text-slate-300" />
                                      <span className="text-[9px] font-medium text-slate-400">Sem foto</span>
                                    </div>
                                  )}

                                  <div className="space-y-1 flex-1 min-w-0">
                                    <p className="text-[11px] font-medium text-slate-700 leading-tight truncate">
                                      {hasPhoto ? 'Fotografia registrada' : 'Nenhuma foto vinculada'}
                                    </p>
                                    <p className="text-[10px] text-slate-400 leading-snug">
                                      {hasPhoto ? `Foto oficial do período letivo ${rec.year}` : 'Faça upload no período atual'}
                                    </p>
                                    {hasPhoto && (
                                      <span className="text-[10px] text-blue-600 font-medium cursor-pointer hover:underline inline-block"
                                        onClick={() =>
                                          setEnlargedPhoto({
                                            url: rec.photoUrl!,
                                            studentName: student.name,
                                            year: rec.year,
                                            className: rec.className,
                                          })
                                        }
                                      >
                                        Ampliar foto
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Ações da Fotografia */}
                              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 pt-2 border-t border-slate-100">
                                {hasPhoto && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={Download}
                                    onClick={() =>
                                      handleDownloadOriginalPhoto({
                                        year: rec.year,
                                        className: rec.className,
                                        photoUrl: rec.photoUrl,
                                      })
                                    }
                                    className="text-[11px] h-7 px-2 flex-1 justify-center"
                                    title={`Baixar fotografia original de ${rec.year}`}
                                  >
                                    Baixar original
                                  </Button>
                                )}

                                <Button
                                  variant={hasPhoto ? 'secondary' : 'primary'}
                                  size="sm"
                                  icon={hasPhoto ? Camera : Upload}
                                  disabled={!isCurrent}
                                  onClick={() => isCurrent && handleOpenPhotoModal(rec)}
                                  className="text-[11px] h-7 px-2 flex-1 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={
                                    isCurrent
                                      ? hasPhoto
                                        ? 'Alterar fotografia do período atual'
                                        : 'Adicionar fotografia no período atual'
                                      : 'Edição de fotografia permitida apenas no período letivo atual'
                                  }
                                >
                                  {hasPhoto ? 'Alterar foto' : 'Adicionar foto'}
                                </Button>
                              </div>
                            </div>

                            {/* 2. COLUNA LINHA DO TEMPO */}
                            <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-3">
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                                    Linha do Tempo
                                  </span>
                                  {timelineForPeriod ? (
                                    <Badge variant="success" size="sm">
                                      Composição salva
                                    </Badge>
                                  ) : (
                                    <Badge variant="neutral" size="sm">
                                      Composição pendente
                                    </Badge>
                                  )}
                                </div>

                                <div className="space-y-1.5 pt-0.5">
                                  <p className="text-xs font-semibold text-slate-800">
                                    {timelineForPeriod ? 'Composição gerada' : 'Aguardando composição'}
                                  </p>
                                  <p className="text-[11px] text-slate-500 leading-relaxed">
                                    {timelineForPeriod
                                      ? `Registro salvo em ${formatDate(timelineForPeriod.createdAt || timelineForPeriod.updatedAt)}.`
                                      : 'Nenhuma composição da Linha do Tempo salva para este período letivo.'}
                                  </p>
                                </div>
                              </div>

                              <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[10px] text-slate-400">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                <span>Consulta de status do período</span>
                              </div>
                            </div>

                            {/* 3. COLUNA CARÔMETRO */}
                            <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-3">
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                                    Carômetro
                                  </span>
                                  {hasCarometroAdjustment ? (
                                    <Badge variant="success" size="sm">
                                      Ajuste salvo
                                    </Badge>
                                  ) : rec.autoFaceCrop ? (
                                    <Badge variant="info" size="sm">
                                      Rosto identificado
                                    </Badge>
                                  ) : hasPhoto ? (
                                    <Badge variant="neutral" size="sm">
                                      Padrão
                                    </Badge>
                                  ) : (
                                    <Badge variant="neutral" size="sm">
                                      Pendente
                                    </Badge>
                                  )}
                                </div>

                                <div className="space-y-1.5 pt-0.5">
                                  <p className="text-xs font-semibold text-slate-800">
                                    {hasCarometroAdjustment
                                      ? 'Enquadramento personalizado'
                                      : rec.autoFaceCrop
                                      ? 'Detecção facial automática'
                                      : hasPhoto
                                      ? 'Enquadramento padrão'
                                      : 'Aguardando foto'}
                                  </p>
                                  <p className="text-[11px] text-slate-500 leading-relaxed">
                                    {hasCarometroAdjustment
                                      ? 'Recorte e zoom ajustados especificamente para a grade do Carômetro.'
                                      : rec.autoFaceCrop
                                      ? 'Rosto detectado e centralizado automaticamente.'
                                      : hasPhoto
                                      ? 'Utilizando enquadramento padrão centralizado da foto.'
                                      : 'Sem fotografia para aplicar recorte do Carômetro.'}
                                  </p>
                                </div>
                              </div>

                              <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[10px] text-slate-400">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                <span>Status do enquadramento no período</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* ================================================== */}
        {/* MODAL CONTEXTUAL: GESTÃO DE FOTO DA MATRÍCULA */}
        {/* ================================================== */}
        {photoModalRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
              {/* Header do Modal */}
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {photoModalRecord.photoUrl ? 'Alterar foto' : 'Adicionar foto'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {student.name} · {photoModalRecord.year}{photoModalRecord.className ? ` (${photoModalRecord.className})` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClosePhotoModal}
                  disabled={photoModalIsSubmitting}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
                  aria-label="Fechar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Corpo do Modal */}
              <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
                {photoModalErrorMsg && (
                  <Alert variant="error">{photoModalErrorMsg}</Alert>
                )}

                {/* Input de Arquivo Oculto */}
                <input
                  ref={photoModalFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleModalPhotoUpload}
                  className="hidden"
                  disabled={photoModalIsSubmitting}
                />

                {!modalPhotoUrl ? (
                  <div
                    onClick={() => photoModalFileInputRef.current?.click()}
                    className="py-8 px-4 border border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/30 rounded-xl flex flex-col items-center justify-center text-center transition-all cursor-pointer group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                      <Upload className="w-5 h-5" />
                    </div>
                    <span className="font-semibold text-slate-800 text-sm">
                      Selecionar foto
                    </span>
                    <span className="text-[11px] text-slate-400 mt-1">
                      JPG, PNG ou WebP (máx. 30MB)
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-lg border border-slate-200/80">
                      <span className="text-xs font-medium text-slate-700">Foto selecionada</span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        icon={Upload}
                        onClick={() => photoModalFileInputRef.current?.click()}
                        disabled={photoModalIsSubmitting}
                      >
                        Trocar foto
                      </Button>
                    </div>

                    {/* Preview de Enquadramento */}
                    {(() => {
                      const isModalPrimary = Boolean(
                        latestRecord &&
                        photoModalRecord &&
                        String(photoModalRecord.year) === String(latestRecord.year)
                      );
                      const modalImgW = modalPhotoNaturalSize.width || 400;
                      const modalImgH = modalPhotoNaturalSize.height || 400;
                      const modalTargetW = isModalPrimary ? 288 : 216;
                      const modalTargetH = isModalPrimary ? 216 : 216;
                      const modalScale = Math.max(modalTargetW / modalImgW, modalTargetH / modalImgH);
                      const modalZoom = modalCropSettings.zoom || 1.0;
                      const modalSrcW = modalTargetW / (modalScale * modalZoom);
                      const modalSrcH = modalTargetH / (modalScale * modalZoom);
                      const modalCenterX = modalImgW * ((modalCropSettings.x ?? 50) / 100);
                      const modalCenterY = modalImgH * ((modalCropSettings.y ?? 50) / 100);
                      const modalSrcX = modalCenterX - modalSrcW / 2;
                      const modalSrcY = modalCenterY - modalSrcH / 2;

                      const modalBoxLeftPct = (modalSrcX / modalImgW) * 100;
                      const modalBoxTopPct = (modalSrcY / modalImgH) * 100;
                      const modalBoxWidthPct = (modalSrcW / modalImgW) * 100;
                      const modalBoxHeightPct = (modalSrcH / modalImgH) * 100;

                      return (
                        <div className="p-3 bg-slate-900 rounded-xl flex flex-col items-center justify-center select-none overflow-hidden">
                          <div
                            onMouseDown={handlePhotoMouseDown}
                            onMouseMove={handlePhotoMouseMove}
                            onMouseUp={handlePhotoMouseUp}
                            onMouseLeave={handlePhotoMouseUp}
                            className="relative inline-block overflow-hidden rounded-lg cursor-grab active:cursor-grabbing max-h-52 select-none border border-slate-800 bg-slate-950"
                          >
                            <img
                              src={modalPhotoUrl}
                              alt={isCollaborator ? 'Original do colaborador' : 'Original do aluno'}
                              onLoad={(e) => {
                                const img = e.currentTarget;
                                setModalPhotoNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
                              }}
                              className="max-h-52 max-w-full object-contain pointer-events-none block"
                              referrerPolicy="no-referrer"
                            />

                            <div
                              style={{
                                left: `${modalBoxLeftPct}%`,
                                top: `${modalBoxTopPct}%`,
                                width: `${modalBoxWidthPct}%`,
                                height: `${modalBoxHeightPct}%`,
                                boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.72)',
                              }}
                              className={`absolute pointer-events-none border-2 border-blue-400 flex items-center justify-center ${
                                isModalPrimary ? 'rounded-none' : 'rounded-full'
                              }`}
                            >
                              <div className="w-full h-px bg-white/20 absolute pointer-events-none"></div>
                              <div className="h-full w-px bg-white/20 absolute pointer-events-none"></div>
                            </div>
                          </div>

                          <div className="mt-2.5 flex items-center justify-between w-full max-w-md px-1 text-slate-400 text-xs">
                            <span className="flex items-center gap-1 text-[11px]">
                              <Move className="w-3 h-3 text-blue-400 shrink-0" />
                              <span>Arraste para posicionar</span>
                            </span>

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-medium text-slate-400">
                                Prévia:
                              </span>
                              <div
                                className={`overflow-hidden border border-blue-500/80 bg-slate-900 ${
                                  isModalPrimary ? 'w-10 h-7.5 rounded-xs' : 'w-7.5 h-7.5 rounded-full'
                                }`}
                              >
                                <canvas ref={modalCanvasRef} className="w-full h-full block" />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Botão de Detecção Facial */}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={Sparkles}
                      onClick={handlePhotoAutoDetect}
                      disabled={isDetectingFace || photoModalIsSubmitting}
                      isLoading={isDetectingFace}
                      className="w-full"
                    >
                      Enquadramento automático
                    </Button>

                    {/* Controles de Zoom e Posição */}
                    <div className="space-y-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                      <div>
                        <div className="flex justify-between text-xs text-slate-600 mb-1">
                          <span className="flex items-center gap-1 font-medium">
                            <ZoomIn className="w-3 h-3 text-slate-400" /> Zoom
                          </span>
                          <span className="font-mono text-[11px] text-slate-500">
                            {Math.round(modalCropSettings.zoom * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1.0"
                          max="2.8"
                          step="0.05"
                          value={modalCropSettings.zoom}
                          onChange={(e) =>
                            setModalCropSettings({
                              ...modalCropSettings,
                              zoom: parseFloat(e.target.value),
                            })
                          }
                          disabled={photoModalIsSubmitting}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => setModalCropSettings({ x: 50, y: 50, zoom: 1.0 })}
                          disabled={photoModalIsSubmitting}
                          className="text-[11px] font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Redefinir</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Rodapé de Ações */}
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2 shrink-0">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handleClosePhotoModal}
                  disabled={photoModalIsSubmitting}
                >
                  Cancelar
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  icon={Check}
                  onClick={handleSavePhotoModal}
                  disabled={!modalPhotoUrl}
                  isLoading={photoModalIsSubmitting}
                >
                  Salvar foto
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================== */}
        {/* MODAL LIGHTBOX: VISUALIZAÇÃO AMPLIADA DA FOTOGRAFIA */}
        {/* ================================================== */}
        {enlargedPhoto && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setEnlargedPhoto(null)}
          >
            <div
              className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 max-w-2xl w-full flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 text-white"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header do Lightbox */}
              <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
                <div>
                  <h3 className="text-base font-semibold text-white truncate">
                    {enlargedPhoto.studentName}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Período {enlargedPhoto.year}{enlargedPhoto.className ? ` · ${enlargedPhoto.className}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEnlargedPhoto(null)}
                    icon={X}
                    className="text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 shadow-xs cursor-pointer"
                  >
                    Fechar
                  </Button>
                </div>
              </div>

              {/* Corpo com Imagem Ampliada */}
              <div className="p-4 flex items-center justify-center bg-slate-950/60 min-h-[320px] max-h-[68vh] overflow-hidden">
                <img
                  src={enlargedPhoto.url}
                  alt={`Fotografia ampliada - ${enlargedPhoto.studentName} (${enlargedPhoto.year})`}
                  className="max-h-[62vh] max-w-full object-contain rounded-lg shadow-lg"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Rodapé com Ações de Consulta/Download */}
              <div className="px-5 py-3 border-t border-slate-800 bg-slate-900 flex items-center justify-between gap-3 shrink-0">
                <span className="text-[11px] text-slate-400">
                  Visualização em alta resolução
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={Download}
                    onClick={() =>
                      handleDownloadOriginalPhoto({
                        year: enlargedPhoto.year,
                        className: enlargedPhoto.className,
                        photoUrl: enlargedPhoto.url,
                      })
                    }
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-white hover:text-white border border-slate-700 shadow-xs transition-colors cursor-pointer"
                  >
                    Baixar original
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
