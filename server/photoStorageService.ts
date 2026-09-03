import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { LocalStorageData } from '../src/types';

export const DATA_DIR = path.join(process.cwd(), 'data');
export const DATA_FILE = path.join(DATA_DIR, 'storage.json');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const PHOTOS_DIR = path.join(UPLOADS_DIR, 'photos');

// Ensure upload directories exist
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(PHOTOS_DIR)) {
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}

/**
 * Checks whether a given string is a Base64-encoded image or Data URI.
 */
export function isBase64Image(data: unknown): boolean {
  if (!data || typeof data !== 'string') return false;
  const trimmed = data.trim();
  if (trimmed.startsWith('data:image/')) return true;
  // Raw Base64 heuristic: at least 500 chars, only base64 charset, starts like image
  if (trimmed.length > 500 && /^[A-Za-z0-9+/=\s]+$/.test(trimmed.slice(0, 100))) {
    return true;
  }
  return false;
}

/**
 * Extracts image extension and binary buffer from a Base64 string or Data URI.
 */
function extractImageBufferAndExt(base64Str: string): { buffer: Buffer; ext: string } {
  let ext = '.jpg';
  let cleanBase64 = base64Str.trim();

  if (cleanBase64.startsWith('data:image/')) {
    const headerMatch = cleanBase64.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/);
    if (headerMatch) {
      const mimeSubtype = headerMatch[1].toLowerCase();
      if (mimeSubtype === 'png') ext = '.png';
      else if (mimeSubtype === 'webp') ext = '.webp';
      else if (mimeSubtype === 'gif') ext = '.gif';
      else if (mimeSubtype === 'jpeg' || mimeSubtype === 'jpg') ext = '.jpg';
      else ext = `.${mimeSubtype}`;
      cleanBase64 = cleanBase64.slice(headerMatch[0].length);
    }
  }

  // Remove any remaining whitespace / newlines from base64
  cleanBase64 = cleanBase64.replace(/\s+/g, '');
  const buffer = Buffer.from(cleanBase64, 'base64');

  // If mime was not explicit, detect by magic numbers
  if (buffer.length >= 4) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      ext = '.jpg';
    } else if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      ext = '.png';
    } else if (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      ext = '.webp';
    }
  }

  return { buffer, ext };
}

/**
 * Saves a photo from Base64 or Data URI directly to the local file system (data/uploads/photos/).
 * Returns the relative public URL (e.g. `/uploads/photos/[year]_[studentId]_[timestamp]_[hash].jpg`).
 * If the input is already a relative URL or empty, returns it directly.
 */
export function savePhotoFromBase64(
  photoData: string | undefined | null,
  studentId: string = 'std',
  year: string = 'general'
): string {
  if (!photoData || typeof photoData !== 'string') {
    return '';
  }

  const trimmed = photoData.trim();
  if (!trimmed) {
    return '';
  }

  // If already a relative URL or absolute URL, return as is
  if (
    trimmed.startsWith('/uploads/') ||
    trimmed.startsWith('uploads/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  ) {
    return trimmed.startsWith('uploads/') ? `/${trimmed}` : trimmed;
  }

  // If not a Base64 image, return as is
  if (!isBase64Image(trimmed)) {
    return trimmed;
  }

  try {
    const { buffer, ext } = extractImageBufferAndExt(trimmed);
    if (buffer.length === 0) {
      return '';
    }

    const safeYear = String(year || 'year').replace(/[^a-zA-Z0-9_-]/g, '') || 'year';
    const safeStudentId = String(studentId || 'std').replace(/[^a-zA-Z0-9_-]/g, '') || 'std';
    const timestamp = Date.now();
    const randomHex = crypto.randomBytes(3).toString('hex');
    const filename = `${safeYear}_${safeStudentId}_${timestamp}_${randomHex}${ext}`;
    const destinationPath = path.join(PHOTOS_DIR, filename);

    fs.writeFileSync(destinationPath, buffer);

    const relativeUrl = `/uploads/photos/${filename}`;
    return relativeUrl;
  } catch (err) {
    console.error('[PhotoStorage] Falha ao salvar foto em disco:', err);
    return trimmed; // fallback
  }
}

/**
 * Deletes a photo file from disk if it exists inside data/uploads/photos/.
 */
export function deletePhotoFile(photoUrl: string | undefined | null): boolean {
  if (!photoUrl || typeof photoUrl !== 'string') return false;
  const trimmed = photoUrl.trim();
  if (!trimmed.startsWith('/uploads/photos/') && !trimmed.startsWith('uploads/photos/')) {
    return false;
  }

  const filename = path.basename(trimmed);
  if (!filename || filename === '.' || filename === '..') return false;

  const targetPath = path.join(PHOTOS_DIR, filename);
  // Ensure path is strictly inside PHOTOS_DIR
  const resolvedTarget = path.resolve(targetPath);
  const resolvedPhotosDir = path.resolve(PHOTOS_DIR);
  if (!resolvedTarget.startsWith(resolvedPhotosDir + path.sep)) {
    return false;
  }

  if (fs.existsSync(resolvedTarget)) {
    try {
      fs.unlinkSync(resolvedTarget);
      return true;
    } catch (err) {
      console.error('[PhotoStorage] Erro ao excluir arquivo de foto:', err);
      return false;
    }
  }
  return false;
}

/**
 * Deletes a list of photo files from disk.
 * Returns the count of successfully deleted files.
 */
export function deletePhotoFilesForUrls(urls: (string | undefined | null)[]): number {
  let count = 0;
  if (!Array.isArray(urls)) return 0;
  for (const url of urls) {
    if (deletePhotoFile(url)) {
      count++;
    }
  }
  return count;
}

/**
 * Scans data/uploads/photos/ and deletes all physical photo files that are no longer
 * referenced in the store (records, timelines, school logo).
 */
export function cleanupOrphanPhotos(store: LocalStorageData): number {
  if (!fs.existsSync(PHOTOS_DIR)) return 0;

  const activeFilenames = new Set<string>();

  const registerUrl = (url?: string | null) => {
    if (!url || typeof url !== 'string') return;
    const trimmed = url.trim();
    if (trimmed.startsWith('/uploads/photos/') || trimmed.startsWith('uploads/photos/')) {
      const filename = path.basename(trimmed);
      if (filename && filename !== '.' && filename !== '..') {
        activeFilenames.add(filename);
      }
    }
  };

  // 1. Collect from store.records
  if (Array.isArray(store?.records)) {
    for (const rec of store.records) {
      registerUrl(rec.photoUrl);
      registerUrl(rec.carometroCrop?.photoUrl);
      registerUrl(rec.carometroCircularCrop?.photoUrl);
      registerUrl(rec.autoFaceCrop?.photoUrl);
    }
  }

  // 2. Collect from store.timelines
  if (Array.isArray(store?.timelines)) {
    for (const tl of store.timelines) {
      const items = Array.isArray(tl.photoItems)
        ? tl.photoItems
        : Array.isArray((tl as any).photos)
        ? (tl as any).photos
        : [];
      for (const p of items) {
        registerUrl(p?.photoUrl);
      }
    }
  }

  // 3. Collect school logo
  if (store?.config?.schoolLogo) {
    registerUrl(store.config.schoolLogo);
  }

  let deletedCount = 0;
  try {
    const filesOnDisk = fs.readdirSync(PHOTOS_DIR);
    for (const file of filesOnDisk) {
      const filePath = path.join(PHOTOS_DIR, file);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        if (!activeFilenames.has(file)) {
          try {
            fs.unlinkSync(filePath);
            deletedCount++;
          } catch (err) {
            console.error(`[PhotoStorage] Erro ao excluir foto órfã ${file}:`, err);
          }
        }
      }
    }
  } catch (err) {
    console.error('[PhotoStorage] Erro ao varrer diretório de fotos para limpeza de órfãos:', err);
  }

  return deletedCount;
}

/**
 * Migrates any legacy Base64 photos found in storage.json to physical disk files.
 * Replaces base64 strings with `/uploads/photos/...` relative URLs.
 */
export function migrateBase64PhotosInStore(store: LocalStorageData): {
  migratedRecords: number;
  migratedTimelines: number;
  migratedLogo: boolean;
  savedBytesApprox: number;
} {
  let migratedRecords = 0;
  let migratedTimelines = 0;
  let migratedLogo = false;
  let savedBytesApprox = 0;

  if (!store) {
    return { migratedRecords, migratedTimelines, migratedLogo, savedBytesApprox };
  }

  // 1. Migrar Fotos nos Registros Escolares (store.records)
  if (Array.isArray(store.records)) {
    for (const record of store.records) {
      if (record.photoUrl && isBase64Image(record.photoUrl)) {
        const originalLength = record.photoUrl.length;
        const newUrl = savePhotoFromBase64(record.photoUrl, record.studentId, record.year);
        record.photoUrl = newUrl;
        savedBytesApprox += originalLength - newUrl.length;
        migratedRecords++;

        // Atualizar referências nos crops se apontavam para base64
        if (record.carometroCrop && isBase64Image(record.carometroCrop.photoUrl)) {
          record.carometroCrop.photoUrl = newUrl;
        }
        if (record.carometroCircularCrop && isBase64Image(record.carometroCircularCrop.photoUrl)) {
          record.carometroCircularCrop.photoUrl = newUrl;
        }
        if (record.autoFaceCrop && isBase64Image(record.autoFaceCrop.photoUrl)) {
          record.autoFaceCrop.photoUrl = newUrl;
        }
      }
    }
  }

  // 2. Migrar Fotos nas Composições Salvas da Linha do Tempo (store.timelines)
  if (Array.isArray(store.timelines)) {
    for (const timeline of store.timelines) {
      const items = Array.isArray(timeline.photoItems)
        ? timeline.photoItems
        : Array.isArray((timeline as any).photos)
        ? (timeline as any).photos
        : [];

      for (const p of items) {
        if (p && p.photoUrl && isBase64Image(p.photoUrl)) {
          const originalLength = p.photoUrl.length;
          const newUrl = savePhotoFromBase64(
            p.photoUrl,
            timeline.studentId,
            String(p.year || timeline.year)
          );
          p.photoUrl = newUrl;
          savedBytesApprox += originalLength - newUrl.length;
          migratedTimelines++;
        }
      }
    }
  }

  // 3. Migrar Logo da Escola se em Base64
  if (store.config?.schoolLogo && isBase64Image(store.config.schoolLogo)) {
    const originalLength = store.config.schoolLogo.length;
    const newLogoUrl = savePhotoFromBase64(store.config.schoolLogo, 'logo', 'school');
    store.config.schoolLogo = newLogoUrl;
    savedBytesApprox += originalLength - newLogoUrl.length;
    migratedLogo = true;
  }

  if (migratedRecords > 0 || migratedTimelines > 0 || migratedLogo) {
    console.info('[PhotoStorage Migration] Migração de fotos para disco concluída:', {
      migratedRecords,
      migratedTimelines,
      migratedLogo,
      savedBytesApprox: `${(savedBytesApprox / (1024 * 1024)).toFixed(2)} MB`,
    });
  }

  return { migratedRecords, migratedTimelines, migratedLogo, savedBytesApprox };
}
