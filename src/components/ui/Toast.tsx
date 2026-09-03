import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastProps {
  message: string;
  type?: ToastType;
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'success',
  onClose,
  duration = 4000,
}) => {
  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const typeConfig = {
    success: {
      icon: CheckCircle2,
      bg: 'bg-slate-900 text-white border border-slate-800 shadow-lg',
      iconColor: 'text-emerald-400',
    },
    error: {
      icon: AlertCircle,
      bg: 'bg-rose-900 text-white border border-rose-800 shadow-lg',
      iconColor: 'text-rose-300',
    },
    info: {
      icon: Info,
      bg: 'bg-slate-900 text-white border border-slate-800 shadow-lg',
      iconColor: 'text-blue-400',
    },
  };

  const current = typeConfig[type];
  const Icon = current.icon;

  return (
    <div className="fixed bottom-5 right-5 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200 pointer-events-auto">
      <div
        className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg max-w-sm text-xs font-medium ${current.bg}`}
      >
        <Icon className={`w-4 h-4 shrink-0 ${current.iconColor}`} />
        <span className="flex-1 leading-normal">{message}</span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 -mr-1 text-slate-400 hover:text-white rounded hover:bg-white/10 transition-colors"
          title="Fechar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
