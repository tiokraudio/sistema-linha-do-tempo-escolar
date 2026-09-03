import React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type AlertVariant = 'success' | 'error' | 'warning' | 'info';

export interface AlertProps {
  children: React.ReactNode;
  variant?: AlertVariant;
  title?: string;
  onClose?: () => void;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  children,
  variant = 'info',
  title,
  onClose,
  className = '',
}) => {
  const configs = {
    success: {
      icon: CheckCircle2,
      bg: 'bg-emerald-50 border-emerald-200 text-emerald-800',
      iconColor: 'text-emerald-600',
    },
    error: {
      icon: AlertCircle,
      bg: 'bg-rose-50 border-rose-200 text-rose-800',
      iconColor: 'text-rose-600',
    },
    warning: {
      icon: AlertTriangle,
      bg: 'bg-amber-50 border-amber-200 text-amber-800',
      iconColor: 'text-amber-600',
    },
    info: {
      icon: Info,
      bg: 'bg-blue-50 border-blue-200 text-blue-800',
      iconColor: 'text-blue-600',
    },
  };

  const current = configs[variant];
  const Icon = current.icon;

  return (
    <div
      className={`p-3.5 rounded-lg border text-xs leading-relaxed flex items-start gap-2.5 ${current.bg} ${className}`}
    >
      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${current.iconColor}`} />
      <div className="flex-1">
        {title && <h4 className="font-semibold mb-0.5">{title}</h4>}
        <div>{children}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded text-current opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Fechar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
