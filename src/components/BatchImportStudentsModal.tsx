import React, { useState, useMemo, useRef } from 'react';
import { Student, AcademicYearRecord, ClassRecord, AcademicPeriod } from '../types';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  ArrowLeft,
  ChevronRight,
  Info,
  Users,
  GraduationCap,
  Calendar,
  Check,
} from 'lucide-react';
import {
  generateImportTemplateXLSX,
  parseXLSXFile,
  validateImportRows,
  RawImportRow,
  ImportPreviewItem,
  BatchImportSummary,
} from '../utils/xlsxImportHelper';
import { Alert } from './ui/Alert';
import { getActiveAcademicYear } from '../utils/academicYears';
import { apiFetch } from '../utils/api';

interface BatchImportStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  periods: AcademicPeriod[];
  classes: ClassRecord[];
  students: Student[];
  records: AcademicYearRecord[];
  onImportSuccess: () => Promise<void>;
}

export const BatchImportStudentsModal: React.FC<BatchImportStudentsModalProps> = ({
  isOpen,
  onClose,
  periods,
  classes,
  students,
  records,
  onImportSuccess,
}) => {
  // Active academic period derived from canonical Configurações -> Ano letivo
  const activeAcademicYear = useMemo(() => {
    return getActiveAcademicYear(periods) || '';
  }, [periods]);

  // Canonical active classes
  const activeClasses = useMemo(() => {
    if (classes && classes.length > 0) {
      return [...classes]
        .filter((c) => c.active !== false)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    return [];
  }, [classes]);

  // Available periods (active periods only)
  const availablePeriods = useMemo(() => {
    const active = periods.filter((p) => p.active !== false);
    if (active.length > 0) {
      return active
        .map((p) => p.name)
        .filter((name) => /^\d{4}$/.test(name))
        .sort((a, b) => Number(b) - Number(a));
    }
    return activeAcademicYear ? [activeAcademicYear] : [];
  }, [periods, activeAcademicYear]);

  // Step state: 1 = File selection & Period, 2 = Preview & Validation, 3 = Result Summary
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Selected period for import
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    const activeYr = getActiveAcademicYear(periods);
    if (activeYr) return activeYr;
    const active = periods.filter((p) => p.active !== false);
    if (active.length > 0) {
      return active[0].name;
    }
    return '';
  });

  // Keep selectedPeriod synced if active academic year changes
  useMemo(() => {
    if (activeAcademicYear && !selectedPeriod) {
      setSelectedPeriod(activeAcademicYear);
    }
  }, [activeAcademicYear, selectedPeriod]);

  // Upload and parsed data state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<RawImportRow[]>([]);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string>('');

  // Preview filtering and pagination
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'errors' | 'new_student' | 'new_record'>('all');
  const [previewSearch, setPreviewSearch] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 15;

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionError, setSubmissionError] = useState<string>('');
  const [importResult, setImportResult] = useState<any>(null);

  // Drag and Drop state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived validation results
  const { items: previewItems, summary } = useMemo(() => {
    if (rawRows.length === 0) {
      return {
        items: [] as ImportPreviewItem[],
        summary: {
          totalRows: 0,
          newStudentsCount: 0,
          newRecordsCount: 0,
          alreadyEnrolledCount: 0,
          errorsCount: 0,
          validCount: 0,
        } as BatchImportSummary,
      };
    }
    return validateImportRows(rawRows, selectedPeriod, activeClasses, students, records);
  }, [rawRows, selectedPeriod, activeClasses, students, records]);

  // Filtered preview items for table display
  const filteredPreviewItems = useMemo(() => {
    return previewItems.filter((item) => {
      // Status filter
      if (previewFilter === 'valid' && !item.isValid) return false;
      if (previewFilter === 'errors' && item.isValid) return false;
      if (previewFilter === 'new_student' && item.status !== 'new_student') return false;
      if (previewFilter === 'new_record' && item.status !== 'new_record') return false;

      // Search filter
      if (previewSearch.trim()) {
        const q = previewSearch.toLowerCase().trim();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesEnrollment = item.enrollment.toLowerCase().includes(q);
        const matchesClass = item.className.toLowerCase().includes(q);
        const matchesMessage = (item.message || '').toLowerCase().includes(q);
        return matchesName || matchesEnrollment || matchesClass || matchesMessage;
      }
      return true;
    });
  }, [previewItems, previewFilter, previewSearch]);

  const totalPages = Math.ceil(filteredPreviewItems.length / itemsPerPage) || 1;
  const paginatedItems = filteredPreviewItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Download template action
  const handleDownloadTemplate = () => {
    generateImportTemplateXLSX(activeClasses);
  };

  // Process selected file
  const handleFileSelect = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setParseError('Formato inválido. Por favor, envie exclusivamente arquivos no formato .XLSX');
      return;
    }

    setSelectedFile(file);
    setIsParsing(true);
    setParseError('');
    setSubmissionError('');

    try {
      const rows = await parseXLSXFile(file);
      setRawRows(rows);
      setStep(2);
      setCurrentPage(1);
      setPreviewFilter('all');
    } catch (err: any) {
      setParseError(err.message || 'Falha ao processar a planilha XLSX.');
      setSelectedFile(null);
    } finally {
      setIsParsing(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // Remove single row from preview
  const handleRemoveRow = (rowIndex: number) => {
    setRawRows((prev) => prev.filter((r) => r.rowIndex !== rowIndex));
  };

  // Remove all error rows from preview
  const handleRemoveAllErrors = () => {
    const errorRowIndices = new Set(
      previewItems.filter((item) => !item.isValid).map((item) => item.rowIndex)
    );
    setRawRows((prev) => prev.filter((r) => !errorRowIndices.has(r.rowIndex)));
    setPreviewFilter('all');
    setCurrentPage(1);
  };

  // Reset to Step 1
  const handleResetFile = () => {
    setSelectedFile(null);
    setRawRows([]);
    setParseError('');
    setSubmissionError('');
    setStep(1);
  };

  // Confirm and execute batch import
  const handleConfirmImport = async () => {
    if (summary.errorsCount > 0) {
      setSubmissionError('Existem linhas com problemas impeditivos. Remova as linhas com erro antes de confirmar.');
      return;
    }

    if (summary.validCount === 0) {
      setSubmissionError('Nenhum registro válido para importar.');
      return;
    }

    // Only send valid rows to backend
    const validRowsToImport = rawRows.filter((row) => {
      const item = previewItems.find((p) => p.rowIndex === row.rowIndex);
      return item && item.isValid;
    });

    setIsSubmitting(true);
    setSubmissionError('');

    try {
      const payload = {
        year: selectedPeriod,
        items: validRowsToImport.map((r) => ({
          enrollment: r.enrollment,
          name: r.name,
          className: r.className,
        })),
      };

      const res = await apiFetch('/api/students/batch-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errMsg = 'Erro na importação em lote.';
        try {
          const errData = await res.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch {
          // not json
        }
        throw new Error(errMsg);
      }

      const result = await res.json();
      setImportResult(result);
      await onImportSuccess();
      setStep(3);
    } catch (err: any) {
      if (
        err?.name === 'TypeError' ||
        err?.message?.includes('Failed to fetch') ||
        err?.message?.includes('NetworkError') ||
        err?.message?.includes('network')
      ) {
        setSubmissionError('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
      } else {
        setSubmissionError(err.message || 'Falha ao processar importação no servidor.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-600/20 text-blue-600 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-lg leading-tight">
                Importação em Lote de Alunos e Matrículas
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Importe uma lista de alunos matriculados no período letivo via planilha .XLSX
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ================================================== */}
          {/* ETAPA 1: SELEÇÃO DE PERÍODO E ARQUIVO */}
          {/* ================================================== */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Informação e Instruções Rápidas */}
              <div className="bg-blue-50 border border-blue-200/80 rounded-2xl p-4 flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-900 space-y-1">
                  <p className="font-bold text-sm">Como funciona a importação:</p>
                  <p>
                    1. Selecione o <strong>período letivo</strong> de destino (ele será aplicado a todas as linhas).
                  </p>
                  <p>
                    2. Baixe o modelo oficial XLSX ou use sua planilha com as colunas: <strong>Matrícula</strong>,{' '}
                    <strong>Nome completo</strong> e <strong>Turma</strong>.
                  </p>
                  <p>
                    3. A matrícula é preservada estritamente como texto (mantendo zeros à esquerda).
                  </p>
                  <p>
                    4. A fotografia fica como <strong>Pendente</strong> para ser adicionada posteriormente.
                  </p>
                </div>
              </div>

              {/* Formulário de Configuração: Período Letivo e Download de Modelo */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                    Período Letivo de Destino *
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <select
                      value={selectedPeriod}
                      onChange={(e) => setSelectedPeriod(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all cursor-pointer"
                    >
                      {availablePeriods.map((period) => (
                        <option key={period} value={period}>
                          Ano Letivo {period}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Todas as linhas da planilha serão vinculadas ao ano letivo {selectedPeriod}.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between space-y-2">
                  <div>
                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                      Modelo Oficial XLSX
                    </label>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Planilha formatada com instruções e lista de turmas ativas ({activeClasses.length} turmas).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="w-full inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-all cursor-pointer active:scale-98"
                  >
                    <Download className="w-4 h-4 text-blue-600" />
                    <span>Baixar modelo XLSX</span>
                  </button>
                </div>
              </div>

              {/* Área de Seleção / Drop do Arquivo */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50/50 scale-[0.99]'
                    : 'border-slate-300 hover:border-blue-400 bg-slate-50/60 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileSelect(e.target.files[0]);
                    }
                  }}
                />
                <div className="w-14 h-14 rounded-2xl bg-blue-100 border border-blue-200 text-blue-600 flex items-center justify-center mb-3 shadow-xs">
                  <Upload className="w-7 h-7" />
                </div>
                <h4 className="font-extrabold text-slate-800 text-base mb-1">
                  Selecione o arquivo XLSX para importar
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mb-4">
                  Arraste e solte o arquivo aqui ou clique para procurar no seu computador.
                </p>
                <span className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md shadow-blue-600/20 transition-all">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Selecionar arquivo XLSX</span>
                </span>
              </div>

              {/* Mensagem de Erro de Leitura */}
              {parseError && (
                <Alert variant="error" title="Erro ao ler arquivo">
                  {parseError}
                </Alert>
              )}

              {/* Loading State durante parsing */}
              {isParsing && (
                <div className="flex items-center justify-center gap-3 p-6 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs font-bold text-slate-700">
                    Processando e validando dados da planilha...
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ================================================== */}
          {/* ETAPA 2: PRÉVIA DA IMPORTAÇÃO E VALIDAÇÕES */}
          {/* ================================================== */}
          {step === 2 && (
            <div className="space-y-5">
              {/* Header da Prévia com Estatísticas */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-extrabold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg mb-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Importação — Ano {selectedPeriod}</span>
                  </div>
                  <h4 className="text-base font-black text-slate-900">
                    {summary.totalRows} registros encontrados no arquivo
                  </h4>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetFile}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-all cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Trocar arquivo</span>
                  </button>

                  {summary.errorsCount > 0 && (
                    <button
                      type="button"
                      onClick={handleRemoveAllErrors}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 hover:text-white hover:bg-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-xl transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remover {summary.errorsCount} problemas</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Cards de Resumo da Análise */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div
                  onClick={() => {
                    setPreviewFilter('all');
                    setCurrentPage(1);
                  }}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    previewFilter === 'all'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                      : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-[11px] font-bold block opacity-80 uppercase tracking-wider">Total</span>
                  <span className="text-xl font-black">{summary.totalRows}</span>
                  <span className="text-[10px] block opacity-70 mt-0.5">linhas na planilha</span>
                </div>

                <div
                  onClick={() => {
                    setPreviewFilter('new_student');
                    setCurrentPage(1);
                  }}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    previewFilter === 'new_student'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                      : 'bg-emerald-50 text-emerald-950 border-emerald-200 hover:bg-emerald-100/70'
                  }`}
                >
                  <span className="text-[11px] font-bold block opacity-80 uppercase tracking-wider">✓ Novos Alunos</span>
                  <span className="text-xl font-black">{summary.newStudentsCount}</span>
                  <span className="text-[10px] block opacity-70 mt-0.5">cadastros novos</span>
                </div>

                <div
                  onClick={() => {
                    setPreviewFilter('new_record');
                    setCurrentPage(1);
                  }}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    previewFilter === 'new_record'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                      : 'bg-blue-50 text-blue-950 border-blue-200 hover:bg-blue-100/70'
                  }`}
                >
                  <span className="text-[11px] font-bold block opacity-80 uppercase tracking-wider">↻ Cadastrados</span>
                  <span className="text-xl font-black">
                    {summary.newRecordsCount + summary.alreadyEnrolledCount}
                  </span>
                  <span className="text-[10px] block opacity-70 mt-0.5">
                    {summary.newRecordsCount} novas matrículas
                  </span>
                </div>

                <div
                  onClick={() => {
                    setPreviewFilter('errors');
                    setCurrentPage(1);
                  }}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    previewFilter === 'errors'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-md'
                      : summary.errorsCount > 0
                      ? 'bg-rose-50 text-rose-950 border-rose-200 hover:bg-rose-100/70'
                      : 'bg-slate-50 text-slate-400 border-slate-200'
                  }`}
                >
                  <span className="text-[11px] font-bold block opacity-80 uppercase tracking-wider">⚠ Problemas</span>
                  <span className="text-xl font-black">{summary.errorsCount}</span>
                  <span className="text-[10px] block opacity-70 mt-0.5">
                    {summary.errorsCount === 0 ? 'tudo pronto' : 'linhas com erro'}
                  </span>
                </div>
              </div>

              {/* Alerta contextual de Erros Impeditivos */}
              {summary.errorsCount > 0 ? (
                <Alert variant="error" title={`Existem ${summary.errorsCount} problema(s) impeditivo(s) no arquivo:`}>
                  <p>
                    Para garantir a integridade do banco de dados, você deve <strong>corrigir o arquivo</strong> ou clicar em{' '}
                    <strong>"Remover problemas"</strong> para importar com segurança apenas as{' '}
                    <strong>{summary.validCount} linhas válidas</strong>.
                  </p>
                </Alert>
              ) : (
                <Alert variant="success">
                  <span>
                    Todos os <strong>{summary.validCount} registros</strong> estão validados e prontos para serem confirmados no ano letivo {selectedPeriod}.
                  </span>
                </Alert>
              )}

              {/* Barra de Filtros e Busca na Prévia */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-1.5 text-xs font-bold bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewFilter('all');
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      previewFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Todos ({summary.totalRows})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewFilter('valid');
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      previewFilter === 'valid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Válidos ({summary.validCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewFilter('errors');
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      previewFilter === 'errors' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Com Problemas ({summary.errorsCount})
                  </button>
                </div>

                <div className="flex-1 max-w-xs">
                  <input
                    type="text"
                    value={previewSearch}
                    onChange={(e) => {
                      setPreviewSearch(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Filtrar por nome, matrícula ou turma..."
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Tabela de Prévia */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs bg-white">
                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase tracking-wider text-[10px] border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-12 text-center">#</th>
                        <th className="py-2.5 px-3 w-28">Matrícula</th>
                        <th className="py-2.5 px-3">Nome completo</th>
                        <th className="py-2.5 px-3 w-36">Turma</th>
                        <th className="py-2.5 px-3 w-32">Situação</th>
                        <th className="py-2.5 px-3">Detalhe / Observação</th>
                        <th className="py-2.5 px-3 w-12 text-center">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedItems.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400 font-bold">
                            Nenhum registro encontrado para o filtro aplicado.
                          </td>
                        </tr>
                      ) : (
                        paginatedItems.map((item) => (
                          <tr
                            key={item.id}
                            className={`hover:bg-slate-50 transition-colors ${
                              !item.isValid ? 'bg-rose-50/40' : ''
                            }`}
                          >
                            <td className="py-2 px-3 text-center text-slate-400 font-bold text-[11px]">
                              {item.rowIndex}
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-slate-900">
                              {item.enrollment}
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-900">
                              {item.name}
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-700">
                              {item.className}
                            </td>
                            <td className="py-2 px-3">
                              {item.status === 'new_student' && (
                                <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 font-extrabold text-[10px] px-2 py-0.5 rounded-full">
                                  <Check className="w-3 h-3" />
                                  <span>Novo</span>
                                </span>
                              )}
                              {item.status === 'new_record' && (
                                <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 font-extrabold text-[10px] px-2 py-0.5 rounded-full">
                                  <RefreshCw className="w-3 h-3" />
                                  <span>Nova matrícula</span>
                                </span>
                              )}
                              {item.status === 'already_enrolled' && (
                                <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 font-extrabold text-[10px] px-2 py-0.5 rounded-full">
                                  <Info className="w-3 h-3" />
                                  <span>Já matriculado</span>
                                </span>
                              )}
                              {item.status === 'error' && (
                                <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 font-extrabold text-[10px] px-2 py-0.5 rounded-full">
                                  <AlertCircle className="w-3 h-3" />
                                  <span>Erro</span>
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-[11px] text-slate-600">
                              <span
                                className={
                                  !item.isValid
                                    ? 'text-rose-700 font-bold'
                                    : 'text-slate-600'
                                }
                              >
                                {item.message}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveRow(item.rowIndex)}
                                title="Descartar esta linha da importação"
                                className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Paginação da Tabela */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs font-semibold text-slate-600">
                    <span>
                      Exibindo {paginatedItems.length} de {filteredPreviewItems.length} registros
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg disabled:opacity-40 cursor-pointer"
                      >
                        Anterior
                      </button>
                      <span className="px-2 py-1">
                        Página {currentPage} de {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg disabled:opacity-40 cursor-pointer"
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Mensagem de Erro no Envio */}
              {submissionError && (
                <Alert variant="error" title="Falha na importação">
                  {submissionError}
                </Alert>
              )}
            </div>
          )}

          {/* ================================================== */}
          {/* ETAPA 3: RESULTADO FINAL DA IMPORTAÇÃO */}
          {/* ================================================== */}
          {step === 3 && (
            <div className="space-y-6 text-center py-6 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div className="space-y-1">
                <h4 className="text-2xl font-black text-slate-900">
                  Importação Concluída com Sucesso!
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Os alunos e suas matrículas foram processados e salvos no período letivo {selectedPeriod}.
                </p>
              </div>

              {/* Grid de Métricas de Sucesso */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                  <span className="text-xs font-bold text-slate-500 block uppercase">Processados</span>
                  <span className="text-2xl font-black text-slate-900">
                    {importResult?.totalProcessed || 0}
                  </span>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl">
                  <span className="text-xs font-bold text-emerald-700 block uppercase">Novos Alunos</span>
                  <span className="text-2xl font-black text-emerald-700">
                    {importResult?.newStudentsCount || 0}
                  </span>
                </div>

                <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl">
                  <span className="text-xs font-bold text-blue-700 block uppercase">Matrículas Confirmadas</span>
                  <span className="text-2xl font-black text-blue-700">
                    {importResult?.newRecordsCount || 0}
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                  <span className="text-xs font-bold text-slate-500 block uppercase">Já Matriculados</span>
                  <span className="text-2xl font-black text-slate-700">
                    {importResult?.alreadyEnrolledCount || 0}
                  </span>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200/80 rounded-2xl p-4 max-w-2xl mx-auto text-left flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-900 space-y-1">
                  <p className="font-bold">Fotografias com status "Pendente":</p>
                  <p>
                    Os alunos já aparecem listados no cadastro geral. Você poderá adicionar a fotografia do ano {selectedPeriod} a qualquer momento acessando a <strong>Ficha do Aluno</strong> ou a <strong>Central de Fotografias</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          {step === 1 && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <div className="text-xs text-slate-500 font-medium">
                Selecione um arquivo .XLSX para continuar
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={isSubmitting || summary.errorsCount > 0 || summary.validCount === 0}
                  className={`inline-flex items-center gap-2 font-bold text-xs px-6 py-2.5 rounded-xl shadow-md transition-all cursor-pointer active:scale-95 ${
                    summary.errorsCount > 0 || summary.validCount === 0
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Gravando importação...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirmar importação ({summary.validCount} registros)</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-8 py-2.5 rounded-xl shadow-md shadow-blue-600/30 transition-all cursor-pointer active:scale-95"
              >
                Concluir
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
