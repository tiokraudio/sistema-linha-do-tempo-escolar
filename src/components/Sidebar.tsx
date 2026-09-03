import React from 'react';
import { ActiveTab } from '../types';
import { Users, Briefcase, Sparkles, Settings, Camera, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenAccountSettings?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onOpenAccountSettings }) => {
  const { adminEmail, logout } = useAuth();

  // 1. CADASTRO
  const cadastroGroup = [
    {
      id: 'students' as ActiveTab,
      label: 'Alunos',
      icon: Users,
    },
    {
      id: 'collaborators' as ActiveTab,
      label: 'Colaboradores',
      icon: Briefcase,
    },
  ];

  // 2. FOTOGRAFIAS
  const photoGroup = [
    {
      id: 'photo_management' as ActiveTab,
      label: 'Fotografias',
      icon: Camera,
    },
  ];

  // 3. LINHA DO TEMPO
  const timelineGroup = [
    {
      id: 'generate_timeline' as ActiveTab,
      label: 'Produção',
      icon: Sparkles,
    },
  ];

  // 4. CONFIGURAÇÕES
  const configGroup = [
    {
      id: 'settings' as ActiveTab,
      label: 'Configurações',
      icon: Settings,
    },
  ];

  const renderNavItem = (item: { id: ActiveTab; label: string; icon: React.ElementType }) => {
    const Icon = item.icon;
    const isActive =
      item.id === 'settings'
        ? activeTab === 'settings' ||
          activeTab === 'school_settings' ||
          activeTab === 'layout_models' ||
          activeTab === 'classes' ||
          activeTab === 'periods' ||
          activeTab === 'backup_security' ||
          activeTab === 'account_settings'
        : activeTab === item.id;

    return (
      <button
        key={item.id}
        onClick={() => setActiveTab(item.id)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
          isActive
            ? 'bg-blue-600 text-white font-semibold shadow-xs'
            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
          <span>{item.label}</span>
        </div>
      </button>
    );
  };

  return (
    <aside className="w-60 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col shrink-0 min-h-[calc(100vh-57px)]">
      <div className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {/* 1. CADASTRO */}
        <div>
          <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Cadastro
          </div>
          <nav className="space-y-0.5">{cadastroGroup.map(renderNavItem)}</nav>
        </div>

        {/* 2. FOTOGRAFIAS */}
        <div>
          <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Fotografias
          </div>
          <nav className="space-y-0.5">{photoGroup.map(renderNavItem)}</nav>
        </div>

        {/* 3. LINHA DO TEMPO */}
        <div>
          <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Linha do Tempo
          </div>
          <nav className="space-y-0.5">{timelineGroup.map(renderNavItem)}</nav>
        </div>

        {/* 4. CONFIGURAÇÕES */}
        <div>
          <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Sistema
          </div>
          <nav className="space-y-0.5">{configGroup.map(renderNavItem)}</nav>
        </div>
      </div>

      {/* Footer Status & Admin Info */}
      <div className="p-3 border-t border-slate-800/80 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
            <span>Sistema Operacional</span>
          </div>
          <span className="text-[10px] font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 border border-slate-700">
            v1.0
          </span>
        </div>

        {/* Admin account card in sidebar */}
        <div className="pt-1 flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs">
          <button
            type="button"
            onClick={onOpenAccountSettings}
            className="flex items-center gap-2 min-w-0 text-left hover:text-white transition-colors cursor-pointer group"
            title="Abrir Minha Conta"
          >
            <div className="w-6 h-6 rounded-md bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:text-blue-300 shrink-0">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-200 truncate">
                {adminEmail || 'Administrador'}
              </div>
              <div className="text-[9px] text-slate-400 uppercase tracking-wider">
                Admin
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => logout()}
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-md transition-colors cursor-pointer shrink-0"
            title="Sair"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};


