import React, { useEffect, useRef } from 'react';
import { SchoolConfig } from '../types';
import { CarometroStudentItem } from '../utils/carometroUtils';
import { A4PrintHeader, A4PrintFooter } from './A4PrintHeaderFooter';

interface CarometroA4SheetProps {
  id?: string;
  items: CarometroStudentItem[];
  schoolConfig: SchoolConfig;
  title?: string;
  subtitle?: string;
  periodName?: string;
  className?: string;
  pageIndex: number;
  totalPages: number;
  scale?: number;
}

const PhotoItemCanvas: React.FC<{
  photoUrl: string;
  crop: { x: number; y: number; zoom: number };
  studentName: string;
}> = ({ photoUrl, crop, studentName }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Local preview canvas size (proportional 3:4)
    canvas.width = 216;
    canvas.height = 288;

    ctx.clearRect(0, 0, 216, 288);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 216, 288);

    if (!photoUrl) {
      // Draw placeholder
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sem foto', 108, 144);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const imgW = img.naturalWidth || img.width;
      const imgH = img.naturalHeight || img.height;
      if (!imgW || !imgH) return;

      const zoom = crop.zoom ?? 1.0;
      const cropX = crop.x ?? 50;
      const cropY = crop.y ?? 50;

      const scale = Math.max(216 / imgW, 288 / imgH);
      const srcW = 216 / (scale * zoom);
      const srcH = 288 / (scale * zoom);
      const centerX = imgW * (cropX / 100);
      const centerY = imgH * (cropY / 100);
      const srcX = centerX - srcW / 2;
      const srcY = centerY - srcH / 2;

      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, 216, 288);
    };
    img.src = photoUrl;
  }, [photoUrl, crop.x, crop.y, crop.zoom]);

  return (
    <canvas
      ref={canvasRef}
      data-src={photoUrl}
      data-crop-x={crop.x}
      data-crop-y={crop.y}
      data-crop-zoom={crop.zoom}
      className="w-full h-full block object-cover"
      aria-label={`Fotografia de ${studentName}`}
    />
  );
};

export const CarometroA4Sheet: React.FC<CarometroA4SheetProps> = ({
  id,
  items,
  schoolConfig,
  title = 'CARÔMETRO ESCOLAR',
  subtitle,
  periodName,
  className,
  pageIndex,
  totalPages,
  scale = 1,
}) => {
  return (
    <div
      style={{
        width: `${794 * scale}px`,
        height: `${1123 * scale}px`,
        transformOrigin: 'top left',
      }}
      className="relative bg-white shadow-lg mx-auto select-none overflow-hidden text-slate-900 font-sans"
    >
      <div
        id={id}
        style={{
          width: '794px',
          height: '1123px',
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top left',
          padding: '36px 40px 32px 40px',
        }}
        className="flex flex-col justify-between h-full box-border bg-white text-slate-900"
      >
        {/* Header da Folha A4 */}
        <A4PrintHeader
          schoolConfig={schoolConfig}
          title={title}
          subtitle={subtitle}
          periodName={periodName}
          className={className}
          pageIndex={pageIndex}
          totalPages={totalPages}
        />

        {/* Grid de Fotos 3x4 (4 linhas x 5 colunas = 20 alunos por página) */}
        <div className="flex-1 py-4 grid grid-cols-5 gap-x-4 gap-y-3.5 items-start content-start">
          {items.map((item) => (
            <div
              key={item.student.id}
              className="flex flex-col items-center text-center w-full"
            >
              {/* Moldura 3x4 */}
              <div className="w-[110px] h-[146px] rounded-xs border-2 border-slate-300 bg-slate-50 overflow-hidden shadow-2xs flex items-center justify-center">
                <PhotoItemCanvas
                  photoUrl={item.photoUrl}
                  crop={item.crop}
                  studentName={item.student.name}
                />
              </div>

              {/* Informações do Aluno */}
              <div className="w-[124px] mt-1.5 px-0.5">
                <p className="text-[11px] font-bold text-slate-900 uppercase leading-tight line-clamp-2">
                  {item.student.name}
                </p>
                <p className="text-[10px] font-mono font-medium text-slate-500 mt-0.5">
                  Mat: {item.student.enrollment}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Rodapé da Folha */}
        <A4PrintFooter
          systemLabel="Sistema Linha do Tempo Escolar — Carômetro Escolar"
          itemsCount={items.length}
        />
      </div>
    </div>
  );
};
