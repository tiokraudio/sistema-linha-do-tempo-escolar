import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Mail,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  Camera,
  Trash2,
  Lock,
  User,
  Check,
  ChevronDown,
  ChevronUp,
  Wrench,
  AlertTriangle,
  CheckSquare,
  Square,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { FormField, inputClasses } from './ui/FormField';
import { apiFetch } from '../utils/api';
import {
  getLocalUserProfile,
  updateServerUserProfile,
  fetchServerUserProfile,
} from '../utils/userProfile';
import {
  SchoolConfig,
  ClassRecord,
  AcademicPeriod,
  LayoutModel,
  Student,
  AcademicYearRecord,
  GeneratedTimeline,
  SelectiveClearCategory,
  UserProfile,
} from '../types';

export interface AccountSettingsProps {
  schoolConfig?: SchoolConfig;
  classes?: ClassRecord[];
  periods?: AcademicPeriod[];
  models?: LayoutModel[];
  students?: Student[];
  records?: AcademicYearRecord[];
  timelines?: GeneratedTimeline[];
  onDataCleared?: () => Promise<void>;
}

interface CategoryItem {
  id: SelectiveClearCategory;
  name: string;
  count: number | string;
}

export const AccountSettings: React.FC<AccountSettingsProps> = ({
  schoolConfig,
  classes = [],
  periods = [],
  models = [],
  students = [],
  records = [],
  timelines = [],
  onDataCleared,
}) => {
  const { adminEmail, changeEmail, changePassword } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Perfil do Administrador
  const [profile, setProfile] = useState<UserProfile>(() => getLocalUserProfile(adminEmail));
  const [displayName, setDisplayName] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null);

  // Alteração de E-mail
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [emailSuccessMsg, setEmailSuccessMsg] = useState<string | null>(null);
  const [emailErrorMsg, setEmailErrorMsg] = useState<string | null>(null);

  // Alteração de Senha
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState<string | null>(null);
  const [passwordErrorMsg, setPasswordErrorMsg] = useState<string | null>(null);

  // Ferramentas do Banco (Acordeão Colapsável)
  const [isMaintenanceExpanded, setIsMaintenanceExpanded] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<SelectiveClearCategory[]>([]);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [clearingStep, setClearingStep] = useState<string>('');
  const [clearErrorMsg, setClearErrorMsg] = useState<string | null>(null);
  const [clearSuccessData, setClearSuccessData] = useState<{
    backupFilename: string;
    clearedCategories: string[];
    backupSizeBytes?: number;
  } | null>(null);

  // Carregar dados iniciais do perfil
  useEffect(() => {
    fetchServerUserProfile(adminEmail).then((p) => {
      setProfile(p);
      setDisplayName(p.displayName || 'Administrador');
    });
  }, [adminEmail]);

  // Contagens para a seção de manutenção
  const photosCount = useMemo(() => {
    return records.filter((r) => r.photoUrl && r.photoUrl.trim() !== '').length;
  }, [records]);

  const carometroCount = useMemo(() => {
    return records.filter((r) => r.carometroCrop || r.autoFaceCrop).length;
  }, [records]);

  const cropsCount = useMemo(() => {
    return records.filter(
      (r) =>
        r.timelinePrimaryCrop ||
        r.timelineSecondaryCrop ||
        r.carometroCrop ||
        r.autoFaceCrop ||
        r.cropSettings
    ).length;
  }, [records]);

  // Categorias Compactas para Limpeza Seletiva - Grupo 1: Dados Operacionais & Produção
  const operationalCategories: CategoryItem[] = useMemo(
    () => [
      {
        id: 'students',
        name: 'Alunos',
        count: students.filter((s) => (s.personType || 'student') === 'student').length,
      },
      {
        id: 'collaborators',
        name: 'Colaboradores',
        count: students.filter((s) => s.personType === 'collaborator').length,
      },
      {
        id: 'records',
        name: 'Matrículas / Registros',
        count: records.length,
      },
      {
        id: 'photos',
        name: 'Fotografias',
        count: photosCount,
      },
      {
        id: 'timelines',
        name: 'Linha do Tempo',
        count: timelines.length,
      },
      {
        id: 'carometro',
        name: 'Dados do Carômetro',
        count: carometroCount,
      },
      {
        id: 'crops',
        name: 'Enquadramentos / Recortes',
        count: cropsCount,
      },
    ],
    [students, records, photosCount, timelines, carometroCount, cropsCount]
  );

  // Categorias Compactas para Limpeza Seletiva - Grupo 2: Configurações Estruturais da Escola
  const structuralCategories: CategoryItem[] = useMemo(
    () => [
      {
        id: 'classes',
        name: 'Turmas',
        count: classes.length,
      },
      {
        id: 'periods',
        name: 'Períodos Letivos',
        count: periods.length,
      },
      {
        id: 'school_data',
        name: 'Dados da Escola',
        count: schoolConfig?.schoolName ? '1' : '0',
      },
      {
        id: 'models',
        name: 'Modelos da Linha do Tempo',
        count: models.length,
      },
    ],
    [classes, periods, schoolConfig, models]
  );

  const allCategories = useMemo(
    () => [...operationalCategories, ...structuralCategories],
    [operationalCategories, structuralCategories]
  );

  // Upload e compressão de Avatar
  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const targetSize = 256;
            canvas.width = targetSize;
            canvas.height = targetSize;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(event.target?.result as string);
              return;
            }
            const minDim = Math.min(img.width, img.height);
            const sx = (img.width - minDim) / 2;
            const sy = (img.height - minDim) / 2;
            ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, targetSize, targetSize);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          };
          img.onerror = () => resolve(event.target?.result as string);
          img.src = event.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const updated = await updateServerUserProfile({ avatarUrl: base64 });
      setProfile(updated);
      setProfileSuccessMsg('Foto de perfil atualizada com sucesso!');
      setTimeout(() => setProfileSuccessMsg(null), 3500);
    } catch (err) {
      console.error('Erro ao carregar foto:', err);
      setProfileErrorMsg('Não foi possível processar a imagem selecionada.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Remover foto de perfil
  const handleRemoveAvatar = async () => {
    try {
      const updated = await updateServerUserProfile({ avatarUrl: null });
      setProfile(updated);
      setProfileSuccessMsg('Foto de perfil removida.');
      setTimeout(() => setProfileSuccessMsg(null), 3500);
    } catch (err) {
      console.error('Erro ao remover avatar:', err);
    }
  };

  // Salvar Nome de Exibição
  const handleSaveProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileErrorMsg(null);
    setProfileSuccessMsg(null);

    try {
      const updated = await updateServerUserProfile({
        displayName: displayName.trim() || 'Administrador',
      });

      setProfile(updated);
      setProfileSuccessMsg('Nome salvo com sucesso!');
      setTimeout(() => setProfileSuccessMsg(null), 3500);
    } catch (err: any) {
      console.error('Erro ao salvar nome:', err);
      setProfileErrorMsg(err.message || 'Falha ao atualizar nome.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Salvar E-mail
  const handleChangeEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailErrorMsg(null);
    setEmailSuccessMsg(null);

    if (!newEmail.trim()) {
      setEmailErrorMsg('Informe o novo endereço de e-mail.');
      return;
    }
    if (!emailCurrentPassword) {
      setEmailErrorMsg('Informe sua senha atual para confirmar.');
      return;
    }

    try {
      setIsSavingEmail(true);
      await changeEmail(emailCurrentPassword, newEmail.trim());
      setProfile((prev) => ({ ...prev, email: newEmail.trim() }));
      setEmailSuccessMsg('E-mail atualizado com sucesso!');
      setNewEmail('');
      setEmailCurrentPassword('');
      setTimeout(() => {
        setEmailSuccessMsg(null);
        setIsEmailModalOpen(false);
      }, 1800);
    } catch (err: any) {
      setEmailErrorMsg(err.message || 'Falha ao atualizar e-mail.');
    } finally {
      setIsSavingEmail(false);
    }
  };

  // Salvar Senha
  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordErrorMsg(null);
    setPasswordSuccessMsg(null);

    if (!currentPassword) {
      setPasswordErrorMsg('Informe a senha atual.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setPasswordErrorMsg('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordErrorMsg('A confirmação da nova senha não confere.');
      return;
    }

    try {
      setIsSavingPassword(true);
      await changePassword(currentPassword, newPassword);
      setPasswordSuccessMsg('Senha atualizada com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccessMsg(null), 3500);
    } catch (err: any) {
      setPasswordErrorMsg(err.message || 'Falha ao atualizar senha.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  // Helper para iniciais do avatar
  const avatarInitials = useMemo(() => {
    const name = profile.displayName || adminEmail || 'Admin';
    const parts = name.split(/[\s@._-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }, [profile.displayName, adminEmail]);

  // Ações da Limpeza Seletiva
  const handleToggleCategory = (catId: SelectiveClearCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  const handleSelectAll = () => {
    setSelectedCategories(allCategories.map((c) => c.id));
  };

  const handleClearSelection = () => {
    setSelectedCategories([]);
  };

  const handleExecuteSelectiveClear = async () => {
    const trimmedConfirm = confirmText.trim().toUpperCase();
    if (trimmedConfirm !== 'EXCLUIR') {
      setClearErrorMsg('Digite exatamente a palavra "EXCLUIR".');
      return;
    }

    try {
      setIsClearing(true);
      setClearErrorMsg(null);
      setClearingStep('Criando backup de segurança e executando limpeza...');

      const response = await apiFetch('/api/maintenance/clear-production-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categories: selectedCategories,
          confirmation: 'EXCLUIR',
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Falha ao executar limpeza seletiva.');
      }

      setClearSuccessData({
        backupFilename: data.backup?.filename || 'backup_automatico.zip',
        clearedCategories: data.selectedCategories || selectedCategories,
        backupSizeBytes: data.backup?.sizeBytes,
      });

      setIsConfirmModalOpen(false);
      setConfirmText('');
      setSelectedCategories([]);

      if (onDataCleared) {
        await onDataCleared();
      }
    } catch (err: any) {
      setClearErrorMsg(err.message || 'Erro ao executar limpeza seletiva.');
    } finally {
      setIsClearing(false);
      setClearingStep('');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      {/* CABEÇALHO DA PÁGINA */}
      <div className="pb-3 border-b border-slate-200">
        <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <User className="w-5 h-5 text-blue-600 shrink-0" />
          Minha Conta
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Gerencie sua identificação de acesso e credenciais de segurança do sistema.
        </p>
      </div>

      {/* GRADE PRINCIPAL: 2 COLUNAS ALINHADAS NO TOPO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        
        {/* ========================================================================= */}
        {/* COLUNA ESQUERDA: IDENTIFICAÇÃO DO ADMINISTRADOR                          */}
        {/* ========================================================================= */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-5">
          {/* Cabeçalho do Card */}
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-tight">
                Identificação do Administrador
              </h3>
              <p className="text-[11px] text-slate-500 leading-tight">
                Foto de perfil e dados de acesso
              </p>
            </div>
          </div>

          {/* Feedback de Perfil */}
          {profileSuccessMsg && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{profileSuccessMsg}</span>
            </div>
          )}

          {profileErrorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{profileErrorMsg}</span>
            </div>
          )}

          {/* Avatar Circular com botões limpos */}
          <div className="flex items-center gap-4 pt-1">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white shadow-xs ring-2 ring-slate-200 flex items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-700 text-white shrink-0 select-none">
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.displayName || 'Avatar'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-lg font-bold tracking-wider">
                  {avatarInitials}
                </span>
              )}
            </div>

            <div className="space-y-1.5 flex-1">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarFileChange}
                accept="image/png, image/jpeg, image/webp"
                className="hidden"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-blue-700 bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>Alterar foto</span>
                </button>

                {profile.avatarUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                    title="Remover foto de perfil"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Remover</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Formatos recomendados: JPG, PNG ou WEBP.
              </p>
            </div>
          </div>

          {/* Formulário de Identificação */}
          <form onSubmit={handleSaveProfileSubmit} className="space-y-4 pt-1">
            <FormField label="Nome de Exibição" required>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ex: Administrador Geral"
                className={inputClasses}
              />
            </FormField>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                E-mail de Acesso
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  disabled
                  value={profile.email || adminEmail || ''}
                  className={`${inputClasses} bg-slate-50 text-slate-600 font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setIsEmailModalOpen(true)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 h-9 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                  title="Alterar endereço de e-mail de acesso"
                >
                  <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>Trocar e-mail</span>
                </button>
              </div>
            </div>

            {/* Botão Salvar Alterações alinhado à direita */}
            <div className="flex justify-end pt-3 border-t border-slate-100">
              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isSavingProfile}
                disabled={isSavingProfile}
                icon={Check}
                className="px-4 text-xs font-semibold h-9 whitespace-nowrap"
              >
                Salvar Alterações
              </Button>
            </div>
          </form>
        </div>

        {/* ========================================================================= */}
        {/* COLUNA DIREITA: ALTERAÇÃO DE SENHA                                        */}
        {/* ========================================================================= */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-5">
          {/* Cabeçalho do Card */}
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-tight">
                Segurança & Senha de Acesso
              </h3>
              <p className="text-[11px] text-slate-500 leading-tight">
                Atualize a senha de login administrativo
              </p>
            </div>
          </div>

          {/* Feedback de Senha */}
          {passwordSuccessMsg && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{passwordSuccessMsg}</span>
            </div>
          )}

          {passwordErrorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{passwordErrorMsg}</span>
            </div>
          )}

          {/* Três inputs verticais alinhados */}
          <form onSubmit={handleChangePasswordSubmit} className="space-y-3.5 pt-1">
            <FormField label="Senha Atual" required>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Digite sua senha atual"
                className={inputClasses}
              />
            </FormField>

            <FormField label="Nova Senha" helperText="Mínimo de 6 caracteres" required>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Digite a nova senha"
                className={inputClasses}
              />
            </FormField>

            <FormField label="Confirmar Nova Senha" required>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                className={inputClasses}
              />
            </FormField>

            {/* Botão Atualizar Senha alinhado à direita */}
            <div className="flex justify-end pt-3 border-t border-slate-100">
              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isSavingPassword}
                disabled={isSavingPassword}
                icon={KeyRound}
                className="px-4 text-xs font-semibold h-9 whitespace-nowrap"
              >
                Atualizar Senha
              </Button>
            </div>
          </form>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* PARTE INFERIOR: FERRAMENTAS DO BANCO (ACORDEÃO COLAPSÁVEL)                */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <button
          type="button"
          onClick={() => setIsMaintenanceExpanded(!isMaintenanceExpanded)}
          className="w-full p-4 px-5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
              <Wrench className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-slate-800">
              Limpeza Seletiva de Dados (Avançado)
            </span>
          </div>

          <div className="text-slate-400">
            {isMaintenanceExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </div>
        </button>

        {isMaintenanceExpanded && (
          <div className="p-5 border-t border-slate-100 space-y-4 bg-slate-50/40">
            {clearSuccessData && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1 text-xs text-emerald-900">
                <div className="flex items-center gap-2 font-bold text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  Limpeza Seletiva Concluída com Sucesso!
                </div>
                <p className="text-[11px]">
                  Backup de segurança gerado em:{' '}
                  <span className="font-mono font-semibold">{clearSuccessData.backupFilename}</span>
                </p>
              </div>
            )}

            {/* Ações rápidas de seleção */}
            <div className="flex items-center justify-between text-xs pb-1">
              <span className="text-slate-600 font-medium">
                Selecione as categorias que deseja limpar:
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-blue-600 hover:text-blue-700 hover:underline font-medium cursor-pointer"
                >
                  Selecionar todas
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="text-slate-600 hover:text-slate-800 hover:underline font-medium cursor-pointer"
                >
                  Limpar seleção
                </button>
              </div>
            </div>

            {/* Categorias divididas em dois subgrupos discretos */}
            <div className="space-y-4">
              {/* Grupo 1: Dados Operacionais & Produção */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  <span>Dados Operacionais &amp; Produção</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {operationalCategories.map((cat) => {
                    const isSelected = selectedCategories.includes(cat.id);
                    return (
                      <button
                        type="button"
                        key={cat.id}
                        onClick={() => handleToggleCategory(cat.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer select-none text-left ${
                          isSelected
                            ? 'bg-rose-50 border-rose-300 text-rose-900 font-semibold'
                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-rose-600 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate flex-1">{cat.name}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ${
                            isSelected
                              ? 'bg-rose-100 text-rose-800 font-bold'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {cat.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Grupo 2: Configurações Estruturais da Escola */}
              <div className="space-y-2 pt-3 border-t border-slate-200/80">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <span>Configurações Estruturais da Escola</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {structuralCategories.map((cat) => {
                    const isSelected = selectedCategories.includes(cat.id);
                    return (
                      <button
                        type="button"
                        key={cat.id}
                        onClick={() => handleToggleCategory(cat.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer select-none text-left ${
                          isSelected
                            ? 'bg-rose-50 border-rose-300 text-rose-900 font-semibold'
                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-rose-600 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate flex-1">{cat.name}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ${
                            isSelected
                              ? 'bg-rose-100 text-rose-800 font-bold'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {cat.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Rodapé do Acordeão com Ações Claras e Alinhadas */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <span className="text-xs text-slate-500">
                {selectedCategories.length} categoria(s) selecionada(s)
              </span>

              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={selectedCategories.length === 0}
                onClick={() => setIsConfirmModalOpen(true)}
                icon={Trash2}
                className="text-xs font-semibold whitespace-nowrap"
              >
                Continuar para Limpeza
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL DE ALTERAÇÃO DE E-MAIL INSTITUCIONAL */}
      <Modal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        title="Atualizar E-mail de Acesso"
        size="sm"
      >
        <form onSubmit={handleChangeEmailSubmit} className="space-y-4 text-xs">
          <p className="text-slate-600">
            Informe o novo endereço de e-mail e confirme sua senha atual de acesso administrativo.
          </p>

          {emailSuccessMsg && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{emailSuccessMsg}</span>
            </div>
          )}

          {emailErrorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{emailErrorMsg}</span>
            </div>
          )}

          <FormField label="Novo E-mail de Acesso" required>
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="novo.email@escola.gov.br"
              className={inputClasses}
            />
          </FormField>

          <FormField label="Senha Atual (Confirmação)" required>
            <input
              type="password"
              required
              value={emailCurrentPassword}
              onChange={(e) => setEmailCurrentPassword(e.target.value)}
              placeholder="Digite sua senha atual"
              className={inputClasses}
            />
          </FormField>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEmailModalOpen(false)}
              disabled={isSavingEmail}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSavingEmail}
              disabled={isSavingEmail}
              icon={Check}
            >
              Confirmar e Salvar
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL DE CONFIRMAÇÃO DA LIMPEZA SELETIVA */}
      <Modal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        title="Confirmar Limpeza Seletiva"
        size="md"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Atenção: Ação irreversível!</span>
              <span>
                Um backup completo (.ZIP) será gerado automaticamente antes da exclusão. As credenciais administrativas e esta conta não serão afetadas.
              </span>
            </div>
          </div>

          <p className="text-slate-700">
            Para autorizar a remoção de <strong>{selectedCategories.length}</strong> categoria(s), digite <strong>EXCLUIR</strong> abaixo:
          </p>

          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Digite EXCLUIR"
            className={inputClasses}
          />

          {clearErrorMsg && (
            <p className="text-rose-600 font-semibold">{clearErrorMsg}</p>
          )}

          {clearingStep && (
            <p className="text-blue-600 font-medium animate-pulse">{clearingStep}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsConfirmModalOpen(false)}
              disabled={isClearing}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={confirmText.trim().toUpperCase() !== 'EXCLUIR' || isClearing}
              isLoading={isClearing}
              onClick={handleExecuteSelectiveClear}
              icon={Trash2}
            >
              Confirmar Exclusão
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
