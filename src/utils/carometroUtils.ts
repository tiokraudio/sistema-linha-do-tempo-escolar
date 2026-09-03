import JSZip from 'jszip';
import { Student, AcademicYearRecord, CropSettings, CarometroCropSettings, AutoFaceCropSettings, SchoolConfig } from '../types';
import { createA4JsPdf, addPngPageToA4Pdf, saveA4Pdf, captureA4ElementToPng } from './pdfGenerator';

export type CarometroItemStatus =
  | 'missing_photo' // "Sem foto"
  | 'timeline_pending' // "Composição pendente"
  | 'pending' // "Pendente" (composição da Linha do Tempo salva, mas sem ajuste do Carômetro salvo)
  | 'saved' // "Ajuste salvo" (composição salva + ajuste do Carômetro salvo)
  | 'photo_outdated'; // "Foto principal alterada"

export type CarometroNamingFormat = 'enrollment_name' | 'name_only' | 'enrollment_only';
export type CarometroExportFormat = '3x4' | 'circular' | 'models';

export interface CarometroStudentItem {
  student: Student;
  record: AcademicYearRecord;
  className: string;
  year: string;
  photoUrl: string;
  crop: CropSettings;
  hasCustomCrop: boolean;
  hasPhoto: boolean;
  hasSavedTimeline: boolean;
  isPhotoOutdated: boolean;
  hasAutoFaceDetection: boolean;
  autoFaceCrop?: AutoFaceCropSettings;
  status: CarometroItemStatus;
  statusLabel: string;
  canAdjust: boolean;
  isEligibleForExport: boolean;
}

/**
 * Canonical rule for Carometro output eligibility (Printing & ZIP download).
 * An item is eligible ONLY when:
 * 1. It has a primary photo
 * 2. It has a saved Timeline composition
 * 3. It has a saved Carometro crop adjustment on the record (3x4 or circular based on format)
 * 4. The saved adjustment corresponds to the current photo (not outdated)
 *
 * NOTE: isCircular indicates ONLY the visual image format (circular vs 3x4 rectangular).
 * It NEVER defines person type or business logic.
 */
export function hasSavedCarometroAdjustment(item: {
  hasPhoto?: boolean;
  hasSavedTimeline?: boolean;
  isPhotoOutdated?: boolean;
  student?: Student;
  record?: AcademicYearRecord;
  status?: CarometroItemStatus;
  isCircular?: boolean;
}): boolean {
  if (item.status) {
    if (item.isCircular) {
      const rec = item.record;
      if (!rec || !rec.photoUrl) return false;
      const savedCrop = rec.carometroCircularCrop || rec.carometroCrop;
      return Boolean(savedCrop && item.hasSavedTimeline !== false);
    }
    return item.status === 'saved';
  }
  const hasPhoto = !!(item.record?.photoUrl && item.record.photoUrl.trim() !== '');
  const savedCrop = item.isCircular
    ? (item.record?.carometroCircularCrop || item.record?.carometroCrop)
    : item.record?.carometroCrop;
  const hasSavedCrop = !!savedCrop;
  const isOutdated = !!(
    hasPhoto &&
    savedCrop?.photoUrl &&
    savedCrop.photoUrl !== item.record?.photoUrl
  );
  return hasPhoto && !!item.hasSavedTimeline && hasSavedCrop && !isOutdated;
}

/**
 * Loads an image from URL and returns HTMLImageElement
 */
export function loadImageAsync(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Falha ao carregar imagem: ${url}`));
    img.src = url;
    if (img.complete) resolve(img);
  });
}

/**
 * Renders a 3:4 aspect ratio photo onto a high-resolution Canvas directly from original source.
 * Target default: 900 x 1200 px (300 DPI for 3x4 cm print).
 */
export async function renderCarometroCanvas(
  photoUrl: string,
  crop: CropSettings = { x: 50, y: 50, zoom: 1.0 },
  targetW: number = 900,
  targetH: number = 1200
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }

  // Clear with white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);

  if (!photoUrl) {
    return canvas;
  }

  try {
    const img = await loadImageAsync(photoUrl);
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;

    if (!imgW || !imgH) return canvas;

    const zoom = crop.zoom ?? 1.0;
    const cropX = crop.x ?? 50;
    const cropY = crop.y ?? 50;

    // Mathematical 3:4 crop mapping
    const scale = Math.max(targetW / imgW, targetH / imgH);
    const srcW = targetW / (scale * zoom);
    const srcH = targetH / (scale * zoom);
    const centerX = imgW * (cropX / 100);
    const centerY = imgH * (cropY / 100);
    const srcX = centerX - srcW / 2;
    const srcY = centerY - srcH / 2;

    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH);
  } catch (err) {
    console.error('Erro ao renderizar foto 3x4:', err);
  }

  return canvas;
}

/**
 * Renders a 3:4 photo and converts directly to a high quality JPEG Blob.
 */
export async function renderCarometroJpegBlob(
  photoUrl: string,
  crop: CropSettings = { x: 50, y: 50, zoom: 1.0 },
  quality: number = 0.95
): Promise<Blob> {
  const canvas = await renderCarometroCanvas(photoUrl, crop, 900, 1200);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Falha ao gerar Blob JPEG'));
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Renders a Circular (1:1) photo onto a high-resolution transparent Canvas.
 * Target default: 1000 x 1000 px.
 */
export async function renderCarometroCircularCanvas(
  photoUrl: string,
  crop: CropSettings = { x: 50, y: 50, zoom: 1.0 },
  targetDiameter: number = 1000
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = targetDiameter;
  canvas.height = targetDiameter;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }

  // Clear with transparency
  ctx.clearRect(0, 0, targetDiameter, targetDiameter);

  if (!photoUrl) {
    return canvas;
  }

  try {
    const img = await loadImageAsync(photoUrl);
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;

    if (!imgW || !imgH) return canvas;

    const zoom = crop.zoom ?? 1.0;
    const cropX = crop.x ?? 50;
    const cropY = crop.y ?? 50;

    const borderWidth = 12;
    const radius = (targetDiameter - borderWidth) / 2;
    const center = targetDiameter / 2;

    // Mathematical 1:1 circular crop mapping
    const scale = Math.max(targetDiameter / imgW, targetDiameter / imgH);
    const srcW = targetDiameter / (scale * zoom);
    const srcH = targetDiameter / (scale * zoom);
    const centerX = imgW * (cropX / 100);
    const centerY = imgH * (cropY / 100);
    const srcX = centerX - srcW / 2;
    const srcY = centerY - srcH / 2;

    // Clip image to circle within border
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, targetDiameter, targetDiameter);
    ctx.restore();

    // Draw clean circular border
    ctx.save();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = borderWidth;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2, true);
    ctx.stroke();
    ctx.restore();
  } catch (err) {
    console.error('Erro ao renderizar foto circular:', err);
  }

  return canvas;
}

/**
 * Renders a Circular photo and converts directly to a high quality transparent PNG Blob.
 */
export async function renderCarometroCircularPngBlob(
  photoUrl: string,
  crop: CropSettings = { x: 50, y: 50, zoom: 1.0 }
): Promise<Blob> {
  const canvas = await renderCarometroCircularCanvas(photoUrl, crop, 1000);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Falha ao gerar Blob PNG transparente'));
      },
      'image/png'
    );
  });
}

/**
 * Sanitizes string for safe filename while preserving accents
 */
export function sanitizeFilename(str: string): string {
  return str
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Formats a safe filename according to the selected naming convention
 * and handles folder-level collisions by appending (2), (3), etc.
 */
export function formatCarometroFilename(
  studentName: string,
  enrollment: string,
  format: CarometroNamingFormat = 'enrollment_name',
  usedNamesMap?: Map<string, number>,
  extension: 'jpg' | 'png' = 'jpg'
): string {
  const cleanName = (studentName || 'Pessoa').trim();
  const cleanEnrollment = (enrollment || '0000').trim();

  let baseName = '';
  switch (format) {
    case 'name_only':
      baseName = cleanName;
      break;
    case 'enrollment_only':
      baseName = cleanEnrollment;
      break;
    case 'enrollment_name':
    default:
      baseName = `${cleanEnrollment} - ${cleanName}`;
      break;
  }

  const safeBase = sanitizeFilename(baseName) || 'foto';

  if (!usedNamesMap) {
    return `${safeBase}.${extension}`;
  }

  const lowerKey = safeBase.toLowerCase();
  const currentCount = usedNamesMap.get(lowerKey) || 0;
  usedNamesMap.set(lowerKey, currentCount + 1);

  if (currentCount === 0) {
    return `${safeBase}.${extension}`;
  } else {
    return `${safeBase} (${currentCount + 1}).${extension}`;
  }
}

export interface GenerateCarometroZipOptions {
  groupByClass?: boolean;
  zipFilename?: string;
  namingFormat?: CarometroNamingFormat;
  exportFormat?: CarometroExportFormat;
  isCircular?: boolean;
  onProgress?: (current: number, total: number, studentName: string) => void;
}

/**
 * Generates and downloads a ZIP file containing high-resolution JPEG (3:4) or transparent PNG (Circular) photos.
 * ONLY includes entities who satisfy hasSavedCarometroAdjustment.
 */
export async function generateCarometroZip(
  items: CarometroStudentItem[],
  options: GenerateCarometroZipOptions = {}
): Promise<void> {
  const {
    groupByClass = true,
    zipFilename = 'Carometro_Fotografias',
    namingFormat = 'enrollment_name',
    exportFormat = options.isCircular ? 'circular' : '3x4',
    isCircular = exportFormat === 'circular',
    onProgress,
  } = options;

  const actualIsCircular = exportFormat === 'circular' || isCircular;

  // Filter STRICTLY by saved Carometro adjustment
  const eligibleItems = items.filter((item) =>
    hasSavedCarometroAdjustment({ ...item, isCircular: actualIsCircular })
  );

  if (eligibleItems.length === 0) {
    throw new Error('Nenhum registro com Ajuste salvo disponível para exportação.');
  }

  const zip = new JSZip();
  const folderNamesMaps = new Map<string, Map<string, number>>();
  const rootNamesMap = new Map<string, number>();

  const total = eligibleItems.length;
  let count = 0;
  const extension: 'jpg' | 'png' = actualIsCircular ? 'png' : 'jpg';

  for (const item of eligibleItems) {
    count++;
    if (onProgress) {
      onProgress(count, total, item.student.name);
    }

    if (!item.photoUrl) continue;

    try {
      let blob: Blob;

      if (actualIsCircular) {
        // Usa exclusivamente o carometroCircularCrop se presente, ou fallback seguro
        const crop =
          item.record.carometroCircularCrop ||
          item.record.carometroCrop ||
          item.crop ||
          { x: 50, y: 50, zoom: 1.0 };
        blob = await renderCarometroCircularPngBlob(item.photoUrl, crop);
      } else {
        // Exportação 3x4: usa exclusivamente carometroCrop
        const crop = item.record.carometroCrop || item.crop || { x: 50, y: 50, zoom: 1.0 };
        blob = await renderCarometroJpegBlob(item.photoUrl, crop, 0.95);
      }

      const safeClass = sanitizeFilename(item.className || 'Sem_Turma');

      if (groupByClass) {
        let classMap = folderNamesMaps.get(safeClass);
        if (!classMap) {
          classMap = new Map<string, number>();
          folderNamesMaps.set(safeClass, classMap);
        }
        const filename = formatCarometroFilename(
          item.student.name,
          item.student.enrollment,
          namingFormat,
          classMap,
          extension
        );
        zip.folder(safeClass)?.file(filename, blob);
      } else {
        const filename = formatCarometroFilename(
          item.student.name,
          item.student.enrollment,
          namingFormat,
          rootNamesMap,
          extension
        );
        zip.file(filename, blob);
      }
    } catch (err) {
      console.error(`Erro ao processar foto do carômetro (${item.student.name}):`, err);
    }
  }

  // Generate the ZIP blob
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // Trigger browser download
  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFilename(zipFilename)}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
