import React from 'react';
import { LucideIcon } from 'lucide-react';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'primary';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: LucideIcon;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  icon: Icon,
  className = '',
}) => {
  const sizeStyles: Record<BadgeSize, string> = {
    sm: 'text-[10px] px-1.5 py-0.5 rounded gap-1 font-medium',
    md: 'text-xs px-2 py-0.5 rounded-md gap-1.5 font-medium',
  };

  const variantStyles: Record<BadgeVariant, string> = {
    neutral: 'bg-slate-100 text-slate-700 border border-slate-200/80',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
    warning: 'bg-amber-50 text-amber-800 border border-amber-200/80',
    danger: 'bg-rose-50 text-rose-700 border border-rose-200/80',
    info: 'bg-sky-50 text-sky-700 border border-sky-200/80',
    primary: 'bg-blue-50 text-blue-700 border border-blue-200/80',
  };

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {Icon && <Icon className="w-3 h-3 shrink-0" />}
      <span>{children}</span>
    </span>
  );
};
