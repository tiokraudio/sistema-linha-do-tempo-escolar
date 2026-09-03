import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Mail,
  KeyRound,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Wrench,
  Trash2,
  AlertTriangle,
  FileArchive,
  GraduationCap,
  Sparkles,
  Users,
  Check,
  Calendar,
  Layers,
  School,
  Camera,
  Crop,
  Image,
  Info,
  CheckSquare,
  Square,
  RotateCcw,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Alert } from './ui/Alert';
import { apiFetch } from '../utils/api';
import {
  SchoolConfig,
  ClassRecord,
  AcademicPeriod,
  LayoutModel,
  Student,
  AcademicYearRecord,
  GeneratedTimeline,
  SelectiveClearCategory,
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

interface CategoryDefinition {
  id: SelectiveClearCategory;
  name: string;
  group: 'students' | 'structural';
  description: string;
  icon: React.ElementType;
  getCount: () => number | string;
  getCountLabel: () => string;
  details: string[];
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

  // Change Email State
  const [newEmail, setNewEmail] = useState('');
  const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [emailSuccessMsg, setEmailSuccessMsg] = useState<string | null>(null);
  const [emailErrorMsg, setEmailErrorMsg] = useState<string | null>(null);

  // Change Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState<string | null>(null);
  const [passwordErrorMsg, setPasswordErrorMsg] = useState<string | null>(null);

  // Maintenance: Selected categories state
  const [selectedCategories, setSelectedCategories] = useState<SelectiveClearCategory[]>([]);

  // Maintenance: Modal & execution state
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

  // Contagens auxiliares
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

  // Definições de todas as 11 categorias permitidas
  const CATEGORIES: CategoryDefinition[] = useMemo(
    () => [
      // GRUPO: DADOS DOS ALUNOS E COLABORADORES
      {
        id: 'students',
        name: 'Alunos',
        group: 'students',
        description: 'Cadastros e dados de identificação pessoal dos alunos.',
        icon: Users,
        getCount: () => students.filter((s) => (s.personType || 'student') === 'student').length,
        getCountLabel: () => `${students.filter((s) => (s.personType || 'student') === 'student').length} aluno(s)`,
        details: [
          'Cadastro e ID dos alunos',
          'Nomes e dados de matrícula',
          'Histórico de criação dos cadastros',
        ],
      },
      {
        id: 'collaborators',
        name: 'Colaboradores',
        group: 'students',
        description: 'Cadastros e dados de identificação pessoal dos colaboradores.',
        icon: Users,
        getCount: () => students.filter((s) => s.personType === 'collaborator').length,
        getCountLabel: () => `${students.filter((s) => s.personType === 'collaborator').length} colaborador(es)`,
        details: [
          'Cadastro e ID dos colaboradores',
          'Nomes e identificadores',
          'Histórico de criação dos cadastros',
        ],
      },
      {
        id: 'records',
        name: 'Matrículas / Registros',
        group: 'students',
        description: 'Registros de períodos letivos vinculados a alunos e colaboradores.',
        icon: GraduationCap,
        getCount: () => records.length,
        getCountLabel: () => `${records.length} registro(s)`,
        details: [
          'Registros de períodos letivos por ano',
          'Associações de turma e vínculos de período',
          'Histórico de períodos cadastrados',
        ],
      },
      {
        id: 'photos',
        name: 'Fotografias',
        group: 'students',
        description: 'Fotografias escolares vinculadas aos registros dos alunos.',
        icon: Camera,
        getCount: () => photosCount,
        getCountLabel: () => `${photosCount} foto(s)`,
        details: [
          'Arquivos e imagens fotográficas dos alunos',
          'Fotos de produção e retratos escolares',
        ],
      },
      {
        id: 'timelines',
        name: 'Produções da Linha do Tempo',
        group: 'students',
        description: 'Composições e artes da Linha do Tempo salvas no sistema.',
        icon: Sparkles,
        getCount: () => timelines.length,
        getCountLabel: () => `${timelines.length} composição(ões)`,
        details: [
          'Artes e composições salvas da Linha do Tempo',
          'Histórico de geração de painéis',
          'Status de revisão das composições',
        ],
      },
      {
        id: 'carometro',
        name: 'Dados do Carômetro',
        group: 'students',
        description: 'Ajustes, enquadramentos e detecções específicas do Carômetro.',
        icon: Image,
        getCount: () => carometroCount,
        getCountLabel: () => `${carometroCount} ajuste(s)`,
        details: [
          'Enquadramentos individuais do Carômetro (carometroCrop)',
          'Detecções faciais automáticas para o Carômetro (autoFaceCrop)',
        ],
      },
      {
        id: 'crops',
        name: 'Enquadramentos / Ajustes',
        group: 'students',
        description: 'Todos os enquadramentos, crops e ajustes fotográficos.',
        icon: Crop,
        getCount: () => cropsCount,
        getCountLabel: () => `${cropsCount} ajuste(s)`,
        details: [
          'Ajustes da foto principal (timelinePrimaryCrop)',
          'Ajustes das fotos secundárias (timelineSecondaryCrop)',
          'Ajustes do Carômetro (carometroCrop)',
          'Detecções faciais automáticas (autoFaceCrop)',
          'Ajustes legados e sugestões de enquadramento',
        ],
      },

      // GRUPO: CONFIGURAÇÕES E DADOS ESTRUTURAIS
      {
        id: 'classes',
        name: 'Turmas',
        group: 'structural',
        description: 'Turmas oficiais cadastradas e ordenação pedagógica.',
        icon: Layers,
        getCount: () => classes.length,
        getCountLabel: () => `${classes.length} turma(s)`,
        details: [
          'Listagem de turmas cadastradas',
          'Etapas de ensino e ordenação pedagógica',
          'Status ativo/inativo das turmas',
        ],
      },
      {
        id: 'periods',
        name: 'Períodos Letivos',
        group: 'structural',
        description: 'Anos letivos cadastrados e controle de encerramento.',
        icon: Calendar,
        getCount: () => periods.length,
        getCountLabel: () => `${periods.length} período(s)`,
        details: [
          'Anos letivos registrados (ex: 2026, 2025...)',
          'Status de produção e períodos fechados',
          'Definição do período ativo do sistema',
        ],
      },
      {
        id: 'school_data',
        name: 'Dados da Escola',
        group: 'structural',
        description: 'Nome institucional, logotipo e configurações da escola.',
        icon: School,
        getCount: () => (schoolConfig?.schoolName ? 'Configurado' : 'Vazio'),
        getCountLabel: () =>
          schoolConfig?.schoolName
            ? `"${schoolConfig.schoolName}" ${schoolConfig.schoolLogo ? '(com Logo)' : ''}`
            : 'Padrão não informado',
        details: [
          'Nome oficial da instituição de ensino (schoolName)',
          'Logotipo oficial da escola em imagem/base64 (schoolLogo)',
          'Quantidade de slots no histórico fotográfico (photoHistorySlots)',
        ],
      },
      {
        id: 'models',
        name: 'Modelos da Linha do Tempo',
        group: 'structural',
        description: 'Modelos de layout, slots e posições da Linha do Tempo.',
        icon: LayoutModelIcon,
        getCount: () => models.length,
        getCountLabel: () => `${models.length} modelo(s)`,
        details: [
          'Modelos e templates cadastrados da Linha do Tempo',
          'Posições de fotos principais e slots secundários',
          'Textos e elementos gráficos dos layouts',
        ],
      },
    ],
    [students, records, photosCount, timelines, carometroCount, cropsCount, classes, periods, schoolConfig, models]
  );

  // Toggle single category selection
  const handleToggleCategory = (catId: SelectiveClearCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  // Select all categories
  const handleSelectAll = () => {
    const allIds = CATEGORIES.map((c) => c.id);
    setSelectedCategories(allIds);
  };

  // Clear all selections
  const handleClearSelection = () => {
    setSelectedCategories([]);
  };

  const isAllSelected = selectedCategories.length === CATEGORIES.length && CATEGORIES.length > 0;

  // Análise de Dependências em tempo real
  const detectedDependencies = useMemo(() => {
    const warnings: string[] = [];

    const hasStudents = selectedCategories.includes('students');
    const hasCollaborators = selectedCategories.includes('collaborators');
    const hasRecords = selectedCategories.includes('records');
    const hasPhotos = selectedCategories.includes('photos');
    const hasTimelines = selectedCategories.includes('timelines');
    const hasCrops = selectedCategories.includes('crops');
    const hasClasses = selectedCategories.includes('classes');
    const hasPeriods = selectedCategories.includes('periods');
    const hasModels = selectedCategories.includes('models');

    // 1. Alunos selecionados sem Matrículas (Bloqueio de integridade)
    if (hasStudents && !hasRecords) {
      const studentIds = new Set(students.filter((s) => (s.personType || 'student') === 'student').map((s) => s.id));
      const dependentRecords = records.filter((r) => r.studentId && studentIds.has(r.studentId));
      if (dependentRecords.length > 0) {
        warnings.push(
          `⚠️ Bloqueio de Integridade: Existem ${dependentRecords.length} matrícula(s) vinculadas aos alunos que serão removidos. Não é permitido excluir 'Alunos' mantendo as 'Matrículas' órfãs. Selecione também a categoria 'Matrículas' para autorizar a limpeza.`
        );
      }
    }

    // 1b. Colaboradores selecionados sem Matrículas / Registros (Bloqueio de integridade)
    if (hasCollaborators && !hasRecords) {
      const collabIds = new Set(students.filter((s) => s.personType === 'collaborator').map((s) => s.id));
      const dependentRecords = records.filter((r) => r.studentId && collabIds.has(r.studentId));
      if (dependentRecords.length > 0) {
        warnings.push(
          `⚠️ Bloqueio de Integridade: Existem ${dependentRecords.length} registro(s) de períodos vinculados aos colaboradores que serão removidos. Não é permitido excluir 'Colaboradores' mantendo os registros órfãos. Selecione também a categoria 'Matrículas' para autorizar a limpeza.`
        );
      }
    }

    // 2. Alunos selecionados sem Produções da Linha do Tempo (Bloqueio de integridade)
    if (hasStudents && !hasTimelines) {
      const studentIds = new Set(students.filter((s) => (s.personType || 'student') === 'student').map((s) => s.id));
      const dependentTimelines = timelines.filter((t) => t.studentId && studentIds.has(t.studentId));
      if (dependentTimelines.length > 0) {
        warnings.push(
          `⚠️ Bloqueio de Integridade: Existem ${dependentTimelines.length} composição(ões) da Linha do Tempo vinculadas aos alunos que serão removidos. Não é permitido excluir 'Alunos' mantendo as 'Produções da Linha do Tempo' órfãs. Selecione também a categoria 'Produções da Linha do Tempo' para autorizar a limpeza.`
        );
      }
    }

    // 2b. Colaboradores selecionados sem Produções da Linha do Tempo (Bloqueio de integridade)
    if (hasCollaborators && !hasTimelines) {
      const collabIds = new Set(students.filter((s) => s.personType === 'collaborator').map((s) => s.id));
      const dependentTimelines = timelines.filter((t) => t.studentId && collabIds.has(t.studentId));
      if (dependentTimelines.length > 0) {
        warnings.push(
          `⚠️ Bloqueio de Integridade: Existem ${dependentTimelines.length} composição(ões) da Linha do Tempo vinculadas aos colaboradores que serão removidos. Não é permitido excluir 'Colaboradores' mantendo as 'Produções da Linha do Tempo' órfãs. Selecione também a categoria 'Produções da Linha do Tempo' para autorizar a limpeza.`
        );
      }
    }

    // 3. Turmas selecionadas sem Matrículas (Bloqueio de integridade)
    if (hasClasses && !hasRecords) {
      const classNames = new Set(classes.map((c) => c.name.trim().toUpperCase()));
      const dependentRecords = records.filter((r) => {
        if (!r.className) return false;
        const cleanName = r.className.trim().toUpperCase();
        return classNames.has(cleanName);
      });
      if (dependentRecords.length > 0) {
        warnings.push(
          `⚠️ Bloqueio de Integridade: Existem ${dependentRecords.length} matrícula(s) vinculadas às turmas que seriam removidas. Não é permitido excluir 'Turmas' isoladamente mantendo matrículas desvinculadas. Selecione também a categoria 'Matrículas' para autorizar a limpeza.`
        );
      }
    }

    // 4. Períodos Letivos selecionados sem Matrículas (Bloqueio de integridade)
    if (hasPeriods && !hasRecords) {
      const periodNames = new Set(periods.map((p) => String(p.name).trim()));
      const dependentRecords = records.filter((r) => {
        if (r.year === undefined || r.year === null) return false;
        const yrStr = String(r.year).trim();
        return periodNames.has(yrStr);
      });
      if (dependentRecords.length > 0) {
        warnings.push(
          `⚠️ Bloqueio de Integridade: Existem ${dependentRecords.length} matrícula(s) cadastradas nos períodos letivos que seriam removidos. Não é permitido excluir 'Períodos Letivos' isoladamente mantendo matrículas com período órfão. Selecione também a categoria 'Matrículas' para autorizar a limpeza.`
        );
      }
    }

    // 5. Modelos da Linha do Tempo selecionados sem Produções (Bloqueio de integridade)
    if (hasModels && !hasTimelines) {
      const modelIds = new Set(models.map((m) => m.id));
      const dependentTimelines = timelines.filter((t) => t.modelId && modelIds.has(t.modelId));
      if (dependentTimelines.length > 0) {
        warnings.push(
          `⚠️ Bloqueio de Integridade: Existem ${dependentTimelines.length} composição(ões) da Linha do Tempo vinculadas aos modelos que seriam removidos. Não é permitido excluir 'Modelos da Linha do Tempo' isoladamente mantendo produções órfãs. Selecione também a categoria 'Produções da Linha do Tempo' para autorizar a limpeza.`
        );
      }
    }

    // 6. Fotografias selecionadas sem Enquadramentos / Ajustes
    if (hasPhotos && !hasCrops && !hasRecords) {
      if (cropsCount > 0) {
        warnings.push(
          `Ao remover as fotografias, os ${cropsCount} enquadramentos e ajustes existentes perderão a imagem fotográfica de referência.`
        );
      }
    }

    // 7. Enquadramentos selecionados sem Fotografias
    if (hasCrops && !hasPhotos && !hasRecords) {
      warnings.push(
        'As fotografias originais dos alunos serão mantidas, mas todos os recortes, enquadramentos e detecções faciais serão restaurados ao padrão original.'
      );
    }

    return warnings;
  }, [selectedCategories, students, records, classes, periods, models, timelines, cropsCount]);

  // Verificação de bloqueio estrito por integridade relacional
  const isBlockedByIntegrity = useMemo(() => {
    const hasStudents = selectedCategories.includes('students');
    const hasCollaborators = selectedCategories.includes('collaborators');
    const hasRecords = selectedCategories.includes('records');
    const hasClasses = selectedCategories.includes('classes');
    const hasPeriods = selectedCategories.includes('periods');
    const hasTimelines = selectedCategories.includes('timelines');
    const hasModels = selectedCategories.includes('models');

    // 1. Alunos sem Matrículas
    if (hasStudents && !hasRecords) {
      const studentIds = new Set(students.filter((s) => (s.personType || 'student') === 'student').map((s) => s.id));
      if (records.some((r) => r.studentId && studentIds.has(r.studentId))) return true;
    }

    // 1b. Colaboradores sem Matrículas / Registros
    if (hasCollaborators && !hasRecords) {
      const collabIds = new Set(students.filter((s) => s.personType === 'collaborator').map((s) => s.id));
      if (records.some((r) => r.studentId && collabIds.has(r.studentId))) return true;
    }

    // 2. Alunos sem Produções
    if (hasStudents && !hasTimelines) {
      const studentIds = new Set(students.filter((s) => (s.personType || 'student') === 'student').map((s) => s.id));
      if (timelines.some((t) => t.studentId && studentIds.has(t.studentId))) return true;
    }

    // 2b. Colaboradores sem Produções
    if (hasCollaborators && !hasTimelines) {
      const collabIds = new Set(students.filter((s) => s.personType === 'collaborator').map((s) => s.id));
      if (timelines.some((t) => t.studentId && collabIds.has(t.studentId))) return true;
    }

    // 3. Turmas sem Matrículas
    if (hasClasses && !hasRecords) {
      const classNames = new Set(classes.map((c) => c.name.trim().toUpperCase()));
      if (
        records.some((r) => {
          if (!r.className) return false;
          const cleanName = r.className.trim().toUpperCase();
          return classNames.has(cleanName);
        })
      ) {
        return true;
      }
    }

    // 4. Períodos sem Matrículas
    if (hasPeriods && !hasRecords) {
      const periodNames = new Set(periods.map((p) => String(p.name).trim()));
      if (
        records.some((r) => {
          if (r.year === undefined || r.year === null) return false;
          const yrStr = String(r.year).trim();
          return periodNames.has(yrStr);
        })
      ) {
        return true;
      }
    }

    // 5. Modelos sem Produções
    if (hasModels && !hasTimelines) {
      const modelIds = new Set(models.map((m) => m.id));
      if (timelines.some((t) => t.modelId && modelIds.has(t.modelId))) return true;
    }

    return false;
  }, [selectedCategories, students, records, classes, periods, models, timelines]);

  // Form Submit: Email
  const handleChangeEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingEmail) return;

    setEmailErrorMsg(null);
    setEmailSuccessMsg(null);

    const cleanEmail = newEmail.trim();
    if (!cleanEmail) {
      setEmailErrorMsg('Informe o novo endereço de e-mail.');
      return;
    }
    if (cleanEmail.toLowerCase() === (adminEmail || '').toLowerCase()) {
      setEmailErrorMsg('O novo e-mail deve ser diferente do e-mail atual.');
      return;
    }
    if (!emailCurrentPassword) {
      setEmailErrorMsg('Informe sua senha atual para autorizar a alteração.');
      return;
    }

    setIsSavingEmail(true);
    try {
      await changeEmail(emailCurrentPassword, cleanEmail);
      setEmailSuccessMsg('E-mail administrativo atualizado com sucesso!');
      setNewEmail('');
      setEmailCurrentPassword('');
    } catch (err: any) {
      setEmailErrorMsg(err.message || 'Erro ao atualizar e-mail.');
    } finally {
      setIsSavingEmail(false);
    }
  };

  // Form Submit: Password
  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingPassword) return;

    setPasswordErrorMsg(null);
    setPasswordSuccessMsg(null);

    if (!currentPassword) {
      setPasswordErrorMsg('Informe a senha atual.');
      return;
    }
    if (!newPassword) {
      setPasswordErrorMsg('Informe a nova senha.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordErrorMsg('A nova senha deve conter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordErrorMsg('A confirmação da nova senha não confere.');
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordErrorMsg('A nova senha deve ser diferente da senha atual.');
      return;
    }

    setIsSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordSuccessMsg('Senha administrativa atualizada com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordErrorMsg(err.message || 'Erro ao atualizar senha.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  // Open confirmation modal
  const handleOpenClearModal = () => {
    if (selectedCategories.length === 0) return;
    setConfirmText('');
    setClearErrorMsg(null);
    setIsClearing(false);
    setClearingStep('');
    setIsConfirmModalOpen(true);
  };

  // Execute Selective Clear with mandatory prior backup
  const handleExecuteClear = async () => {
    if (confirmText !== 'LIMPAR PRODUÇÃO' || isClearing || selectedCategories.length === 0 || isBlockedByIntegrity) return;

    setClearErrorMsg(null);
    setIsClearing(true);

    try {
      // Passo 1: Preparando backup
      setClearingStep('Preparando backup de segurança...');
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Passo 2: Validando backup
      setClearingStep('Validando integridade do backup...');
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Passo 3: Removendo dados selecionados
      setClearingStep('Removendo dados selecionados...');

      const response = await apiFetch('/api/maintenance/clear-production-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categories: selectedCategories,
          confirmation: confirmText,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao executar limpeza seletiva.');
      }

      // Passo 4: Finalizando
      setClearingStep('Finalizando...');
      await new Promise((resolve) => setTimeout(resolve, 300));

      setClearSuccessData({
        backupFilename: data.backup?.filename || 'backup_automatico.zip',
        clearedCategories: data.selectedCategories || selectedCategories,
        backupSizeBytes: data.backup?.sizeBytes,
      });

      setIsConfirmModalOpen(false);
      setConfirmText('');
      setSelectedCategories([]);

      // Notificar aplicação para recarregar dados do servidor
      if (onDataCleared) {
        await onDataCleared();
      }
    } catch (err: any) {
      console.error('Erro na limpeza seletiva:', err);
      setClearErrorMsg(err.message || 'Ocorreu um erro ao tentar executar a limpeza seletiva.');
    } finally {
      setIsClearing(false);
      setClearingStep('');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* 1. Account Summary Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Conta de Acesso Administrativo
                </h3>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded-full uppercase tracking-wider">
                  Admin Protegido
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                E-mail atual:{' '}
                <span className="font-semibold text-slate-900 font-mono">
                  {adminEmail || 'admin'}
                </span>
              </p>
            </div>
          </div>

          <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 sm:max-w-xs">
            <span className="font-semibold text-slate-700">Proteção Permanente:</span> A conta Admin, credenciais e sessão nunca são afetadas por ferramentas de manutenção ou limpeza.
          </div>
        </div>
      </div>

      {/* 2. Alterar E-mail e Alterar Senha */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Alterar E-mail */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <form onSubmit={handleChangeEmailSubmit} className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Mail className="w-4 h-4 text-blue-600" />
              <h4 className="text-sm font-bold text-slate-900">Alterar E-mail</h4>
            </div>

            <p className="text-xs text-slate-500">
              Altere o endereço de e-mail utilizado para fazer login no sistema escolar.
            </p>

            {emailSuccessMsg && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{emailSuccessMsg}</span>
              </div>
            )}

            {emailErrorMsg && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-800 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{emailErrorMsg}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Novo E-mail
              </label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="novo.email@escola.com.br"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Senha Atual (para confirmação)
              </label>
              <input
                type="password"
                required
                value={emailCurrentPassword}
                onChange={(e) => setEmailCurrentPassword(e.target.value)}
                placeholder="Sua senha atual"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isSavingEmail}
                disabled={isSavingEmail}
                className="w-full justify-center text-xs font-bold"
              >
                {isSavingEmail ? 'Salvando novo e-mail...' : 'Salvar novo e-mail'}
              </Button>
            </div>
          </form>
        </div>

        {/* Alterar Senha */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <KeyRound className="w-4 h-4 text-blue-600" />
              <h4 className="text-sm font-bold text-slate-900">Alterar Senha</h4>
            </div>

            <p className="text-xs text-slate-500">
              Atualize a senha de acesso administrativo ao sistema escolar.
            </p>

            {passwordSuccessMsg && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{passwordSuccessMsg}</span>
              </div>
            )}

            {passwordErrorMsg && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-800 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{passwordErrorMsg}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Senha Atual
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Digite a senha atual"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Nova Senha
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo de 6 caracteres"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Confirmar Nova Senha
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isSavingPassword}
                disabled={isSavingPassword}
                className="w-full justify-center text-xs font-bold"
              >
                {isSavingPassword ? 'Atualizando senha...' : 'Atualizar senha'}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* 3. MANUTENÇÃO DO SISTEMA — LIMPEZA SELETIVA DE DADOS */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-5">
        {/* Cabeçalho da Seção */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Manutenção do Sistema — Limpeza Seletiva</h4>
              <p className="text-xs text-slate-500">
                Selecione individualmente os grupos de dados que deseja limpar ou redefinir.
              </p>
            </div>
          </div>

          {/* Botões de Seleção Rápida */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={isAllSelected ? handleClearSelection : handleSelectAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors"
            >
              {isAllSelected ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Limpar seleção</span>
                </>
              ) : (
                <>
                  <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                  <span>Selecionar tudo</span>
                </>
              )}
            </button>
            {selectedCategories.length > 0 && !isAllSelected && (
              <button
                type="button"
                onClick={handleClearSelection}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Desmarcar todos
              </button>
            )}
          </div>
        </div>

        {/* Feedback de sucesso de limpeza anterior */}
        {clearSuccessData && (
          <Alert
            variant="success"
            title="Limpeza Seletiva Concluída com Sucesso"
            onClose={() => setClearSuccessData(null)}
          >
            <div className="space-y-2 text-xs text-emerald-900">
              <p>
                As categorias selecionadas foram processadas e limpas com sucesso no sistema.
              </p>
              <div className="bg-emerald-100/70 border border-emerald-300/60 rounded-lg p-2.5 space-y-1 text-emerald-950 font-mono text-[11px]">
                <div className="flex items-center gap-1.5 font-sans font-semibold">
                  <FileArchive className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Backup de segurança gerado antes da operação:</span>
                </div>
                <div className="text-emerald-800 break-all">{clearSuccessData.backupFilename}</div>
                {clearSuccessData.backupSizeBytes && (
                  <div className="text-[10px] text-emerald-700 font-sans">
                    Tamanho validado: {(clearSuccessData.backupSizeBytes / 1024).toFixed(1)} KB
                  </div>
                )}
              </div>
              <p className="text-[11px] text-emerald-800">
                A conta administrativa e todos os módulos não selecionados permaneceram intactos.
              </p>
            </div>
          </Alert>
        )}

        {/* GRUPO 1: DADOS DOS ALUNOS */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-600" />
              Dados dos Alunos e Produção
            </span>
            <span className="text-[11px] text-slate-400">
              {CATEGORIES.filter((c) => c.group === 'students' && selectedCategories.includes(c.id)).length} de{' '}
              {CATEGORIES.filter((c) => c.group === 'students').length} selecionados
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {CATEGORIES.filter((c) => c.group === 'students').map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedCategories.includes(cat.id);
              return (
                <div
                  key={cat.id}
                  onClick={() => handleToggleCategory(cat.id)}
                  className={`cursor-pointer rounded-xl border p-3.5 transition-all flex flex-col justify-between select-none ${
                    isSelected
                      ? 'border-rose-300 bg-rose-50/40 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-bold text-slate-900">{cat.name}</span>
                      </div>
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-rose-600 border-rose-600 text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      {cat.description}
                    </p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Total encontrado:</span>
                    <span
                      className={`font-semibold ${
                        isSelected ? 'text-rose-700' : 'text-slate-700'
                      }`}
                    >
                      {cat.getCountLabel()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* GRUPO 2: CONFIGURAÇÕES E DADOS ESTRUTURAIS */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              Configurações e Dados Estruturais
            </span>
            <span className="text-[11px] text-slate-400">
              {CATEGORIES.filter((c) => c.group === 'structural' && selectedCategories.includes(c.id)).length} de{' '}
              {CATEGORIES.filter((c) => c.group === 'structural').length} selecionados
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {CATEGORIES.filter((c) => c.group === 'structural').map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedCategories.includes(cat.id);
              return (
                <div
                  key={cat.id}
                  onClick={() => handleToggleCategory(cat.id)}
                  className={`cursor-pointer rounded-xl border p-3.5 transition-all flex flex-col justify-between select-none ${
                    isSelected
                      ? 'border-rose-300 bg-rose-50/40 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-bold text-slate-900">{cat.name}</span>
                      </div>
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-rose-600 border-rose-600 text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      {cat.description}
                    </p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Total:</span>
                    <span
                      className={`font-semibold truncate max-w-[130px] ${
                        isSelected ? 'text-rose-700' : 'text-slate-700'
                      }`}
                      title={cat.getCountLabel()}
                    >
                      {cat.getCountLabel()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rodapé da Manutenção com Botão de Ação */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-slate-900 flex items-center gap-2">
              <span>Status da Seleção:</span>
              <span className="font-bold text-rose-700">
                {selectedCategories.length === 0
                  ? 'Nenhuma categoria selecionada'
                  : isAllSelected
                  ? `Todas as ${CATEGORIES.length} categorias selecionadas`
                  : `${selectedCategories.length} de ${CATEGORIES.length} categorias selecionadas`}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              O sistema criará um backup completo e validará o arquivo antes de excluir qualquer dado selecionado.
            </p>
          </div>

          <Button
            type="button"
            variant="danger"
            size="sm"
            icon={Trash2}
            onClick={handleOpenClearModal}
            disabled={selectedCategories.length === 0}
            className="w-full sm:w-auto text-xs font-semibold"
          >
            {selectedCategories.length === 0
              ? 'Selecione as categorias para limpar'
              : 'Limpar dados selecionados'}
          </Button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* MODAL DE CONFIRMAÇÃO FORTE E REVISÃO DETALHADA COM DEPENDÊNCIAS */}
      {/* ================================================================ */}
      <Modal
        isOpen={isConfirmModalOpen}
        onClose={() => {
          if (!isClearing) {
            setIsConfirmModalOpen(false);
          }
        }}
        title="ATENÇÃO — REVISAR EXCLUSÃO"
        size="xl"
      >
        <div className="space-y-5">
          {/* ALERTA ESPECIAL QUANDO 'SELECIONAR TUDO' É UTILIZADO */}
          {isAllSelected ? (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-2 text-amber-950">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Você selecionou todas as categorias disponíveis para limpeza</span>
              </div>
              <p className="text-xs leading-relaxed text-amber-900">
                Todas as produções, alunos e configurações estruturais serão limpos. O sistema retornará ao estado inicial limpo.
              </p>
              <div className="p-2.5 bg-white/80 border border-amber-200 rounded-lg text-xs font-semibold text-amber-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Mesmo selecionando tudo, a conta administrativa (login, e-mail e senha) NÃO será excluída e permanecerá protegida.</span>
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-900">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-700">
                  Atenção: Revisão de Exclusão Seletiva
                </h4>
                <p className="text-xs font-medium leading-relaxed">
                  Confira atentamente os grupos de dados que serão removidos e as dependências identificadas.
                </p>
              </div>
            </div>
          )}

          {/* BLOCO DE DEPENDÊNCIAS DETECTADAS (SE HOUVER) */}
          {detectedDependencies.length > 0 && (
            <div
              className={`p-4 border rounded-xl space-y-2 ${
                isBlockedByIntegrity
                  ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-400/50'
                  : 'bg-amber-50/80 border-amber-200'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {isBlockedByIntegrity
                    ? 'Bloqueio de Integridade Relacional Ativo:'
                    : 'Dependências identificadas na seleção atual:'}
                </span>
              </div>
              <ul className="space-y-1.5 text-xs text-amber-900 list-disc list-inside">
                {detectedDependencies.map((dep, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {dep}
                  </li>
                ))}
              </ul>
              {isBlockedByIntegrity && (
                <p className="text-[11px] font-semibold text-amber-800 pt-1 border-t border-amber-200/80">
                  Para autorizar a limpeza, marque também as categorias dependentes indicadas ou cancele a operação.
                </p>
              )}
            </div>
          )}

          {/* DUAS COLUNAS: O QUE SERÁ EXCLUÍDO vs O QUE SERÁ PRESERVADO */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Coluna 1: O que será Excluído */}
            <div className="bg-rose-50/50 border border-rose-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-rose-200/80 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                  <Trash2 className="w-4 h-4 text-rose-600" />
                  <span>Será excluído / redefinido:</span>
                </div>
                <span className="px-2 py-0.5 bg-rose-200/80 text-rose-900 text-[10px] font-bold rounded-full">
                  {selectedCategories.length} selecionada(s)
                </span>
              </div>

              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {CATEGORIES.filter((c) => selectedCategories.includes(c.id)).map((cat) => (
                  <div
                    key={cat.id}
                    className="p-2.5 bg-white rounded-lg border border-rose-100 space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between font-bold text-rose-950">
                      <span>{cat.name}</span>
                      <span className="text-[11px] font-mono text-rose-700">
                        {cat.getCountLabel()}
                      </span>
                    </div>
                    <ul className="text-[11px] text-slate-600 list-disc list-inside space-y-0.5 pl-1">
                      {cat.details.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Coluna 2: O que será Preservado */}
            <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-200/80 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Será preservado e protegido:</span>
                </div>
                <span className="px-2 py-0.5 bg-emerald-200/80 text-emerald-900 text-[10px] font-bold rounded-full">
                  Protegido
                </span>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {/* Conta Admin (Sempre Protegida) */}
                <div className="p-2.5 bg-white rounded-lg border border-emerald-100 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-950">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Conta Administrativa (Permanente)</span>
                  </div>
                  <p className="text-[11px] text-slate-600 pl-5">
                    E-mail ({adminEmail || 'admin'}), senha criptografada, hash e credenciais de login.
                  </p>
                </div>

                {/* Backups anteriores */}
                <div className="p-2.5 bg-white rounded-lg border border-emerald-100 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-950">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Histórico de Backups Anteriores</span>
                  </div>
                  <p className="text-[11px] text-slate-600 pl-5">
                    Todos os arquivos ZIP gerados anteriormente em disco permanecerão intactos.
                  </p>
                </div>

                {/* Categorias Não Selecionadas */}
                {CATEGORIES.filter((c) => !selectedCategories.includes(c.id)).map((cat) => (
                  <div
                    key={cat.id}
                    className="p-2.5 bg-white rounded-lg border border-emerald-100 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between font-bold text-emerald-950">
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{cat.name}</span>
                      </div>
                      <span className="text-[11px] font-mono text-emerald-800">
                        {cat.getCountLabel()}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 pl-5">{cat.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* AVISO DO BACKUP AUTOMÁTICO PRÉVIO OBRIGATÓRIO */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2.5 text-xs text-blue-900">
            <FileArchive className="w-4 h-4 text-blue-600 shrink-0" />
            <div>
              <span className="font-bold">Backup de Segurança Automático Obrigatório:</span> Antes de efetuar qualquer exclusão, o servidor gerará automaticamente um arquivo ZIP contendo todo o estado do sistema e validará sua integridade em disco. Se o backup falhar, a operação será cancelada e nenhum dado será apagado.
            </div>
          </div>

          {/* Mensagem de Erro (se houver) */}
          {clearErrorMsg && (
            <Alert variant="error" title="Não foi possível concluir a limpeza">
              {clearErrorMsg}
            </Alert>
          )}

          {/* Campo de Confirmação Textual */}
          <div className="space-y-2 pt-1">
            <label className="block text-xs font-semibold text-slate-800">
              Digite <span className="font-mono font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">LIMPAR PRODUÇÃO</span> para confirmar:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={isClearing}
              placeholder="LIMPAR PRODUÇÃO"
              autoComplete="off"
              spellCheck="false"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-rose-500/40 focus:border-rose-500"
            />
          </div>

          {/* Estado de Processamento Progressivo */}
          {isClearing && (
            <div className="p-3.5 bg-slate-900 text-white rounded-lg flex items-center gap-3 text-xs animate-in fade-in">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
              <span className="font-medium">{clearingStep || 'Processando manutenção do sistema...'}</span>
            </div>
          )}

          {/* Ações do Modal */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
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
              icon={Trash2}
              onClick={handleExecuteClear}
              isLoading={isClearing}
              disabled={confirmText !== 'LIMPAR PRODUÇÃO' || isClearing || selectedCategories.length === 0 || isBlockedByIntegrity}
              className="font-bold"
            >
              Confirmar e limpar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

function LayoutModelIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  );
}
