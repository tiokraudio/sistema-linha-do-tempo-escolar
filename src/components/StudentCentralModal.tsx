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
  Image as ImageIcon,
  Copy,
  Calendar,
  IdCard,
  Crop,
  Trash2,
  AlertCircle,
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
import { AdjustPhotoModal } from './AdjustPhotoModal';

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
  onUpdateRecordCrops?: (
    recordId: string,
    crops: {
      timelinePrimaryCrop?: CropSettings;
      timelineSecondaryCrop?: CropSettings;
      carometroCrop?: CropSettings;
      carometroCircularCrop?: CropSettings;
    }
  ) => Promise<any>;
  onDeleteRecord?: (recordId: string) => Promise<any>;
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
  onUpdateRecordCrops,
  onDeleteRecord,
}) => {
  if (!isOpen || !student) return null;

  const isCollaborator = student.personType === 'collaborator';
  const photoHistorySlots = schoolConfig.photoHistorySlots ?? 15;

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

  // Estado para visualização ampliada (Lightbox) da fotografia
  const [enlargedPhoto, setEnlargedPhoto] = useState<{
    url: string;
    studentName: string;
    year: string | number;
    className: string;
  } | null>(null);

  // Estados para exclusão e ajuste de enquadramento
  const [recordToDelete, setRecordToDelete] = useState<AcademicYearRecord | null>(null);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);
  const [adjustingRecord, setAdjustingRecord] = useState<AcademicYearRecord | null>(null);
  const quickUploadRecordRef = useRef<AcademicYearRecord | null>(null);
  const quickFileInputRef = useRef<HTMLInputElement>(null);

  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      return new Date(isoString).toLocaleDateString('pt-BR');
    } catch {
      return isoString;
    }
  };

  // Estado e handler para cópia rápida do nome para a área de transferência
  const [copiedName, setCopiedName] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setCopiedName(false);
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
  }, [student.id]);

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
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopiedName(false);
      }, 2000);
    } catch (err) {
      console.error('Falha ao copiar nome:', err);
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

  const handleQuickUploadClick = (rec: AcademicYearRecord) => {
    const isCurrent = String(rec.year) === String(currentAcademicPeriodName);
    if (!isCurrent) return;

    const hasPhoto = Boolean(rec.photoUrl && rec.photoUrl.trim());
    if (!hasPhoto) {
      quickUploadRecordRef.current = rec;
      if (quickFileInputRef.current) {
        quickFileInputRef.current.value = '';
        quickFileInputRef.current.click();
      }
    } else {
      handleOpenPhotoModal(rec);
    }
  };

  const handleQuickFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetRec = quickUploadRecordRef.current;
    if (file && targetRec) {
      if (file.size > 30 * 1024 * 1024) {
        setPhotoModalErrorMsg('A imagem é muito grande. Escolha uma foto de até 30MB.');
        setPhotoModalRecord(targetRec);
        return;
      }
      const reader = new FileReader();
      reader.onload = async (event) => {
        const result = event.target?.result as string;
        setPhotoModalRecord(targetRec);
        setModalPhotoUrl(result);
        setModalCropSettings({ x: 50, y: 50, zoom: 1.0 });
        setPhotoModalErrorMsg('');
        try {
          const detected = await autoDetectFaceCrop(result);
          setModalCropSettings(detected);
        } catch {}
      };
      reader.readAsDataURL(file);
    }
    if (e.target) e.target.value = '';
  };

  const handleConfirmDeleteRecord = async () => {
    if (!recordToDelete) return;
    setIsDeletingRecord(true);
    const targetRec = recordToDelete;
    const deletedYear = String(targetRec.year);
    try {
      if (onDeleteRecord) {
        await onDeleteRecord(targetRec.id);
      } else {
        const res = await apiFetch(`/api/records/${targetRec.id}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Erro ao excluir matrícula.');
        }
      }
      setSuccessToast(
        isCollaborator
          ? `Período ${deletedYear} excluído com sucesso.`
          : `Matrícula do período ${deletedYear} excluída com sucesso.`
      );
      setRecordToDelete(null);
    } catch (err: any) {
      setSuccessToast(err?.message || 'Erro ao excluir período.');
    } finally {
      setIsDeletingRecord(false);
    }
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
          <div className="min-w-0">
            {/* Linha 1: Nome em destaque + Botão de Copiar Nome + Badge indicativo do tipo */}
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <h2
                className={`font-bold text-slate-900 leading-snug break-words max-w-full ${
                  student.name.length > 35
                    ? 'text-base'
                    : student.name.length > 25
                    ? 'text-lg'
                    : 'text-xl'
                }`}
                title={student.name}
              >
                {student.name}
              </h2>
              <button
                type="button"
                onClick={handleCopyName}
                title={copiedName ? 'Copiado!' : 'Copiar nome completo'}
                className="relative inline-flex items-center justify-center p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer shrink-0"
                aria-label={isCollaborator ? 'Copiar nome do colaborador' : 'Copiar nome do aluno'}
              >
                {copiedName ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600 animate-in zoom-in-75 duration-150" />
                    <span className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-slate-800 text-white text-[10px] font-medium rounded shadow-sm whitespace-nowrap pointer-events-none animate-in fade-in duration-150 z-20">
                      Copiado!
                    </span>
                  </>
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
              <Badge variant={isCollaborator ? 'neutral' : 'info'} size="sm">
                {isCollaborator ? 'Colaborador' : 'Aluno'}
              </Badge>
            </div>

            {/* Linha 2 (Metadados alinhados em barra horizontal limpa) */}
            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 whitespace-nowrap">
              <div className="flex items-center gap-1.5">
                <IdCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{isCollaborator ? 'Código / Matrícula:' : 'Matrícula:'}</span>
                <strong className="font-mono font-semibold text-slate-700">{student.enrollment || '—'}</strong>
              </div>
              <span className="text-slate-300 select-none">•</span>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Cadastrado em:</span>
                <span className="font-medium text-slate-700">{formatDate(student.createdAt)}</span>
              </div>
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
          {/* MATRÍCULAS / PERÍODOS E HISTÓRICO (LINHA ÚNICA COMPACTA - ORDEM DESC) */}
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

            {/* Input oculto para upload direto ao clicar no botão da linha */}
            <input
              ref={quickFileInputRef}
              type="file"
              accept="image/*"
              onChange={handleQuickFileSelected}
              className="hidden"
            />

            {displayRecords.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-xs bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                {isCollaborator
                  ? 'Nenhum período registrado para este colaborador.'
                  : 'Nenhuma matrícula confirmada para este aluno.'}
              </div>
            ) : (
              <div className="space-y-2">
                {displayRecords.map((rec) => {
                  const key = String(rec.year);
                  const isCurrent = key === currentAcademicPeriodName;
                  const hasPhoto = Boolean(rec.photoUrl && rec.photoUrl.trim());

                  return (
                    <div
                      key={rec.id || key}
                      className="flex items-center justify-between py-2 px-3 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 transition-colors shadow-2xs gap-3"
                    >
                      {/* Esquerda / Centro: Miniatura + Identificação Período e Turma */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Miniatura da Foto */}
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
                            className="group relative w-10 h-10 rounded-lg bg-slate-100 overflow-hidden border border-slate-200 shrink-0 cursor-pointer shadow-2xs hover:ring-2 hover:ring-blue-500/50 transition-all"
                            title="Clique para ampliar a fotografia"
                          >
                            <img
                              src={rec.photoUrl}
                              alt={`Foto ${rec.year} - ${student.name}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-slate-950/25 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                              <ZoomIn className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        ) : (
                          <div
                            className="w-10 h-10 rounded-lg bg-slate-100 border border-dashed border-slate-300 shrink-0 flex items-center justify-center text-slate-400"
                            title="Sem fotografia vinculada"
                          >
                            <Camera className="w-4 h-4 text-slate-400" />
                          </div>
                        )}

                        {/* Identificação do Período & Turma */}
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-mono font-bold text-slate-900 text-sm tracking-tight">
                            {rec.year}
                          </span>
                          {!isCollaborator && rec.className && (
                            <>
                              <span className="text-slate-300 select-none">·</span>
                              <span className="font-semibold text-slate-700 text-xs sm:text-sm truncate">
                                {rec.className}
                              </span>
                            </>
                          )}
                          {isCurrent ? (
                            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-md">
                              Atual
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md hidden sm:inline-block">
                              Histórico
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Extremidade Direita: Barra de Ações Rápidas em formato compacto sem quebras */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* 1. Adicionar / Alterar Foto */}
                        <button
                          type="button"
                          onClick={() => handleQuickUploadClick(rec)}
                          disabled={!isCurrent}
                          title={
                            isCurrent
                              ? hasPhoto
                                ? 'Alterar fotografia'
                                : 'Adicionar fotografia (upload direto)'
                              : 'Edição de foto permitida apenas no período atual'
                          }
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                            !isCurrent
                              ? 'text-slate-300 border border-slate-100 cursor-not-allowed'
                              : hasPhoto
                              ? 'text-slate-600 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 cursor-pointer'
                              : 'text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 cursor-pointer'
                          }`}
                        >
                          {hasPhoto ? <Camera className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                        </button>

                        {/* 2. Ampliar / Prévia */}
                        <button
                          type="button"
                          onClick={() =>
                            hasPhoto &&
                            setEnlargedPhoto({
                              url: rec.photoUrl!,
                              studentName: student.name,
                              year: rec.year,
                              className: rec.className,
                            })
                          }
                          disabled={!hasPhoto}
                          title={hasPhoto ? 'Ampliar fotografia' : 'Nenhuma fotografia para visualizar'}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                            hasPhoto
                              ? 'text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 cursor-pointer'
                              : 'text-slate-300 border border-slate-100 cursor-not-allowed'
                          }`}
                        >
                          <ZoomIn className="w-4 h-4" />
                        </button>

                        {/* 3. Baixar Original */}
                        <button
                          type="button"
                          onClick={() =>
                            hasPhoto &&
                            handleDownloadOriginalPhoto({
                              year: rec.year,
                              className: rec.className,
                              photoUrl: rec.photoUrl,
                            })
                          }
                          disabled={!hasPhoto}
                          title={hasPhoto ? `Baixar foto original (${rec.year})` : 'Nenhuma fotografia para download'}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                            hasPhoto
                              ? 'text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 border border-slate-200 cursor-pointer'
                              : 'text-slate-300 border border-slate-100 cursor-not-allowed'
                          }`}
                        >
                          <Download className="w-4 h-4" />
                        </button>

                        {/* 4. Ajustar Enquadramento / Crop */}
                        <button
                          type="button"
                          onClick={() => isCurrent && hasPhoto && setAdjustingRecord(rec)}
                          disabled={!isCurrent || !hasPhoto}
                          title={
                            !isCurrent
                              ? 'Ajuste disponível apenas para o período letivo atual'
                              : !hasPhoto
                              ? 'Nenhuma fotografia para ajustar'
                              : `Ajustar enquadramento e recorte (${rec.year})`
                          }
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                            isCurrent && hasPhoto
                              ? 'text-slate-600 hover:text-amber-600 hover:bg-amber-50 border border-slate-200 cursor-pointer'
                              : 'text-slate-300 border border-slate-100 cursor-not-allowed opacity-50'
                          }`}
                        >
                          <Crop className="w-4 h-4" />
                        </button>

                        {/* 5. Excluir Matrícula / Registro */}
                        <button
                          type="button"
                          onClick={() => setRecordToDelete(rec)}
                          title={isCollaborator ? `Excluir período ${rec.year}` : `Excluir matrícula ${rec.year}`}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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
                  <p
                    className="text-xs text-slate-500 mt-0.5 truncate max-w-sm"
                    title={`${student.name} · ${photoModalRecord.year}${photoModalRecord.className ? ` (${photoModalRecord.className})` : ''}`}
                  >
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

        {/* ================================================== */}
        {/* MODAL DE AJUSTE DE ENQUADRAMENTO / CROP */}
        {/* ================================================== */}
        {adjustingRecord && (
          <AdjustPhotoModal
            isOpen={Boolean(adjustingRecord)}
            student={student}
            record={adjustingRecord}
            isLocked={Boolean(
              timelines &&
              timelines.some(
                (t) =>
                  (t.studentId === student.id || (student.enrollment && t.studentEnrollment === student.enrollment)) &&
                  String(t.year) === String(adjustingRecord.year)
              )
            )}
            lockReason="Este período possui uma composição salva na Linha do Tempo e não pode ter o enquadramento alterado."
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
                  throw new Error(err.error || 'Erro ao salvar enquadramento.');
                }
              }
              setSuccessToast('Enquadramento salvo com sucesso.');
              setAdjustingRecord(null);
            }}
            onClose={() => setAdjustingRecord(null)}
          />
        )}

        {/* ================================================== */}
        {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE MATRÍCULA / PERÍODO */}
        {/* ================================================== */}
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
                {!isCollaborator && recordToDelete.className && (
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
      </div>
    </div>
  );
};
