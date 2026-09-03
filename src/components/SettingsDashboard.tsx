import React, { useState, useEffect } from 'react';
import {
  SchoolConfig,
  LayoutModel,
  ClassRecord,
  AcademicPeriod,
  Student,
  AcademicYearRecord,
  GeneratedTimeline,
} from '../types';
import {
  School,
  Palette,
  GraduationCap,
  Calendar,
  ShieldCheck,
  User,
} from 'lucide-react';
import { SchoolSettings } from './SchoolSettings';
import { LayoutEditor } from './LayoutEditor';
import { ClassesManager } from './ClassesManager';
import { PeriodsManager } from './PeriodsManager';
import { BackupSecurityDashboard } from './BackupSecurityDashboard';
import { AccountSettings } from './AccountSettings';
import { PageHeader } from './ui/PageHeader';

export type SettingsCategory = 'school' | 'model' | 'classes' | 'periods' | 'backup' | 'account';

interface SettingsDashboardProps {
  initialCategory?: SettingsCategory;
  schoolConfig: SchoolConfig;
  onSaveSchoolConfig: (config: SchoolConfig) => Promise<void>;
  activeLayoutModel: LayoutModel;
  onSaveLayoutModel: (model: LayoutModel) => Promise<LayoutModel | void>;
  classes: ClassRecord[];
  onUpdateClass?: (id: string, updates: Partial<ClassRecord>) => Promise<void>;
  onReorderClasses?: (ids: string[]) => Promise<void>;
  onResetClassesOrder?: () => Promise<void>;
  onAddClass?: (name: string, stage?: string) => Promise<void>;
  onDeleteClass?: (id: string) => Promise<void>;
  periods: AcademicPeriod[];
  onAddPeriod?: (name: string) => Promise<void>;
  onTogglePeriodActive?: (id: string, active: boolean) => Promise<void>;
  onUpdatePeriod?: (id: string, updates: Partial<AcademicPeriod>) => Promise<void>;
  models?: LayoutModel[];
  students: Student[];
  records: AcademicYearRecord[];
  timelines: GeneratedTimeline[];
  onDataRestored?: () => Promise<void>;
}

export const SettingsDashboard: React.FC<SettingsDashboardProps> = ({
  initialCategory = 'school',
  schoolConfig,
  onSaveSchoolConfig,
  activeLayoutModel,
  onSaveLayoutModel,
  models,
  classes,
  onUpdateClass,
  onReorderClasses,
  onResetClassesOrder,
  onAddClass,
  onDeleteClass,
  periods,
  onAddPeriod,
  onTogglePeriodActive,
  onUpdatePeriod,
  students,
  records,
  timelines,
  onDataRestored,
}) => {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(initialCategory);

  useEffect(() => {
    if (initialCategory) {
      setActiveCategory(initialCategory);
    }
  }, [initialCategory]);

  const categories = [
    {
      id: 'school' as SettingsCategory,
      label: 'Escola',
      icon: School,
    },
    {
      id: 'model' as SettingsCategory,
      label: 'Modelo da Linha do Tempo',
      icon: Palette,
    },
    {
      id: 'classes' as SettingsCategory,
      label: 'Turmas',
      icon: GraduationCap,
    },
    {
      id: 'periods' as SettingsCategory,
      label: 'Períodos Letivos',
      icon: Calendar,
    },
    {
      id: 'backup' as SettingsCategory,
      label: 'Backup e Segurança',
      icon: ShieldCheck,
    },
    {
      id: 'account' as SettingsCategory,
      label: 'Minha Conta',
      icon: User,
    },
  ];

  return (
    <div className="space-y-4">
      {/* 2. CABEÇALHO */}
      <PageHeader
        title="Configurações"
        subtitle="Preferências e configurações do sistema."
      />

      {/* 3. NAVEGAÇÃO INTERNA */}
      <div className="bg-white rounded-xl border border-slate-200 p-1 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-2 ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* CONTEÚDO DA CATEGORIA SELECIONADA */}
      <div>
        {activeCategory === 'school' && (
          <SchoolSettings
            config={schoolConfig}
            onSaveConfig={onSaveSchoolConfig}
          />
        )}

        {activeCategory === 'model' && (
          <LayoutEditor
            model={activeLayoutModel}
            schoolConfig={schoolConfig}
            onSaveModel={onSaveLayoutModel}
          />
        )}

        {activeCategory === 'classes' && (
          <ClassesManager
            classes={classes}
            onUpdateClass={onUpdateClass}
            onReorderClasses={onReorderClasses}
            onResetOrder={onResetClassesOrder}
            onAddClass={onAddClass}
            onDeleteClass={onDeleteClass}
          />
        )}

        {activeCategory === 'periods' && (
          <PeriodsManager
            periods={periods}
            records={records}
            onAddPeriod={onAddPeriod || (async () => {})}
            onTogglePeriodActive={onTogglePeriodActive}
            onUpdatePeriod={onUpdatePeriod}
          />
        )}

        {activeCategory === 'backup' && (
          <BackupSecurityDashboard
            schoolConfig={schoolConfig}
            periods={periods}
            students={students}
            records={records}
            timelines={timelines}
            onDataRestored={onDataRestored || (async () => {})}
          />
        )}

        {activeCategory === 'account' && (
          <AccountSettings
            schoolConfig={schoolConfig}
            classes={classes}
            periods={periods}
            models={models || [activeLayoutModel]}
            students={students}
            records={records}
            timelines={timelines}
            onDataCleared={onDataRestored}
          />
        )}
      </div>
    </div>
  );
};
