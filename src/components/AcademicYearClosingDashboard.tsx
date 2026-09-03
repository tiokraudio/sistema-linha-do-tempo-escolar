import React, { useState, useMemo } from 'react';
import {
  AcademicPeriod,
  AcademicPeriodOperationalStatus,
  AcademicYearClosingSummary,
  SchoolConfig,
  WorkQueueItem,
} from '../types';
import { calculateAcademicYearClosingSummary } from '../utils/academicYearClosing';
import {
  Lock,
  Calendar,
  AlertTriangle,
  Clock,
  ShieldCheck,
  TrendingUp,
  Sparkles,
  Search,
  RotateCcw,
  Check,
  History,
} from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Alert } from './ui/Alert';
import { Toast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { FormField, inputClasses, selectClasses } from './ui/FormField';

interface AcademicYearClosingDashboardProps {
  periods: AcademicPeriod[];
  workQueueData: WorkQueueItem[];
  schoolConfig: SchoolConfig;
  selectedPeriod: string;
  onSelectPeriod: (period: string) => void;
  onUpdatePeriodStatus: (year: string, status: AcademicPeriodOperationalStatus) => Promise<void>;
  onClosePeriod: (year: string, closedBy?: string) => Promise<void>;
  onNavigateToQueue: (filters?: any) => void;
  onNavigateToReviewCenter?: () => void;
  onNavigateToBatchProduction?: () => void;
  onNavigateToDashboard?: () => void;
}

export const AcademicYearClosingDashboard: React.FC<AcademicYearClosingDashboardProps> = ({
  periods,
  workQueueData,
  selectedPeriod,
  onSelectPeriod,
  onUpdatePeriodStatus,
  onClosePeriod,
  onNavigateToQueue,
  onNavigateToReviewCenter,
  onNavigateToBatchProduction,
  onNavigateToDashboard,
}) => {
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [operatorName, setOperatorName] = useState('Administrador');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [historySearchTerm, setHistorySearchTerm] = useState('');

  // Find period object for current selected period
  const currentPeriodObj = useMemo(() => {
    return periods.find((p) => String(p.name) === String(selectedPeriod));
  }, [periods, selectedPeriod]);

  // Scoped queue data for selected period
  const scopedQueueData = useMemo(() => {
    if (selectedPeriod === 'all') {
      return workQueueData;
    }
    return workQueueData.filter((i) => String(i.latestYear) === String(selectedPeriod));
  }, [workQueueData, selectedPeriod]);

  // Current year closing summary
  const summary: AcademicYearClosingSummary = useMemo(() => {
    return calculateAcademicYearClosingSummary(
      selectedPeriod,
      currentPeriodObj,
      scopedQueueData
    );
  }, [selectedPeriod, currentPeriodObj, scopedQueueData]);

  // All years closing summaries for the overview table
  const allYearsSummaries = useMemo(() => {
    return periods.map((p) => {
      const yearQueue = workQueueData.filter((i) => String(i.latestYear) === String(p.name));
      return calculateAcademicYearClosingSummary(p.name, p, yearQueue);
    });
  }, [periods, workQueueData]);

  // Filtered all years for table
  const filteredAllYears = useMemo(() => {
    if (!historySearchTerm.trim()) return allYearsSummaries;
    const q = historySearchTerm.toLowerCase().trim();
    return allYearsSummaries.filter(
      (s) =>
        s.year.includes(q) ||
        s.operationalStatus.includes(q) ||
        s.displayStatus.includes(q)
    );
  }, [allYearsSummaries, historySearchTerm]);

  // Handle status toggle (in_production <-> in_review)
  const handleToggleOperationalStatus = async () => {
    if (summary.isClosed) return;
    const newStatus: AcademicPeriodOperationalStatus =
      summary.operationalStatus === 'in_production' ? 'in_review' : 'in_production';
    setErrorMsg('');
    setSuccessMsg('');
    try {
      setIsSubmitting(true);
      await onUpdatePeriodStatus(selectedPeriod, newStatus);
      setSuccessMsg(
        `Status do ano letivo ${selectedPeriod} alterado para ${
          newStatus === 'in_review' ? 'EM REVISÃO' : 'EM PRODUÇÃO'
        }.`
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao alterar status do ano letivo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Close confirmation
  const handleConfirmClosing = async () => {
    if (!summary.isReadyToClose && !summary.isClosed) {
      setErrorMsg('Este ano letivo ainda possui pendências impeditivas e não pode ser fechado.');
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    try {
      setIsSubmitting(true);
      await onClosePeriod(selectedPeriod, operatorName);
      setIsConfirmModalOpen(false);
      setSuccessMsg(`Ano letivo ${selectedPeriod} foi FECHADO e arquivado com sucesso!`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao fechar ano letivo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. CABEÇALHO */}
      <PageHeader
        title="Fechamento do Ano Letivo"
        subtitle="Consolidação formal e arquivamento seguro de períodos letivos."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={selectedPeriod}
                onChange={(e) => onSelectPeriod(e.target.value)}
                className="text-xs font-semibold text-slate-800 bg-transparent border-0 focus:outline-none cursor-pointer pr-1"
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.name}>
                    Ano Letivo {p.name} {p.status === 'closed' ? '(Fechado)' : p.status === 'in_review' ? '(Em Revisão)' : '(Em Produção)'}
                  </option>
                ))}
              </select>
            </div>

            {onNavigateToDashboard && (
              <Button
                variant="secondary"
                size="md"
                icon={TrendingUp}
                onClick={onNavigateToDashboard}
              >
                Dashboard
              </Button>
            )}
          </div>
        }
      />

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

      {/* 2. CARD PRINCIPAL DE STATUS DO ANO SELECIONADO */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-base shadow-2xs ${
                summary.isClosed
                  ? 'bg-slate-900 text-white'
                  : summary.isReadyToClose
                  ? 'bg-emerald-600 text-white'
                  : summary.operationalStatus === 'in_review'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-blue-600 text-white'
              }`}
            >
              {summary.isClosed ? <Lock className="w-6 h-6" /> : summary.year}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Ano Letivo {summary.year}
                </span>

                {summary.isClosed ? (
                  <Badge variant="neutral" size="sm">
                    Fechado
                  </Badge>
                ) : summary.isReadyToClose ? (
                  <Badge variant="success" size="sm">
                    Pronto para fechamento
                  </Badge>
                ) : summary.operationalStatus === 'in_review' ? (
                  <Badge variant="warning" size="sm">
                    Em revisão
                  </Badge>
                ) : (
                  <Badge variant="info" size="sm">
                    Em produção
                  </Badge>
                )}
              </div>

              <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">
                {summary.isClosed
                  ? `Ciclo Letivo ${summary.year} Arquivado`
                  : summary.isReadyToClose
                  ? `Ano Letivo ${summary.year} Validado para Fechamento`
                  : summary.operationalStatus === 'in_review'
                  ? `Conferência e Revisão Final (${summary.year})`
                  : `Produção Ativa (${summary.year})`}
              </h2>
            </div>
          </div>

          {/* Ações do Ano */}
          <div className="flex flex-wrap items-center gap-2">
            {!summary.isClosed && (
              <Button
                variant="secondary"
                size="md"
                icon={summary.operationalStatus === 'in_production' ? Clock : RotateCcw}
                onClick={handleToggleOperationalStatus}
                isLoading={isSubmitting}
              >
                {summary.operationalStatus === 'in_production'
                  ? 'Mudar para Em Revisão'
                  : 'Voltar para Em Produção'}
              </Button>
            )}

            {!summary.isClosed && summary.isReadyToClose && (
              <Button
                variant="primary"
                size="md"
                icon={Lock}
                onClick={() => setIsConfirmModalOpen(true)}
              >
                Fechar Ano Letivo
              </Button>
            )}
          </div>
        </div>

        {/* Barra de Progresso */}
        <div className="space-y-2 bg-slate-50 border border-slate-200/80 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
              Produção Concluída (Salvas na Linha do Tempo)
            </span>
            <span className="text-blue-700 font-bold text-sm">{summary.completionPercent}%</span>
          </div>

          <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden flex">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                summary.isClosed
                  ? 'bg-slate-800'
                  : summary.completionPercent === 100
                  ? 'bg-emerald-500'
                  : 'bg-blue-600'
              }`}
              style={{ width: `${summary.completionPercent}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-0.5">
            <span>
              {summary.savedCompositionsCount} de {summary.totalStudents} alunos com composição salva
            </span>
            <span>
              {summary.readyForPrintCount} de {summary.totalStudents} alunos 100% prontos para impressão
            </span>
          </div>
        </div>

        {/* Grade de Indicadores (KPIs) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Total de Alunos
            </div>
            <div className="text-xl font-bold text-slate-900 mt-0.5">{summary.totalStudents}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Matriculados no ano</div>
          </div>

          <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-3">
            <div className="text-[11px] font-medium text-blue-700 uppercase tracking-wider">
              Períodos Confirmados
            </div>
            <div className="text-xl font-bold text-blue-900 mt-0.5">
              {summary.confirmedRecordsCount}
            </div>
            <div className="text-[10px] text-blue-600 mt-0.5">Registros com turma</div>
          </div>

          <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-3">
            <div className="text-[11px] font-medium text-indigo-700 uppercase tracking-wider">
              Composições Salvas
            </div>
            <div className="text-xl font-bold text-indigo-900 mt-0.5">
              {summary.savedCompositionsCount}
            </div>
            <div className="text-[10px] text-indigo-600 mt-0.5">Com layout gerado</div>
          </div>

          <div
            onClick={() => onNavigateToBatchProduction && onNavigateToBatchProduction()}
            className={`border rounded-xl p-3 transition-all ${
              summary.readyForPrintCount > 0
                ? 'bg-emerald-50/60 border-emerald-200 cursor-pointer hover:border-emerald-300'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="text-[11px] font-medium text-emerald-800 uppercase tracking-wider">
              Prontas p/ Impressão
            </div>
            <div className="text-xl font-bold text-emerald-900 mt-0.5">
              {summary.readyForPrintCount}
            </div>
            <div className="text-[10px] text-emerald-700 mt-0.5">Salvas sem pendências</div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="text-[11px] font-medium text-rose-700 uppercase tracking-wider">
              Foto Faltante
            </div>
            <div className="text-xl font-bold text-rose-900 mt-0.5">
              {summary.missingPhotosCount}
            </div>
            <div className="text-[10px] text-rose-600 mt-0.5">No ano de referência</div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="text-[11px] font-medium text-amber-800 uppercase tracking-wider">
              Histórico Excedente
            </div>
            <div className="text-xl font-bold text-amber-900 mt-0.5">
              {summary.exceedingCount}
            </div>
            <div className="text-[10px] text-amber-700 mt-0.5">Excede capacidade</div>
          </div>
        </div>
      </div>

      {/* Banner de Auditoria se FECHADO */}
      {summary.isClosed && (
        <div className="bg-slate-900 text-white border border-slate-800 rounded-xl p-5 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 bg-amber-500/20 border border-amber-500/30 rounded-lg flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                Ano Letivo Arquivado e Protegido
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Fechado em <strong>{formatDateTime(summary.closedAt)}</strong>
                {summary.closedBy && (
                  <span> por <strong>{summary.closedBy}</strong></span>
                )}
                . Os registros históricos permanecem preservados para consulta e histórico escolar.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3. PENDÊNCIAS E REQUISITOS PARA FECHAMENTO */}
      {!summary.isClosed && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Critérios para Fechamento do Ano Letivo
          </h3>

          <div className="space-y-2.5">
            {/* Critério 1: Todas as composições salvas */}
            <div className="p-3 rounded-lg border border-slate-200 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                {summary.savedCompositionsCount === summary.totalStudents && summary.totalStudents > 0 ? (
                  <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold shrink-0">
                    !
                  </div>
                )}
                <div>
                  <span className="font-semibold text-slate-900 block">
                    Composições da Linha do Tempo salvas
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    {summary.savedCompositionsCount}/{summary.totalStudents} alunos com composição gerada e salva
                  </span>
                </div>
              </div>

              {summary.savedCompositionsCount < summary.totalStudents && onNavigateToQueue && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onNavigateToQueue({ status: 'pending' })}
                >
                  Ver pendentes
                </Button>
              )}
            </div>

            {/* Critério 2: Fotos faltantes */}
            <div className="p-3 rounded-lg border border-slate-200 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                {summary.missingPhotosCount === 0 ? (
                  <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold shrink-0">
                    !
                  </div>
                )}
                <div>
                  <span className="font-semibold text-slate-900 block">
                    Fotografias dos alunos
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    {summary.missingPhotosCount === 0
                      ? 'Nenhum aluno com fotografia pendente no período'
                      : `${summary.missingPhotosCount} aluno(s) sem foto no ano letivo`}
                  </span>
                </div>
              </div>

              {summary.missingPhotosCount > 0 && onNavigateToReviewCenter && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onNavigateToReviewCenter}
                >
                  Ver fotos faltantes
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. HISTÓRICO DOS ANOS LETIVOS */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <History className="w-4 h-4 text-blue-600" />
              Histórico dos Anos Letivos
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Visão consolidada de todos os períodos registrados no sistema.
            </p>
          </div>

          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por ano letivo..."
              value={historySearchTerm}
              onChange={(e) => setHistorySearchTerm(e.target.value)}
              className={`${inputClasses} pl-8 py-1.5 text-xs`}
            />
          </div>
        </div>

        {/* Tabela de Anos */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="pb-2.5 px-3">Ano Letivo</th>
                <th className="pb-2.5 px-3">Status</th>
                <th className="pb-2.5 px-3 text-center">Total Alunos</th>
                <th className="pb-2.5 px-3 text-center">Produção</th>
                <th className="pb-2.5 px-3 text-center">Pendências</th>
                <th className="pb-2.5 px-3">Data Fechamento</th>
                <th className="pb-2.5 px-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAllYears.map((item) => (
                <tr
                  key={item.year}
                  className={`hover:bg-slate-50 transition-colors ${
                    item.year === selectedPeriod ? 'bg-blue-50/40 font-semibold' : ''
                  }`}
                >
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">{item.year}</span>
                      {item.year === selectedPeriod && (
                        <Badge variant="info" size="sm">
                          Atual
                        </Badge>
                      )}
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    {item.isClosed ? (
                      <Badge variant="neutral" size="sm">
                        Fechado
                      </Badge>
                    ) : item.isReadyToClose ? (
                      <Badge variant="success" size="sm">
                        Pronto
                      </Badge>
                    ) : item.operationalStatus === 'in_review' ? (
                      <Badge variant="warning" size="sm">
                        Em revisão
                      </Badge>
                    ) : (
                      <Badge variant="info" size="sm">
                        Em produção
                      </Badge>
                    )}
                  </td>

                  <td className="py-3 px-3 text-center font-mono font-semibold text-slate-700">
                    {item.totalStudents}
                  </td>

                  <td className="py-3 px-3 text-center">
                    <span className="font-mono font-bold text-blue-700">
                      {item.completionPercent}%
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      ({item.savedCompositionsCount}/{item.totalStudents})
                    </span>
                  </td>

                  <td className="py-3 px-3 text-center">
                    {item.blockingPendencies.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {item.blockingPendencies.length} pendente(s)
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-semibold flex items-center justify-center gap-1">
                        <Check className="w-3.5 h-3.5" /> 0
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                    {item.isClosed ? formatDateTime(item.closedAt) : '—'}
                  </td>

                  <td className="py-3 px-3 text-right">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onSelectPeriod(item.year)}
                    >
                      Gerenciar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Confirmação de Fechamento */}
      <Modal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        title={`Fechar Ano Letivo ${summary.year}?`}
        footer={
          <>
            <Button
              variant="secondary"
              size="md"
              onClick={() => setIsConfirmModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={Lock}
              onClick={handleConfirmClosing}
              isLoading={isSubmitting}
            >
              Confirmar Fechamento
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert variant="warning">
            <div className="space-y-1">
              <strong className="block">Aviso Importante de Fechamento</strong>
              <p>
                Após o fechamento, os registros deste ano <strong>não poderão ser alterados</strong> pelos fluxos normais de produção. Os dados continuarão <strong>totalmente disponíveis para consulta</strong> e para a composição do histórico escolar futuro dos alunos.
              </p>
            </div>
          </Alert>

          <FormField label="Operador / Responsável pelo Fechamento" required>
            <input
              type="text"
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              placeholder="Ex: Administrador"
              className={inputClasses}
            />
          </FormField>
        </div>
      </Modal>
    </div>
  );
};
