import React from 'react';
import { LayoutModel, SchoolConfig, CropSettings, DotPosition, PersonType, getModelBackgroundUrl } from '../types';
import { VisualReferenceGrid } from './VisualReferenceGrid';
import { formatTimelineStudentName } from '../utils/textMetrics';
import {
  A4_STANDARD_WIDTH,
  A4_STANDARD_HEIGHT,
  A4_PRINT_WIDTH_PX,
  A4_PRINT_HEIGHT_PX,
  A4_PRINT_SCALE,
} from '../utils/pdfGenerator';

export interface TimelinePhotoItemForPreview {
  recordId?: string;
  year: string | number;
  className: string;
  photoUrl: string;
  cropSettings: CropSettings;
  isPrimary?: boolean;
}

interface A4TimelinePreviewProps {
  id?: string;
  studentName: string;
  studentEnrollment?: string;
  personType?: PersonType;
  model: LayoutModel;
  schoolConfig: SchoolConfig;
  photoItems: TimelinePhotoItemForPreview[];
  forcedConfigIndex?: number; // Optional override for layout editor preview
  scale?: number;
  selectedPhotoIndex?: number | null;
  onSelectPhotoIndex?: (index: number) => void;
  onEditPhotoCrop?: (index: number) => void;
  interactive?: boolean;
  showGrid?: boolean;
}

interface CanvasPhotoProps {
  src: string;
  cropSettings?: CropSettings;
  isPrimary?: boolean;
  alt?: string;
  className?: string;
}

// Cache de elementos de imagem em memória para aceleração e reaproveitamento imediato
const previewImageCache = new Map<string, HTMLImageElement>();

export const CanvasPhoto: React.FC<CanvasPhotoProps> = ({
  src,
  cropSettings,
  isPrimary = false,
  alt = 'Foto',
  className = 'w-full h-full pointer-events-none',
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !src) return;

    canvas.dataset.status = 'loading';
    let isMounted = true;

    const drawImageOnCanvas = (img: HTMLImageElement) => {
      if (!isMounted) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        canvas.dataset.status = 'error';
        return;
      }

      const imgW = img.naturalWidth || img.width;
      const imgH = img.naturalHeight || img.height;

      if (!imgW || !imgH) {
        canvas.dataset.status = 'error';
        return;
      }

      // CALIBRAÇÃO PARA 300 DPI NATIVO (Folha A4: 2480 x 3508 px):
      // - Foto principal: preserva a definição máxima original (mínimo 2480 x 1860 px, até 3840 px)
      // - Fotos secundárias: 1200 x 1200 px (supersampling de alta fidelidade para círculos)
      let targetW = isPrimary ? 2480 : 1200;
      let targetH = isPrimary ? 1860 : 1200;

      if (isPrimary && imgW > 0 && imgH > 0) {
        const candidateW = Math.min(Math.max(imgW, 2480), 3840);
        targetW = candidateW;
        targetH = Math.round(candidateW * 0.75);
      }

      canvas.width = targetW;
      canvas.height = targetH;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);

      const zoom = cropSettings?.zoom ?? 1.0;
      const cropX = cropSettings?.x ?? 50;
      const cropY = cropSettings?.y ?? 50;

      const scale = Math.max(targetW / imgW, targetH / imgH);

      const srcW = targetW / (scale * zoom);
      const srcH = targetH / (scale * zoom);

      const centerX = imgW * (cropX / 100);
      const centerY = imgH * (cropY / 100);

      const srcX = centerX - srcW / 2;
      const srcY = centerY - srcH / 2;

      // Habilitar interpolação bicúbica de máxima qualidade fotográfica
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH);
      canvas.dataset.status = 'ready';
    };

    // Verificar se a imagem já foi instanciada e decodificada
    let img = previewImageCache.get(src);
    if (img && img.complete && (img.naturalWidth || img.width)) {
      drawImageOnCanvas(img);
      return () => {
        isMounted = false;
      };
    }

    img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      previewImageCache.set(src, img!);
      drawImageOnCanvas(img!);
    };

    img.onerror = () => {
      if (isMounted) {
        canvas.dataset.status = 'error';
      }
    };

    img.src = src;

    return () => {
      isMounted = false;
    };
  }, [src, cropSettings?.x, cropSettings?.y, cropSettings?.zoom, isPrimary]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-label={alt}
      data-src={src}
      data-status="loading"
      data-crop-x={cropSettings?.x ?? 50}
      data-crop-y={cropSettings?.y ?? 50}
      data-crop-zoom={cropSettings?.zoom ?? 1.0}
      data-is-primary={isPrimary ? 'true' : 'false'}
    />
  );
};

export const A4TimelinePreview: React.FC<A4TimelinePreviewProps> = ({
  id = 'a4-timeline-canvas',
  studentName,
  studentEnrollment,
  personType,
  model,
  schoolConfig,
  photoItems,
  forcedConfigIndex,
  scale = 1,
  selectedPhotoIndex = null,
  onSelectPhotoIndex,
  onEditPhotoCrop,
  interactive = false,
  showGrid = false,
}) => {
  // Base A4 canvas dimensions in pixels (Standard 96DPI A4: 794px x 1123px)
  const baseWidth = 794;
  const baseHeight = 1123;

  // Resolve Primary Item (main highlight photo) and Secondary Items (photographic history trajectory slots)
  const primaryIndex = photoItems.findIndex((p) => p.isPrimary);
  const realPrimaryIndex = primaryIndex !== -1 ? primaryIndex : (photoItems.length > 0 ? 0 : -1);
  const primaryItem = realPrimaryIndex !== -1 ? photoItems[realPrimaryIndex] : null;

  const secondaryItems = photoItems.some((p) => p.isPrimary)
    ? photoItems.filter((p) => !p.isPrimary)
    : photoItems.slice(1);

  const secondaryCount = secondaryItems.length;
  const maxAvailableConfig =
    model.configurations && model.configurations.length > 0
      ? Math.max(...model.configurations.map((c) => c.configIndex))
      : 10;
  const activeConfigIndex =
    typeof forcedConfigIndex === 'number'
      ? forcedConfigIndex
      : Math.min(Math.max(secondaryCount, 0), maxAvailableConfig);

  // Retrieve configuration for current photo count
  const currentConfig =
    model.configurations?.find((c) => c.configIndex === activeConfigIndex) ||
    model.configurations?.[activeConfigIndex] || {
      configIndex: activeConfigIndex,
      secondaryDots: [],
    };

  // Primary photo position (unconstrained custom geometry)
  const primaryPos: DotPosition = model.primaryPhotoPosition || {
    xPercent: 0,
    yPercent: 0,
    widthPercent: 100,
    heightPercent: 58,
  };

  const secondaryDots = currentConfig.secondaryDots || [];
  const effectiveBgUrl = getModelBackgroundUrl(model, personType);

  const isPrintScale = Math.abs(scale - A4_PRINT_SCALE) < 0.05 || scale >= 3.0;
  const containerWidth = isPrintScale ? A4_PRINT_WIDTH_PX : Math.round(baseWidth * scale);
  const containerHeight = isPrintScale ? A4_PRINT_HEIGHT_PX : Math.round(baseHeight * scale);
  const scaleX = isPrintScale ? A4_PRINT_WIDTH_PX / baseWidth : scale;
  const scaleY = isPrintScale ? A4_PRINT_HEIGHT_PX / baseHeight : scale;

  // Contexto Linha do Tempo: O espaço para o nome é enorme (ocupa quase toda a largura da página A4).
  // A imensa maioria dos nomes cabe em 1 linha sem abreviar.
  // Para proteger as fotos secundárias, o nome deve ficar estritamente em 1 linha (whitespace-nowrap, overflow-hidden).
  // Gatilho condicional: a abreviação SÓ PODE ser chamada se measureTextWidth(nome) > maxWidth.
  const cleanStudentName = (studentName || '').trim();
  const modelNameFontSize = model.studentNamePosition?.fontSizePx ?? 24;
  const modelNameLineHeight = model.studentNamePosition?.lineHeight || 1.18;
  const nameBoxWidthPx = (baseWidth * (model.studentNamePosition?.widthPercent ?? 100)) / 100;
  const nameFont = `${model.studentNamePosition?.fontWeight || 'bold'} ${modelNameFontSize}px ${model.studentNamePosition?.fontFamily || model.fontFamily || "'Montserrat', sans-serif"}`;
  const formattedStudentName = formatTimelineStudentName(cleanStudentName, nameBoxWidthPx, nameFont, 2);

  return (
    <div
      style={{
        width: `${containerWidth}px`,
        height: `${containerHeight}px`,
      }}
      className="overflow-hidden relative inline-block shrink-0"
    >
      <div
        style={{
          transform: isPrintScale ? `scale(${scaleX}, ${scaleY})` : `scale(${scale})`,
          transformOrigin: 'top left',
          width: `${baseWidth}px`,
          height: `${baseHeight}px`,
        }}
        className={interactive ? "transition-transform duration-150" : ""}
      >
        <div
          id={id}
          style={{
            width: `${baseWidth}px`,
            height: `${baseHeight}px`,
            fontFamily: model.fontFamily || "'Montserrat', sans-serif",
          }}
          className={`relative bg-white ${isPrintScale ? '' : 'shadow-2xl'} overflow-hidden select-none print:shadow-none`}
        >
        {/* Layer 0 (z-0) — Base A4 White Canvas Background */}
        <div
          style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}
          className="absolute inset-0 bg-white pointer-events-none z-0"
        />

        {/* Layer 10 (z-10) — Primary Photo (Sits BEHIND Background PNG) */}
        {primaryItem && realPrimaryIndex !== -1 && (
          <div
            style={{
              position: 'absolute',
              left: `${primaryPos.xPercent}%`,
              top: `${primaryPos.yPercent}%`,
              width: `${primaryPos.widthPercent}%`,
              height: `${primaryPos.heightPercent}%`,
              transform: primaryPos.rotation ? `rotate(${primaryPos.rotation}deg)` : undefined,
              zIndex: 10,
            }}
            className={`group pointer-events-auto transition-all z-10 ${
              selectedPhotoIndex === realPrimaryIndex ? 'ring-4 ring-blue-500 ring-offset-2 scale-105' : ''
            } ${interactive ? 'cursor-pointer hover:scale-105' : ''}`}
            onClick={() => {
              if (onSelectPhotoIndex) onSelectPhotoIndex(realPrimaryIndex);
              if (interactive && onEditPhotoCrop) {
                onEditPhotoCrop(realPrimaryIndex);
              }
            }}
          >
            {/* Rectangular Photo */}
            <div className="w-full h-full overflow-hidden bg-white relative z-10">
              {primaryItem.photoUrl ? (
                <CanvasPhoto
                  src={primaryItem.photoUrl}
                  cropSettings={primaryItem.cropSettings}
                  isPrimary={true}
                  alt={`Foto ${primaryItem.year}`}
                  className="w-full h-full object-cover pointer-events-none"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 font-semibold">
                  Foto Principal ({primaryItem.year})
                </div>
              )}
            </div>

            {interactive && (
              <div
                style={{ zIndex: 60 }}
                className="absolute inset-0 rounded-sm bg-blue-900/40 opacity-0 group-hover:opacity-100 transition-opacity z-[60] flex items-center justify-center text-white text-[11px] font-bold"
              >
                {selectedPhotoIndex === realPrimaryIndex ? 'Ajustando' : 'Ajustar'}
              </div>
            )}
          </div>
        )}

        {/* Layer 20 (z-20) — Main A4 Background PNG (Sits ON TOP of Primary Photo) */}
        {effectiveBgUrl && (
          <img
            src={effectiveBgUrl}
            alt="Background"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', zIndex: 20 }}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none z-20"
          />
        )}

        {/* Layer 30 (z-30) — Secondary Photos / Dots */}
        {secondaryDots.map((dot, idx) => {
          const photoItem = secondaryItems[idx];
          const itemIndex = photoItem ? photoItems.indexOf(photoItem) : idx + 1;
          const isSelected = selectedPhotoIndex === itemIndex;

          return (
            <div
              key={`secondary_dot_${idx}`}
              style={{
                position: 'absolute',
                left: `${dot.xPercent}%`,
                top: `${dot.yPercent}%`,
                width: `${dot.widthPercent}%`,
                height: `${dot.heightPercent}%`,
                transform: dot.rotation ? `rotate(${dot.rotation}deg)` : undefined,
                zIndex: 30,
              }}
              className={`group pointer-events-auto transition-all z-30 ${
                isSelected ? 'ring-4 ring-blue-500 ring-offset-2 scale-105' : ''
              } ${interactive && photoItem ? 'cursor-pointer hover:scale-105' : ''}`}
              onClick={() => {
                if (photoItem && onSelectPhotoIndex) onSelectPhotoIndex(itemIndex);
                if (interactive && photoItem && onEditPhotoCrop) {
                  onEditPhotoCrop(itemIndex);
                }
              }}
            >
              {/* Circular Cropped Photo Container with refined frame rim */}
              <div className="w-full h-full rounded-full overflow-hidden bg-white shadow-md ring-1 ring-black/15 ring-offset-1 ring-offset-white/90 relative z-10">
                {photoItem && photoItem.photoUrl ? (
                  <CanvasPhoto
                    src={photoItem.photoUrl}
                    cropSettings={photoItem.cropSettings}
                    isPrimary={false}
                    alt={`Foto ${photoItem.year}`}
                    className="w-full h-full object-cover pointer-events-none"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-[10px] text-slate-500 font-semibold bg-slate-100 border border-slate-300 rounded-full px-1 text-center">
                    <span>{photoItem ? photoItem.year : `Ano ${idx + 1}`}</span>
                    {photoItem && photoItem.className && (
                      <span className="text-[8px] text-slate-500 font-normal truncate max-w-[90%]">
                        {photoItem.className}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Layer 40 (z-40): Secondary Frame PNG matching exact dot bounding box */}
              {model.secondaryFrameUrl && (
                <img
                  src={model.secondaryFrameUrl}
                  alt="Moldura Secundária"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none', zIndex: 40 }}
                  className="absolute inset-0 w-full h-full object-fill pointer-events-none z-40"
                />
              )}

              {/* Layer 50 (z-50): Secondary Year Label */}
              {(() => {
                const vertPos = dot.yearLabel?.verticalPosition || model.secondaryYearConfig?.verticalPosition || 'inferior';
                const hAlign = dot.yearLabel?.align || model.secondaryYearConfig?.align || 'center';
                const isSuperior = vertPos === 'superior';
                const isLeft = hAlign === 'left';
                const isRight = hAlign === 'right';

                return (
                  <div
                    style={{
                      position: 'absolute',
                      top: isSuperior ? 'auto' : '100%',
                      bottom: isSuperior ? '100%' : 'auto',
                      left: isLeft ? '0%' : isRight ? 'auto' : '50%',
                      right: isRight ? '0%' : 'auto',
                      transform: isLeft || isRight ? 'none' : 'translateX(-50%)',
                      marginTop: isSuperior ? undefined : '5px',
                      marginBottom: isSuperior ? '5px' : undefined,
                      fontSize: `${dot.yearLabel?.fontSizePx ?? model.secondaryYearConfig?.fontSizePx ?? 12}px`,
                      color: dot.yearLabel?.color || model.secondaryYearConfig?.color || '#ffffff',
                      backgroundColor: dot.yearLabel?.bgColor || model.secondaryYearConfig?.bgColor || '#1e293b',
                      textShadow: '0 1px 2px rgba(0,0,0,0.35)',
                      boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.25), 0 1px 2px -1px rgba(0, 0, 0, 0.15)',
                      zIndex: 50,
                    }}
                    className="z-50 font-bold px-2.5 py-0.5 rounded-full border border-white/40 whitespace-nowrap text-center pointer-events-none tracking-wide"
                  >
                    {photoItem ? photoItem.year : `Ano ${idx + 1}`}
                  </div>
                );
              })()}

              {interactive && photoItem && (
                <div
                  style={{ zIndex: 60 }}
                  className="absolute inset-0 rounded-full bg-blue-900/40 opacity-0 group-hover:opacity-100 transition-opacity z-[60] flex items-center justify-center text-white text-[9px] font-bold"
                >
                  {isSelected ? 'Ajustando' : 'Ajustar'}
                </div>
              )}
            </div>
          );
        })}

        {/* Layer 50 (z-50) — School Logo */}
        {schoolConfig.schoolLogo &&
          model.schoolLogoPosition?.show !== false && (
            <div
              style={{
                position: 'absolute',
                left: `${model.schoolLogoPosition?.xPercent ?? 82}%`,
                top: `${model.schoolLogoPosition?.yPercent ?? 5}%`,
                width: `${model.schoolLogoPosition?.widthPercent ?? 16}%`,
                height: `${model.schoolLogoPosition?.heightPercent ?? 12}%`,
                zIndex: 50,
              }}
              className="pointer-events-none z-50 flex items-center justify-start"
            >
              <img
                src={schoolConfig.schoolLogo}
                alt="Logo Escola"
                className="max-w-full max-h-full object-contain"
              />
            </div>
          )}

        {/* Layer 50 (z-50) — School Name (Rodapé Institucional Fixo Centralizado) */}
        {model.showSchoolName !== false && (
          <div
            style={{
              position: 'absolute',
              top: `${model.schoolNamePosition?.yPercent ?? 97}%`,
              left: `${model.schoolNamePosition?.xPercent ?? 0}%`,
              width: `${model.schoolNamePosition?.widthPercent ?? 100}%`,
              height: `${model.schoolNamePosition?.heightPercent ?? 2}%`,
              textAlign: model.schoolNamePosition?.align || 'center',
              fontSize: `${model.schoolNamePosition?.fontSizePx ?? 12}px`,
              fontFamily: model.schoolNamePosition?.fontFamily || model.fontFamily || "'Montserrat', sans-serif",
              color: model.schoolNamePosition?.color || '#ffffff',
              fontWeight: model.schoolNamePosition?.fontWeight || 'bold',
              zIndex: 50,
            }}
            className="pointer-events-none z-50 uppercase tracking-wide leading-tight flex items-center justify-center p-0.5 drop-shadow-xs"
            title={schoolConfig.schoolName || 'ESCOLA'}
          >
            <span className="w-full truncate text-center px-3">
              {schoolConfig.schoolName || 'ESCOLA'}
            </span>
          </div>
        )}

        {/* Layer 50 (z-50) — Student Name (Preservação estrita de fonte com margem lateral de 2% e quebra em até 2 linhas) */}
        <div
          style={{
            position: 'absolute',
            left: `${model.studentNamePosition?.xPercent ?? 0}%`,
            top: `${model.studentNamePosition?.yPercent ?? 86}%`,
            width: `${model.studentNamePosition?.widthPercent ?? 100}%`,
            minHeight: `${model.studentNamePosition?.heightPercent ?? 5}%`,
            maxHeight: `${Math.max(model.studentNamePosition?.heightPercent ?? 5, 8.5)}%`,
            transform: `rotate(${model.studentNamePosition?.rotation ?? 0}deg)`,
            fontSize: `${modelNameFontSize}px`,
            lineHeight: modelNameLineHeight,
            color: model.studentNamePosition?.color || '#ffffff',
            textAlign: model.studentNamePosition?.align || 'center',
            fontWeight: model.studentNamePosition?.fontWeight || 'bold',
            fontFamily: model.studentNamePosition?.fontFamily || model.fontFamily || "'Montserrat', sans-serif",
            textShadow: '0 2px 4px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.7)',
            zIndex: 50,
            paddingLeft: '2%',
            paddingRight: '2%',
            boxSizing: 'border-box',
          }}
          className="pointer-events-none z-50 uppercase tracking-wider flex items-center justify-center drop-shadow-md"
          title={cleanStudentName}
        >
          <span
            className="w-full whitespace-nowrap overflow-hidden text-center block truncate"
            style={{
              textAlign: model.studentNamePosition?.align || 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {formattedStudentName}
          </span>
        </div>

        {/* Layer 50 (z-50) — Primary Year Badge */}
        {primaryItem && (
          <div
            style={{
              position: 'absolute',
              left: `${model.yearPosition?.xPercent ?? 82}%`,
              top: `${model.yearPosition?.yPercent ?? 16.5}%`,
              width: `${model.yearPosition?.widthPercent ?? 16}%`,
              height: `${model.yearPosition?.heightPercent ?? 3}%`,
              transform: `rotate(${model.yearPosition?.rotation ?? 0}deg)`,
              zIndex: 50,
            }}
            className={`pointer-events-none z-50 flex items-center ${
              model.yearPosition?.align === 'left'
                ? 'justify-start'
                : model.yearPosition?.align === 'right'
                ? 'justify-end'
                : 'justify-center'
            }`}
          >
            {model.mainYearType === 'image' && model.mainYearImageUrl ? (
              <img
                src={model.mainYearImageUrl}
                alt="Ano Principal"
                className={`max-w-full max-h-full object-contain pointer-events-none ${
                  model.yearPosition?.align === 'left'
                    ? 'object-left'
                    : model.yearPosition?.align === 'right'
                    ? 'object-right'
                    : 'object-center'
                }`}
              />
            ) : (
              <div
                style={{
                  fontSize: `${model.yearPosition?.fontSizePx ?? 14}px`,
                  color: model.yearPosition?.color || '#ffffff',
                  backgroundColor: model.yearPosition?.bgColor || '#1e293b',
                  textAlign: model.yearPosition?.align || 'center',
                  textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)',
                }}
                className="font-extrabold px-3.5 py-0.5 rounded-full border border-white/50 whitespace-nowrap tracking-wider"
              >
                {primaryItem.year}
              </div>
            )}
          </div>
        )}

        {/* Visual Reference Grid (5%) */}
        <VisualReferenceGrid show={showGrid} />
      </div>
    </div>
  </div>
  );
};
