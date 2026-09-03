import React, { useState, useMemo } from 'react';
import { AcademicPeriod, AcademicYearRecord } from '../types';
import {
  Calendar,
  Plus,
  Search,
  Power,
  X,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Alert } from './ui/Alert';
import { Toast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { FormField, inputClasses } from './ui/FormField';
import { getActiveAcademicYear } from '../utils/academicYears';
import { apiFetch } from '../utils/api';

interface PeriodsManagerProps {
  periods: AcademicPeriod[];
  records?: AcademicYearRecord[];
  onAddPeriod: (name: string) => Promise<void>;
  onTogglePeriodActive?: (id: string, active: boolean) => Promise<void>;
  onUpdatePeriod?: (id: string, updates: Partial<AcademicPeriod>) => Promise<void>;
}

export const PeriodsManager: React.FC<PeriodsManagerProps> = ({
  periods = [],
  onAddPeriod,
  onTogglePeriodActive,
  onUpdatePeriod,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newPeriodYear, setNewPeriodYear] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Sort periods strictly descending (most recent first)
  const sortedPeriods = useMemo(() => {
    return [...periods].sort((a, b) => Number(b.name) - Number(a.name));
  }, [periods]);

  // Filtered Periods
  const filteredPeriods = useMemo(() => {
    const query = searchTerm.toLowerCase().trim();
    return sortedPeriods.filter((p) => {
      const matchesQuery = !query || p.name.toLowerCase().includes(query);
      const isActive = p.active !== false;

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && isActive) ||
        (statusFilter === 'INACTIVE' && !isActive);

      return matchesQuery && matchesStatus;
    });
  }, [sortedPeriods, searchTerm, statusFilter]);

  // Handle Toggle Active
  const handleToggleActive = async (period: AcademicPeriod) => {
    const currentlyActive = period.active !== false;
    const nextState = !currentlyActive;

    setActionFeedback(null);
    setIsSubmitting(true);

    try {
      if (onTogglePeriodActive) {
        await onTogglePeriodActive(period.id, nextState);
      } else if (onUpdatePeriod) {
        await onUpdatePeriod(period.id, { active: nextState });
      } else {
        const res = await apiFetch(`/api/periods/${period.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: nextState }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Erro ao alterar status do período.');
        }
      }

      setActionFeedback({
        type: 'success',
        message: nextState ? `Período ${period.name} ativado.` : `Período ${period.name} desativado.`,
      });
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: err.message || 'Erro ao alterar status do período.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Add New Period
  const handleOpenAddModal = () => {
    const validNumericYears = sortedPeriods
      .map((p) => Number(p.name))
      .filter((n) => !isNaN(n) && n > 0);
    const highestYear = validNumericYears.length > 0 ? Math.max(...validNumericYears) : 2026;
    setNewPeriodYear(String(highestYear + 1));
    setActionFeedback(null);
    setIsAddModalOpen(true);
  };

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanYear = newPeriodYear.trim();

    if (!cleanYear) {
      setActionFeedback({ type: 'error', message: 'Informe o ano letivo.' });
      return;
    }

    if (!/^\d{4}$/.test(cleanYear)) {
      setActionFeedback({
        type: 'error',
        message: 'O ano deve conter 4 dígitos (ex: 2027).',
      });
      return;
    }

    const exists = sortedPeriods.some((p) => p.name === cleanYear);
    if (exists) {
      setActionFeedback({
        type: 'error',
        message: `O período letivo ${cleanYear} já está cadastrado.`,
      });
      return;
    }

    setIsSubmitting(true);
    setActionFeedback(null);

    try {
      await onAddPeriod(cleanYear);
      setActionFeedback({
        type: 'success',
        message: `Período ${cleanYear} criado.`,
      });
      setIsAddModalOpen(false);
      setNewPeriodYear('');
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: err.message || 'Erro ao criar período letivo.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Feedback Messages */}
      {actionFeedback?.type === 'success' && (
        <Toast
          message={actionFeedback.message}
          onClose={() => setActionFeedback(null)}
        />
      )}
      {actionFeedback?.type === 'error' && (
        <Alert
          variant="error"
          onClose={() => setActionFeedback(null)}
        >
          {actionFeedback.message}
        </Alert>
      )}

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        {/* Status Filters */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ACTIVE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              statusFilter === 'ACTIVE'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Ativos
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('INACTIVE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              statusFilter === 'INACTIVE'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Inativos
          </button>
        </div>

        {/* Search & Actions */}
        <div className="flex flex-wrap items-center gap-2 flex-1 justify-end">
          <div className="relative w-48 sm:w-60">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar período (ex: 2026)..."
              className={`${inputClasses} pl-8.5 py-1.5 text-xs`}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={handleOpenAddModal}
          >
            Novo período
          </Button>
        </div>
      </div>

      {/* Periods Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase font-semibold text-[11px] tracking-wider">
              <th className="py-3 px-4">Ano Letivo</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredPeriods.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-10 text-center text-slate-400">
                  <Calendar className="w-6 h-6 mx-auto mb-1 opacity-40" />
                  <span>Nenhum período letivo encontrado.</span>
                </td>
              </tr>
            ) : (
              filteredPeriods.map((period) => {
                const isActive = period.active !== false;

                return (
                  <tr
                    key={period.id || period.name}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      !isActive ? 'opacity-65' : ''
                    }`}
                  >
                    {/* Ano */}
                    <td className="py-3 px-4 font-semibold text-slate-900 text-sm">
                      <div className="flex items-center gap-2">
                        <span>{period.name}</span>
                        {period.name === getActiveAcademicYear(periods) && (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-800 rounded-full border border-blue-200">
                            PERÍODO ATIVO DO SISTEMA
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      {isActive ? (
                        <Badge variant="success">ATIVO</Badge>
                      ) : (
                        <Badge variant="neutral">INATIVO</Badge>
                      )}
                    </td>

                    {/* Ação */}
                    <td className="py-3 px-4 text-right">
                      <Button
                        type="button"
                        variant={isActive ? 'secondary' : 'primary'}
                        size="sm"
                        icon={Power}
                        onClick={() => handleToggleActive(period)}
                        disabled={isSubmitting}
                      >
                        {isActive ? 'Desativar' : 'Ativar'}
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Novo Período */}
      {isAddModalOpen && (
        <Modal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          title="Novo Período"
        >
          <form onSubmit={handleCreatePeriod} className="space-y-4">
            <FormField label="Ano letivo">
              <input
                type="text"
                maxLength={4}
                required
                value={newPeriodYear}
                onChange={(e) => setNewPeriodYear(e.target.value.replace(/\D/g, ''))}
                placeholder="2027"
                className={inputClasses}
                autoFocus
              />
            </FormField>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsAddModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isSubmitting}
                disabled={!newPeriodYear.trim()}
              >
                Criar
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
