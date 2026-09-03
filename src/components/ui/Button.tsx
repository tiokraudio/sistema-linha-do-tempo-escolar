import React from 'react';
import { LucideIcon, Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  isLoading?: boolean;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  isLoading = false,
  loading = false,
  className = '',
  disabled,
  ...props
}) => {
  const isBusy = isLoading || loading;
  const baseStyles =
    'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none';

  const sizeStyles: Record<ButtonSize, string> = {
    sm: 'text-xs px-2.5 py-1.5 rounded-lg gap-1.5 h-8',
    md: 'text-xs sm:text-sm px-3.5 py-2 rounded-lg gap-2 h-9',
    lg: 'text-sm px-4 py-2.5 rounded-lg gap-2 h-10',
  };

  const variantStyles: Record<ButtonVariant, string> = {
    primary:
      'bg-blue-600 hover:bg-blue-700 text-white shadow-xs focus:ring-blue-500 border border-blue-600',
    secondary:
      'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-xs focus:ring-slate-400',
    danger:
      'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 focus:ring-rose-500',
    ghost:
      'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent focus:ring-slate-400',
    outline:
      'bg-transparent hover:bg-slate-50 text-slate-700 border border-slate-300 focus:ring-slate-400',
  };

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      disabled={disabled || isBusy}
      {...props}
    >
      {isBusy ? (
        <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
      ) : (
        Icon && iconPosition === 'left' && <Icon className="w-4 h-4 shrink-0" />
      )}
      {children && <span>{children}</span>}
      {!isBusy && Icon && iconPosition === 'right' && <Icon className="w-4 h-4 shrink-0" />}
    </button>
  );
};
