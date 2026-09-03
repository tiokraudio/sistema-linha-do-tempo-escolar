import React from 'react';
import { Instagram, Sparkles } from 'lucide-react';

interface FooterProps {
  variant?: 'light' | 'dark';
  className?: string;
}

export const Footer: React.FC<FooterProps> = ({ variant = 'light', className = '' }) => {
  const currentYear = new Date().getFullYear();
  const isDark = variant === 'dark';

  return (
    <footer
      id="app-footer"
      className={`no-print print-ignore print:hidden w-full transition-colors ${
        isDark
          ? 'border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-md text-slate-400'
          : 'border-t border-slate-200/80 bg-white/80 dark:bg-slate-900/80 dark:border-slate-800/80 backdrop-blur-md text-slate-500'
      } ${className}`}
      aria-label="Rodapé do Sistema"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4 text-xs">
          
          {/* 1. Indicador de Status Operacional Pulsante */}
          <div className="flex items-center gap-2.5">
            <div
              className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                isDark
                  ? 'bg-slate-900/90 border border-slate-800 text-slate-300'
                  : 'bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-300'
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Sistema Ativo</span>
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                  isDark
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                    : 'bg-emerald-100/90 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/50'
                }`}
              >
                Edição Escolar
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 text-slate-400 dark:text-slate-500 text-[11px]">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Linha do Tempo & Carômetro</span>
            </div>
          </div>

          {/* 2. Créditos de Autoria e Marca Pessoal com Link Instagram */}
          <div className="flex items-center gap-1.5 font-medium">
            <span className={isDark ? 'text-slate-400' : 'text-slate-600 dark:text-slate-400'}>
              Desenvolvido por:
            </span>
            <a
              id="footer-author-link"
              href="https://www.instagram.com/tiokraudio/"
              target="_blank"
              rel="noopener noreferrer"
              title="Acessar Instagram @tiokraudio"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all duration-300 group cursor-pointer shadow-2xs ${
                isDark
                  ? 'bg-slate-900/90 hover:bg-slate-850 border-slate-800 hover:border-pink-500/40 text-slate-200'
                  : 'bg-slate-50 hover:bg-pink-50/40 dark:bg-slate-800/90 dark:hover:bg-slate-800 border-slate-200 hover:border-pink-300 dark:border-slate-700 dark:hover:border-pink-500/40 text-slate-800 dark:text-slate-200'
              }`}
            >
              <Instagram className="w-3.5 h-3.5 text-pink-500 transition-transform duration-300 group-hover:scale-115 group-hover:-rotate-6 shrink-0" />
              <span className="font-bold tracking-tight bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 bg-clip-text text-transparent group-hover:brightness-110">
                tiokraudio
              </span>
            </a>
          </div>

          {/* 3. Copyright e Proteção de Propriedade */}
          <div
            className={`text-[11px] flex items-center gap-1.5 ${
              isDark ? 'text-slate-500' : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            <span>© {currentYear} Sistema Linha do Tempo Escolar</span>
            <span className="hidden sm:inline text-slate-300 dark:text-slate-700">•</span>
            <span className="hidden sm:inline">Todos os direitos reservados</span>
          </div>

        </div>
      </div>
    </footer>
  );
};
