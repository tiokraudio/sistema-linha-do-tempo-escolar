import React from 'react';
import { Instagram, Sparkles } from 'lucide-react';

interface FooterProps {
  variant?: 'light' | 'dark';
  className?: string;
}

export const Footer: React.FC<FooterProps> = ({ variant = 'dark', className = '' }) => {
  const currentYear = new Date().getFullYear();
  // By default we speak the exact same visual language as the Header (dark slate obsidian frame)
  const isLightExplicit = variant === 'light';

  return (
    <footer
      id="app-footer"
      className={`no-print print-ignore print:hidden w-full shrink-0 z-30 transition-colors select-none ${
        isLightExplicit
          ? 'border-t border-slate-200/80 bg-white/90 backdrop-blur-md text-slate-500 shadow-xs'
          : 'border-t border-slate-800 bg-slate-900 text-slate-300 shadow-xs'
      } ${className}`}
      aria-label="Rodapé do Sistema"
    >
      <div className="w-full px-4 sm:px-6 py-1.5 sm:py-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs">
          
          {/* 1. Indicador de Status Operacional Pulsante */}
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all ${
                isLightExplicit
                  ? 'bg-slate-100 border border-slate-200 text-slate-700'
                  : 'bg-slate-800/90 border border-slate-700/80 text-slate-300'
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Sistema Ativo</span>
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                  isLightExplicit
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-emerald-950/90 text-emerald-300 border border-emerald-800/60'
                }`}
              >
                Edição Escolar
              </span>
            </div>

            <div className="hidden md:flex items-center gap-1 text-slate-400 text-[11px]">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Linha do Tempo & Carômetro</span>
            </div>
          </div>

          {/* 2. Créditos de Autoria e Marca Pessoal com Link Instagram */}
          <div className="flex items-center gap-1.5 font-medium">
            <span className={isLightExplicit ? 'text-slate-500' : 'text-slate-400'}>
              Desenvolvido por:
            </span>
            <a
              id="footer-author-link"
              href="https://www.instagram.com/tiokraudio/"
              target="_blank"
              rel="noopener noreferrer"
              title="Acessar Instagram @tiokraudio"
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border transition-all duration-200 group cursor-pointer shadow-2xs ${
                isLightExplicit
                  ? 'bg-slate-50 hover:bg-pink-50/50 border-slate-200 hover:border-pink-300 text-slate-800'
                  : 'bg-slate-800/90 hover:bg-slate-800 border-slate-700 hover:border-pink-500/50 text-slate-200'
              }`}
            >
              <Instagram className="w-3.5 h-3.5 text-pink-400 transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-6 shrink-0" />
              <span className="font-bold tracking-tight bg-gradient-to-r from-pink-400 via-rose-400 to-amber-300 bg-clip-text text-transparent group-hover:brightness-110">
                tiokraudio
              </span>
            </a>
          </div>

          {/* 3. Copyright e Proteção de Propriedade */}
          <div
            className={`text-[11px] flex items-center gap-1.5 ${
              isLightExplicit ? 'text-slate-400' : 'text-slate-400'
            }`}
          >
            <span>© {currentYear} Sistema Linha do Tempo Escolar</span>
            <span className="hidden sm:inline text-slate-600">•</span>
            <span className="hidden sm:inline">Todos os direitos reservados</span>
          </div>

        </div>
      </div>
    </footer>
  );
};
