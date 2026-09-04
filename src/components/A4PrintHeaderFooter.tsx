import React from 'react';
import { SchoolConfig } from '../types';

export interface A4PrintHeaderProps {
  schoolConfig?: SchoolConfig;
  title?: string;
  subtitle?: string;
  className?: string;
  periodName?: string;
  pageIndex: number;
  totalPages: number;
  isPrintMode?: boolean;
}

export const A4PrintHeader: React.FC<A4PrintHeaderProps> = ({
  schoolConfig,
  title = 'CARÔMETRO ESCOLAR',
  subtitle,
  className,
  periodName,
  pageIndex,
  totalPages,
  isPrintMode = false,
}) => {
  if (isPrintMode) {
    return (
      <div className="border-b-[6px] border-slate-900 pb-8 box-border">
        <div className="flex items-center justify-between gap-10">
          <div className="flex items-center gap-8">
            {schoolConfig?.schoolLogo ? (
              <img
                src={schoolConfig.schoolLogo}
                alt="Logo da Escola"
                className="h-[144px] w-auto max-w-[280px] object-contain shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : null}
            <div>
              <h1 className="text-[42px] font-black uppercase tracking-wider text-slate-900 leading-tight line-clamp-1">
                {schoolConfig?.schoolName || 'ESCOLA'}
              </h1>
              <h2 className="text-[50px] font-black tracking-tight text-blue-900 uppercase leading-tight mt-1">
                {title}
              </h2>
              {subtitle && <p className="text-[36px] text-slate-500 font-medium mt-2">{subtitle}</p>}
            </div>
          </div>

          <div className="text-right shrink-0">
            {className && (
              <div className="text-[42px] font-black text-slate-900 uppercase leading-tight">
                TURMA: <span className="text-blue-700">{className}</span>
              </div>
            )}
            {periodName && (
              <div className="text-[36px] font-semibold text-slate-600 mt-1">
                ANO LETIVO: {periodName}
              </div>
            )}
            <div className="text-[34px] font-bold text-slate-400 mt-2">
              PÁGINA {pageIndex + 1} DE {totalPages}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b-2 border-slate-900 pb-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {schoolConfig?.schoolLogo ? (
            <img
              src={schoolConfig.schoolLogo}
              alt="Logo da Escola"
              className="h-12 w-auto max-w-[90px] object-contain shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : null}
          <div>
            <h1 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 line-clamp-1">
              {schoolConfig?.schoolName || 'ESCOLA'}
            </h1>
            <h2 className="text-base font-black tracking-tight text-blue-900 uppercase">
              {title}
            </h2>
            {subtitle && <p className="text-xs text-slate-500 font-medium">{subtitle}</p>}
          </div>
        </div>

        <div className="text-right shrink-0">
          {className && (
            <div className="text-sm font-black text-slate-900 uppercase">
              TURMA: <span className="text-blue-700">{className}</span>
            </div>
          )}
          {periodName && (
            <div className="text-xs font-semibold text-slate-600">
              ANO LETIVO: {periodName}
            </div>
          )}
          <div className="text-[11px] font-bold text-slate-400 mt-0.5">
            PÁGINA {pageIndex + 1} DE {totalPages}
          </div>
        </div>
      </div>
    </div>
  );
};

export interface A4PrintFooterProps {
  systemLabel?: string;
  itemsCount: number;
  date?: string;
  isPrintMode?: boolean;
}

export const A4PrintFooter: React.FC<A4PrintFooterProps> = ({
  systemLabel = 'Sistema Linha do Tempo Escolar — Carômetro Escolar',
  itemsCount,
  date,
  isPrintMode = false,
}) => {
  if (isPrintMode) {
    return (
      <div className="pt-6 border-t-[3px] border-slate-200 flex items-center justify-between text-[31px] text-slate-400 font-medium box-border">
        <span>{systemLabel}</span>
        <span>{itemsCount} aluno{itemsCount !== 1 ? 's' : ''} nesta folha</span>
        <span>{date || new Date().toLocaleDateString('pt-BR')}</span>
      </div>
    );
  }

  return (
    <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400">
      <span>{systemLabel}</span>
      <span>{itemsCount} aluno{itemsCount !== 1 ? 's' : ''} nesta folha</span>
      <span>{date || new Date().toLocaleDateString('pt-BR')}</span>
    </div>
  );
};
