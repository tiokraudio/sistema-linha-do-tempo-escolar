import React from 'react';

export interface FormFieldProps {
  label: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  helperText,
  required,
  children,
  className = '',
}) => {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="block text-xs font-semibold text-slate-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] font-medium text-rose-600 mt-1">{error}</p>}
      {!error && helperText && (
        <p className="text-[11px] text-slate-500 mt-1">{helperText}</p>
      )}
    </div>
  );
};

export const inputClasses =
  'w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed';

export const selectClasses =
  'w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed';
