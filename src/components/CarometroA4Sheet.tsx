import React, { useEffect, useRef } from 'react';
import { SchoolConfig } from '../types';
import { CarometroStudentItem } from '../utils/carometroUtils';
import { formatCarometroName } from '../utils/textMetrics';
import { A4PrintHeader, A4PrintFooter } from './A4PrintHeaderFooter';
import {
  A4_PRINT_WIDTH_PX,
  A4_PRINT_HEIGHT_PX,
  A4_STANDARD_WIDTH,
  A4_STANDARD_HEIGHT,
  A4_PRINT_SCALE,
  A4_LANDSCAPE_WIDTH_PX,
  A4_LANDSCAPE_HEIGHT_PX,
  A4_LANDSCAPE_STANDARD_WIDTH,
  A4_LANDSCAPE_STANDARD_HEIGHT,
  A4_LANDSCAPE_PRINT_SCALE,
} from '../utils/pdfGenerator';

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
  orientation?: 'portrait' | 'landscape';
  isPrintMode?: boolean;
}

// Cache em memória para aceleração do Carômetro
const carometroImageCache = new Map<string, HTMLImageElement>();

const PhotoItemCanvas: React.FC<{
  photoUrl: string;
  crop: { x: number; y: number; zoom: number };
  studentName: string;
  isPrintMode?: boolean;
}> = ({ photoUrl, crop, studentName, isPrintMode = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resolução de alta fidelidade para 300 DPI estrito no A4 impresso (proporção 3:4):
    // Em modo de impressão (300 DPI), o card tem ~320-344 x 424-456 px.
    // Usamos buffer nativo de 1032 x 1376 px (supersampling de ~3x em 3:4)
    // garantindo nitidez fotográfica impecável sem degradação ou downsample prematuro.
    const targetW = isPrintMode ? 1032 : 660;
    const targetH = isPrintMode ? 1376 : 880;

    canvas.width = targetW;
    canvas.height = targetH;
    canvas.dataset.status = 'loading';

    ctx.clearRect(0, 0, targetW, targetH);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, targetW, targetH);

    if (!photoUrl) {
      // Draw placeholder
      ctx.fillStyle = '#94a3b8';
      ctx.font = isPrintMode ? 'bold 54px sans-serif' : 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sem foto', targetW / 2, targetH / 2);
      canvas.dataset.status = 'ready';
      return;
    }

    let isMounted = true;

    const drawPhoto = (img: HTMLImageElement) => {
      if (!isMounted) return;
      const imgW = img.naturalWidth || img.width;
      const imgH = img.naturalHeight || img.height;
      if (!imgW || !imgH) {
        canvas.dataset.status = 'error';
        return;
      }

      const zoom = crop.zoom ?? 1.0;
      const cropX = crop.x ?? 50;
      const cropY = crop.y ?? 50;

      const scale = Math.max(targetW / imgW, targetH / imgH);
      const srcW = targetW / (scale * zoom);
      const srcH = targetH / (scale * zoom);
      const centerX = imgW * (cropX / 100);
      const centerY = imgH * (cropY / 100);
      const srcX = centerX - srcW / 2;
      const srcY = centerY - srcH / 2;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH);
      canvas.dataset.status = 'ready';
    };

    let img = carometroImageCache.get(photoUrl);
    if (img && img.complete && (img.naturalWidth || img.width)) {
      drawPhoto(img);
      return () => {
        isMounted = false;
      };
    }

    img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      carometroImageCache.set(photoUrl, img!);
      drawPhoto(img!);
    };
    img.onerror = () => {
      if (isMounted) {
        canvas.dataset.status = 'error';
      }
    };
    img.src = photoUrl;

    return () => {
      isMounted = false;
    };
  }, [photoUrl, crop.x, crop.y, crop.zoom, isPrintMode]);

  return (
    <canvas
      ref={canvasRef}
      data-src={photoUrl}
      data-status="loading"
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
  orientation = 'portrait',
  isPrintMode = false,
}) => {
  const isLandscape = orientation === 'landscape';

  // Detecção estrita de renderização para 300 DPI nativos
  const isPrint =
    isPrintMode ||
    (scale !== undefined &&
      (scale >= 2.5 ||
        Math.abs(scale - A4_PRINT_SCALE) < 0.1 ||
        Math.abs(scale - A4_LANDSCAPE_PRINT_SCALE) < 0.1));

  // Geometria nativa correspondente
  const baseWidth = isLandscape ? A4_LANDSCAPE_STANDARD_WIDTH : A4_STANDARD_WIDTH; // 1123 vs 794
  const baseHeight = isLandscape ? A4_LANDSCAPE_STANDARD_HEIGHT : A4_STANDARD_HEIGHT; // 794 vs 1123
  const printWidth = isLandscape ? A4_LANDSCAPE_WIDTH_PX : A4_PRINT_WIDTH_PX; // 3508 vs 2480
  const printHeight = isLandscape ? A4_LANDSCAPE_HEIGHT_PX : A4_PRINT_HEIGHT_PX; // 2480 vs 3508

  // Margens de segurança A4
  const paddingStyle = isPrint
    ? isLandscape
      ? '96px 130px 84px 130px'
      : '112px 125px 100px 125px'
    : isLandscape
    ? '30px 42px 26px 42px'
    : '36px 40px 32px 40px';

  if (isPrint) {
    return (
      <div
        id={id}
        style={{
          width: `${printWidth}px`,
          height: `${printHeight}px`,
          minWidth: `${printWidth}px`,
          minHeight: `${printHeight}px`,
          maxWidth: `${printWidth}px`,
          maxHeight: `${printHeight}px`,
          transform: 'none',
          boxSizing: 'border-box',
          padding: paddingStyle,
          backgroundColor: '#ffffff',
          overflow: 'hidden',
        }}
        className="flex flex-col justify-between h-full box-border bg-white text-slate-900 select-none font-sans"
      >
        {/* Header da Folha A4 em 300 DPI */}
        <A4PrintHeader
          schoolConfig={schoolConfig}
          title={title}
          subtitle={subtitle}
          periodName={periodName}
          className={className}
          pageIndex={pageIndex}
          totalPages={totalPages}
          isPrintMode={true}
        />

        {/* Grid de Fotos 3x4 em Escala Nativa 300 DPI */}
        {isLandscape ? (
          /* Paisagem: 6 colunas x até 4 linhas = 24 alunos */
          <div className="flex-1 py-6 grid grid-cols-6 gap-x-9 gap-y-7 items-start content-start">
            {items.map((item) => (
              <div
                key={item.student.id}
                className="flex flex-col items-center text-center w-full"
              >
                {/* Moldura 3x4 Paisagem */}
                <div className="w-[320px] h-[424px] rounded-[6px] border-[6px] border-slate-300 bg-slate-50 overflow-hidden shadow-sm flex items-center justify-center shrink-0">
                  <PhotoItemCanvas
                    photoUrl={item.photoUrl}
                    crop={item.crop}
                    studentName={item.student.name}
                    isPrintMode={true}
                  />
                </div>

                {/* Informações do Aluno (Preservação estrita da fonte, margem lateral de segurança de 3% e quebra em até 2 linhas) */}
                <div
                  className="w-[360px] mt-3 text-center"
                  style={{
                    paddingLeft: '3%',
                    paddingRight: '3%',
                    boxSizing: 'border-box',
                  }}
                  title={item.student.name}
                >
                  <p
                    className="text-[31px] leading-[35px] font-bold text-slate-900 uppercase break-words line-clamp-2"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      maxHeight: '72px',
                    }}
                  >
                    {formatCarometroName(item.student.name, true, true)}
                  </p>
                  <p className="text-[26px] font-mono font-medium text-slate-500 mt-1 truncate">
                    Mat: {item.student.enrollment}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Retrato: 5 colunas x até 4 linhas = 20 alunos */
          <div className="flex-1 py-8 grid grid-cols-5 gap-x-12 gap-y-9 items-start content-start">
            {items.map((item) => (
              <div
                key={item.student.id}
                className="flex flex-col items-center text-center w-full"
              >
                {/* Moldura 3x4 Retrato */}
                <div className="w-[344px] h-[456px] rounded-[6px] border-[6px] border-slate-300 bg-slate-50 overflow-hidden shadow-sm flex items-center justify-center shrink-0">
                  <PhotoItemCanvas
                    photoUrl={item.photoUrl}
                    crop={item.crop}
                    studentName={item.student.name}
                    isPrintMode={true}
                  />
                </div>

                {/* Informações do Aluno (Preservação estrita da fonte, margem lateral de segurança de 3% e quebra em até 2 linhas) */}
                <div
                  className="w-[388px] mt-3.5 text-center"
                  style={{
                    paddingLeft: '3%',
                    paddingRight: '3%',
                    boxSizing: 'border-box',
                  }}
                  title={item.student.name}
                >
                  <p
                    className="text-[34px] leading-[38px] font-bold text-slate-900 uppercase break-words line-clamp-2"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      maxHeight: '78px',
                    }}
                  >
                    {formatCarometroName(item.student.name, false, true)}
                  </p>
                  <p className="text-[28px] font-mono font-medium text-slate-500 mt-1.5 truncate">
                    Mat: {item.student.enrollment}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Rodapé da Folha em 300 DPI */}
        <A4PrintFooter
          systemLabel="Sistema Linha do Tempo Escolar — Carômetro Escolar"
          itemsCount={items.length}
          isPrintMode={true}
        />
      </div>
    );
  }

  // Modo de Prévia Interativa de Tela (Preview)
  return (
    <div
      style={{
        width: `${baseWidth * scale}px`,
        height: `${baseHeight * scale}px`,
        transformOrigin: 'top left',
      }}
      className="relative bg-white shadow-lg mx-auto select-none overflow-hidden text-slate-900 font-sans"
    >
      <div
        id={id}
        style={{
          width: `${baseWidth}px`,
          height: `${baseHeight}px`,
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top left',
          padding: paddingStyle,
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
          isPrintMode={false}
        />

        {/* Grid de Fotos 3x4 */}
        {isLandscape ? (
          <div className="flex-1 py-3 grid grid-cols-6 gap-x-3 gap-y-2.5 items-start content-start">
            {items.map((item) => (
              <div
                key={item.student.id}
                className="flex flex-col items-center text-center w-full"
              >
                {/* Moldura 3x4 */}
                <div className="w-[102px] h-[136px] rounded-xs border-2 border-slate-300 bg-slate-50 overflow-hidden shadow-2xs flex items-center justify-center shrink-0">
                  <PhotoItemCanvas
                    photoUrl={item.photoUrl}
                    crop={item.crop}
                    studentName={item.student.name}
                    isPrintMode={false}
                  />
                </div>

                {/* Informações do Aluno (Preservação estrita da fonte, margem lateral de segurança de 3% e quebra em até 2 linhas) */}
                <div
                  className="w-[115px] mt-1 text-center"
                  style={{
                    paddingLeft: '3%',
                    paddingRight: '3%',
                    boxSizing: 'border-box',
                  }}
                  title={item.student.name}
                >
                  <p
                    className="text-[10px] leading-tight font-bold text-slate-900 uppercase break-words line-clamp-2"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      maxHeight: '26px',
                    }}
                  >
                    {formatCarometroName(item.student.name, true, false)}
                  </p>
                  <p className="text-[9px] font-mono font-medium text-slate-500 mt-0.5 truncate">
                    Mat: {item.student.enrollment}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 py-4 grid grid-cols-5 gap-x-4 gap-y-3.5 items-start content-start">
            {items.map((item) => (
              <div
                key={item.student.id}
                className="flex flex-col items-center text-center w-full"
              >
                {/* Moldura 3x4 */}
                <div className="w-[110px] h-[146px] rounded-xs border-2 border-slate-300 bg-slate-50 overflow-hidden shadow-2xs flex items-center justify-center shrink-0">
                  <PhotoItemCanvas
                    photoUrl={item.photoUrl}
                    crop={item.crop}
                    studentName={item.student.name}
                    isPrintMode={false}
                  />
                </div>

                {/* Informações do Aluno (Preservação estrita da fonte, margem lateral de segurança de 3% e quebra em até 2 linhas) */}
                <div
                  className="w-[124px] mt-1.5 text-center"
                  style={{
                    paddingLeft: '3%',
                    paddingRight: '3%',
                    boxSizing: 'border-box',
                  }}
                  title={item.student.name}
                >
                  <p
                    className="text-[11px] leading-tight font-bold text-slate-900 uppercase break-words line-clamp-2"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      maxHeight: '28px',
                    }}
                  >
                    {formatCarometroName(item.student.name, false, false)}
                  </p>
                  <p className="text-[10px] font-mono font-medium text-slate-500 mt-0.5 truncate">
                    Mat: {item.student.enrollment}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Rodapé da Folha */}
        <A4PrintFooter
          systemLabel="Sistema Linha do Tempo Escolar — Carômetro Escolar"
          itemsCount={items.length}
          isPrintMode={false}
        />
      </div>
    </div>
  );
};
