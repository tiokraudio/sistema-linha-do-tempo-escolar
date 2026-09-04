import React, { useState, useMemo, useRef } from 'react';
import { WorkQueueItem, SchoolConfig } from '../types';
import { hasSavedTimelineComposition } from '../utils/workQueue';
import { A4TimelinePreview, TimelinePhotoItemForPreview } from './A4TimelinePreview';
import {
  captureA4ElementToPng,
  createA4JsPdf,
  addPngPageToA4Pdf,
  saveA4Pdf,
  A4_PRINT_WIDTH_PX,
  A4_PRINT_HEIGHT_PX,
  A4_PRINT_SCALE,
} from '../utils/pdfGenerator';
import JSZip from 'jszip';
import {
  Download,
  FileText,
  Archive,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Alert } from './ui/Alert';

export type DownloadFormat = 'single_pdf' | 'individual_zip';

interface DownloadTimelineModalProps {
  isOpen: boolean;
  selectedItems: WorkQueueItem[];
  allWorkQueueItems: WorkQueueItem[];
  schoolConfig: SchoolConfig;
  activeClassFilter?: string;
  activePeriodFilter?: string;
  onClose: () => void;
}

/**
 * Sanitizes folder names removing invalid filesystem characters
 */
function sanitizeFolderName(str: string): string {
  return str
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || 'Sem_Turma';
}

/**
 * Sanitizes student names for PDF filenames:
 * - Removes accents
 * - Uppercase
 * - Replaces spaces with underscores
 * - Removes invalid characters
 */
function sanitizeStudentName(name: string): string {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9_\- ]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  return normalized || 'ALUNO';
}

/**
 * Generates a collision-safe filename inside a target folder.
 * In case of duplicates in the same folder, appends the enrollment code.
 */
function getZipEntryPath(
  folder: string,
  studentName: string,
  enrollment: string,
  usedPaths: Set<string>
): { folder: string; filename: string } {
  const safeFolder = sanitizeFolderName(folder);
  const cleanName = sanitizeStudentName(studentName);

  let filename = `${cleanName}.pdf`;
  let fullPath = `${safeFolder}/${filename}`;

  if (usedPaths.has(fullPath)) {
    const cleanEnrollment = (enrollment || '000').replace(/[^a-zA-Z0-9_-]/g, '_');
    filename = `${cleanName}_${cleanEnrollment}.pdf`;
    fullPath = `${safeFolder}/${filename}`;

    let counter = 2;
    while (usedPaths.has(fullPath)) {
      filename = `${cleanName}_${cleanEnrollment}_${counter}.pdf`;
      fullPath = `${safeFolder}/${filename}`;
      counter++;
    }
  }

  usedPaths.add(fullPath);
  return { folder: safeFolder, filename };
}

export const DownloadTimelineModal: React.FC<DownloadTimelineModalProps> = ({
  isOpen,
  selectedItems,
  allWorkQueueItems,
  schoolConfig,
  activeClassFilter,
  activePeriodFilter,
  onClose,
}) => {
  // Option 1: PDF único / Option 2: ZIP individual
  const [downloadFormat, setDownloadFormat] = useState<DownloadFormat>('single_pdf');

  // Generation state
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    percent: number;
    stepMessage: string;
    studentName: string;
    studentClass: string;
  }>({
    current: 0,
    total: 0,
    percent: 0,
    stepMessage: '',
    studentName: '',
    studentClass: '',
  });

  const [activeRenderingItem, setActiveRenderingItem] = useState<WorkQueueItem | null>(null);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const cancelRequestedRef = useRef<boolean>(false);

  // Pool of items to process:
  // If items were pre-selected, use selectedItems; otherwise use all available work queue items.
  const targetPool = useMemo(() => {
    return selectedItems.length > 0 ? selectedItems : allWorkQueueItems;
  }, [selectedItems, allWorkQueueItems]);

  // CRITICAL RULE: Filter ONLY students with SAVED timeline compositions (hasSavedTimelineComposition).
  // Regra única e centralizada compartilhada com Produção e Imprimir Conferência.
  const { eligibleItems, unSavedCount } = useMemo(() => {
    const eligible: WorkQueueItem[] = [];
    let unSaved = 0;

    targetPool.forEach((item) => {
      if (hasSavedTimelineComposition(item)) {
        eligible.push(item);
      } else {
        unSaved++;
      }
    });

    // Sort pedagogically then by name
    eligible.sort((a, b) => {
      if (a.pedagogicalPos !== b.pedagogicalPos) {
        return a.pedagogicalPos - b.pedagogicalPos;
      }
      return a.student.name.localeCompare(b.student.name, 'pt-BR');
    });

    return {
      eligibleItems: eligible,
      unSavedCount: unSaved,
    };
  }, [targetPool]);

  if (!isOpen) return null;

  // Single PDF Generator
  const handleGenerateSinglePdf = async () => {
    if (eligibleItems.length === 0) return;

    try {
      setIsGenerating(true);
      setErrorMsg('');
      setSuccessMsg('');
      cancelRequestedRef.current = false;

      const total = eligibleItems.length;
      setProgress({
        current: 0,
        total,
        percent: 0,
        stepMessage: `Preparando ${total} Linha(s) do Tempo...`,
        studentName: eligibleItems[0].student.name,
        studentClass: eligibleItems[0].latestClass,
      });

      const pdf = createA4JsPdf();

      for (let i = 0; i < total; i++) {
        if (cancelRequestedRef.current) {
          setErrorMsg('Download cancelado pelo usuário.');
          setIsGenerating(false);
          setActiveRenderingItem(null);
          return;
        }

        const currentItem = eligibleItems[i];
        setActiveRenderingItem(currentItem);

        const currentNum = i + 1;
        const percent = Math.round((currentNum / total) * 100);

        setProgress({
          current: currentNum,
          total,
          percent,
          stepMessage: `Gerando Linha do Tempo ${currentNum} de ${total}...`,
          studentName: currentItem.student.name,
          studentClass: currentItem.latestClass,
        });

        // Small tick to ensure React DOM updates the offscreen A4 layout
        await new Promise((r) => setTimeout(r, 160));

        const canvasElement = document.getElementById('download-timeline-offscreen-canvas');
        if (!canvasElement) {
          throw new Error('Elemento de renderização A4 não encontrado no DOM.');
        }

        const pngDataUrl = await captureA4ElementToPng('download-timeline-offscreen-canvas');
        addPngPageToA4Pdf(pdf, pngDataUrl, i === 0);
      }

      setProgress((prev) => ({
        ...prev,
        stepMessage: 'Finalizando download...',
        percent: 100,
      }));

      const timestamp = new Date().toISOString().slice(0, 10);
      const referenceClassOrYear =
        activeClassFilter && activeClassFilter !== 'all'
          ? sanitizeFolderName(activeClassFilter)
          : eligibleItems[0]?.latestYear || 'ano';
      const filename = `Linhas_do_Tempo_${referenceClassOrYear}_${timestamp}`;
      saveA4Pdf(pdf, filename);

      setSuccessMsg('Download concluído.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao gerar arquivo PDF.');
    } finally {
      setIsGenerating(false);
      setActiveRenderingItem(null);
    }
  };

  // Individual ZIP Generator
  const handleGenerateIndividualZip = async () => {
    if (eligibleItems.length === 0) return;

    try {
      setIsGenerating(true);
      setErrorMsg('');
      setSuccessMsg('');
      cancelRequestedRef.current = false;

      const total = eligibleItems.length;
      const zip = new JSZip();
      const usedPaths = new Set<string>();

      setProgress({
        current: 0,
        total,
        percent: 0,
        stepMessage: `Preparando ${total} composição(ões)...`,
        studentName: eligibleItems[0].student.name,
        studentClass: eligibleItems[0].latestClass,
      });

      for (let i = 0; i < total; i++) {
        if (cancelRequestedRef.current) {
          setErrorMsg('Download cancelado pelo usuário.');
          setIsGenerating(false);
          setActiveRenderingItem(null);
          return;
        }

        const currentItem = eligibleItems[i];
        setActiveRenderingItem(currentItem);

        const currentNum = i + 1;
        // Keep some headroom (up to 90%) for the zip compression phase
        const percent = Math.round((currentNum / (total + 1)) * 90);

        setProgress({
          current: currentNum,
          total,
          percent,
          stepMessage: `Gerando PDF ${currentNum} de ${total}...`,
          studentName: currentItem.student.name,
          studentClass: currentItem.latestClass,
        });

        // Small tick to allow DOM render of current preview
        await new Promise((r) => setTimeout(r, 160));

        const canvasElement = document.getElementById('download-timeline-offscreen-canvas');
        if (!canvasElement) {
          throw new Error('Elemento de renderização A4 não encontrado no DOM.');
        }

        const pngDataUrl = await captureA4ElementToPng('download-timeline-offscreen-canvas');

        // Create individual 1-page PDF for this student
        const singlePdf = createA4JsPdf();
        addPngPageToA4Pdf(singlePdf, pngDataUrl, true);
        const pdfBlob = singlePdf.output('blob');

        // Organize folder structure
        const targetClass = currentItem.latestClass && currentItem.latestClass !== '—'
          ? currentItem.latestClass
          : 'Sem_Turma';
        const { folder, filename } = getZipEntryPath(
          targetClass,
          currentItem.student.name,
          currentItem.student.enrollment,
          usedPaths
        );

        zip.folder(folder)?.file(filename, pdfBlob);
      }

      // Step: Compressing zip
      setProgress((prev) => ({
        ...prev,
        stepMessage: 'Compactando arquivos...',
        percent: 95,
      }));

      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      // Step: Finalizing download
      setProgress((prev) => ({
        ...prev,
        stepMessage: 'Finalizando download...',
        percent: 100,
      }));

      const timestamp = new Date().toISOString().slice(0, 10);
      const referenceClassOrYear =
        activeClassFilter && activeClassFilter !== 'all'
          ? sanitizeFolderName(activeClassFilter)
          : activePeriodFilter && activePeriodFilter !== 'all'
          ? activePeriodFilter
          : eligibleItems[0]?.latestYear || 'ano';

      const zipFilename = `Linhas_do_Tempo_${referenceClassOrYear}_${timestamp}.zip`;

      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = zipFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccessMsg('Download concluído.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao gerar arquivo ZIP.');
    } finally {
      setIsGenerating(false);
      setActiveRenderingItem(null);
    }
  };

  const handleStartDownload = () => {
    if (downloadFormat === 'single_pdf') {
      handleGenerateSinglePdf();
    } else {
      handleGenerateIndividualZip();
    }
  };

  const activePhotoItems: TimelinePhotoItemForPreview[] = activeRenderingItem?.savedTimeline
    ? (activeRenderingItem.savedTimeline.photoItems || []).map((p) => ({
        year: p.year,
        className: p.className,
        photoUrl: p.photoUrl,
        cropSettings: p.cropSettings,
        isPrimary: p.isPrimary,
      }))
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Baixar Linha do Tempo
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Escolha como deseja baixar as composições selecionadas.
            </p>
          </div>

          {!isGenerating && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
          {/* Status feedback */}
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

          {/* Zero eligible warning */}
          {eligibleItems.length === 0 && !isGenerating && (
            <Alert variant="warning">
              <span>Nenhuma composição salva disponível para download.</span>
            </Alert>
          )}

          {/* Notice for unsaved items ignored */}
          {unSavedCount > 0 && !isGenerating && !successMsg && eligibleItems.length > 0 && (
            <Alert variant="warning">
              <span>
                <strong>{unSavedCount} cadastro(s)</strong> sem composição salva foram desconsiderados. Apenas composições salvas são baixadas.
              </span>
            </Alert>
          )}

          {/* Progress View when Generating */}
          {isGenerating ? (
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5 text-center">
              <Loader2 className="w-7 h-7 text-slate-900 animate-spin mx-auto" />
              
              <div>
                <h3 className="font-bold text-slate-900 text-xs">
                  {progress.stepMessage}
                </h3>
                {progress.studentName && (
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-sm mx-auto">
                    {progress.studentName} {progress.studentClass ? `• ${progress.studentClass}` : ''}
                  </p>
                )}
              </div>

              {/* Real Progress Bar */}
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden max-w-md mx-auto">
                <div
                  className="bg-slate-900 h-2 transition-all duration-200 rounded-full"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold max-w-md mx-auto px-1">
                <span>{progress.percent}%</span>
                <span>
                  {progress.current} / {progress.total}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  cancelRequestedRef.current = true;
                }}
                className="text-xs font-semibold text-rose-600 hover:text-rose-800 cursor-pointer pt-1"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <>
              {/* Format Selection Cards (OPÇÃO 1 e OPÇÃO 2) */}
              <div className="space-y-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Formato de download
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* OPÇÃO 1: PDF Único */}
                  <label
                    onClick={() => setDownloadFormat('single_pdf')}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      downloadFormat === 'single_pdf'
                        ? 'border-slate-900 bg-slate-50/90 ring-1 ring-slate-900'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-lg ${
                            downloadFormat === 'single_pdf' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                          }`}>
                            <FileText className="w-4 h-4" />
                          </div>
                          <strong className="text-xs text-slate-900">
                            PDF único
                          </strong>
                        </div>
                        <input
                          type="radio"
                          name="downloadFormat"
                          value="single_pdf"
                          checked={downloadFormat === 'single_pdf'}
                          onChange={() => setDownloadFormat('single_pdf')}
                          className="w-4 h-4 text-slate-900 focus:ring-slate-500 cursor-pointer"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
                        Baixar todas as composições selecionadas em um único arquivo PDF.
                      </p>
                    </div>
                  </label>

                  {/* OPÇÃO 2: ZIP Individual */}
                  <label
                    onClick={() => setDownloadFormat('individual_zip')}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      downloadFormat === 'individual_zip'
                        ? 'border-slate-900 bg-slate-50/90 ring-1 ring-slate-900'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-lg ${
                            downloadFormat === 'individual_zip' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                          }`}>
                            <Archive className="w-4 h-4" />
                          </div>
                          <strong className="text-xs text-slate-900">
                            ZIP individual
                          </strong>
                        </div>
                        <input
                          type="radio"
                          name="downloadFormat"
                          value="individual_zip"
                          checked={downloadFormat === 'individual_zip'}
                          onChange={() => setDownloadFormat('individual_zip')}
                          className="w-4 h-4 text-slate-900 focus:ring-slate-500 cursor-pointer"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
                        Baixar um PDF individual para cada composição, organizado conforme o filtro selecionado.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Informações da Exportação */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    Composições elegíveis
                  </span>
                  <span className="text-xs font-bold text-slate-900">
                    {eligibleItems.length} {eligibleItems.length === 1 ? 'composição' : 'composições'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">
                      Padrão Gráfico
                    </span>
                    <strong className="text-slate-800 block mt-0.5">
                      A4 Paisagem (300 DPI)
                    </strong>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">
                      Origem dos Dados
                    </span>
                    <strong className="text-slate-800 block mt-0.5">
                      Última Composição Salva
                    </strong>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Hidden offscreen A4 rendering element for high-res 300 DPI native generation */}
        {activeRenderingItem && activeRenderingItem.savedTimeline && (
          <div
            style={{
              position: 'fixed',
              top: '-99999px',
              left: '-99999px',
              width: `${A4_PRINT_WIDTH_PX}px`,
              height: `${A4_PRINT_HEIGHT_PX}px`,
              pointerEvents: 'none',
              zIndex: -9999,
              overflow: 'hidden',
            }}
            aria-hidden="true"
          >
            <div
              id="download-timeline-offscreen-canvas"
              style={{
                width: `${A4_PRINT_WIDTH_PX}px`,
                height: `${A4_PRINT_HEIGHT_PX}px`,
                minWidth: `${A4_PRINT_WIDTH_PX}px`,
                minHeight: `${A4_PRINT_HEIGHT_PX}px`,
                maxWidth: `${A4_PRINT_WIDTH_PX}px`,
                maxHeight: `${A4_PRINT_HEIGHT_PX}px`,
                overflow: 'hidden',
                boxSizing: 'border-box',
                backgroundColor: '#ffffff',
                position: 'relative',
              }}
            >
              <A4TimelinePreview
                studentName={activeRenderingItem.student.name}
                studentEnrollment={activeRenderingItem.student.enrollment}
                model={activeRenderingItem.savedTimeline.modelSnapshot}
                schoolConfig={schoolConfig}
                photoItems={activePhotoItems}
                scale={A4_PRINT_SCALE}
                interactive={false}
                personType={activeRenderingItem.savedTimeline?.personType || activeRenderingItem.student.personType || 'student'}
              />
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isGenerating}
          >
            {successMsg ? 'Concluir' : 'Cancelar'}
          </Button>

          {!successMsg && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={Download}
              onClick={handleStartDownload}
              isLoading={isGenerating}
              disabled={isGenerating || eligibleItems.length === 0}
            >
              {downloadFormat === 'single_pdf'
                ? `Baixar PDF único (${eligibleItems.length})`
                : `Baixar ZIP individual (${eligibleItems.length})`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
