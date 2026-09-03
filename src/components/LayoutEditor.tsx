import React, { useState, useRef, useEffect, useMemo } from 'react';
import { LayoutModel, SchoolConfig, DotPosition, TextElementPosition, PersonType, getModelBackgroundUrl } from '../types';
import { getDefaultSingleLayoutModel, ensureModelConfigurations, createDefaultDotsForConfig } from '../utils/defaultLayout';
import { VisualReferenceGrid } from './VisualReferenceGrid';
import { Button } from './ui/Button';
import { Alert } from './ui/Alert';
import { Toast } from './ui/Toast';
import { Badge } from './ui/Badge';
import { PageHeader } from './ui/PageHeader';
import { FormField, inputClasses, selectClasses } from './ui/FormField';
import {
  Palette,
  Upload,
  Save,
  ImageIcon,
  Type,
  LayoutGrid,
  Eye,
  EyeOff,
  Settings2,
  Sliders,
  Layers,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Copy,
  Users,
  GraduationCap,
  Briefcase,
} from 'lucide-react';

interface LayoutEditorProps {
  model?: LayoutModel | null;
  schoolConfig: SchoolConfig;
  onSaveModel: (model: LayoutModel) => Promise<LayoutModel | void>;
}

export type ElementId =
  | 'bg'
  | 'primaryPhoto'
  | 'schoolLogo'
  | 'schoolName'
  | 'studentName'
  | 'year'
  | 'secondaryDots'
  | 'secondaryYear'
  | string;

const compactInputClasses =
  'w-full h-8 px-2.5 py-1 bg-white border border-slate-300 rounded-md text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed';

const compactSelectClasses =
  'w-full h-8 px-2.5 py-1 bg-white border border-slate-300 rounded-md text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed';

export const LayoutEditor: React.FC<LayoutEditorProps> = ({
  model,
  schoolConfig,
  onSaveModel,
}) => {
  const slotsCount = schoolConfig.photoHistorySlots ?? 15;

  function ensureConfigs(m: LayoutModel): LayoutModel {
    const configs = ensureModelConfigurations(m.configurations || [], slotsCount);
    return { ...m, configurations: configs };
  }

  const [formData, setFormData] = useState<LayoutModel | null>(() => {
    if (!model || !model.id) return null;
    return ensureConfigs(model);
  });

  const [savedSnapshot, setSavedSnapshot] = useState<string>(() => {
    if (!model || !model.id) return '';
    return JSON.stringify(ensureConfigs(model));
  });

  const isDirty = useMemo(() => {
    if (!formData) return false;
    return JSON.stringify(formData) !== savedSnapshot;
  }, [formData, savedSnapshot]);

  const [activeConfigIndex, setActiveConfigIndex] = useState<number>(1);
  const [selectedElementId, setSelectedElementId] = useState<ElementId>('studentName');
  const [previewPersonType, setPreviewPersonType] = useState<PersonType>('student');
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState<number>(560);

  useEffect(() => {
    const updateWidth = () => {
      if (canvasRef.current) {
        setCanvasWidth(canvasRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const fontScale = canvasWidth / 794;

  const lastModelRef = useRef(model);
  useEffect(() => {
    if (model && model.id) {
      if (!isDirty || lastModelRef.current?.id !== model.id) {
        const normalized = ensureConfigs(model);
        setFormData(normalized);
        setSavedSnapshot(JSON.stringify(normalized));
      }
      lastModelRef.current = model;
    }
  }, [model, schoolConfig.photoHistorySlots, isDirty]);

  const handleUpdateAllSecondaryDotsSize = (newWidthPercent: number) => {
    if (!formData) return;
    const newHeightPercent = Math.round(newWidthPercent * (794 / 1123) * 10) / 10;
    const updatedConfigs = [...(formData.configurations || [])];
    const cfgIdx = updatedConfigs.findIndex((c) => c.configIndex === activeConfigIndex);
    if (cfgIdx !== -1) {
      const dots = (updatedConfigs[cfgIdx].secondaryDots || []).map((dot) => ({
        ...dot,
        widthPercent: newWidthPercent,
        heightPercent: newHeightPercent,
      }));
      updatedConfigs[cfgIdx] = { ...updatedConfigs[cfgIdx], secondaryDots: dots };
      setFormData({ ...formData, configurations: updatedConfigs });
    }
  };

  const handleCreateNewModel = () => {
    const newModel = getDefaultSingleLayoutModel(slotsCount);
    setFormData(ensureConfigs(newModel));
    setSuccessMsg('Novo Modelo de Layout criado! Personalize e clique em Salvar.');
  };

  if (!formData) {
    return (
      <div className="bg-white rounded-lg p-6 text-center border border-slate-200 shadow-2xs max-w-md mx-auto space-y-3 my-4">
        <div className="w-10 h-10 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-center mx-auto text-blue-600">
          <Palette className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800">
            Nenhum Modelo de Layout
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            Crie o modelo para estruturar as composições de fotos (0 a {slotsCount} slots).
          </p>
        </div>
        <Button size="sm" variant="primary" icon={Sparkles} onClick={handleCreateNewModel}>
          Criar Modelo
        </Button>
      </div>
    );
  }

  const currentConfig =
    formData.configurations?.find((c) => c.configIndex === activeConfigIndex) || {
      configIndex: activeConfigIndex,
      label: `Configuração ${activeConfigIndex}`,
      secondaryDots: [],
    };

  const secondaryDots = currentConfig.secondaryDots || [];

  const handleFileUpload = (
    field: 'bgImageUrl' | 'collaboratorBgImageUrl' | 'primaryFrameUrl' | 'secondaryFrameUrl',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setFormData((prev) => (prev ? { ...prev, [field]: result } : prev));
      };
      reader.readAsDataURL(file);
    }
  };

  function getSelectedElementDataById(id: string) {
    if (!formData) return null;
    if (id === 'schoolLogo') {
      const pos = formData.schoolLogoPosition || { show: true, xPercent: 82, yPercent: 5, widthPercent: 16, heightPercent: 12, rotation: 0 };
      return { pos: { xPercent: pos.xPercent ?? 82, yPercent: pos.yPercent ?? 5, widthPercent: pos.widthPercent ?? 16, heightPercent: pos.heightPercent ?? 12 } };
    }
    if (id === 'schoolName') {
      const pos = formData.schoolNamePosition || { xPercent: 0, yPercent: 97, widthPercent: 100, heightPercent: 2, fontSizePx: 12, color: '#ffffff', align: 'center', fontWeight: 'bold' };
      return { pos: { xPercent: pos.xPercent ?? 0, yPercent: pos.yPercent ?? 97, widthPercent: pos.widthPercent ?? 100, heightPercent: pos.heightPercent ?? 2 } };
    }
    if (id === 'studentName') {
      const pos = formData.studentNamePosition || { xPercent: 0, yPercent: 86, widthPercent: 100, heightPercent: 5, fontSizePx: 24, color: '#ffffff', align: 'center', fontWeight: 'bold' };
      return { pos: { xPercent: pos.xPercent ?? 0, yPercent: pos.yPercent ?? 86, widthPercent: pos.widthPercent ?? 100, heightPercent: pos.heightPercent ?? 5 } };
    }
    if (id === 'studentRegistration') {
      const pos = formData.studentRegistrationPosition || { show: true, xPercent: 50, yPercent: 48, widthPercent: 60, heightPercent: 4, fontSizePx: 12, color: '#475569', align: 'center' };
      return { pos: { xPercent: pos.xPercent ?? 50, yPercent: pos.yPercent ?? 48, widthPercent: pos.widthPercent ?? 60, heightPercent: pos.heightPercent ?? 4 } };
    }
    if (id === 'primaryPhoto') {
      const pos = formData.primaryPhotoPosition || { xPercent: 0, yPercent: 0, widthPercent: 100, heightPercent: 58, rotation: 0 };
      return { pos: { xPercent: pos.xPercent ?? 0, yPercent: pos.yPercent ?? 0, widthPercent: pos.widthPercent ?? 100, heightPercent: pos.heightPercent ?? 58 } };
    }
    if (id === 'year') {
      const pos = formData.yearPosition || { xPercent: 82, yPercent: 16.5, widthPercent: 16, heightPercent: 3, fontSizePx: 14, color: '#ffffff', bgColor: '#1e293b', align: 'center', fontWeight: 'bold' };
      return { pos: { xPercent: pos.xPercent ?? 82, yPercent: pos.yPercent ?? 16.5, widthPercent: pos.widthPercent ?? 16, heightPercent: pos.heightPercent ?? 3 } };
    }
    if (id.startsWith('secondaryDot_')) {
      const dotIndex = parseInt(id.replace('secondaryDot_', ''), 10);
      const dot = secondaryDots[dotIndex];
      if (dot) {
        return { pos: { xPercent: dot.xPercent, yPercent: dot.yPercent, widthPercent: dot.widthPercent, heightPercent: dot.heightPercent } };
      }
    }
    return null;
  }

  function updateElementById(id: string, updates: Partial<{ xPercent: number; yPercent: number; widthPercent: number; heightPercent: number }>) {
    if (!formData) return;
    if (id === 'schoolLogo') {
      const current = formData.schoolLogoPosition || { show: true, xPercent: 82, yPercent: 5, widthPercent: 16, heightPercent: 12, rotation: 0 };
      setFormData({ ...formData, schoolLogoPosition: { ...current, ...updates } });
    } else if (id === 'schoolName') {
      const current = formData.schoolNamePosition || { xPercent: 0, yPercent: 97, widthPercent: 100, heightPercent: 2, fontSizePx: 12, color: '#ffffff', align: 'center', fontWeight: 'bold' };
      setFormData({ ...formData, schoolNamePosition: { ...current, ...updates } });
    } else if (id === 'studentName') {
      const current = formData.studentNamePosition || { xPercent: 0, yPercent: 86, fontSizePx: 24, color: '#ffffff', align: 'center', fontWeight: 'bold' };
      setFormData({ ...formData, studentNamePosition: { ...current, ...updates } });
    } else if (id === 'studentRegistration') {
      const current = formData.studentRegistrationPosition || { show: true, xPercent: 50, yPercent: 48, widthPercent: 60, heightPercent: 4, fontSizePx: 12, color: '#475569', align: 'center' };
      setFormData({ ...formData, studentRegistrationPosition: { ...current, ...updates } });
    } else if (id === 'primaryPhoto') {
      const current = formData.primaryPhotoPosition || { xPercent: 0, yPercent: 0, widthPercent: 100, heightPercent: 58, rotation: 0 };
      setFormData({
        ...formData,
        primaryPhotoPosition: {
          ...current,
          ...updates,
        },
      });
    } else if (id === 'year') {
      const current = formData.yearPosition || { xPercent: 82, yPercent: 16.5, widthPercent: 16, heightPercent: 3, fontSizePx: 14, color: '#ffffff', bgColor: '#1e293b', align: 'center', fontWeight: 'bold' };
      setFormData({ ...formData, yearPosition: { ...current, ...updates } });
    } else if (id.startsWith('secondaryDot_')) {
      const dotIndex = parseInt(id.replace('secondaryDot_', ''), 10);
      const updatedConfigs = [...(formData.configurations || [])];
      const cfgIdx = updatedConfigs.findIndex((c) => c.configIndex === activeConfigIndex);
      if (cfgIdx !== -1) {
        const dots = [...(updatedConfigs[cfgIdx].secondaryDots || [])];
        if (dots[dotIndex]) {
          dots[dotIndex] = { ...dots[dotIndex], ...updates };
          updatedConfigs[cfgIdx] = { ...updatedConfigs[cfgIdx], secondaryDots: dots };
          setFormData({ ...formData, configurations: updatedConfigs });
        }
      }
    }
  }

  const renderPranchetaAlignmentBlock = (elementId: string) => {
    const elemData = getSelectedElementDataById(elementId);
    if (!elemData || !elemData.pos) return null;
    const currentX = elemData.pos.xPercent ?? 0;
    const currentY = elemData.pos.yPercent ?? 0;

    const nudge = (dx: number, dy: number) => {
      const newX = Math.round((currentX + dx) * 10) / 10;
      const newY = Math.round((currentY + dy) * 10) / 10;
      updateElementById(elementId, { xPercent: newX, yPercent: newY });
    };

    return (
      <div className="space-y-1.5 pt-2 border-t border-slate-100 mt-2">
        {/* Microajuste de Posição (0.5%) */}
        <div className="space-y-1 bg-slate-50 p-2 rounded-md border border-slate-200">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-slate-600 block">
              Microajuste (±0,5%)
            </label>
            <span className="text-[10px] font-mono text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
              X: {currentX}% | Y: {currentY}%
            </span>
          </div>

          <div className="flex justify-center items-center pt-0.5">
            <div className="grid grid-cols-3 gap-1 w-24">
              <div></div>
              <button
                type="button"
                onClick={() => nudge(0, -0.5)}
                className="p-1 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-600 rounded border border-slate-200 flex items-center justify-center transition-colors cursor-pointer active:scale-95 shadow-2xs"
                title="Cima (Y - 0,5%)"
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <div></div>

              <button
                type="button"
                onClick={() => nudge(-0.5, 0)}
                className="p-1 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-600 rounded border border-slate-200 flex items-center justify-center transition-colors cursor-pointer active:scale-95 shadow-2xs"
                title="Esquerda (X - 0,5%)"
              >
                <ArrowLeft className="w-3 h-3" />
              </button>

              <div className="flex items-center justify-center">
                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
              </div>

              <button
                type="button"
                onClick={() => nudge(0.5, 0)}
                className="p-1 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-600 rounded border border-slate-200 flex items-center justify-center transition-colors cursor-pointer active:scale-95 shadow-2xs"
                title="Direita (X + 0,5%)"
              >
                <ArrowRight className="w-3 h-3" />
              </button>

              <div></div>
              <button
                type="button"
                onClick={() => nudge(0, 0.5)}
                className="p-1 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-600 rounded border border-slate-200 flex items-center justify-center transition-colors cursor-pointer active:scale-95 shadow-2xs"
                title="Baixo (Y + 0,5%)"
              >
                <ArrowDown className="w-3 h-3" />
              </button>
              <div></div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleMouseDownElement = (e: React.MouseEvent, elementId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedElementId(elementId);

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    const startX = e.clientX;
    const startY = e.clientY;

    const elemData = getSelectedElementDataById(elementId);
    if (!elemData || !elemData.pos) return;

    const initialX = elemData.pos.xPercent;
    const initialY = elemData.pos.yPercent;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const deltaXPercent = (deltaX / canvasRect.width) * 100;
      const deltaYPercent = (deltaY / canvasRect.height) * 100;

      const newX = Math.round((initialX + deltaXPercent) * 10) / 10;
      const newY = Math.round((initialY + deltaYPercent) * 10) / 10;

      updateElementById(elementId, { xPercent: newX, yPercent: newY });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseDownResizeHandle = (
    e: React.MouseEvent,
    elementId: string,
    corner: 'se' | 'sw' | 'ne' | 'nw'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedElementId(elementId);

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    const startX = e.clientX;
    const startY = e.clientY;

    const elemData = getSelectedElementDataById(elementId);
    if (!elemData || !elemData.pos) return;

    const initialX = elemData.pos.xPercent;
    const initialY = elemData.pos.yPercent;
    const initialW = elemData.pos.widthPercent;
    const initialH = elemData.pos.heightPercent;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const deltaWPercent = (deltaX / canvasRect.width) * 100;
      const deltaHPercent = (deltaY / canvasRect.height) * 100;

      let newX = initialX;
      let newY = initialY;
      let newW = initialW;
      let newH = initialH;

      if (corner === 'se') {
        newW = Math.max(2, Math.round((initialW + deltaWPercent) * 10) / 10);
        newH = Math.max(2, Math.round((initialH + deltaHPercent) * 10) / 10);
      }

      updateElementById(elementId, {
        xPercent: newX,
        yPercent: newY,
        widthPercent: newW,
        heightPercent: newH,
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Keyboard Arrow Keys microadjustment listener for selected element (0.5%)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedElementId || selectedElementId === 'schoolName') return;
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowLeft') dx = -0.5;
        if (e.key === 'ArrowRight') dx = 0.5;
        if (e.key === 'ArrowUp') dy = -0.5;
        if (e.key === 'ArrowDown') dy = 0.5;

        const elemData = getSelectedElementDataById(selectedElementId);
        if (elemData && elemData.pos) {
          const currentX = elemData.pos.xPercent ?? 0;
          const currentY = elemData.pos.yPercent ?? 0;
          const newX = Math.round((currentX + dx) * 10) / 10;
          const newY = Math.round((currentY + dy) * 10) / 10;
          updateElementById(selectedElementId, { xPercent: newX, yPercent: newY });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementId, formData]);

  const maxConfigIndex = (formData.configurations || []).reduce((max, c) => Math.max(max, c.configIndex), 0);
  const hasNextConfig = activeConfigIndex < maxConfigIndex;

  const handleCopyConfigToNext = () => {
    if (!formData || !formData.configurations) return;
    const currentIdx = activeConfigIndex;
    const nextIdx = currentIdx + 1;

    const currentCfg = formData.configurations.find((c) => c.configIndex === currentIdx);
    const nextCfg = formData.configurations.find((c) => c.configIndex === nextIdx);

    if (!currentCfg || !nextCfg) return;

    const currentDots = currentCfg.secondaryDots || [];
    const nextDots = nextCfg.secondaryDots || [];
    const defaultDotsForNext = createDefaultDotsForConfig(nextIdx);

    // Deep copy the current dots, and preserve or create the additional slot(s) for nextConfig
    const updatedNextDots: DotPosition[] = [];
    const targetCount = Math.max(nextIdx, currentDots.length);

    for (let i = 0; i < targetCount; i++) {
      if (i < currentDots.length) {
        // Deep clone of the current configuration's dot
        updatedNextDots.push(JSON.parse(JSON.stringify(currentDots[i])));
      } else {
        // Additional slot(s) in next config: preserve existing nextDot or fallback to default
        if (nextDots[i]) {
          updatedNextDots.push(JSON.parse(JSON.stringify(nextDots[i])));
        } else if (defaultDotsForNext[i]) {
          updatedNextDots.push(JSON.parse(JSON.stringify(defaultDotsForNext[i])));
        }
      }
    }

    const updatedConfigs = formData.configurations.map((cfg) => {
      if (cfg.configIndex === nextIdx) {
        return {
          ...cfg,
          secondaryDots: updatedNextDots,
        };
      }
      return {
        ...cfg,
        secondaryDots: cfg.secondaryDots ? JSON.parse(JSON.stringify(cfg.secondaryDots)) : [],
      };
    });

    setFormData({
      ...formData,
      configurations: updatedConfigs,
    });

    setSuccessMsg('Ajustes copiados.');
  };

  const handleSave = async () => {
    if (!formData || !isDirty || isSaving) return;
    setErrorMsg('');
    setSuccessMsg('');
    setIsSaving(true);

    try {
      const updated = await onSaveModel(formData);
      const normalized = ensureConfigs((updated as LayoutModel) || formData);
      setFormData(normalized);
      setSavedSnapshot(JSON.stringify(normalized));
      setSuccessMsg('Modelo salvo com sucesso.');
    } catch (e: any) {
      setErrorMsg(e.message || 'Erro ao salvar o modelo.');
    } finally {
      setIsSaving(false);
    }
  };

  const isSecondaryDotSelected = selectedElementId.startsWith('secondaryDot_');
  const selectedDotIndex = isSecondaryDotSelected
    ? parseInt(selectedElementId.replace('secondaryDot_', ''), 10)
    : null;
  const selectedDot = selectedDotIndex !== null ? secondaryDots[selectedDotIndex] : null;

  // Element list definitions for the selector
  const elementItems = [
    {
      id: 'bg',
      label: 'Background',
      icon: ImageIcon,
      active: selectedElementId === 'bg',
      badge: formData.bgImageUrl ? 'Ativo' : 'Vazio',
    },
    {
      id: 'primaryPhoto',
      label: 'Foto Principal',
      icon: ImageIcon,
      active: selectedElementId === 'primaryPhoto',
      badge: null,
    },
    {
      id: 'schoolLogo',
      label: 'Logo Principal',
      icon: Settings2,
      active: selectedElementId === 'schoolLogo',
      badge: formData.schoolLogoPosition?.show !== false ? 'ON' : 'OFF',
    },
    {
      id: 'schoolName',
      label: 'Nome da Escola',
      icon: Type,
      active: selectedElementId === 'schoolName',
      badge: formData.showSchoolName !== false ? 'ON' : 'OFF',
    },
    {
      id: 'studentName',
      label: 'Nome',
      icon: Type,
      active: selectedElementId === 'studentName',
      badge: null,
    },
    {
      id: 'year',
      label: 'Ano Principal',
      icon: Type,
      active: selectedElementId === 'year',
      badge: formData.mainYearType === 'image' ? 'PNG' : 'Texto',
    },
    {
      id: 'secondaryDots',
      label: 'Fotos Secundárias',
      icon: Sliders,
      active: selectedElementId === 'secondaryDots' || isSecondaryDotSelected,
      badge: `${secondaryDots.length}`,
    },
  ];

  return (
    <div className="space-y-3">
      {/* Barra de Ferramentas Compacta do Modelo */}
      <div className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-2xs">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-xs font-bold text-slate-800">
            Modelo da Linha do Tempo
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-[11px] text-slate-500 font-medium truncate">
            {formData.title || 'Padrão'}
          </span>
          {isDirty && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              Alterações não salvas
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={showGrid ? 'secondary' : 'ghost'}
            icon={LayoutGrid}
            onClick={() => setShowGrid(!showGrid)}
            className={`h-8 text-xs ${showGrid ? 'border-blue-300 text-blue-700 bg-blue-50/80 hover:bg-blue-100' : 'text-slate-600'}`}
          >
            Grade {showGrid ? 'ON' : 'OFF'}
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={Save}
            loading={isSaving}
            disabled={!isDirty || isSaving}
            onClick={handleSave}
            className="h-8 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Salvar Modelo
          </Button>
        </div>
      </div>

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

      {/* 3-COLUMN WORKSPACE: ELEMENTOS → PRÉVIA A4 → PROPRIEDADES */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        
        {/* COLUMN 1 (3 cols): ELEMENTOS & COMPOSIÇÕES */}
        <div className="lg:col-span-3 space-y-2.5">
          
          {/* Element Selector */}
          <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-2xs space-y-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                <span>Elementos</span>
              </span>
            </div>

            <div className="space-y-1">
              {elementItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.id === 'secondaryDots' && isSecondaryDotSelected) {
                        // keep current dot
                      } else {
                        setSelectedElementId(item.id);
                      }
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-md text-left text-xs font-medium transition-colors cursor-pointer flex items-center justify-between border ${
                      item.active
                        ? 'bg-blue-50 text-blue-800 border-blue-200 font-semibold shadow-2xs'
                        : 'bg-white text-slate-700 border-transparent hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${item.active ? 'text-blue-600' : 'text-slate-400'}`} />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.badge && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                          item.active
                            ? 'bg-blue-200/70 text-blue-900'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Composição de Fotos */}
          <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Composição
              </span>
              <span className="text-[11px] font-medium text-blue-600">
                {secondaryDots.length} foto{secondaryDots.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {(formData.configurations || []).map((cfg) => {
                const cfgIdx = cfg.configIndex;
                const isActive = activeConfigIndex === cfgIdx;
                return (
                  <button
                    key={`cfg_btn_${cfgIdx}`}
                    type="button"
                    onClick={() => setActiveConfigIndex(cfgIdx)}
                    className={`min-w-[26px] h-6 px-1 text-xs font-medium rounded border transition-colors cursor-pointer flex items-center justify-center ${
                      isActive
                        ? 'bg-blue-600 text-white border-blue-600 font-semibold shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                    title={`${cfgIdx} foto(s) secundária(s)`}
                  >
                    {cfgIdx}
                  </button>
                );
              })}
            </div>

            <div className="pt-1.5 border-t border-slate-100">
              <button
                type="button"
                onClick={handleCopyConfigToNext}
                disabled={!hasNextConfig}
                className={`w-full py-1.5 px-2 rounded-md text-xs font-medium border flex items-center justify-center gap-1.5 transition-colors ${
                  hasNextConfig
                    ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300 cursor-pointer shadow-2xs'
                    : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                }`}
                title={
                  hasNextConfig
                    ? `Copiar posições da Configuração ${activeConfigIndex} para a Configuração ${activeConfigIndex + 1}`
                    : 'Não existe próxima configuração'
                }
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar para a próxima</span>
              </button>
            </div>
          </div>

        </div>

        {/* COLUMN 2 (5 cols on lg, 6 cols on xl): PRÉVIA A4 (CENTRALIZADA E PERSISTENTE) */}
        <div className="lg:col-span-5 xl:col-span-5 lg:sticky lg:top-3 z-10 self-start space-y-2">
          <div className="bg-slate-900 rounded-lg p-3 shadow-sm border border-slate-800 text-white space-y-2 flex flex-col items-center">
            {/* Top Status */}
            <div className="w-full flex items-center justify-between pb-1.5 border-b border-slate-800 text-xs gap-2">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-300">Prévia A4</span>
                <div className="flex items-center bg-slate-800 p-0.5 rounded border border-slate-700 ml-2">
                  <button
                    type="button"
                    onClick={() => setPreviewPersonType('student')}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors flex items-center gap-1 ${
                      previewPersonType === 'student'
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <GraduationCap className="w-3 h-3" />
                    <span>Aluno</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewPersonType('collaborator')}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors flex items-center gap-1 ${
                      previewPersonType === 'collaborator'
                        ? 'bg-indigo-600 text-white font-bold shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Briefcase className="w-3 h-3" />
                    <span>Colaborador</span>
                  </button>
                </div>
              </div>
              <span className="text-[11px] text-slate-400 font-mono bg-slate-800/90 px-2 py-0.5 rounded border border-slate-700">
                Config. {activeConfigIndex} • {secondaryDots.length} {secondaryDots.length === 1 ? 'foto' : 'fotos'}
              </span>
            </div>

            {/* A4 Sheet Canvas */}
            <div
              className="w-full max-w-[480px] mx-auto aspect-[210/297] bg-white rounded-lg shadow-md relative overflow-hidden select-none border border-slate-300"
              style={{ fontFamily: formData.fontFamily || "'Montserrat', sans-serif" }}
              ref={canvasRef}
            >
              {/* Grid visual overlay */}
              <VisualReferenceGrid show={showGrid} />

              {/* Layer 0 (z-0): Background Canvas Placeholder */}
              <div
                style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}
                className="absolute inset-0 bg-slate-50/50 pointer-events-none z-0"
              />

              {/* Layer 10 (z-10): Foto Principal */}
              <div
                id="elem_primaryPhoto"
                style={{
                  position: 'absolute',
                  left: `${formData.primaryPhotoPosition?.xPercent ?? 0}%`,
                  top: `${formData.primaryPhotoPosition?.yPercent ?? 0}%`,
                  width: `${formData.primaryPhotoPosition?.widthPercent ?? 100}%`,
                  height: `${formData.primaryPhotoPosition?.heightPercent ?? 58}%`,
                  transform: `rotate(${formData.primaryPhotoPosition?.rotation ?? 0}deg)`,
                  zIndex: 10,
                }}
                onMouseDown={(e) => handleMouseDownElement(e, 'primaryPhoto')}
                className={`absolute z-10 cursor-move border transition-all ${
                  selectedElementId === 'primaryPhoto'
                    ? 'border-blue-600 ring-2 ring-blue-500/50'
                    : 'border-slate-300 hover:border-blue-400'
                }`}
              >
                <div className="w-full h-full rounded-xs bg-slate-100 border border-slate-300 flex flex-col items-center justify-center text-center p-1.5 relative overflow-hidden">
                  <span className="text-[10px] font-bold text-slate-600 uppercase">
                    [FOTO PRINCIPAL]
                  </span>
                  <span className="text-[8px] text-slate-400 mt-0.5 font-mono">
                    Camada Posterior
                  </span>
                </div>

                {selectedElementId === 'primaryPhoto' && (
                  <>
                    <div
                      onMouseDown={(e) => handleMouseDownResizeHandle(e, 'primaryPhoto', 'se')}
                      style={{ zIndex: 60 }}
                      className="w-3 h-3 bg-blue-600 border-2 border-white rounded-full absolute -bottom-1.5 -right-1.5 cursor-se-resize shadow z-[60]"
                    />
                    <div
                      style={{ zIndex: 60 }}
                      className="absolute -top-5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[8px] font-bold px-1.5 py-0.2 rounded shadow whitespace-nowrap z-[60]"
                    >
                      FOTO PRINCIPAL
                    </div>
                  </>
                )}
              </div>

              {/* Layer 20 (z-20): Background A4 PNG */}
              {getModelBackgroundUrl(formData, previewPersonType) && (
                <img
                  src={getModelBackgroundUrl(formData, previewPersonType)}
                  alt="Background A4"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', zIndex: 20 }}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none z-20"
                />
              )}

              {/* Layer 30 (z-30): Secondary Dots */}
              {secondaryDots.map((dot, idx) => {
                const elemId = `secondaryDot_${idx}`;
                const isSelected = selectedElementId === elemId;

                const vertPos = dot.yearLabel?.verticalPosition || formData.secondaryYearConfig?.verticalPosition || 'inferior';
                const hAlign = dot.yearLabel?.align || formData.secondaryYearConfig?.align || 'center';
                const isSuperior = vertPos === 'superior';
                const isLeft = hAlign === 'left';
                const isRight = hAlign === 'right';

                return (
                  <div
                    key={`canvas_dot_${idx}`}
                    id={`elem_${elemId}`}
                    style={{
                      position: 'absolute',
                      left: `${dot.xPercent}%`,
                      top: `${dot.yPercent}%`,
                      width: `${dot.widthPercent}%`,
                      height: `${dot.heightPercent}%`,
                      transform: `rotate(${dot.rotation ?? 0}deg)`,
                      zIndex: 30,
                    }}
                    onMouseDown={(e) => handleMouseDownElement(e, elemId)}
                    className={`absolute z-30 cursor-move border transition-all ${
                      isSelected
                        ? 'border-blue-600 ring-2 ring-blue-500/50'
                        : 'border-slate-300 hover:border-blue-400'
                    }`}
                  >
                    <div className="w-full h-full rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-center p-0.5 shadow-2xs relative overflow-hidden z-10">
                      <span className="text-[8px] font-bold text-slate-600">
                        #{idx + 1}
                      </span>
                    </div>

                    {formData.secondaryFrameUrl && (
                      <img
                        src={formData.secondaryFrameUrl}
                        alt="Moldura Secundária"
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none', zIndex: 40 }}
                        className="absolute inset-0 w-full h-full object-fill pointer-events-none z-40"
                      />
                    )}

                    <div
                      style={{
                        position: 'absolute',
                        top: isSuperior ? 'auto' : '100%',
                        bottom: isSuperior ? '100%' : 'auto',
                        left: isLeft ? '0%' : isRight ? 'auto' : '50%',
                        right: isRight ? '0%' : 'auto',
                        transform: isLeft || isRight ? 'none' : 'translateX(-50%)',
                        marginTop: isSuperior ? undefined : '3px',
                        marginBottom: isSuperior ? '3px' : undefined,
                        fontSize: `${(dot.yearLabel?.fontSizePx ?? formData.secondaryYearConfig?.fontSizePx ?? 12) * fontScale}px`,
                        color: dot.yearLabel?.color || formData.secondaryYearConfig?.color || '#ffffff',
                        backgroundColor: dot.yearLabel?.bgColor || formData.secondaryYearConfig?.bgColor || '#1e293b',
                        zIndex: 50,
                      }}
                      className="z-50 font-bold px-1.5 py-0.2 rounded-full border border-white/30 whitespace-nowrap text-center pointer-events-none"
                    >
                      [ANO {idx + 1}]
                    </div>

                    {isSelected && (
                      <>
                        <div
                          onMouseDown={(e) => handleMouseDownResizeHandle(e, elemId, 'se')}
                          style={{ zIndex: 60 }}
                          className="w-2.5 h-2.5 bg-blue-600 border-2 border-white rounded-full absolute -bottom-1 -right-1 cursor-se-resize shadow z-[60]"
                        />
                        <div
                          style={{ zIndex: 60 }}
                          className="absolute -top-5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[8px] font-bold px-1.5 py-0.2 rounded shadow whitespace-nowrap z-[60]"
                        >
                          #{idx + 1}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {/* Layer 50 (z-50): Logo Principal */}
              {formData.schoolLogoPosition?.show !== false && (
                <div
                  id="elem_schoolLogo"
                  style={{
                    position: 'absolute',
                    left: `${formData.schoolLogoPosition?.xPercent ?? 82}%`,
                    top: `${formData.schoolLogoPosition?.yPercent ?? 5}%`,
                    width: `${formData.schoolLogoPosition?.widthPercent ?? 16}%`,
                    height: `${formData.schoolLogoPosition?.heightPercent ?? 12}%`,
                    transform: `rotate(${formData.schoolLogoPosition?.rotation ?? 0}deg)`,
                    zIndex: 50,
                  }}
                  onMouseDown={(e) => handleMouseDownElement(e, 'schoolLogo')}
                  className={`absolute z-50 cursor-move border flex items-center justify-center p-0.5 ${
                    selectedElementId === 'schoolLogo'
                      ? 'border-blue-600 ring-2 ring-blue-500/50'
                      : 'border-dashed border-slate-400/60 hover:border-blue-400'
                  }`}
                >
                  {schoolConfig.schoolLogo ? (
                    <img
                      src={schoolConfig.schoolLogo}
                      alt="Logo Principal"
                      className="w-full h-full object-contain pointer-events-none"
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-100 border border-slate-300 rounded flex items-center justify-center text-[8px] font-bold text-slate-500">
                      [LOGO]
                    </div>
                  )}

                  {selectedElementId === 'schoolLogo' && (
                    <div
                      onMouseDown={(e) => handleMouseDownResizeHandle(e, 'schoolLogo', 'se')}
                      style={{ zIndex: 60 }}
                      className="w-2.5 h-2.5 bg-blue-600 border-2 border-white rounded-full absolute -bottom-1 -right-1 cursor-se-resize shadow z-[60]"
                    />
                  )}
                </div>
              )}

              {/* Layer 50 (z-50): Nome da Escola (Rodapé Institucional Fixo) */}
              {formData.showSchoolName !== false && (
                <div
                  id="elem_schoolName"
                  onClick={() => setSelectedElementId('schoolName')}
                  style={{
                    position: 'absolute',
                    top: `${formData.schoolNamePosition?.yPercent ?? 97}%`,
                    left: `${formData.schoolNamePosition?.xPercent ?? 0}%`,
                    width: `${formData.schoolNamePosition?.widthPercent ?? 100}%`,
                    height: `${formData.schoolNamePosition?.heightPercent ?? 2}%`,
                    zIndex: 50,
                  }}
                  className={`absolute z-50 p-0.5 flex items-center justify-center cursor-pointer transition-all ${
                    selectedElementId === 'schoolName'
                      ? 'border border-blue-600 ring-1 ring-blue-500/30 rounded bg-blue-500/5'
                      : 'hover:outline-1 hover:outline-dashed hover:outline-blue-400'
                  }`}
                  title="Clique para editar as propriedades do Nome da Escola"
                >
                  <div
                    style={{
                      fontSize: `${(formData.schoolNamePosition?.fontSizePx ?? 12) * fontScale}px`,
                      fontFamily: formData.schoolNamePosition?.fontFamily || formData.fontFamily || "'Montserrat', sans-serif",
                      color: formData.schoolNamePosition?.color || '#ffffff',
                      textAlign: 'center',
                      fontWeight: 'bold',
                    }}
                    className="w-full uppercase tracking-wide font-bold truncate text-center pointer-events-none"
                  >
                    {schoolConfig.schoolName || '[NOME DA ESCOLA]'}
                  </div>
                </div>
              )}

              {/* Layer 50 (z-50): Nome */}
              <div
                id="elem_studentName"
                style={{
                  position: 'absolute',
                  left: `${formData.studentNamePosition?.xPercent ?? 0}%`,
                  top: `${formData.studentNamePosition?.yPercent ?? 86}%`,
                  width: `${formData.studentNamePosition?.widthPercent ?? 100}%`,
                  height: `${formData.studentNamePosition?.heightPercent ?? 5}%`,
                  transform: `rotate(${formData.studentNamePosition?.rotation ?? 0}deg)`,
                  zIndex: 50,
                }}
                onMouseDown={(e) => handleMouseDownElement(e, 'studentName')}
                className={`absolute z-50 cursor-move border flex flex-col justify-center p-0.5 ${
                  formData.studentNamePosition?.align === 'left'
                    ? 'items-start'
                    : formData.studentNamePosition?.align === 'right'
                    ? 'items-end'
                    : 'items-center'
                } ${
                  selectedElementId === 'studentName'
                    ? 'border-blue-600 ring-2 ring-blue-500/50'
                    : 'border-dashed border-slate-400/60 hover:border-blue-400'
                }`}
              >
                <div
                  style={{
                    fontSize: `${(formData.studentNamePosition?.fontSizePx ?? 24) * fontScale}px`,
                    color: formData.studentNamePosition?.color || '#ffffff',
                    textAlign: formData.studentNamePosition?.align || 'center',
                    fontWeight: formData.studentNamePosition?.fontWeight || 'bold',
                  }}
                  className="w-full uppercase tracking-tight font-bold leading-tight"
                >
                  [NOME]
                </div>

                {selectedElementId === 'studentName' && (
                  <div
                    onMouseDown={(e) => handleMouseDownResizeHandle(e, 'studentName', 'se')}
                    style={{ zIndex: 60 }}
                    className="w-2.5 h-2.5 bg-blue-600 border-2 border-white rounded-full absolute -bottom-1 -right-1 cursor-se-resize shadow z-[60]"
                  />
                )}
              </div>

              {/* Layer 50 (z-50): Ano Principal */}
              <div
                id="elem_year"
                style={{
                  position: 'absolute',
                  left: `${formData.yearPosition?.xPercent ?? 82}%`,
                  top: `${formData.yearPosition?.yPercent ?? 16.5}%`,
                  width: `${formData.yearPosition?.widthPercent ?? 16}%`,
                  height: `${formData.yearPosition?.heightPercent ?? 3}%`,
                  transform: `rotate(${formData.yearPosition?.rotation ?? 0}deg)`,
                  zIndex: 50,
                }}
                onMouseDown={(e) => handleMouseDownElement(e, 'year')}
                className={`absolute z-50 cursor-move border flex items-center p-0.5 ${
                  formData.yearPosition?.align === 'left'
                    ? 'justify-start'
                    : formData.yearPosition?.align === 'right'
                    ? 'justify-end'
                    : 'justify-center'
                } ${
                  selectedElementId === 'year'
                    ? 'border-blue-600 ring-2 ring-blue-500/50'
                    : 'border-dashed border-slate-400/60 hover:border-blue-400'
                }`}
              >
                {formData.mainYearType === 'image' && formData.mainYearImageUrl ? (
                  <img
                    src={formData.mainYearImageUrl}
                    alt="PNG do Ano"
                    className={`max-w-full max-h-full object-contain pointer-events-none ${
                      formData.yearPosition?.align === 'left'
                        ? 'object-left'
                        : formData.yearPosition?.align === 'right'
                        ? 'object-right'
                        : 'object-center'
                    }`}
                  />
                ) : formData.mainYearType === 'image' ? (
                  <div className="text-[8px] font-bold text-amber-600 bg-amber-50 px-1 py-0.2 rounded border border-amber-200 whitespace-nowrap pointer-events-none">
                    [PNG DO ANO]
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: `${(formData.yearPosition?.fontSizePx ?? 14) * fontScale}px`,
                      color: formData.yearPosition?.color || '#ffffff',
                      backgroundColor: formData.yearPosition?.bgColor || '#1e293b',
                      textAlign: formData.yearPosition?.align || 'center',
                    }}
                    className="font-bold px-2 py-0.2 rounded-full border border-white/40 tracking-wider whitespace-nowrap pointer-events-none"
                  >
                    [ANO]
                  </div>
                )}

                {selectedElementId === 'year' && (
                  <div
                    onMouseDown={(e) => handleMouseDownResizeHandle(e, 'year', 'se')}
                    style={{ zIndex: 50 }}
                    className="w-2.5 h-2.5 bg-blue-600 border-2 border-white rounded-full absolute -bottom-1 -right-1 cursor-se-resize shadow z-50"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* COLUMN 3 (4 cols): PROPRIEDADES DO ELEMENTO SELECIONADO */}
        <div className="lg:col-span-4 space-y-2.5">
          <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-2xs space-y-2.5">
            
            {/* CONTEXT: BACKGROUND */}
            {selectedElementId === 'bg' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Background da Folha A4
                  </h4>
                </div>

                {/* 1. Background Principal / Alunos */}
                <div className="space-y-2 border border-slate-200 rounded-lg p-2.5 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
                      Background Alunos
                    </span>
                  </div>

                  {formData.bgImageUrl ? (
                    <div className="space-y-2">
                      <div className="relative w-full h-20 bg-slate-100 border border-slate-200 rounded-md overflow-hidden flex items-center justify-center p-1">
                        <img
                          src={formData.bgImageUrl}
                          alt="Prévia do Background de Alunos"
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer flex-1">
                          <span className="w-full inline-flex items-center justify-center gap-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium px-2 py-1.5 rounded-md transition-colors">
                            <Upload className="w-3.5 h-3.5" />
                            <span>Substituir</span>
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileUpload('bgImageUrl', e)}
                            className="hidden"
                          />
                        </label>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setFormData({ ...formData, bgImageUrl: '' })}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 text-xs h-8"
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="cursor-pointer block">
                        <div className="border border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/50 rounded-lg p-2.5 flex items-center justify-center gap-2 text-center transition-all cursor-pointer group bg-white">
                          <Upload className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
                          <span className="text-xs font-semibold text-slate-700">Carregar imagem (A4)</span>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleFileUpload('bgImageUrl', e)}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* 2. Background Específico de Colaboradores */}
                <div className="space-y-2 border border-slate-200 rounded-lg p-2.5 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
                      Background Colaboradores
                    </span>
                  </div>

                  {formData.collaboratorBgImageUrl ? (
                    <div className="space-y-2">
                      <div className="relative w-full h-20 bg-slate-100 border border-slate-200 rounded-md overflow-hidden flex items-center justify-center p-1">
                        <img
                          src={formData.collaboratorBgImageUrl}
                          alt="Prévia do Background de Colaboradores"
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer flex-1">
                          <span className="w-full inline-flex items-center justify-center gap-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium px-2 py-1.5 rounded-md transition-colors">
                            <Upload className="w-3.5 h-3.5" />
                            <span>Substituir</span>
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileUpload('collaboratorBgImageUrl', e)}
                            className="hidden"
                          />
                        </label>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setFormData({ ...formData, collaboratorBgImageUrl: '' })}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 text-xs h-8"
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="cursor-pointer block">
                        <div className="border border-dashed border-slate-300 hover:border-indigo-500 hover:bg-indigo-50/50 rounded-lg p-2.5 flex items-center justify-center gap-2 text-center transition-all cursor-pointer group bg-white">
                          <Upload className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
                          <span className="text-xs font-semibold text-slate-700">Carregar arte de colaborador</span>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleFileUpload('collaboratorBgImageUrl', e)}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CONTEXT: FOTO PRINCIPAL */}
            {selectedElementId === 'primaryPhoto' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Foto Principal
                  </h4>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <FormField label="Horizontal (%)">
                    <input
                      type="number"
                      step="0.5"
                      value={formData.primaryPhotoPosition?.xPercent ?? 0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateElementById('primaryPhoto', { xPercent: val });
                      }}
                      className={compactInputClasses}
                    />
                  </FormField>

                  <FormField label="Vertical (%)">
                    <input
                      type="number"
                      step="0.5"
                      value={formData.primaryPhotoPosition?.yPercent ?? 0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateElementById('primaryPhoto', { yPercent: val });
                      }}
                      className={compactInputClasses}
                    />
                  </FormField>

                  <FormField label="Largura (%)">
                    <input
                      type="number"
                      step="0.5"
                      value={formData.primaryPhotoPosition?.widthPercent ?? 100}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateElementById('primaryPhoto', { widthPercent: val });
                      }}
                      className={compactInputClasses}
                    />
                  </FormField>

                  <FormField label="Altura (%)">
                    <input
                      type="number"
                      step="0.5"
                      value={formData.primaryPhotoPosition?.heightPercent ?? 58}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateElementById('primaryPhoto', { heightPercent: val });
                      }}
                      className={compactInputClasses}
                    />
                  </FormField>
                </div>

                {renderPranchetaAlignmentBlock('primaryPhoto')}
              </div>
            )}

            {/* CONTEXT: LOGO */}
            {selectedElementId === 'schoolLogo' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Logo Principal
                  </h4>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={formData.schoolLogoPosition?.show !== false ? Eye : EyeOff}
                    onClick={() => {
                      const current = formData.schoolLogoPosition || { show: true, xPercent: 82, yPercent: 5, widthPercent: 16, heightPercent: 12, rotation: 0 };
                      setFormData({
                        ...formData,
                        schoolLogoPosition: { ...current, show: current.show === false },
                      });
                    }}
                    className="h-8 text-xs"
                  >
                    {formData.schoolLogoPosition?.show !== false ? 'ON' : 'OFF'}
                  </Button>
                </div>

                {formData.schoolLogoPosition?.show !== false && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <FormField label="Horizontal (%)">
                        <input
                          type="number"
                          step="0.5"
                          value={formData.schoolLogoPosition?.xPercent ?? 82}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            updateElementById('schoolLogo', { xPercent: val });
                          }}
                          className={compactInputClasses}
                        />
                      </FormField>
                      <FormField label="Vertical (%)">
                        <input
                          type="number"
                          step="0.5"
                          value={formData.schoolLogoPosition?.yPercent ?? 5}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            updateElementById('schoolLogo', { yPercent: val });
                          }}
                          className={compactInputClasses}
                        />
                      </FormField>
                      <FormField label="Largura (%)">
                        <input
                          type="number"
                          step="0.5"
                          value={formData.schoolLogoPosition?.widthPercent ?? 16}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            updateElementById('schoolLogo', { widthPercent: val });
                          }}
                          className={compactInputClasses}
                        />
                      </FormField>
                      <FormField label="Altura (%)">
                        <input
                          type="number"
                          step="0.5"
                          value={formData.schoolLogoPosition?.heightPercent ?? 12}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            updateElementById('schoolLogo', { heightPercent: val });
                          }}
                          className={compactInputClasses}
                        />
                      </FormField>
                    </div>
                    {renderPranchetaAlignmentBlock('schoolLogo')}
                  </>
                )}
              </div>
            )}

            {/* CONTEXT: NOME DA ESCOLA (Rodapé Fixo) */}
            {selectedElementId === 'schoolName' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Nome da Escola
                  </h4>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={formData.showSchoolName !== false ? Eye : EyeOff}
                    onClick={() => setFormData({ ...formData, showSchoolName: !formData.showSchoolName })}
                    className="h-8 text-xs"
                  >
                    {formData.showSchoolName !== false ? 'ON' : 'OFF'}
                  </Button>
                </div>

                {formData.showSchoolName !== false && (
                  <div className="space-y-2.5">
                    <FormField label="Fonte">
                      <select
                        value={formData.schoolNamePosition?.fontFamily || formData.fontFamily || 'Montserrat, sans-serif'}
                        onChange={(e) => {
                          const current = formData.schoolNamePosition || { xPercent: 0, yPercent: 97, widthPercent: 100, heightPercent: 2, fontSizePx: 12, color: '#ffffff', align: 'center', fontWeight: 'bold' };
                          setFormData({ ...formData, schoolNamePosition: { ...current, fontFamily: e.target.value } });
                        }}
                        className={compactSelectClasses}
                      >
                        <option value="Montserrat, sans-serif">Montserrat</option>
                        <option value="Plus Jakarta Sans, sans-serif">Plus Jakarta Sans</option>
                        <option value="Inter, sans-serif">Inter</option>
                        <option value="Roboto, sans-serif">Roboto</option>
                        <option value="Playfair Display, serif">Playfair Display</option>
                        <option value="Cinzel, serif">Cinzel</option>
                      </select>
                    </FormField>

                    <div className="grid grid-cols-2 gap-2">
                      <FormField label="Tamanho (px)">
                        <input
                          type="number"
                          value={formData.schoolNamePosition?.fontSizePx ?? 12}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 12;
                            const current = formData.schoolNamePosition || { xPercent: 0, yPercent: 97, widthPercent: 100, heightPercent: 2, fontSizePx: 12, color: '#ffffff', align: 'center', fontWeight: 'bold' };
                            setFormData({ ...formData, schoolNamePosition: { ...current, fontSizePx: val } });
                          }}
                          className={compactInputClasses}
                        />
                      </FormField>

                      <FormField label="Cor">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={formData.schoolNamePosition?.color || '#ffffff'}
                            onChange={(e) => {
                              const current = formData.schoolNamePosition || { xPercent: 0, yPercent: 97, widthPercent: 100, heightPercent: 2, fontSizePx: 12, color: '#ffffff', align: 'center', fontWeight: 'bold' };
                              setFormData({ ...formData, schoolNamePosition: { ...current, color: e.target.value } });
                            }}
                            className="w-8 h-8 rounded border border-slate-200 p-0.5 cursor-pointer shrink-0"
                          />
                          <input
                            type="text"
                            value={formData.schoolNamePosition?.color || '#ffffff'}
                            onChange={(e) => {
                              const current = formData.schoolNamePosition || { xPercent: 0, yPercent: 97, widthPercent: 100, heightPercent: 2, fontSizePx: 12, color: '#ffffff', align: 'center', fontWeight: 'bold' };
                              setFormData({ ...formData, schoolNamePosition: { ...current, color: e.target.value } });
                            }}
                            className={compactInputClasses}
                          />
                        </div>
                      </FormField>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* CONTEXT: NOME */}
            {selectedElementId === 'studentName' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Nome
                  </h4>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <FormField label="Horizontal (%)">
                    <input
                      type="number"
                      step="0.5"
                      value={formData.studentNamePosition?.xPercent ?? 0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateElementById('studentName', { xPercent: val });
                      }}
                      className={compactInputClasses}
                    />
                  </FormField>
                  <FormField label="Vertical (%)">
                    <input
                      type="number"
                      step="0.5"
                      value={formData.studentNamePosition?.yPercent ?? 86}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateElementById('studentName', { yPercent: val });
                      }}
                      className={compactInputClasses}
                    />
                  </FormField>
                  <FormField label="Largura (%)">
                    <input
                      type="number"
                      step="0.5"
                      value={formData.studentNamePosition?.widthPercent ?? 100}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateElementById('studentName', { widthPercent: val });
                      }}
                      className={compactInputClasses}
                    />
                  </FormField>
                  <FormField label="Tamanho (px)">
                    <input
                      type="number"
                      value={formData.studentNamePosition?.fontSizePx ?? 24}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 10;
                        const current = formData.studentNamePosition || { xPercent: 0, yPercent: 86, widthPercent: 100, heightPercent: 5, fontSizePx: 24, color: '#ffffff', align: 'center', fontWeight: 'bold' };
                        setFormData({ ...formData, studentNamePosition: { ...current, fontSizePx: val } });
                      }}
                      className={compactInputClasses}
                    />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <FormField label="Cor">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={formData.studentNamePosition?.color || '#ffffff'}
                        onChange={(e) => {
                          const current = formData.studentNamePosition || { xPercent: 0, yPercent: 86, widthPercent: 100, heightPercent: 5, fontSizePx: 24, color: '#ffffff', align: 'center', fontWeight: 'bold' };
                          setFormData({ ...formData, studentNamePosition: { ...current, color: e.target.value } });
                        }}
                        className="w-8 h-8 rounded border border-slate-200 p-0.5 cursor-pointer shrink-0"
                      />
                      <input
                        type="text"
                        value={formData.studentNamePosition?.color || '#ffffff'}
                        onChange={(e) => {
                          const current = formData.studentNamePosition || { xPercent: 0, yPercent: 86, widthPercent: 100, heightPercent: 5, fontSizePx: 24, color: '#ffffff', align: 'center', fontWeight: 'bold' };
                          setFormData({ ...formData, studentNamePosition: { ...current, color: e.target.value } });
                        }}
                        className={compactInputClasses}
                      />
                    </div>
                  </FormField>

                  <FormField label="Alinhamento">
                    <div className="grid grid-cols-3 gap-1">
                      {(['left', 'center', 'right'] as const).map((alignOpt) => (
                        <button
                          key={`student_align_${alignOpt}`}
                          type="button"
                          onClick={() => {
                            const current = formData.studentNamePosition || { xPercent: 0, yPercent: 86, widthPercent: 100, heightPercent: 5, fontSizePx: 24, color: '#ffffff', align: 'center', fontWeight: 'bold' };
                            setFormData({ ...formData, studentNamePosition: { ...current, align: alignOpt } });
                          }}
                          className={`h-8 px-1 text-xs font-medium rounded border transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                            (formData.studentNamePosition?.align || 'center') === alignOpt
                              ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                          title={alignOpt === 'left' ? 'Esquerda' : alignOpt === 'center' ? 'Centro' : 'Direita'}
                        >
                          {alignOpt === 'left' && <AlignLeft className="w-3.5 h-3.5" />}
                          {alignOpt === 'center' && <AlignCenter className="w-3.5 h-3.5" />}
                          {alignOpt === 'right' && <AlignRight className="w-3.5 h-3.5" />}
                        </button>
                      ))}
                    </div>
                  </FormField>
                </div>

                {renderPranchetaAlignmentBlock('studentName')}
              </div>
            )}

            {/* CONTEXT: ANO */}
            {selectedElementId === 'year' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Ano Principal
                  </h4>
                </div>

                <FormField label="Formato">
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, mainYearType: 'text' })}
                      className={`h-8 px-2 text-xs font-medium rounded-md border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                        (formData.mainYearType || 'text') === 'text'
                          ? 'bg-blue-600 text-white border-blue-600 font-semibold shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Type className="w-3.5 h-3.5" />
                      <span>Texto</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, mainYearType: 'image' })}
                      className={`h-8 px-2 text-xs font-medium rounded-md border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                        formData.mainYearType === 'image'
                          ? 'bg-blue-600 text-white border-blue-600 font-semibold shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Imagem PNG</span>
                    </button>
                  </div>
                </FormField>

                {formData.mainYearType === 'image' ? (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                    <label className="text-[11px] font-semibold text-slate-600 block">
                      Imagem PNG do Ano
                    </label>
                    {formData.mainYearImageUrl ? (
                      <div className="space-y-2">
                        <div className="h-12 bg-white rounded border border-slate-200 flex items-center justify-center p-1">
                          <img
                            src={formData.mainYearImageUrl}
                            alt="PNG do Ano"
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <div className="flex gap-2">
                          <label className="flex-1 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded text-center cursor-pointer transition-colors block">
                            <span>Alterar PNG</span>
                            <input
                              type="file"
                              accept="image/png,image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (ev) => {
                                    setFormData({ ...formData, mainYearImageUrl: ev.target?.result as string });
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, mainYearImageUrl: '' })}
                            className="py-1 px-2 text-rose-600 hover:bg-rose-50 text-xs font-medium rounded border border-rose-200 cursor-pointer transition-colors"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-2 p-2 bg-white border border-dashed border-slate-300 rounded-lg hover:border-blue-400 cursor-pointer transition-colors">
                        <Upload className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-medium text-slate-700">Carregar PNG</span>
                        <input
                          type="file"
                          accept="image/png,image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                setFormData({ ...formData, mainYearImageUrl: ev.target?.result as string });
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                    )}
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                  <FormField label="Horizontal (%)">
                    <input
                      type="number"
                      step="0.5"
                      value={formData.yearPosition?.xPercent ?? 82}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateElementById('year', { xPercent: val });
                      }}
                      className={compactInputClasses}
                    />
                  </FormField>
                  <FormField label="Vertical (%)">
                    <input
                      type="number"
                      step="0.5"
                      value={formData.yearPosition?.yPercent ?? 16.5}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateElementById('year', { yPercent: val });
                      }}
                      className={compactInputClasses}
                    />
                  </FormField>
                  <FormField label="Largura (%)">
                    <input
                      type="number"
                      step="0.5"
                      value={formData.yearPosition?.widthPercent ?? 16}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateElementById('year', { widthPercent: val });
                      }}
                      className={compactInputClasses}
                    />
                  </FormField>
                  <FormField label="Altura (%)">
                    <input
                      type="number"
                      step="0.5"
                      value={formData.yearPosition?.heightPercent ?? 3}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateElementById('year', { heightPercent: val });
                      }}
                      className={compactInputClasses}
                    />
                  </FormField>
                </div>

                {formData.mainYearType !== 'image' && (
                  <div className="grid grid-cols-2 gap-2">
                    <FormField label="Tamanho (px)">
                      <input
                        type="number"
                        value={formData.yearPosition?.fontSizePx ?? 14}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 8;
                          const current = formData.yearPosition || { xPercent: 82, yPercent: 16.5, widthPercent: 16, heightPercent: 3, fontSizePx: 14, color: '#ffffff', bgColor: '#1e293b', align: 'center', fontWeight: 'bold' };
                          setFormData({ ...formData, yearPosition: { ...current, fontSizePx: val } });
                        }}
                        className={compactInputClasses}
                      />
                    </FormField>
                    <FormField label="Cor">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={formData.yearPosition?.color || '#ffffff'}
                          onChange={(e) => {
                            const current = formData.yearPosition || { xPercent: 82, yPercent: 16.5, widthPercent: 16, heightPercent: 3, fontSizePx: 14, color: '#ffffff', bgColor: '#1e293b', align: 'center', fontWeight: 'bold' };
                            setFormData({ ...formData, yearPosition: { ...current, color: e.target.value } });
                          }}
                          className="w-8 h-8 rounded border border-slate-200 p-0.5 cursor-pointer shrink-0"
                        />
                        <input
                          type="text"
                          value={formData.yearPosition?.color || '#ffffff'}
                          onChange={(e) => {
                            const current = formData.yearPosition || { xPercent: 82, yPercent: 16.5, widthPercent: 16, heightPercent: 3, fontSizePx: 14, color: '#ffffff', bgColor: '#1e293b', align: 'center', fontWeight: 'bold' };
                            setFormData({ ...formData, yearPosition: { ...current, color: e.target.value } });
                          }}
                          className={compactInputClasses}
                        />
                      </div>
                    </FormField>
                  </div>
                )}

                {renderPranchetaAlignmentBlock('year')}
              </div>
            )}

            {/* CONTEXT: FOTOS SECUNDÁRIAS */}
            {(selectedElementId === 'secondaryDots' || isSecondaryDotSelected) && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Fotos Secundárias
                  </h4>
                  <Badge variant="info">Config {activeConfigIndex}</Badge>
                </div>

                {/* Moldura Secundária */}
                <div className="space-y-2 pt-0.5">
                  <label className="text-[11px] font-semibold text-slate-700 block">
                    Moldura PNG Secundária
                  </label>

                  {formData.secondaryFrameUrl ? (
                    <div className="space-y-2">
                      <div className="relative w-full h-16 bg-slate-100 border border-slate-200 rounded-md overflow-hidden flex items-center justify-center p-1">
                        <img
                          src={formData.secondaryFrameUrl}
                          alt="Prévia da Moldura Secundária"
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer flex-1">
                          <span className="w-full inline-flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-medium px-2 py-1 rounded-md transition-colors">
                            <Upload className="w-3.5 h-3.5" />
                            <span>Substituir</span>
                          </span>
                          <input
                            type="file"
                            accept="image/png,image/*"
                            onChange={(e) => handleFileUpload('secondaryFrameUrl', e)}
                            className="hidden"
                          />
                        </label>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setFormData({ ...formData, secondaryFrameUrl: '' })}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 h-7 text-xs"
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="cursor-pointer block">
                        <div className="border border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/50 rounded-md p-2 flex items-center justify-center gap-2 text-center transition-all cursor-pointer group">
                          <Upload className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
                          <span className="text-xs font-medium text-slate-700">
                            Carregar moldura PNG
                          </span>
                        </div>
                        <input
                          type="file"
                          accept="image/png,image/*"
                          onChange={(e) => handleFileUpload('secondaryFrameUrl', e)}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Tamanho Geral */}
                <FormField label="Tamanho Geral das Fotos">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="4"
                      max="30"
                      step="0.5"
                      value={secondaryDots[0]?.widthPercent ?? 12}
                      onChange={(e) => handleUpdateAllSecondaryDotsSize(parseFloat(e.target.value))}
                      className="flex-1 accent-blue-600 cursor-pointer"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        step="0.5"
                        value={secondaryDots[0]?.widthPercent ?? 12}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            handleUpdateAllSecondaryDotsSize(val);
                          }
                        }}
                        className="w-14 h-8 px-1.5 py-1 text-xs border border-slate-300 rounded text-center font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <span className="text-xs text-slate-500 font-medium">%</span>
                    </div>
                  </div>
                </FormField>

                {/* Seletor de Foto Individual */}
                {secondaryDots.length > 0 && (
                  <div className="space-y-1.5 pt-1.5 border-t border-slate-100">
                    <label className="text-[11px] font-semibold text-slate-600 block">
                      Editar Foto Individual:
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {secondaryDots.map((_, dotIdx) => {
                        const dotElemId = `secondaryDot_${dotIdx}`;
                        const isDotActive = selectedElementId === dotElemId;
                        return (
                          <button
                            key={`btn_dot_${dotIdx}`}
                            type="button"
                            onClick={() => setSelectedElementId(dotElemId)}
                            className={`min-w-[26px] h-6 px-1 text-xs font-medium rounded border transition-colors cursor-pointer flex items-center justify-center ${
                              isDotActive
                                ? 'bg-blue-600 text-white border-blue-600 font-semibold shadow-2xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            #{dotIdx + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Ajuste fino da bolinha individual */}
                {selectedDot && selectedDotIndex !== null && (
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2 mt-1.5">
                    <span className="text-xs font-bold text-slate-800 block">
                      Ajuste: Foto #{selectedDotIndex + 1}
                    </span>

                    <div className="grid grid-cols-2 gap-2">
                      <FormField label="Horizontal (%)">
                        <input
                          type="number"
                          step="0.5"
                          value={selectedDot.xPercent}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            updateElementById(`secondaryDot_${selectedDotIndex}`, { xPercent: val });
                          }}
                          className={compactInputClasses}
                        />
                      </FormField>
                      <FormField label="Vertical (%)">
                        <input
                          type="number"
                          step="0.5"
                          value={selectedDot.yPercent}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            updateElementById(`secondaryDot_${selectedDotIndex}`, { yPercent: val });
                          }}
                          className={compactInputClasses}
                        />
                      </FormField>
                      <FormField label="Largura (%)">
                        <input
                          type="number"
                          step="0.5"
                          value={selectedDot.widthPercent}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            updateElementById(`secondaryDot_${selectedDotIndex}`, { widthPercent: val });
                          }}
                          className={compactInputClasses}
                        />
                      </FormField>
                      <FormField label="Altura (%)">
                        <input
                          type="number"
                          step="0.5"
                          value={selectedDot.heightPercent}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            updateElementById(`secondaryDot_${selectedDotIndex}`, { heightPercent: val });
                          }}
                          className={compactInputClasses}
                        />
                      </FormField>
                    </div>

                    {renderPranchetaAlignmentBlock(`secondaryDot_${selectedDotIndex}`)}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
};
