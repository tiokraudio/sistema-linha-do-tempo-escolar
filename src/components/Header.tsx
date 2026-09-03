import React, { useState } from 'react';
import { SchoolConfig } from '../types';
import { School, Search, LogOut, User, ShieldCheck, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  config: SchoolConfig;
  currentPeriodName?: string;
  isSettingsActive?: boolean;
  onOpenGlobalSearch?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  config,
  currentPeriodName,
  isSettingsActive = false,
  onOpenGlobalSearch,
  onOpenAccountSettings,
  onOpenSettings,
}) => {
  const { adminEmail, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = async () => {
    setShowLogoutConfirm(false);
    await logout();
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white px-4 sm:px-6 py-2.5 shadow-xs flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30 shrink-0 w-full">
      {/* Logo & School Name */}
      <div className="flex items-center gap-3">
        {config.schoolLogo ? (
          <img
            src={config.schoolLogo}
            alt="Logo da Escola"
            className="w-8 h-8 object-contain bg-slate-800 p-0.5 rounded-lg border border-slate-700"
          />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold shadow-xs">
            <School className="w-4 h-4" />
          </div>
        )}
        <div>
          <h1 className="text-sm font-semibold tracking-tight text-slate-100 flex items-center gap-2 leading-tight">
            {config.schoolName || 'Linha do Tempo Escolar'}
          </h1>
          <p className="text-[11px] text-slate-400 leading-tight">
            Histórico Fotográfico Escolar
          </p>
        </div>
      </div>

      {/* Global Search Trigger */}
      {onOpenGlobalSearch && (
        <div className="flex-1 max-w-sm mx-2 order-last md:order-none w-full md:w-auto">
          <button
            type="button"
            onClick={onOpenGlobalSearch}
            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-700/80 transition-colors text-xs cursor-pointer text-left group"
            title="Abrir Pesquisa Global de Alunos (Ctrl+K)"
          >
            <div className="flex items-center gap-2 truncate">
              <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-400 transition-colors shrink-0" />
              <span className="truncate text-slate-400 group-hover:text-slate-200">
                Buscar aluno por nome ou matrícula...
              </span>
            </div>
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono bg-slate-900 border border-slate-700 rounded text-slate-400">
              Ctrl+K
            </kbd>
          </button>
        </div>
      )}

      {/* Right Controls: Period Indicator + Admin Badge + Settings + Logout */}
      <div className="flex items-center gap-2 text-xs">
        {currentPeriodName && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300">
            <span className="text-[11px] text-slate-400">Período ativo:</span>
            <span className="font-semibold text-white">{currentPeriodName}</span>
          </div>
        )}

        {/* Admin Account Button */}
        {onOpenAccountSettings ? (
          <button
            type="button"
            onClick={onOpenAccountSettings}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Gerenciar Conta Administrativa"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-medium max-w-[140px] truncate">{adminEmail || 'Admin'}</span>
          </button>
        ) : (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-medium max-w-[140px] truncate">{adminEmail || 'Admin'}</span>
          </div>
        )}

        {/* Settings Button - Discreto, elegante, com acabamento refinado */}
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className={`relative p-2 rounded-lg border transition-all duration-200 cursor-pointer group flex items-center justify-center ${
              isSettingsActive
                ? 'bg-blue-600 border-blue-500 text-white shadow-xs'
                : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:border-slate-600'
            }`}
            title="Configurações do Sistema"
            aria-label="Configurações do Sistema"
          >
            <Settings
              className={`w-4 h-4 transition-transform duration-500 ease-out group-hover:rotate-90 ${
                isSettingsActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'
              }`}
            />
          </button>
        )}

        {/* Logout Button */}
        <button
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-rose-950/80 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-800/60 transition-colors cursor-pointer text-xs"
          title="Encerrar sessão (Sair do sistema)"
        >
          <LogOut className="w-3.5 h-3.5 text-slate-400 group-hover:text-rose-400" />
          <span className="font-medium">Sair</span>
        </button>
      </div>

      {/* Logout Confirmation Dialog */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-sm w-full space-y-4 shadow-2xl text-left animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Encerrar Sessão</h3>
                <p className="text-xs text-slate-400 mt-0.5">Deseja realmente sair do sistema?</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                Sim, sair
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};


