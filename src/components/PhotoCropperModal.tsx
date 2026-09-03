import React, { useState, useEffect, useRef } from 'react';
import { CropSettings } from '../types';
import { autoDetectFaceCrop } from '../utils/faceDetector';
import { Sparkles, Move, ZoomIn, Check, X, RotateCcw } from 'lucide-react';
import { Button } from './ui/Button';

interface PhotoCropperModalProps {
  isOpen: boolean;
  photoUrl: string;
  initialCrop: CropSettings;
  frameOverlayUrl?: string;
  isPrimary?: boolean;
  onSave: (crop: CropSettings) => void;
  onClose: () => void;
}

export const PhotoCropperModal: React.FC<PhotoCropperModalProps> = ({
  isOpen,
  photoUrl,
  initialCrop,
  frameOverlayUrl,
  isPrimary = false,
  onSave,
  onClose,
}) => {
  const [crop, setCrop] = useState<CropSettings>(initialCrop || { x: 50, y: 50, zoom: 1.0 });
  const [isDetecting, setIsDetecting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (isOpen) {
      setCrop(initialCrop || { x: 50, y: 50, zoom: 1.0 });
    }
  }, [isOpen, initialCrop, photoUrl]);

  // Update canvas preview whenever crop or photoUrl changes
  useEffect(() => {
    if (!isOpen || !photoUrl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setNaturalSize({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      });

      const targetW = isPrimary ? 288 : 224;
      const targetH = isPrimary ? 216 : 224;
      canvas.width = targetW;
      canvas.height = targetH;

      ctx.clearRect(0, 0, targetW, targetH);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, targetW, targetH);

      const zoom = crop.zoom ?? 1.0;
      const cropX = crop.x ?? 50;
      const cropY = crop.y ?? 50;

      const imgW = img.naturalWidth || img.width;
      const imgH = img.naturalHeight || img.height;
      if (!imgW || !imgH) return;

      const scale = Math.max(targetW / imgW, targetH / imgH);
      const srcW = targetW / (scale * zoom);
      const srcH = targetH / (scale * zoom);
      const centerX = imgW * (cropX / 100);
      const centerY = imgH * (cropY / 100);
      const srcX = centerX - srcW / 2;
      const srcY = centerY - srcH / 2;

      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH);
    };
    img.src = photoUrl;
  }, [isOpen, photoUrl, crop.x, crop.y, crop.zoom, isPrimary]);

  if (!isOpen || !photoUrl) return null;

  const handleAutoDetect = async () => {
    setIsDetecting(true);
    try {
      const detected = await autoDetectFaceCrop(photoUrl);
      setCrop(detected);
    } catch (e) {
      console.error('Auto detect error:', e);
    } finally {
      setIsDetecting(false);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    const factor = 0.35;
    setCrop((prev) => ({
      ...prev,
      x: Math.min(Math.max(prev.x + dx * factor, 0), 100),
      y: Math.min(Math.max(prev.y + dy * factor, 0), 100),
    }));

    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Calculate crop rectangle on the original image coordinate space
  const imgW = naturalSize.width || 400;
  const imgH = naturalSize.height || 400;
  const targetW = isPrimary ? 288 : 216;
  const targetH = isPrimary ? 216 : 216;
  const scale = Math.max(targetW / imgW, targetH / imgH);
  const zoom = crop.zoom || 1.0;
  const srcW = targetW / (scale * zoom);
  const srcH = targetH / (scale * zoom);
  const centerX = imgW * ((crop.x ?? 50) / 100);
  const centerY = imgH * ((crop.y ?? 50) / 100);
  const srcX = centerX - srcW / 2;
  const srcY = centerY - srcH / 2;

  const boxLeftPct = (srcX / imgW) * 100;
  const boxTopPct = (srcY / imgH) * 100;
  const boxWidthPct = (srcW / imgW) * 100;
  const boxHeightPct = (srcH / imgH) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              {isPrimary ? 'Enquadramento da foto principal' : 'Enquadramento da foto'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isPrimary
                ? 'Posicione a área retangular sobre a fotografia'
                : 'Posicione a área circular sobre a fotografia'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Framing Stage */}
        <div className="p-4 bg-slate-950 flex flex-col items-center justify-center select-none overflow-hidden">
          <div
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="relative inline-block overflow-hidden rounded-lg shadow-xl cursor-grab active:cursor-grabbing max-h-56 select-none border border-slate-800 bg-slate-900"
          >
            {/* Full Original Image */}
            <img
              src={photoUrl}
              alt="Original do aluno"
              onLoad={(e) => {
                const img = e.currentTarget;
                setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
              }}
              className="max-h-56 max-w-full object-contain pointer-events-none block"
              referrerPolicy="no-referrer"
            />

            {/* Illuminated Viewfinder Cutout with dark mask outside */}
            <div
              style={{
                left: `${boxLeftPct}%`,
                top: `${boxTopPct}%`,
                width: `${boxWidthPct}%`,
                height: `${boxHeightPct}%`,
                boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.72)',
              }}
              className={`absolute pointer-events-none border-2 border-amber-400 flex items-center justify-center transition-all duration-75 ${
                isPrimary ? 'rounded-none' : 'rounded-full'
              }`}
            >
              {/* Optional secondary frame overlay */}
              {!isPrimary && frameOverlayUrl && (
                <img
                  src={frameOverlayUrl}
                  alt="Moldura"
                  className="absolute inset-0 w-full h-full object-fill pointer-events-none z-10"
                />
              )}

              {/* Crosshair Guides */}
              <div className="w-full h-px bg-white/30 absolute pointer-events-none"></div>
              <div className="h-full w-px bg-white/30 absolute pointer-events-none"></div>
              <div className="w-2 h-2 rounded-full bg-amber-400/90 absolute pointer-events-none"></div>
            </div>
          </div>

          {/* Stage Footer: Hint & Live Result Preview */}
          <div className="mt-3 flex items-center justify-between w-full max-w-md px-1 text-slate-400 text-xs">
            <span className="flex items-center gap-1.5 text-[11px]">
              <Move className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Arraste com o mouse para posicionar</span>
            </span>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Resultado:
              </span>
              <div
                className={`overflow-hidden border border-amber-500/80 bg-slate-900 shadow-md ${
                  isPrimary ? 'w-12 h-9 rounded-xs' : 'w-9 h-9 rounded-full'
                }`}
              >
                <canvas ref={canvasRef} className="w-full h-full block" />
              </div>
            </div>
          </div>
        </div>

        {/* Controls Section */}
        <div className="p-4 sm:p-5 space-y-3.5 bg-white overflow-y-auto">
          {/* Auto Detect Button */}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={Sparkles}
            onClick={handleAutoDetect}
            isLoading={isDetecting}
            className="w-full"
          >
            {isDetecting ? 'Identificando...' : 'Identificar rosto automaticamente'}
          </Button>

          {/* Sliders */}
          <div className="space-y-2.5 pt-1">
            {/* Zoom Slider */}
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                <span className="flex items-center gap-1">
                  <ZoomIn className="w-3.5 h-3.5 text-slate-500" /> Zoom
                </span>
                <span className="text-slate-500 font-mono font-bold">{Math.round(crop.zoom * 100)}%</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="2.8"
                step="0.05"
                value={crop.zoom}
                onChange={(e) => setCrop({ ...crop, zoom: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
              />
            </div>

            {/* Horizontal Position X */}
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                <span>Posição horizontal</span>
                <span className="text-slate-500 font-mono font-bold">{Math.round(crop.x)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={crop.x}
                onChange={(e) => setCrop({ ...crop, x: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
              />
            </div>

            {/* Vertical Position Y */}
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                <span>Posição vertical</span>
                <span className="text-slate-500 font-mono font-bold">{Math.round(crop.y)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={crop.y}
                onChange={(e) => setCrop({ ...crop, y: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setCrop({ x: 50, y: 50, zoom: 1.0 })}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Redefinir</span>
          </button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={Check}
              onClick={() => {
                onSave(crop);
                onClose();
              }}
            >
              Salvar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
