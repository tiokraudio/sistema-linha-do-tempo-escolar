import React, { useState, useMemo, useRef } from 'react';
import { WorkQueueItem, SchoolConfig, LayoutModel } from '../types';
import { hasSavedTimelineComposition } from '../utils/workQueue';
import { A4TimelinePreview, TimelinePhotoItemForPreview } from './A4TimelinePreview';
import { A4PrintHeader, A4PrintFooter } from './A4PrintHeaderFooter';
import {
  captureA4ElementToPng,
  createA4JsPdf,
  addPngPageToA4Pdf,
  saveA4Pdf,
} from '../utils/pdfGenerator';
import {
  Printer,
  X,
  Loader2,
  Search,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Alert } from './ui/Alert';
import { inputClasses, selectClasses } from './ui/FormField';

export type ItemsPerPage = 2 | 4 | 6 | 8 | 10;

interface LayoutConfig {
  columns: number;
  rows: number;
  gap: string;
  cardPadding: string;
  headerFontSize: string;
  subHeaderFontSize: string;
  previewWidth: number;
  previewHeight: number;
  scale: number;
}

const LAYOUT_CONFIGS: Record<ItemsPerPage, LayoutConfig> = {
  2: {
    columns: 1,
    rows: 2,
    gap: '12px',
    cardPadding: '6px',
    headerFontSize: '11px',
    subHeaderFontSize: '9.5px',
    previewWidth: 278,
    previewHeight: 393,
    scale: 0.35,
  },
  4: {
    columns: 2,
    rows: 2,
    gap: '10px',
    cardPadding: '6px',
    headerFontSize: '10px',
    subHeaderFontSize: '9px',
    previewWidth: 278,
    previewHeight: 393,
    scale: 0.35,
  },
  6: {
    columns: 2,
    rows: 3,
    gap: '8px',
    cardPadding: '5px',
    headerFontSize: '9.5px',
    subHeaderFontSize: '8.5px',
    previewWidth: 179,
    previewHeight: 253,
    scale: 0.225,
  },
  8: {
    columns: 2,
    rows: 4,
    gap: '6px',
    cardPadding: '4px',
    headerFontSize: '9px',
    subHeaderFontSize: '8px',
    previewWidth: 131,
    previewHeight: 185,
    scale: 0.165,
  },
  10: {
    columns: 2,
    rows: 5,
    gap: '5px',
    cardPadding: '3px',
    headerFontSize: '8.5px',
    subHeaderFontSize: '7.5px',
    previewWidth: 103,
    previewHeight: 146,
    scale: 0.13,
  },
};

interface ReviewSheetPrintModalProps {
  isOpen: boolean;
  selectedItems: WorkQueueItem[];
  allWorkQueueItems: WorkQueueItem[];
  schoolConfig: SchoolConfig;
  defaultModel?: LayoutModel | null;
  activePeriodFilter?: string;
  activeClassFilter?: string;
  onClose: () => void;
}

export const ReviewSheetPrintModal: React.FC<ReviewSheetPrintModalProps> = ({
  isOpen,
  selectedItems,
  allWorkQueueItems,
  schoolConfig,
  defaultModel,
  activePeriodFilter,
  activeClassFilter,
  onClose,
}) => {
  // Configurable items per sheet (2, 4, 6, 8, 10 - default 4 preserves previous behavior)
  const [itemsPerPage, setItemsPerPage] = useState<ItemsPerPage>(4);

  // Only items with saved timeline are eligible for review printing (Regra única centralizada)
  const savedCompositionsPool = useMemo(() => {
    return allWorkQueueItems.filter((item) => hasSavedTimelineComposition(item));
  }, [allWorkQueueItems]);

  // Initialize selection with saved compositions from pre-selected items, or all saved if none selected
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>(() => {
    const preSelectedSaved = selectedItems.filter((item) => hasSavedTimelineComposition(item));
    if (preSelectedSaved.length > 0) {
      return preSelectedSaved.map((item) => item.student.id);
    }
    return savedCompositionsPool.map((item) => item.student.id);
  });

  // Filter and Search states
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [classFilter, setClassFilter] = useState<string>(
    activeClassFilter && activeClassFilter !== 'all' ? activeClassFilter : 'all'
  );

  // Generation state
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [progress, setProgress] = useState<{
    currentPage: number;
    totalPages: number;
    currentBatchNames: string[];
    percent: number;
  }>({
    currentPage: 0,
    totalPages: 0,
    currentBatchNames: [],
    percent: 0,
  });

  const [activePageItems, setActivePageItems] = useState<WorkQueueItem[]>([]);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const cancelRequestedRef = useRef<boolean>(false);

  // Available classes for filter dropdown
  const availableClasses = useMemo(() => {
    const classesSet = new Set<string>();
    savedCompositionsPool.forEach((item) => {
      if (item.latestClass && item.latestClass !== '—') {
        classesSet.add(item.latestClass);
      }
    });
    return Array.from(classesSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [savedCompositionsPool]);

  // Filtered pool based on user search & class filter
  const filteredSavedItems = useMemo(() => {
    return savedCompositionsPool.filter((item) => {
      if (classFilter !== 'all' && item.latestClass !== classFilter) {
        return false;
      }
      if (searchTerm.trim() !== '') {
        const query = searchTerm.toLowerCase().trim();
        const matchesName = item.student.name.toLowerCase().includes(query);
        const matchesEnrollment = item.student.enrollment.toLowerCase().includes(query);
        const matchesClass = item.latestClass.toLowerCase().includes(query);
        if (!matchesName && !matchesEnrollment && !matchesClass) return false;
      }
      return true;
    });
  }, [savedCompositionsPool, classFilter, searchTerm]);

  // Final selected items ready for PDF generation
  const selectedEligibleItems = useMemo(() => {
    const selectedSet = new Set(selectedStudentIds);
    return savedCompositionsPool
      .filter((item) => selectedSet.has(item.student.id))
      .sort((a, b) => {
        if (a.pedagogicalPos !== b.pedagogicalPos) {
          return a.pedagogicalPos - b.pedagogicalPos;
        }
        return a.student.name.localeCompare(b.student.name, 'pt-BR');
      });
  }, [savedCompositionsPool, selectedStudentIds]);

  const totalPages = Math.max(1, Math.ceil(selectedEligibleItems.length / itemsPerPage));

  // Ineligible notice if pre-selected items contained unsaved students
  const unSavedPreselectedCount = useMemo(() => {
    return selectedItems.filter((item) => !item.savedTimeline).length;
  }, [selectedItems]);

  if (!isOpen) return null;

  const handleToggleStudent = (studentId: string) => {
    if (isGenerating) return;
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const handleSelectAllFiltered = () => {
    if (isGenerating) return;
    const filteredIds = filteredSavedItems.map((item) => item.student.id);
    setSelectedStudentIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
  };

  const handleDeselectAllFiltered = () => {
    if (isGenerating) return;
    const filteredIdsSet = new Set(filteredSavedItems.map((item) => item.student.id));
    setSelectedStudentIds((prev) => prev.filter((id) => !filteredIdsSet.has(id)));
  };

  const handleStartReviewGeneration = async () => {
    if (selectedEligibleItems.length === 0) {
      setErrorMsg('Nenhuma composição salva disponível para impressão.');
      return;
    }

    try {
      setIsGenerating(true);
      setErrorMsg('');
      setSuccessMsg('');
      cancelRequestedRef.current = false;

      const totalItems = selectedEligibleItems.length;
      const pagesCount = Math.ceil(totalItems / itemsPerPage);

      setProgress({
        currentPage: 0,
        totalPages: pagesCount,
        currentBatchNames: [],
        percent: 0,
      });

      const pdf = createA4JsPdf();

      for (let p = 0; p < pagesCount; p++) {
        if (cancelRequestedRef.current) {
          setErrorMsg('Geração do relatório cancelada.');
          setIsGenerating(false);
          setActivePageItems([]);
          return;
        }

        const pageSlice = selectedEligibleItems.slice(p * itemsPerPage, p * itemsPerPage + itemsPerPage);
        setActivePageItems(pageSlice);

        setProgress({
          currentPage: p + 1,
          totalPages: pagesCount,
          currentBatchNames: pageSlice.map((i) => i.student.name),
          percent: Math.round(((p + 1) / pagesCount) * 100),
        });

        await new Promise((r) => setTimeout(r, 220));

        const containerElement = document.getElementById('review-sheet-offscreen-a4-page');
        if (!containerElement) {
          throw new Error('Elemento da folha de conferência não encontrado no DOM.');
        }

        const pngDataUrl = await captureA4ElementToPng('review-sheet-offscreen-a4-page');
        addPngPageToA4Pdf(pdf, pngDataUrl, p === 0);
      }

      const timestamp = new Date().toISOString().slice(0, 10);
      const referenceYear = selectedEligibleItems[0]?.latestYear || 'ano';
      const filename = `folha_conferencia_${itemsPerPage}porfolha_${referenceYear}_${timestamp}`;
      saveA4Pdf(pdf, filename);

      setSuccessMsg(
        `Folhas de conferência geradas com sucesso (${pagesCount} folha(s) A4 com ${totalItems} composições).`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao gerar folhas de conferência em PDF.');
    } finally {
      setIsGenerating(false);
      setActivePageItems([]);
    }
  };

  // Derived period and class for current sheet A4 header
  const currentSheetPeriodName = useMemo(() => {
    return (
      activePeriodFilter ||
      activePageItems[0]?.latestYear ||
      savedCompositionsPool[0]?.latestYear ||
      ''
    );
  }, [activePeriodFilter, activePageItems, savedCompositionsPool]);

  const currentSheetClassName = useMemo(() => {
    if (classFilter !== 'all') return classFilter;
    const classesOnPage = Array.from(
      new Set(
        activePageItems
          .map((i) => i.latestClass)
          .filter((c) => Boolean(c) && c !== '—')
      )
    );
    return classesOnPage.length === 1 ? classesOnPage[0] : undefined;
  }, [classFilter, activePageItems]);

  const layout = LAYOUT_CONFIGS[itemsPerPage];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Imprimir conferência
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Escolha a quantidade por folha e gere o PDF de conferência das composições salvas.
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
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
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

          {savedCompositionsPool.length === 0 && (
            <Alert variant="warning">
              <span>
                Nenhuma composição salva disponível para impressão.
              </span>
            </Alert>
          )}

          {unSavedPreselectedCount > 0 && !isGenerating && !successMsg && savedCompositionsPool.length > 0 && (
            <Alert variant="warning">
              <span>
                <strong>{unSavedPreselectedCount} registro(s)</strong> sem composição salva foram desconsiderados.
              </span>
            </Alert>
          )}

          {/* Progress View when Generating */}
          {isGenerating ? (
            <div className="p-8 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-center">
              <Loader2 className="w-8 h-8 text-slate-900 animate-spin mx-auto" />
              <div>
                <h3 className="font-bold text-slate-900 text-xs">
                  Renderizando folha A4 {progress.currentPage} de {progress.totalPages}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5 max-w-md mx-auto truncate">
                  {progress.currentBatchNames.join(' • ')}
                </p>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden max-w-sm mx-auto">
                <div
                  className="bg-slate-900 h-2 transition-all duration-200 rounded-full"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold max-w-sm mx-auto px-1">
                <span>{progress.percent}%</span>
                <span>{progress.currentPage} / {progress.totalPages} folhas</span>
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
              {/* Option Selector: Quantidade por folha */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <div className="font-bold text-slate-900 text-xs">
                  Quantidade por folha:
                </div>
                <div className="flex flex-wrap items-center gap-4 pt-0.5">
                  {([2, 4, 6, 8, 10] as ItemsPerPage[]).map((qty) => (
                    <label
                      key={qty}
                      className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-700 hover:text-slate-900"
                    >
                      <input
                        type="radio"
                        name="itemsPerPage"
                        value={qty}
                        checked={itemsPerPage === qty}
                        onChange={() => setItemsPerPage(qty)}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <span>{qty} por folha</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Filter & Selection Bar */}
              <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* Search Input */}
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Buscar por nome ou matrícula..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className={`${inputClasses} pl-8.5 py-1.5 text-xs`}
                    />
                  </div>

                  {/* Class Filter */}
                  <select
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className={`${selectClasses} py-1.5 text-xs w-auto`}
                  >
                    <option value="all">Todas as turmas</option>
                    {availableClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        {cls}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Bulk Check Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleSelectAllFiltered}
                    >
                      Marcar visíveis
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleDeselectAllFiltered}
                    >
                      Desmarcar visíveis
                    </Button>
                  </div>

                  <div className="text-slate-600 font-semibold text-xs">
                    <span className="text-slate-900 font-bold">{selectedEligibleItems.length}</span> de{' '}
                    <span>{savedCompositionsPool.length}</span> selecionados{' '}
                    <span className="text-slate-400 font-normal">
                      ({totalPages} {totalPages === 1 ? 'folha' : 'folhas'})
                    </span>
                  </div>
                </div>
              </div>

              {/* Student List */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[34vh] overflow-y-auto">
                {filteredSavedItems.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 space-y-1">
                    <p className="font-bold text-xs text-slate-600">Nenhuma composição salva encontrada.</p>
                    <p className="text-[11px]">Verifique os filtros ou salve composições na Produção.</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 sticky top-0 z-10 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 w-8 text-center">
                          <input
                            type="checkbox"
                            checked={
                              filteredSavedItems.length > 0 &&
                              filteredSavedItems.every((item) =>
                                selectedStudentIds.includes(item.student.id)
                              )
                            }
                            onChange={(e) => {
                              if (e.target.checked) handleSelectAllFiltered();
                              else handleDeselectAllFiltered();
                            }}
                            className="w-3.5 h-3.5 rounded text-slate-900 focus:ring-slate-500 cursor-pointer"
                          />
                        </th>
                        <th className="py-2.5 px-3">Nome / Cadastro</th>
                        <th className="py-2.5 px-3">Turma</th>
                        <th className="py-2.5 px-3">Ano</th>
                        <th className="py-2.5 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredSavedItems.map((item) => {
                        const isChecked = selectedStudentIds.includes(item.student.id);
                        return (
                          <tr
                            key={item.student.id}
                            onClick={() => handleToggleStudent(item.student.id)}
                            className={`cursor-pointer transition-colors ${
                              isChecked ? 'bg-slate-50/90' : 'hover:bg-slate-50/50'
                            }`}
                          >
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleStudent(item.student.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-3.5 h-3.5 rounded text-slate-900 focus:ring-slate-500 cursor-pointer"
                              />
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900">
                              {item.student.name}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {item.latestClass}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {item.latestYear}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <Badge variant="success">Salva</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>

        {/* Hidden offscreen A4 Portrait Layout Container (794x1123 px standard grid configured by itemsPerPage) */}
        {activePageItems.length > 0 && (
          <div
            style={{
              position: 'fixed',
              top: '-9999px',
              left: '-9999px',
              width: '794px',
              height: '1123px',
              pointerEvents: 'none',
              zIndex: -99,
              overflow: 'hidden',
            }}
          >
            <div
              id="review-sheet-offscreen-a4-page"
              style={{
                width: '794px',
                height: '1123px',
                maxHeight: '1123px',
                backgroundColor: '#ffffff',
                boxSizing: 'border-box',
                padding: '36px 40px 32px 40px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                overflow: 'hidden',
              }}
              className="flex flex-col justify-between h-full box-border bg-white text-slate-900 font-sans"
            >
              {/* Header Padronizado */}
              <A4PrintHeader
                schoolConfig={schoolConfig}
                title="FOLHA DE CONFERÊNCIA"
                subtitle="CONFERÊNCIA DE COMPOSIÇÕES SALVAS DA LINHA DO TEMPO"
                periodName={currentSheetPeriodName}
                className={currentSheetClassName}
                pageIndex={progress.currentPage - 1}
                totalPages={progress.totalPages}
              />

              {/* Dynamic Grid Container - Área Útil da Grade */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
                  gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
                  gap: layout.gap,
                  flex: 1,
                  paddingTop: '10px',
                  paddingBottom: '10px',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                }}
              >
                {Array.from({ length: itemsPerPage }).map((_, slotIdx) => {
                  const item = activePageItems[slotIdx];
                  if (!item) {
                    return (
                      <div
                        key={`empty-slot-${slotIdx}`}
                        style={{
                          border: '1px dashed #cbd5e1',
                          borderRadius: '8px',
                          backgroundColor: '#f8fafc',
                          boxSizing: 'border-box',
                        }}
                      />
                    );
                  }

                  const modelToUse = item.savedTimeline?.modelSnapshot || defaultModel;
                  const photoItems: TimelinePhotoItemForPreview[] = item.savedTimeline
                    ? (item.savedTimeline.photoItems || []).map((p) => ({
                        year: p.year,
                        className: p.className,
                        photoUrl: p.photoUrl,
                        cropSettings: p.cropSettings,
                        isPrimary: p.isPrimary,
                      }))
                    : [];

                  return (
                    <div
                      key={`slot-${slotIdx}-${item.student.id}`}
                      style={{
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        padding: layout.cardPadding,
                        backgroundColor: '#ffffff',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        overflow: 'hidden',
                        boxSizing: 'border-box',
                        width: '100%',
                        height: '100%',
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderBottom: '1px solid #e2e8f0',
                          paddingBottom: '2px',
                          marginBottom: '2px',
                          fontSize: layout.headerFontSize,
                          fontWeight: 800,
                          color: '#1e293b',
                          boxSizing: 'border-box',
                          lineHeight: 1.2,
                        }}
                      >
                        <span
                          style={{
                            textTransform: 'uppercase',
                            color: '#0f172a',
                            fontWeight: 900,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '65%',
                          }}
                        >
                          {item.student.name}
                        </span>
                        <span
                          style={{
                            color: '#64748b',
                            fontSize: layout.subHeaderFontSize,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.latestClass} ({item.latestYear})
                        </span>
                      </div>

                      {modelToUse && (
                        <div
                          style={{
                            width: `${layout.previewWidth}px`,
                            height: `${layout.previewHeight}px`,
                            overflow: 'hidden',
                            position: 'relative',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'flex-start',
                            margin: '0 auto',
                            boxSizing: 'border-box',
                          }}
                        >
                          <A4TimelinePreview
                            id={`review-slot-${slotIdx}-${item.student.id}`}
                            studentName={item.student.name}
                            studentEnrollment={item.student.enrollment}
                            model={modelToUse}
                            schoolConfig={schoolConfig}
                            photoItems={photoItems}
                            scale={layout.scale}
                            interactive={false}
                            personType={item.savedTimeline?.personType || item.student.personType || 'student'}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Rodapé Padronizado */}
              <A4PrintFooter
                systemLabel="Sistema Linha do Tempo Escolar — Folha de Conferência"
                itemsCount={activePageItems.length}
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
              icon={Printer}
              onClick={handleStartReviewGeneration}
              isLoading={isGenerating}
              disabled={isGenerating || selectedEligibleItems.length === 0}
            >
              {`Imprimir (${selectedEligibleItems.length} selecionados)`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
