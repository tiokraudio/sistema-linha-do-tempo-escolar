import React, { useState, useEffect } from 'react';
import { SchoolConfig } from '../types';
import { School, Upload, Save, Trash2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Alert } from './ui/Alert';
import { Toast } from './ui/Toast';
import { FormField, inputClasses } from './ui/FormField';

interface SchoolSettingsProps {
  config: SchoolConfig;
  onSaveConfig: (config: SchoolConfig) => Promise<void>;
}

export const SchoolSettings: React.FC<SchoolSettingsProps> = ({
  config,
  onSaveConfig,
}) => {
  const [initialSnapshot, setInitialSnapshot] = useState(() => ({
    schoolName: config.schoolName || '',
    schoolLogo: config.schoolLogo || '',
    photoHistorySlots: config.photoHistorySlots ?? 10,
  }));

  const [schoolName, setSchoolName] = useState(initialSnapshot.schoolName);
  const [schoolLogo, setSchoolLogo] = useState(initialSnapshot.schoolLogo);
  const [photoHistorySlots, setPhotoHistorySlots] = useState<number>(
    initialSnapshot.photoHistorySlots
  );

  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const snap = {
      schoolName: config.schoolName || '',
      schoolLogo: config.schoolLogo || '',
      photoHistorySlots: config.photoHistorySlots ?? 10,
    };
    setInitialSnapshot(snap);
    setSchoolName(snap.schoolName);
    setSchoolLogo(snap.schoolLogo);
    setPhotoHistorySlots(snap.photoHistorySlots);
  }, [config]);

  const hasChanges =
    schoolName !== initialSnapshot.schoolName ||
    schoolLogo !== initialSnapshot.schoolLogo ||
    photoHistorySlots !== initialSnapshot.photoHistorySlots;

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSchoolLogo(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasChanges || isSaving) return;

    setIsSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const slots = isNaN(photoHistorySlots) ? 10 : Math.max(0, Math.floor(photoHistorySlots));
      const savedConfig = {
        schoolName: schoolName.trim(),
        schoolLogo,
        photoHistorySlots: slots,
      };

      await onSaveConfig(savedConfig);

      const newSnap = {
        schoolName: savedConfig.schoolName,
        schoolLogo: savedConfig.schoolLogo,
        photoHistorySlots: savedConfig.photoHistorySlots,
      };
      setSchoolName(newSnap.schoolName);
      setSchoolLogo(newSnap.schoolLogo);
      setPhotoHistorySlots(newSnap.photoHistorySlots);
      setInitialSnapshot(newSnap);

      setSuccessMsg('Configurações salvas com sucesso.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Não foi possível salvar as alterações.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
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

      {/* Formulário Principal */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-6">
        {/* DADOS DA ESCOLA */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Dados da Escola
          </h3>
          <FormField label="Nome da escola">
            <input
              type="text"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="Nome da escola"
              className={inputClasses}
            />
          </FormField>
        </div>

        {/* LOGOTIPO */}
        <div className="border-t border-slate-100 pt-5 space-y-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Logotipo
          </h3>

          <div className="flex flex-wrap items-center gap-4">
            <div className="w-16 h-16 rounded-lg border border-slate-200 bg-slate-900 p-1.5 flex items-center justify-center shrink-0 overflow-hidden">
              {schoolLogo ? (
                <img
                  src={schoolLogo}
                  alt="Logo"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <School className="w-6 h-6 text-slate-400" />
              )}
            </div>

            <div className="flex items-center gap-2">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={Upload}
                  onClick={(e) => {
                    const input = (e.currentTarget.parentElement as HTMLElement)?.querySelector('input');
                    input?.click();
                  }}
                >
                  {schoolLogo ? 'Alterar logo' : 'Carregar logo'}
                </Button>
              </label>

              {schoolLogo && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  onClick={() => setSchoolLogo('')}
                >
                  Remover
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* HISTÓRICO FOTOGRÁFICO */}
        <div className="border-t border-slate-100 pt-5 space-y-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Histórico Fotográfico
          </h3>

          <FormField label="Capacidade">
            <div className="max-w-[120px]">
              <input
                type="number"
                min="0"
                step="1"
                value={photoHistorySlots}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setPhotoHistorySlots(isNaN(val) ? 0 : Math.max(0, val));
                }}
                className={inputClasses}
              />
            </div>
          </FormField>
        </div>

        {/* Rodapé / Salvar */}
        <div className="border-t border-slate-100 pt-4 flex justify-end">
          <Button
            type="submit"
            variant="primary"
            isLoading={isSaving}
            disabled={!hasChanges || isSaving}
            icon={Save}
          >
            Salvar
          </Button>
        </div>
      </form>
    </div>
  );
};
