import React from 'react';
import { WorkQueueItem, SchoolConfig } from '../types';
import { A4TimelinePreview, TimelinePhotoItemForPreview } from './A4TimelinePreview';
import { X } from 'lucide-react';
import { Button } from './ui/Button';

interface TimelinePreviewModalProps {
  isOpen: boolean;
  item: WorkQueueItem | null;
  schoolConfig: SchoolConfig;
  onClose: () => void;
}

export const TimelinePreviewModal: React.FC<TimelinePreviewModalProps> = ({
  isOpen,
  item,
  schoolConfig,
  onClose,
}) => {
  if (!isOpen || !item || !item.savedTimeline) return null;

  const photoItems: TimelinePhotoItemForPreview[] = (
    item.savedTimeline.photoItems || []
  ).map((p) => ({
    recordId: p.recordId,
    year: p.year,
    className: p.className,
    photoUrl: p.photoUrl,
    cropSettings: p.cropSettings,
    isPrimary: p.isPrimary,
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Cabeçalho do Modal de Prévia */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Prévia
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {item.student.name} • {item.latestClass} ({item.latestYear})
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Fechar"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com Prévia A4 Exclusiva de Leitura */}
        <div className="p-5 overflow-y-auto flex-1 flex items-center justify-center bg-slate-100/75">
          <div
            id="timeline-preview-visual-container"
            className="shadow-md rounded-lg overflow-hidden border border-slate-300 bg-white"
          >
            <A4TimelinePreview
              id="timeline-preview-visual-canvas"
              studentName={item.student.name}
              studentEnrollment={item.student.enrollment}
              model={item.savedTimeline.modelSnapshot}
              schoolConfig={schoolConfig}
              photoItems={photoItems}
              scale={0.48}
              interactive={false}
              showGrid={false}
              personType={item.savedTimeline.personType || item.student.personType || 'student'}
            />
          </div>
        </div>

        {/* Rodapé: SOMENTE o botão Fechar */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onClose}
          >
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
};
