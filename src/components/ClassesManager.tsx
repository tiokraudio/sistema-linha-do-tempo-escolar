import React, { useState, useMemo } from 'react';
import { ClassRecord } from '../types';
import {
  GraduationCap,
  Search,
  ArrowUp,
  ArrowDown,
  Edit2,
  RotateCcw,
  Plus,
  Power,
  X,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Alert } from './ui/Alert';
import { Toast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { FormField, inputClasses, selectClasses } from './ui/FormField';

interface ClassesManagerProps {
  classes: ClassRecord[];
  onUpdateClass?: (id: string, updates: Partial<ClassRecord>) => Promise<void>;
  onReorderClasses?: (ids: string[]) => Promise<void>;
  onResetOrder?: () => Promise<void>;
  onAddClass?: (name: string, stage?: string) => Promise<void>;
  onDeleteClass?: (id: string) => Promise<void>;
}

export const ClassesManager: React.FC<ClassesManagerProps> = ({
  classes = [],
  onUpdateClass,
  onReorderClasses,
  onResetOrder,
  onAddClass,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Edit class state
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Add new class modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassStage, setNewClassStage] = useState<'EI' | 'EFAI' | 'EFAF' | 'EM'>('EFAI');

  // Display list (sorted by order)
  const displayClasses = useMemo(() => {
    const list = [...classes];
    return list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [classes]);

  // Filtered classes
  const filteredClasses = useMemo(() => {
    const query = searchTerm.toLowerCase().trim();
    return displayClasses.filter((c) => {
      const matchesQuery =
        !query ||
        c.name.toLowerCase().includes(query) ||
        (c.stageName && c.stageName.toLowerCase().includes(query));

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && c.active !== false) ||
        (statusFilter === 'INACTIVE' && c.active === false);

      return matchesQuery && matchesStatus;
    });
  }, [displayClasses, searchTerm, statusFilter]);

  const handleStartEdit = (cls: ClassRecord) => {
    setEditingClassId(cls.id);
    setEditingName(cls.name);
    setActionFeedback(null);
  };

  const handleCancelEdit = () => {
    setEditingClassId(null);
    setEditingName('');
  };

  const handleSaveEdit = async (cls: ClassRecord) => {
    if (!editingName.trim()) {
      setActionFeedback({ type: 'error', message: 'O nome da turma não pode ficar vazio.' });
      return;
    }
    try {
      setIsSubmitting(true);
      if (onUpdateClass) {
        await onUpdateClass(cls.id, { name: editingName.trim() });
      }
      setActionFeedback({ type: 'success', message: `Turma renomeada para "${editingName.trim()}".` });
      setEditingClassId(null);
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err?.message || 'Erro ao renomear turma.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (cls: ClassRecord) => {
    const newStatus = cls.active === false ? true : false;
    try {
      setIsSubmitting(true);
      if (onUpdateClass) {
        await onUpdateClass(cls.id, { active: newStatus });
      }
      setActionFeedback({
        type: 'success',
        message: newStatus ? `Turma "${cls.name}" ativada.` : `Turma "${cls.name}" desativada.`,
      });
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err?.message || 'Erro ao alterar status da turma.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMove = async (currentIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= displayClasses.length) return;

    const reordered = [...displayClasses];
    const [movedItem] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, movedItem);

    const ids = reordered.map((c) => c.id);
    try {
      setIsSubmitting(true);
      if (onReorderClasses) {
        await onReorderClasses(ids);
      }
      setActionFeedback({ type: 'success', message: 'Ordem das turmas atualizada.' });
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err?.message || 'Erro ao reordenar turmas.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetOrder = async () => {
    try {
      setIsSubmitting(true);
      if (onResetOrder) {
        await onResetOrder();
      }
      setActionFeedback({ type: 'success', message: 'Matriz oficial restaurada.' });
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err?.message || 'Erro ao restaurar matriz.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    try {
      setIsSubmitting(true);
      if (onAddClass) {
        await onAddClass(newClassName.trim(), newClassStage);
      }
      setActionFeedback({ type: 'success', message: `Turma "${newClassName.trim()}" criada.` });
      setNewClassName('');
      setIsAddModalOpen(false);
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err?.message || 'Erro ao cadastrar turma.' });
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
            Todas
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
            Ativas
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
            Inativas
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
              placeholder="Buscar turma..."
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
            variant="secondary"
            size="sm"
            icon={RotateCcw}
            onClick={handleResetOrder}
            disabled={isSubmitting}
          >
            Restaurar matriz
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setIsAddModalOpen(true)}
          >
            Nova turma
          </Button>
        </div>
      </div>

      {/* Classes Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase font-semibold text-[11px] tracking-wider">
              <th className="py-3 px-4">Turma</th>
              <th className="py-3 px-4">Etapa</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredClasses.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-10 text-center text-slate-400">
                  <GraduationCap className="w-6 h-6 mx-auto mb-1 opacity-40" />
                  <span>Nenhuma turma encontrada.</span>
                </td>
              </tr>
            ) : (
              filteredClasses.map((cls) => {
                const fullIndex = displayClasses.findIndex((c) => c.id === cls.id);
                const isFirst = fullIndex === 0;
                const isLast = fullIndex === displayClasses.length - 1;
                const isActive = cls.active !== false;
                const isEditing = editingClassId === cls.id;

                return (
                  <tr
                    key={cls.id}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      !isActive ? 'opacity-65' : ''
                    }`}
                  >
                    {/* Turma / Nome ou Edição */}
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {isEditing ? (
                        <div className="flex items-center gap-2 max-w-xs">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className={`${inputClasses} py-1 text-xs`}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(cls);
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="primary"
                            onClick={() => handleSaveEdit(cls)}
                            disabled={isSubmitting}
                          >
                            Salvar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={handleCancelEdit}
                          >
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <span>{cls.name}</span>
                      )}
                    </td>

                    {/* Etapa */}
                    <td className="py-3 px-4 text-slate-500">
                      <span>{cls.stageName || cls.stage || 'Geral'}</span>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      {isActive ? (
                        <Badge variant="success">ATIVA</Badge>
                      ) : (
                        <Badge variant="neutral">INATIVA</Badge>
                      )}
                    </td>

                    {/* Ações */}
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {/* Reordenar */}
                        <button
                          type="button"
                          onClick={() => handleMove(fullIndex, 'up')}
                          disabled={isFirst || isSubmitting}
                          className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          title="Subir posição"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMove(fullIndex, 'down')}
                          disabled={isLast || isSubmitting}
                          className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          title="Descer posição"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>

                        {/* Editar */}
                        {!isEditing && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            icon={Edit2}
                            onClick={() => handleStartEdit(cls)}
                          >
                            Editar
                          </Button>
                        )}

                        {/* Ativar / Desativar */}
                        <Button
                          type="button"
                          variant={isActive ? 'secondary' : 'primary'}
                          size="sm"
                          icon={Power}
                          onClick={() => handleToggleActive(cls)}
                          disabled={isSubmitting}
                        >
                          {isActive ? 'Desativar' : 'Ativar'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Nova Turma */}
      {isAddModalOpen && (
        <Modal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          title="Nova Turma"
        >
          <form onSubmit={handleCreateClass} className="space-y-4">
            <FormField label="Nome da turma">
              <input
                type="text"
                required
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                placeholder="Ex: 5º Ano A"
                className={inputClasses}
                autoFocus
              />
            </FormField>

            <FormField label="Etapa">
              <select
                value={newClassStage}
                onChange={(e) => setNewClassStage(e.target.value as any)}
                className={selectClasses}
              >
                <option value="EI">Educação Infantil (EI)</option>
                <option value="EFAI">Ensino Fundamental — Anos Iniciais (EFAI)</option>
                <option value="EFAF">Ensino Fundamental — Anos Finais (EFAF)</option>
                <option value="EM">Ensino Médio (EM)</option>
              </select>
            </FormField>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsAddModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isSubmitting}
                disabled={!newClassName.trim()}
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
