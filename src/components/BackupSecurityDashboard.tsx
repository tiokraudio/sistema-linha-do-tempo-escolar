import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BackupRecord,
  BackupManifest,
  SchoolConfig,
  AcademicPeriod,
  Student,
  AcademicYearRecord,
  SavedComposition,
} from '../types';
import {
  ShieldCheck,
  Download,
  RotateCcw,
  Trash2,
  FileText,
  UploadCloud,
  RefreshCw,
  Search,
  X,
  AlertTriangle,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Alert } from './ui/Alert';
import { Toast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { FormField, inputClasses } from './ui/FormField';
import { apiFetch } from '../utils/api';

interface BackupSecurityDashboardProps {
  schoolConfig: SchoolConfig;
  periods: AcademicPeriod[];
  students: Student[];
  records: AcademicYearRecord[];
  timelines: SavedComposition[];
  onDataRestored: () => Promise<void>;
}

export const BackupSecurityDashboard: React.FC<BackupSecurityDashboardProps> = ({
  onDataRestored,
}) => {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Restore Modal State
  const [selectedBackupToRestore, setSelectedBackupToRestore] = useState<BackupRecord | null>(null);
  const [uploadedZipBase64, setUploadedZipBase64] = useState<string | null>(null);
  const [uploadedZipName, setUploadedZipName] = useState<string>('');
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    manifest?: BackupManifest;
    counts?: any;
    error?: string;
  } | null>(null);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restoreConfirmText, setRestoreConfirmText] = useState('');

  // Details Modal State
  const [inspectingManifest, setInspectingManifest] = useState<BackupManifest | null>(null);

  // Delete Modal State
  const [backupToDelete, setBackupToDelete] = useState<BackupRecord | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch Backups List
  const fetchBackups = async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch('/api/backups');
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        setBackups(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Erro ao buscar backups:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (isoString: string) => {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  // Create Manual Backup (Exportar)
  const handleCreateManualBackup = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setIsCreating(true);
    try {
      const res = await apiFetch('/api/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backupType: 'manual',
          reason: 'Backup manual solicitado pelo operador',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao gerar backup manual.');
      }

      const newBackup: BackupRecord = await res.json();
      await fetchBackups();

      setSuccessMsg(`Backup gerado com sucesso (${formatBytes(newBackup.sizeBytes)}).`);

      // Trigger direct download
      window.location.href = `/api/backups/${newBackup.id}/download`;
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao criar backup manual.');
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Uploaded ZIP file for Restoration (Importar)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      setErrorMsg('O arquivo selecionado deve ser um pacote .zip.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      setUploadedZipBase64(base64);
      setUploadedZipName(file.name);
      setSelectedBackupToRestore(null);
      setRestoreConfirmText('');

      setErrorMsg('');
      setIsLoading(true);
      try {
        const valRes = await apiFetch('/api/backups/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zipBase64: base64 }),
        });

        const valData = await valRes.json();
        if (!valRes.ok || !valData.valid) {
          throw new Error(valData.error || 'O arquivo .zip não é um backup válido.');
        }

        setValidationResult(valData);
        setIsRestoreModalOpen(true);
      } catch (err: any) {
        setErrorMsg(`Erro de validação: ${err.message}`);
      } finally {
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle Restore from History
  const handleSelectHistoryBackupForRestore = async (bck: BackupRecord) => {
    setErrorMsg('');
    setSuccessMsg('');
    setSelectedBackupToRestore(bck);
    setUploadedZipBase64(null);
    setUploadedZipName(bck.filename);
    setRestoreConfirmText('');

    setIsLoading(true);
    try {
      const valRes = await apiFetch('/api/backups/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupId: bck.id }),
      });

      const valData = await valRes.json();
      if (!valRes.ok || !valData.valid) {
        throw new Error(valData.error || 'Falha ao validar integridade do backup.');
      }

      setValidationResult(valData);
      setIsRestoreModalOpen(true);
    } catch (err: any) {
      setErrorMsg(`Erro ao validar backup: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Confirm and Execute Integral Restoration
  const handleExecuteRestore = async () => {
    if (restoreConfirmText !== 'RESTAURAR') {
      setErrorMsg('Digite a palavra RESTAURAR em maiúsculas para confirmar.');
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    setIsRestoring(true);

    try {
      const payload: any = {};
      if (selectedBackupToRestore) {
        payload.backupId = selectedBackupToRestore.id;
      } else if (uploadedZipBase64) {
        payload.zipBase64 = uploadedZipBase64;
      } else {
        throw new Error('Nenhum backup válido selecionado.');
      }

      const res = await apiFetch('/api/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Falha na restauração do backup.');
      }

      await onDataRestored();
      await fetchBackups();

      setIsRestoreModalOpen(false);
      setSuccessMsg('Restauração concluída com sucesso.');
    } catch (err: any) {
      setErrorMsg(`Erro na restauração: ${err.message}`);
    } finally {
      setIsRestoring(false);
    }
  };

  // Delete Backup
  const handleConfirmDelete = async () => {
    if (!backupToDelete) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiFetch(`/api/backups/${backupToDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao excluir backup.');
      }
      setSuccessMsg(`Backup removido com sucesso.`);
      setBackupToDelete(null);
      await fetchBackups();
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao excluir backup.');
    }
  };

  const filteredBackups = useMemo(() => {
    if (!searchTerm.trim()) return backups;
    const q = searchTerm.toLowerCase().trim();
    return backups.filter(
      (b) =>
        b.filename.toLowerCase().includes(q) ||
        b.reason.toLowerCase().includes(q) ||
        b.backupType.toLowerCase().includes(q)
    );
  }, [backups, searchTerm]);

  return (
    <div className="space-y-4">
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

      {/* Ações Principais de Backup */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={Download}
            onClick={handleCreateManualBackup}
            isLoading={isCreating}
          >
            Exportar backup
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleFileSelect}
            className="hidden"
            id="backup-upload-input"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={UploadCloud}
            onClick={() => fileInputRef.current?.click()}
          >
            Importar backup
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-48 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar backup..."
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
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            onClick={fetchBackups}
            isLoading={isLoading}
          >
            Atualizar
          </Button>
        </div>
      </div>

      {/* Backups Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase font-semibold text-[11px] tracking-wider">
              <th className="py-3 px-4">Data e Hora</th>
              <th className="py-3 px-4">Tipo</th>
              <th className="py-3 px-4">Tamanho</th>
              <th className="py-3 px-4">Registros</th>
              <th className="py-3 px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredBackups.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-slate-400">
                  <ShieldCheck className="w-6 h-6 mx-auto mb-1 opacity-40" />
                  <span>Nenhum backup encontrado.</span>
                </td>
              </tr>
            ) : (
              filteredBackups.map((bck) => (
                <tr key={bck.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                    {formatDate(bck.createdAt)}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="capitalize text-slate-600">
                      {bck.backupType === 'manual' ? 'Manual' : bck.backupType === 'automatic' ? 'Automático' : bck.backupType}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                    {formatBytes(bck.sizeBytes)}
                  </td>
                  <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                    {bck.counts?.studentsCount ?? '—'} pessoas / {bck.counts?.recordsCount ?? '—'} registros
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={Download}
                        onClick={() => {
                          window.location.href = `/api/backups/${bck.id}/download`;
                        }}
                      >
                        Baixar
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={FileText}
                        onClick={() => setInspectingManifest(bck.manifest)}
                      >
                        Metadados
                      </Button>

                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        icon={RotateCcw}
                        onClick={() => handleSelectHistoryBackupForRestore(bck)}
                      >
                        Restaurar
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        onClick={() => setBackupToDelete(bck)}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Metadados */}
      {inspectingManifest && (
        <Modal
          isOpen={Boolean(inspectingManifest)}
          onClose={() => setInspectingManifest(null)}
          title="Metadados do Backup"
        >
          <div className="space-y-4">
            <div className="p-3 bg-slate-900 text-slate-200 rounded-lg text-xs font-mono overflow-y-auto max-h-72">
              <pre>{JSON.stringify(inspectingManifest, null, 2)}</pre>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setInspectingManifest(null)}
              >
                Fechar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Excluir Backup */}
      {backupToDelete && (
        <Modal
          isOpen={Boolean(backupToDelete)}
          onClose={() => setBackupToDelete(null)}
          title="Excluir Backup"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              Tem certeza de que deseja excluir este arquivo de backup? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setBackupToDelete(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleConfirmDelete}
              >
                Excluir
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Restaurar Backup */}
      {isRestoreModalOpen && validationResult && (
        <Modal
          isOpen={isRestoreModalOpen}
          onClose={() => setIsRestoreModalOpen(false)}
          title="Restaurar Backup"
        >
          <div className="space-y-4">
            <Alert variant="warning">
              A restauração substituirá os dados operacionais atuais pelos dados contidos neste backup.
            </Alert>

            <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <strong>Arquivo:</strong> {uploadedZipName}
              </div>
              <div>
                <strong>Pessoas:</strong> {validationResult.counts?.studentsCount ?? 0}
              </div>
              <div>
                <strong>Registros:</strong> {validationResult.counts?.recordsCount ?? 0}
              </div>
              <div>
                <strong>Períodos:</strong> {validationResult.counts?.periodsCount ?? 0}
              </div>
            </div>

            <FormField
              label='Digite "RESTAURAR" para confirmar'
            >
              <input
                type="text"
                value={restoreConfirmText}
                onChange={(e) => setRestoreConfirmText(e.target.value)}
                placeholder="RESTAURAR"
                className={`${inputClasses} font-mono uppercase`}
                autoFocus
              />
            </FormField>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsRestoreModalOpen(false)}
                disabled={isRestoring}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleExecuteRestore}
                isLoading={isRestoring}
                disabled={isRestoring || restoreConfirmText !== 'RESTAURAR'}
              >
                Restaurar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
