import React, { useState, useMemo, useRef } from 'react';
import { Student } from '../types';
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
  Briefcase,
  Check,
} from 'lucide-react';
import {
  generateCollaboratorImportTemplateXLSX,
  parseCollaboratorXLSXFile,
  validateCollaboratorImportRows,
  RawCollaboratorImportRow,
  CollaboratorImportPreviewItem,
  CollaboratorBatchImportSummary,
} from '../utils/xlsxCollaboratorImportHelper';
import { Alert } from './ui/Alert';
import { apiFetch } from '../utils/api';

interface BatchImportCollaboratorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  onImportSuccess: () => Promise<void>;
}

export const BatchImportCollaboratorsModal: React.FC<BatchImportCollaboratorsModalProps> = ({
  isOpen,
  onClose,
  students,
  onImportSuccess,
}) => {
  // Step state: 1 = File selection, 2 = Preview & Validation, 3 = Result Summary
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Upload and parsed data state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<RawCollaboratorImportRow[]>([]);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string>('');

  // Preview filtering and pagination
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'already_exists' | 'errors'>('all');
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
        items: [] as CollaboratorImportPreviewItem[],
        summary: {
          totalRows: 0,
          newCollaboratorsCount: 0,
          alreadyExistsCount: 0,
          errorsCount: 0,
          validCount: 0,
        } as CollaboratorBatchImportSummary,
      };
    }
    return validateCollaboratorImportRows(rawRows, students);
  }, [rawRows, students]);

  // Filtered preview items for table display
  const filteredPreviewItems = useMemo(() => {
    return previewItems.filter((item) => {
      // Status filter
      if (previewFilter === 'valid' && item.status !== 'new_collaborator') return false;
      if (previewFilter === 'already_exists' && item.status !== 'already_exists') return false;
      if (previewFilter === 'errors' && item.status !== 'error') return false;

      // Search filter
      if (previewSearch.trim()) {
        const q = previewSearch.toLowerCase().trim();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesEnrollment = item.enrollment.toLowerCase().includes(q);
        const matchesMessage = (item.message || '').toLowerCase().includes(q);
        return matchesName || matchesEnrollment || matchesMessage;
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
    generateCollaboratorImportTemplateXLSX();
  };

  // Process selected file
  const handleFileSelect = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
      setParseError('Formato inválido. Por favor, envie exclusivamente arquivos no formato .XLSX ou .XLS');
      return;
    }

    setSelectedFile(file);
    setIsParsing(true);
    setParseError('');
    setSubmissionError('');

    try {
      const rows = await parseCollaboratorXLSXFile(file);
      setRawRows(rows);
      setStep(2);
      setCurrentPage(1);
      setPreviewFilter('all');
    } catch (err: any) {
      setParseError(err.message || 'Falha ao processar a planilha XLSX de colaboradores.');
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
      previewItems.filter((item) => item.status === 'error').map((item) => item.rowIndex)
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
      setSubmissionError('Existem linhas com erros no arquivo. Remova as linhas com erro antes de confirmar a importação.');
      return;
    }

    if (summary.newCollaboratorsCount === 0) {
      setSubmissionError('Nenhum novo colaborador para cadastrar. Todas as linhas já estão cadastradas ou inválidas.');
      return;
    }

    // Apenas enviar as linhas válidas de novos colaboradores
    const validRowsToImport = rawRows.filter((row) => {
      const item = previewItems.find((p) => p.rowIndex === row.rowIndex);
      return item && item.status === 'new_collaborator';
    });

    setIsSubmitting(true);
    setSubmissionError('');

    try {
      const payload = {
        items: validRowsToImport.map((r) => ({
          enrollment: r.enrollment,
          name: r.name,
        })),
      };

      const res = await apiFetch('/api/collaborators/batch-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errMsg = 'Erro na importação em lote de colaboradores.';
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
        err?.message?.includes('network') ||
        err?.message?.includes('conectar ao servidor')
      ) {
        setSubmissionError('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
      } else {
        setSubmissionError(err.message || 'Falha ao processar a importação no servidor.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="batch_import_collaborators_modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 shrink-0">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
                Importar Colaboradores em Lote
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  Planilha XLSX
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Cadastre múltiplos colaboradores no sistema a partir de um arquivo Excel.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSubmitting || isParsing}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors disabled:opacity-50"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Progress Bar */}
        <div className="px-6 py-3 bg-white border-b border-slate-100 flex items-center justify-center gap-2 sm:gap-6 text-xs shrink-0">
          <div className={`flex items-center gap-1.5 ${step === 1 ? 'font-bold text-blue-600' : step > 1 ? 'font-medium text-emerald-600' : 'text-slate-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 1 ? 'bg-blue-600 text-white' : step > 1 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
              {step > 1 ? <Check className="w-3 h-3" /> : '1'}
            </span>
            <span>Arquivo XLSX</span>
          </div>

          <ChevronRight className="w-4 h-4 text-slate-300" />

          <div className={`flex items-center gap-1.5 ${step === 2 ? 'font-bold text-blue-600' : step > 2 ? 'font-medium text-emerald-600' : 'text-slate-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 2 ? 'bg-blue-600 text-white' : step > 2 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
              {step > 2 ? <Check className="w-3 h-3" /> : '2'}
            </span>
            <span>Validação & Prévia</span>
          </div>

          <ChevronRight className="w-4 h-4 text-slate-300" />

          <div className={`flex items-center gap-1.5 ${step === 3 ? 'font-bold text-emerald-600' : 'text-slate-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 3 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
              3
            </span>
            <span>Conclusão</span>
          </div>
        </div>

        {/* Modal Body Container */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          
          {/* ========================================================================= */}
          {/* STEP 1: FILE SELECTION & TEMPLATE DOWNLOAD */}
          {/* ========================================================================= */}
          {step === 1 && (
            <div className="space-y-6 max-w-3xl mx-auto">
              {parseError && (
                <Alert
                  variant="danger"
                  title="Erro ao ler o arquivo"
                  message={parseError}
                  icon={AlertCircle}
                />
              )}

              {/* Action Card: Download Template */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0 mt-0.5">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">
                      Baixar Planilha Modelo de Colaboradores
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Utilize o modelo oficial com as colunas formatadas (Matrícula/Código e Nome completo) para garantir uma importação segura.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 shrink-0 shadow-2xs"
                >
                  <Download className="w-4 h-4 text-slate-600" />
                  <span>Baixar modelo XLSX</span>
                </button>
              </div>

              {/* Upload Drag & Drop Box */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50/60 scale-[0.99]'
                    : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/20 shadow-2xs'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileSelect(e.target.files[0]);
                    }
                  }}
                />

                <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mx-auto mb-3 shadow-inner">
                  {isParsing ? (
                    <RefreshCw className="w-7 h-7 animate-spin" />
                  ) : (
                    <Upload className="w-7 h-7" />
                  )}
                </div>

                <h4 className="text-sm sm:text-base font-bold text-slate-800">
                  {isParsing ? 'Processando planilha...' : 'Clique para selecionar ou arraste o arquivo XLSX aqui'}
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Formatos aceitos: <strong>.XLSX</strong> ou <strong>.XLS</strong>. O sistema processará automaticamente os colaboradores.
                </p>
              </div>

              {/* Instructions Callout */}
              <div className="bg-blue-50/60 rounded-xl p-4 border border-blue-100 text-xs text-blue-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-blue-800">
                  <Info className="w-4 h-4 text-blue-600" />
                  <span>Diretrizes para o Cadastro de Colaboradores</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-600 ml-1">
                  <li>
                    <strong>Identificador / Matrícula:</strong> Tratado estritamente como texto, preservando zeros à esquerda (ex: <code className="text-blue-700 bg-blue-100/50 px-1 py-0.5 rounded">000101</code>).
                  </li>
                  <li>
                    <strong>Nome Completo:</strong> Nome do colaborador que será exibido no sistema e nos relatórios.
                  </li>
                  <li>
                    <strong>Sem Turma ou Cargo:</strong> Colaboradores não utilizam turma, cargo/função ou progressão pedagógica.
                  </li>
                  <li>
                    <strong>Duplicidade:</strong> Colaboradores que já possuem a mesma matrícula/código cadastrada serão identificados e não serão duplicados.
                  </li>
                  <li>
                    <strong>Períodos Letivos e Fotografias:</strong> A importação cadastra a pessoa. O registro nos períodos letivos e a inclusão de fotos continuam sendo feitos normalmente em "Registrar Período".
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 2: PREVIEW & VALIDATION */}
          {/* ========================================================================= */}
          {step === 2 && (
            <div className="space-y-4">
              
              {submissionError && (
                <Alert
                  variant="danger"
                  title="Atenção"
                  message={submissionError}
                  icon={AlertTriangle}
                />
              )}

              {/* Summary Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Total na Planilha
                  </div>
                  <div className="text-xl font-bold text-slate-800 mt-0.5">
                    {summary.totalRows}
                  </div>
                </div>

                <div className="bg-emerald-50/60 p-3.5 rounded-xl border border-emerald-200 shadow-2xs">
                  <div className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Novos Colaboradores
                  </div>
                  <div className="text-xl font-bold text-emerald-700 mt-0.5">
                    {summary.newCollaboratorsCount}
                  </div>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                    <Info className="w-3.5 h-3.5 text-slate-500" />
                    Já Cadastrados
                  </div>
                  <div className="text-xl font-bold text-slate-700 mt-0.5">
                    {summary.alreadyExistsCount}
                  </div>
                </div>

                <div className={`p-3.5 rounded-xl border shadow-2xs ${summary.errorsCount > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className={`text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1 ${summary.errorsCount > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
                    <AlertCircle className="w-3.5 h-3.5" />
                    Linhas com Erro
                  </div>
                  <div className={`text-xl font-bold mt-0.5 ${summary.errorsCount > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                    {summary.errorsCount}
                  </div>
                </div>
              </div>

              {/* Table Controls & Filter Bar */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                {/* Status Filter Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewFilter('all');
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                      previewFilter === 'all'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
                    className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                      previewFilter === 'valid'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Novos ({summary.newCollaboratorsCount})
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPreviewFilter('already_exists');
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                      previewFilter === 'already_exists'
                        ? 'bg-slate-700 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Já cadastrados ({summary.alreadyExistsCount})
                  </button>

                  {summary.errorsCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewFilter('errors');
                        setCurrentPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                        previewFilter === 'errors'
                          ? 'bg-rose-600 text-white shadow-2xs'
                          : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                      }`}
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                      Erros ({summary.errorsCount})
                    </button>
                  )}
                </div>

                {/* Search & Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="text"
                    value={previewSearch}
                    onChange={(e) => {
                      setPreviewSearch(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Filtrar por nome ou código..."
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-full sm:w-48"
                  />

                  {summary.errorsCount > 0 && (
                    <button
                      type="button"
                      onClick={handleRemoveAllErrors}
                      className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shrink-0 shadow-2xs"
                      title="Excluir todas as linhas que apresentam erros"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remover erros</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Preview Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2.5 w-12 text-center">Linha</th>
                        <th className="px-4 py-2.5 w-36">Código / Matrícula</th>
                        <th className="px-4 py-2.5">Nome completo</th>
                        <th className="px-4 py-2.5 w-36">Status</th>
                        <th className="px-4 py-2.5">Mensagem / Observação</th>
                        <th className="px-3 py-2.5 w-12 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                            Nenhum registro encontrado para os filtros selecionados.
                          </td>
                        </tr>
                      ) : (
                        paginatedItems.map((item) => (
                          <tr
                            key={item.id}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              item.status === 'error'
                                ? 'bg-rose-50/30'
                                : item.status === 'already_exists'
                                ? 'bg-slate-50/40 text-slate-500'
                                : ''
                            }`}
                          >
                            <td className="px-3 py-2.5 text-center font-mono text-slate-400">
                              {item.rowIndex}
                            </td>
                            <td className="px-4 py-2.5 font-mono font-medium text-slate-800">
                              {item.enrollment}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-slate-800">
                              {item.name}
                            </td>
                            <td className="px-4 py-2.5">
                              {item.status === 'new_collaborator' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Novo
                                </span>
                              ) : item.status === 'already_exists' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                  Já cadastrado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                                  <AlertCircle className="w-3 h-3" />
                                  Erro
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-slate-500">
                              {item.message}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveRow(item.rowIndex)}
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="Descartar esta linha"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                    <div>
                      Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong> ({filteredPreviewItems.length} registros)
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-2.5 py-1 bg-white border border-slate-200 rounded font-medium disabled:opacity-40 hover:bg-slate-50"
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="px-2.5 py-1 bg-white border border-slate-200 rounded font-medium disabled:opacity-40 hover:bg-slate-50"
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 3: RESULT SUMMARY */}
          {/* ========================================================================= */}
          {step === 3 && importResult && (
            <div className="space-y-6 max-w-xl mx-auto py-4 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto shadow-inner">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-800">
                  Importação de Colaboradores Concluída!
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Os colaboradores foram cadastrados com sucesso no sistema.
                </p>
              </div>

              {/* Stats Box */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs grid grid-cols-2 gap-4 text-left">
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                  <div className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
                    Cadastrados Agora
                  </div>
                  <div className="text-2xl font-bold text-emerald-700 mt-0.5">
                    {importResult.newCount ?? 0}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    Já Existentes (Ignorados)
                  </div>
                  <div className="text-2xl font-bold text-slate-700 mt-0.5">
                    {importResult.alreadyExistsCount ?? 0}
                  </div>
                </div>
              </div>

              <div className="bg-blue-50/60 rounded-xl p-4 border border-blue-100 text-xs text-blue-900 text-left">
                <div className="font-semibold text-blue-800 flex items-center gap-1.5 mb-1">
                  <Info className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Próximos Passos:</span>
                </div>
                <p className="text-slate-600">
                  Os colaboradores já aparecem na lista de <strong>Cadastro → Colaboradores</strong>. Para adicionar fotografias ou vinculá-los ao período letivo atual, acione a opção <strong>"Registrar Período"</strong> em cada registro.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between shrink-0">
          {step === 1 && (
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-lg transition-colors"
              >
                Cancelar
              </button>

              <span className="text-xs text-slate-400 italic">
                Selecione uma planilha XLSX para avançar
              </span>
            </div>
          )}

          {step === 2 && (
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={handleResetFile}
                disabled={isSubmitting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Trocar arquivo</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 font-medium text-xs rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={isSubmitting || summary.errorsCount > 0 || summary.newCollaboratorsCount === 0}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition-colors shadow-2xs flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Cadastrando colaboradores...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>
                        Confirmar Importação ({summary.newCollaboratorsCount} {summary.newCollaboratorsCount === 1 ? 'colaborador' : 'colaboradores'})
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex items-center justify-end w-full">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition-colors shadow-2xs flex items-center gap-2"
              >
                <span>Concluir e Voltar</span>
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
