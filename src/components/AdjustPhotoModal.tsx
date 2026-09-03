import React, { useState, useEffect, useRef } from 'react';
import { CropSettings, Student, AcademicYearRecord } from '../types';
import { autoDetectFaceCrop } from '../utils/faceDetector';
import { Sparkles, ZoomIn, X, RotateCcw, Image as ImageIcon, CheckCircle2, AlertCircle, Lock, HelpCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

export type AdjustPhotoTab = 'timeline_primary' | 'timeline_secondary' | 'carometro' | 'carometro_3x4' | 'carometro_circular';

interface AdjustPhotoModalProps {
  isOpen: boolean;
  student: Student;
  record: AcademicYearRecord;
  initialTab?: AdjustPhotoTab;
  isLocked?: boolean;
  lockReason?: string;
  onSaveCrops: (
    recordId: string,
    crops: {
      timelinePrimaryCrop?: CropSettings;
      timelineSecondaryCrop?: CropSettings;
      carometroCrop?: CropSettings;
      carometroCircularCrop?: CropSettings;
    }
  ) => Promise<void>;
  onClose: () => void;
}

export const AdjustPhotoModal: React.FC<AdjustPhotoModalProps> = ({
  isOpen,
  student,
  record,
  initialTab = 'timeline_primary',
  isLocked = false,
  lockReason = 'Este período possui uma composição salva e não pode mais ter o enquadramento alterado.',
  onSaveCrops,
  onClose,
}) => {
  const isCollaborator = student?.personType === 'collaborator';
  const normalizedInitialTab =
    initialTab === 'carometro_3x4'
      ? 'carometro'
      : initialTab;

  const [activeTab, setActiveTab] = useState<AdjustPhotoTab>(normalizedInitialTab);

  // Independent crop states
  const [primaryCrop, setPrimaryCrop] = useState<CropSettings>({ x: 50, y: 50, zoom: 1.0 });
  const [secondaryCrop, setSecondaryCrop] = useState<CropSettings>({ x: 50, y: 50, zoom: 1.0 });
  const [carometroCrop, setCarometroCrop] = useState<CropSettings>({ x: 50, y: 50, zoom: 1.0 });
  const [carometroCircularCrop, setCarometroCircularCrop] = useState<CropSettings>({ x: 50, y: 50, zoom: 1.0 });

  // Saved flags from record
  const [hasSavedPrimary, setHasSavedPrimary] = useState(false);
  const [hasSavedSecondary, setHasSavedSecondary] = useState(false);
  const [hasSavedCarometro, setHasSavedCarometro] = useState(false);
  const [hasSavedCarometroCircular, setHasSavedCarometroCircular] = useState(false);

  // Canvas and interaction states
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmSave, setShowConfirmSave] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Sync state when record or modal open changes
  useEffect(() => {
    if (isOpen && record) {
      const pCrop = record.timelinePrimaryCrop || record.cropSettings || { x: 50, y: 50, zoom: 1.0 };
      const sCrop = record.timelineSecondaryCrop || { x: 50, y: 50, zoom: 1.0 };
      const cCrop = record.carometroCrop
        ? { x: record.carometroCrop.x, y: record.carometroCrop.y, zoom: record.carometroCrop.zoom }
        : record.autoFaceCrop
        ? { x: record.autoFaceCrop.x, y: record.autoFaceCrop.y, zoom: record.autoFaceCrop.zoom }
        : { x: 50, y: 50, zoom: 1.0 };

      const circCrop = record.carometroCircularCrop
        ? { x: record.carometroCircularCrop.x, y: record.carometroCircularCrop.y, zoom: record.carometroCircularCrop.zoom }
        : record.carometroCrop
        ? { x: record.carometroCrop.x, y: record.carometroCrop.y, zoom: record.carometroCrop.zoom }
        : record.autoFaceCrop
        ? { x: record.autoFaceCrop.x, y: record.autoFaceCrop.y, zoom: record.autoFaceCrop.zoom }
        : { x: 50, y: 50, zoom: 1.0 };

      setPrimaryCrop(pCrop);
      setSecondaryCrop(sCrop);
      setCarometroCrop(cCrop);
      setCarometroCircularCrop(circCrop);

      setHasSavedPrimary(Boolean(record.timelinePrimaryCrop || record.cropSettings));
      setHasSavedSecondary(Boolean(record.timelineSecondaryCrop));
      setHasSavedCarometro(Boolean(record.carometroCrop));
      setHasSavedCarometroCircular(Boolean(record.carometroCircularCrop));

      setShowConfirmSave(false);
      setSaveSuccessMsg(null);
      setSaveError(null);
      setActiveTab(normalizedInitialTab);
    }
  }, [isOpen, record, normalizedInitialTab]);

  const photoUrl = record?.photoUrl || '';

  // Get current active crop
  const currentCrop =
    activeTab === 'timeline_primary'
      ? primaryCrop
      : activeTab === 'timeline_secondary'
      ? secondaryCrop
      : activeTab === 'carometro' || activeTab === 'carometro_3x4'
      ? carometroCrop
      : carometroCircularCrop;

  const setCurrentCrop = (updater: React.SetStateAction<CropSettings>) => {
    if (isLocked) return;
    setSaveSuccessMsg(null);
    setSaveError(null);
    if (activeTab === 'timeline_primary') {
      setPrimaryCrop(updater);
    } else if (activeTab === 'timeline_secondary') {
      setSecondaryCrop(updater);
    } else if (activeTab === 'carometro' || activeTab === 'carometro_3x4') {
      setCarometroCrop(updater);
    } else {
      setCarometroCircularCrop(updater);
    }
  };

  // Render canvas preview whenever crop, photoUrl, or activeTab changes
  useEffect(() => {
    if (!isOpen || !photoUrl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setNaturalSize({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      });

      let targetW = 288;
      let targetH = 216;

      if (activeTab === 'timeline_primary') {
        targetW = 288;
        targetH = 216; // 4:3 landscape
      } else if (activeTab === 'timeline_secondary' || activeTab === 'carometro_circular') {
        targetW = 224;
        targetH = 224; // 1:1 square
      } else {
        targetW = 180;
        targetH = 240; // 3:4 portrait
      }

      canvas.width = targetW;
      canvas.height = targetH;

      ctx.clearRect(0, 0, targetW, targetH);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, targetW, targetH);

      const zoom = currentCrop.zoom ?? 1.0;
      const cropX = currentCrop.x ?? 50;
      const cropY = currentCrop.y ?? 50;

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

      // If secondary or circular carometro, draw faint circular guide
      if (activeTab === 'timeline_secondary' || activeTab === 'carometro_circular') {
        ctx.save();
        ctx.strokeStyle = activeTab === 'carometro_circular' ? 'rgba(59, 130, 246, 0.85)' : 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(targetW / 2, targetH / 2, targetW / 2 - 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    };
    img.src = photoUrl;
  }, [isOpen, photoUrl, currentCrop.x, currentCrop.y, currentCrop.zoom, activeTab]);

  if (!isOpen || !record) return null;

  const handleAutoDetect = async () => {
    if (isSaving || isLocked) return;
    setIsDetecting(true);
    setSaveSuccessMsg(null);
    setSaveError(null);
    try {
      const detected = await autoDetectFaceCrop(photoUrl);
      setCurrentCrop(detected);
    } catch (e) {
      console.error('Auto detect error:', e);
    } finally {
      setIsDetecting(false);
    }
  };

  const handleReset = () => {
    if (isLocked) return;
    setCurrentCrop({ x: 50, y: 50, zoom: 1.0 });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isLocked || isSaving) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || isLocked) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    const factor = 0.35;
    setCurrentCrop((prev) => ({
      ...prev,
      x: Math.min(Math.max(prev.x - dx * factor, 0), 100),
      y: Math.min(Math.max(prev.y - dy * factor, 0), 100),
    }));

    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleConfirmAndSave = async () => {
    if (isSaving || isLocked) return;
    setIsSaving(true);
    setSaveSuccessMsg(null);
    setSaveError(null);

    try {
      // Salva o conjunto completo de enquadramentos sem apagar ajustes intocados
      await onSaveCrops(record.id, {
        timelinePrimaryCrop: primaryCrop,
        timelineSecondaryCrop: secondaryCrop,
        carometroCrop: carometroCrop,
        ...(isCollaborator ? { carometroCircularCrop: carometroCircularCrop } : {}),
      });

      setHasSavedPrimary(true);
      setHasSavedSecondary(true);
      setHasSavedCarometro(true);
      if (isCollaborator) {
        setHasSavedCarometroCircular(true);
      }
      setShowConfirmSave(false);
      onClose();
    } catch (err: any) {
      setSaveError(err.message || 'Erro ao salvar os ajustes da fotografia.');
      setShowConfirmSave(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Dimensions & Aspect info based on active tab
  const getTabInfo = () => {
    switch (activeTab) {
      case 'timeline_primary':
        return {
          title: isCollaborator ? 'Linha do Tempo — Foto Principal (Colaborador)' : 'Linha do Tempo — Foto Principal',
          aspect: '4:3 (Paisagem)',
          description:
            'Ajuste utilizado exclusivamente quando esta fotografia for a Foto Principal na Linha do Tempo (período letivo correspondente).',
          isSaved: hasSavedPrimary,
        };
      case 'timeline_secondary':
        return {
          title: isCollaborator ? 'Linha do Tempo — Foto Secundária (Colaborador)' : 'Linha do Tempo — Foto Secundária',
          aspect: '1:1 (Quadrada / Circular)',
          description:
            'Ajuste utilizado exclusivamente quando esta fotografia for uma Foto Secundária (histórica) em composições futuras.',
          isSaved: hasSavedSecondary,
        };
      case 'carometro_circular':
        return {
          title: 'Carômetro — Circular para Perfil',
          aspect: '1:1 (Circular / PNG Transparente)',
          description:
            'Enquadramento circular específico do colaborador, exportado com fundo transparente e borda para fotos de perfil.',
          isSaved: hasSavedCarometroCircular,
        };
      case 'carometro':
      case 'carometro_3x4':
      default:
        return {
          title: isCollaborator ? 'Carômetro — 3×4 (Colaborador)' : 'Carômetro — Foto do Aluno',
          aspect: '3:4 (Retrato)',
          description: isCollaborator
            ? 'Ajuste padrão retangular 3:4 utilizado para a exibição e exportação do Carômetro de Colaboradores.'
            : 'Ajuste padrão 3:4 utilizado para a exibição no Carômetro da turma.',
          isSaved: hasSavedCarometro,
        };
    }
  };

  const tabInfo = getTabInfo();

  return (
    <div
      id="adjust-photo-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
    >
      <div
        id="adjust-photo-modal-container"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/75">
          <div className="space-y-0.5">
            <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-blue-600" />
              <span>Ajustar Foto da Matrícula</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              {isCollaborator ? 'Colaborador: ' : 'Aluno: '}
              <strong className="text-slate-800">{student.name}</strong> · Período Letivo:{' '}
              <strong className="text-slate-800">{record.year}</strong> · Turma:{' '}
              <strong className="text-slate-800">{record.className}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 cursor-pointer transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Navigation Tabs */}
        <div className="bg-slate-100/90 p-2 border-b border-slate-200 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              setActiveTab('timeline_primary');
              setSaveSuccessMsg(null);
              setSaveError(null);
            }}
            className={`flex-1 min-w-[120px] px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'timeline_primary'
                ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <span>Linha do Tempo (Principal)</span>
            {hasSavedPrimary ? (
              <span className="w-2 h-2 rounded-full bg-emerald-500" title="Ajuste salvo" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-400" title="Ajuste pendente" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('timeline_secondary');
              setSaveSuccessMsg(null);
              setSaveError(null);
            }}
            className={`flex-1 min-w-[120px] px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'timeline_secondary'
                ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <span>Linha do Tempo (Secundária)</span>
            {hasSavedSecondary ? (
              <span className="w-2 h-2 rounded-full bg-emerald-500" title="Ajuste salvo" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-400" title="Ajuste pendente" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('carometro');
              setSaveSuccessMsg(null);
              setSaveError(null);
            }}
            className={`flex-1 min-w-[120px] px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'carometro' || activeTab === 'carometro_3x4'
                ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <span>{isCollaborator ? 'Carômetro (3×4)' : 'Carômetro'}</span>
            {hasSavedCarometro ? (
              <span className="w-2 h-2 rounded-full bg-emerald-500" title="Ajuste salvo" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-400" title="Ajuste pendente" />
            )}
          </button>

          {/* Tab Carômetro Circular (Colaboradores apenas) */}
          {isCollaborator && (
            <button
              type="button"
              onClick={() => {
                setActiveTab('carometro_circular');
                setSaveSuccessMsg(null);
                setSaveError(null);
              }}
              className={`flex-1 min-w-[120px] px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'carometro_circular'
                  ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <span>Carômetro (Circular)</span>
              {hasSavedCarometroCircular ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500" title="Ajuste salvo" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-amber-400" title="Ajuste pendente" />
              )}
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Lock Banner if Saved Composition Exists */}
          {isLocked && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2.5 shadow-xs">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{lockReason}</span>
            </div>
          )}

          {/* Active Tab Header / Explanatory card */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-3.5 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-900">{tabInfo.title}</span>
                <span className="text-[10px] bg-slate-200 text-slate-700 font-mono px-2 py-0.5 rounded font-bold">
                  {tabInfo.aspect}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 leading-snug">{tabInfo.description}</p>
            </div>
            <div>
              {tabInfo.isSaved ? (
                <Badge variant="success" size="sm">
                  Ajuste salvo
                </Badge>
              ) : (
                <Badge variant="neutral" size="sm">
                  Pendente
                </Badge>
              )}
            </div>
          </div>

          {/* Feedback messages */}
          {saveSuccessMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          {saveError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Cropper Canvas & Controls */}
          <div className="flex flex-col sm:flex-row items-center gap-6 justify-center bg-slate-950 p-6 rounded-2xl border border-slate-800">
            {/* Interactive Preview Canvas */}
            <div
              className={`relative rounded-xl overflow-hidden ${
                isLocked ? 'cursor-not-allowed opacity-90' : 'cursor-grab active:cursor-grabbing'
              } border-2 border-slate-700 shadow-xl select-none touch-none ${
                activeTab === 'timeline_secondary' || activeTab === 'carometro_circular'
                  ? 'ring-2 ring-blue-500/50'
                  : ''
              }`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{
                width:
                  activeTab === 'timeline_primary'
                    ? 288
                    : activeTab === 'timeline_secondary' || activeTab === 'carometro_circular'
                    ? 224
                    : 180,
                height:
                  activeTab === 'timeline_primary'
                    ? 216
                    : activeTab === 'timeline_secondary' || activeTab === 'carometro_circular'
                    ? 224
                    : 240,
              }}
            >
              <canvas ref={canvasRef} className="w-full h-full object-contain block" />

              {/* Dragging Guide Overlay */}
              {!isLocked && (
                <div className="absolute inset-0 pointer-events-none border border-white/20 flex items-center justify-center">
                  <span className="bg-black/60 backdrop-blur-xs text-white text-[10px] px-2 py-0.5 rounded font-medium opacity-0 hover:opacity-100 transition-opacity">
                    Arraste para reposicionar
                  </span>
                </div>
              )}
            </div>

            {/* Adjustment Controls */}
            <div className="flex-1 w-full max-w-xs space-y-4 text-white">
              {/* Zoom Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-300 font-bold">
                  <span className="flex items-center gap-1">
                    <ZoomIn className="w-3.5 h-3.5 text-blue-400" /> Zoom
                  </span>
                  <span className="font-mono">{(currentCrop.zoom ?? 1.0).toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="3.0"
                  step="0.05"
                  value={currentCrop.zoom ?? 1.0}
                  disabled={isLocked || isSaving}
                  onChange={(e) =>
                    setCurrentCrop((prev) => ({
                      ...prev,
                      zoom: parseFloat(e.target.value),
                    }))
                  }
                  className={`w-full h-2 bg-slate-800 rounded-lg appearance-none ${
                    isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                  } accent-blue-500`}
                />
              </div>

              {/* Position Pointers (Info) */}
              <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400 font-mono">
                <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg">
                  <span>Centro X:</span> <strong className="text-slate-200">{Math.round(currentCrop.x ?? 50)}%</strong>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg">
                  <span>Centro Y:</span> <strong className="text-slate-200">{Math.round(currentCrop.y ?? 50)}%</strong>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={RotateCcw}
                  onClick={handleReset}
                  disabled={isSaving || isLocked}
                  className="text-xs h-8 flex-1 justify-center bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
                >
                  Centralizar
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={Sparkles}
                  onClick={handleAutoDetect}
                  disabled={isDetecting || isSaving || isLocked}
                  className="text-xs h-8 flex-1 justify-center bg-blue-900/80 text-blue-200 border-blue-700 hover:bg-blue-800"
                >
                  {isDetecting ? 'Detectando...' : 'Detectar Rosto'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer - Exactly Two Buttons: [ Fechar ] [ Salvar ajuste ] */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSaving}
            className="text-xs font-bold"
          >
            Fechar
          </Button>

          <Button
            type="button"
            variant="primary"
            onClick={() => {
              if (isLocked || isSaving) return;
              setShowConfirmSave(true);
            }}
            disabled={isSaving || isLocked}
            className="text-xs font-bold min-w-[140px] justify-center"
            title={
              isLocked
                ? lockReason
                : isCollaborator
                ? 'Salvar os 4 enquadramentos da fotografia do colaborador'
                : 'Salvar os 3 enquadramentos da fotografia'
            }
          >
            {isSaving ? 'Salvando...' : 'Salvar ajuste'}
          </Button>
        </div>
      </div>

      {/* Confirmation Dialog before saving */}
      {showConfirmSave && (
        <div
          id="confirm-save-crops-overlay"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div
            id="confirm-save-crops-dialog"
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                <HelpCircle className="w-6 h-6 text-blue-600" />
              </div>
              <div className="space-y-1.5 flex-1">
                <h4 className="text-base font-bold text-slate-900">
                  Salvar ajuste da fotografia?
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {isCollaborator
                    ? 'Os ajustes de Linha do Tempo (Principal), Linha do Tempo (Secundária), Carômetro (3×4) e Carômetro (Circular) serão salvos no cadastro do colaborador.'
                    : 'Os ajustes de Linha do Tempo (Principal), Linha do Tempo (Secundária) e Carômetro serão salvos no cadastro do aluno.'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setShowConfirmSave(false)}
                disabled={isSaving}
                className="text-xs font-bold"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleConfirmAndSave}
                isLoading={isSaving}
                disabled={isSaving}
                className="text-xs font-bold min-w-[150px] justify-center"
              >
                {isSaving ? 'Salvando...' : 'Confirmar e fechar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
