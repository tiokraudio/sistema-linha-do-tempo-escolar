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
 * Limite máximo para imagem decodificada: 20 MB.
 */
export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * Formatos de imagem estritamente aceitos para novos uploads: JPEG, PNG e WEBP.
 */
export type SupportedImageFormat = 'jpeg' | 'png' | 'webp';

/**
 * Erro de validação de imagem com mensagens limpas e seguras.
 */
export class PhotoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoValidationError';
  }
}

/**
 * Cabeçalhos Data URI estritamente permitidos:
 * - data:image/jpeg;base64,
 * - data:image/jpg;base64,
 * - data:image/png;base64,
 * - data:image/webp;base64,
 */
const STRICT_DATA_URI_REGEX = /^data:image\/(jpeg|jpg|png|webp);base64,/i;

/**
 * Detecta se uma string representa uma URL ou referência de foto já existente no sistema.
 */
export function isExistingPhotoReference(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  return (
    trimmed.startsWith('/uploads/photos/') ||
    trimmed.startsWith('uploads/photos/') ||
    trimmed.startsWith('/uploads/') ||
    trimmed.startsWith('uploads/') ||
    trimmed.startsWith('/api/photos/') ||
    trimmed.startsWith('api/photos/') ||
    trimmed.startsWith('/api/public-logo') ||
    trimmed.startsWith('api/public-logo') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:')
  );
}

/**
 * Verifica se uma string pretende ser uma imagem codificada em Base64 ou Data URI.
 */
export function isBase64Image(data: unknown): boolean {
  if (!data || typeof data !== 'string') return false;
  const trimmed = data.trim();
  if (!trimmed) return false;

  // URLs já existentes não são novos uploads
  if (isExistingPhotoReference(trimmed)) {
    return false;
  }

  // Qualquer Data URI
  if (trimmed.startsWith('data:')) {
    return true;
  }

  // Base64 bruto substancial
  if (trimmed.length >= 64 && /^[A-Za-z0-9+/=\r\n\t\s]+$/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Detecta o formato real da imagem através dos magic bytes binários obrigatórios:
 * - JPEG: FF D8 FF
 * - PNG:  89 50 4E 47 0D 0A 1A 0A
 * - WEBP: RIFF nos bytes 0..3 e WEBP nos bytes 8..11
 */
export function detectFormatFromMagicBytes(buffer: Buffer): SupportedImageFormat | null {
  if (!buffer || buffer.length < 3) return null;

  // 1. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }

  // 3. WEBP: RIFF (bytes 0..3) + WEBP (bytes 8..11)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'webp';
  }

  return null;
}

/**
 * Inspeciona assinaturas de formatos não permitidos para mensagens claras de erro.
 */
function inspectDisallowedFormat(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 4) return null;

  // GIF: GIF87a ou GIF89a (47 49 46 38)
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return 'GIF';
  }

  // SVG / XML textual
  const sample = buffer.slice(0, 100).toString('utf8').trim().toLowerCase();
  if (sample.startsWith('<?xml') || sample.startsWith('<svg') || sample.includes('<svg')) {
    return 'SVG';
  }

  return null;
}

/**
 * Validação rigorosa e extração do buffer binário da imagem:
 * - Valida cabeçalho Data URI (quando presente)
 * - Valida charset Base64 completo e padding
 * - Decodifica Buffer binário
 * - Valida que buffer é não vazio
 * - Valida limite individual de 20 MB
 * - Valida magic bytes reais (JPEG, PNG ou WEBP)
 * - Rejeita divergência entre MIME declarado e magic bytes
 * - Determina extensão SOMENTE pelo formato real (.jpg, .png, .webp)
 */
export function validateAndExtractImageBuffer(dataStr: string): {
  buffer: Buffer;
  format: SupportedImageFormat;
  ext: '.jpg' | '.png' | '.webp';
} {
  const trimmed = dataStr.trim();
  if (!trimmed) {
    throw new PhotoValidationError('Conteúdo de imagem vazio.');
  }

  let declaredFormat: SupportedImageFormat | null = null;
  let base64Payload = trimmed;

  if (trimmed.startsWith('data:')) {
    const lowerHead = trimmed.slice(0, 50).toLowerCase();
    if (lowerHead.startsWith('data:image/svg')) {
      throw new PhotoValidationError('Formato SVG não é permitido. Apenas imagens JPEG, PNG e WEBP são aceitas.');
    }
    if (lowerHead.startsWith('data:image/gif')) {
      throw new PhotoValidationError('Formato GIF não é permitido. Apenas imagens JPEG, PNG e WEBP são aceitas.');
    }

    const match = trimmed.match(STRICT_DATA_URI_REGEX);
    if (!match) {
      throw new PhotoValidationError(
        'Cabeçalho Data URI inválido ou formato não permitido. Formatos aceitos: data:image/jpeg;base64,, data:image/jpg;base64,, data:image/png;base64, ou data:image/webp;base64,.'
      );
    }

    const rawMime = match[1].toLowerCase();
    declaredFormat = (rawMime === 'jpeg' || rawMime === 'jpg') ? 'jpeg' : (rawMime as SupportedImageFormat);
    base64Payload = trimmed.slice(match[0].length);
  }

  // 1. Remover somente whitespace permitido
  const cleanBase64 = base64Payload.replace(/[\r\n\t\s]+/g, '');
  if (cleanBase64.length === 0) {
    throw new PhotoValidationError('Conteúdo Base64 vazio.');
  }

  // 2. Comprimento do Base64 deve ser múltiplo de 4
  if (cleanBase64.length % 4 !== 0) {
    throw new PhotoValidationError('Conteúdo Base64 malformado: comprimento inválido ou padding incorreto.');
  }

  // 3. Validação estrita de charset e padding (A-Za-z0-9+/ com no máximo dois '=' no final)
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleanBase64)) {
    throw new PhotoValidationError('Conteúdo Base64 inválido: caracteres não permitidos encontrados.');
  }

  // 4. Decodificação em Buffer binário
  const buffer = Buffer.from(cleanBase64, 'base64');
  if (!buffer || buffer.length === 0) {
    throw new PhotoValidationError('Falha ao decodificar imagem Base64: conteúdo binário resultante vazio.');
  }

  // 5. Validação de tamanho individual máximo (20 MB)
  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new PhotoValidationError('Tamanho da imagem excede o limite máximo permitido de 20MB.');
  }

  // 6. Validação dos magic bytes reais
  const realFormat = detectFormatFromMagicBytes(buffer);
  if (!realFormat) {
    const disallowed = inspectDisallowedFormat(buffer);
    if (disallowed) {
      throw new PhotoValidationError(`Formato ${disallowed} não é permitido. Apenas imagens JPEG, PNG e WEBP são aceitas.`);
    }
    throw new PhotoValidationError('Assinatura de arquivo (magic bytes) inválida. O arquivo não é uma imagem JPEG, PNG ou WEBP real.');
  }

  // 7. Divergência entre MIME declarado e Magic Bytes
  if (declaredFormat && declaredFormat !== realFormat) {
    const declStr = declaredFormat === 'jpeg' ? 'image/jpeg' : `image/${declaredFormat}`;
    throw new PhotoValidationError(
      `MIME declarado (${declStr}) diverge do formato real dos bytes da imagem (${realFormat.toUpperCase()}).`
    );
  }

  // 8. Extensão derivada estritamente dos magic bytes
  let ext: '.jpg' | '.png' | '.webp';
  if (realFormat === 'jpeg') {
    ext = '.jpg';
  } else if (realFormat === 'png') {
    ext = '.png';
  } else {
    ext = '.webp';
  }

  return { buffer, format: realFormat, ext };
}

/**
 * Saves a photo from Base64 or Data URI directly to the local file system (data/uploads/photos/).
 * Validates magic bytes, strict base64, size limits, and format constraints.
 * Writes the exact decoded bytes with zero modification/compression.
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

  // Se já for uma URL existente conhecida, preserva sem regravação
  if (isExistingPhotoReference(trimmed)) {
    return trimmed.startsWith('uploads/')
      ? `/${trimmed}`
      : trimmed.startsWith('api/photos/')
      ? `/${trimmed}`
      : trimmed;
  }

  // Validação rígida com erro explícito se inválido (não silencioso)
  const { buffer, ext } = validateAndExtractImageBuffer(trimmed);

  const safeYear = String(year || 'year').replace(/[^a-zA-Z0-9_-]/g, '') || 'year';
  const safeStudentId = String(studentId || 'std').replace(/[^a-zA-Z0-9_-]/g, '') || 'std';
  const timestamp = Date.now();
  const randomHex = crypto.randomBytes(4).toString('hex');
  const filename = `${safeYear}_${safeStudentId}_${timestamp}_${randomHex}${ext}`;
  const destinationPath = path.join(PHOTOS_DIR, filename);

  // Gravação física DIRETA dos bytes originais idênticos
  fs.writeFileSync(destinationPath, buffer);

  const relativeUrl = `/uploads/photos/${filename}`;
  return relativeUrl;
}

/**
 * Safely resolves and validates an image filename strictly inside the specified directory (defaults to PHOTOS_DIR).
 * Prevents any directory traversal (../, ..\, null bytes, encoded slashes, absolute paths).
 * Returns the absolute path string if safe and strictly inside baseDir, or null otherwise.
 */
export function getSafePhotoFilePath(filenameInput: unknown, baseDir: string = PHOTOS_DIR): string | null {
  if (!filenameInput || typeof filenameInput !== 'string') return null;

  let decoded = '';
  try {
    decoded = decodeURIComponent(filenameInput.trim());
  } catch {
    return null;
  }

  // Remove any leading slash or path prefix if provided (e.g. /uploads/photos/file.jpg or /api/photos/file.jpg)
  if (decoded.startsWith('/uploads/photos/')) {
    decoded = decoded.slice('/uploads/photos/'.length);
  } else if (decoded.startsWith('uploads/photos/')) {
    decoded = decoded.slice('uploads/photos/'.length);
  } else if (decoded.startsWith('/api/photos/')) {
    decoded = decoded.slice('/api/photos/'.length);
  } else if (decoded.startsWith('api/photos/')) {
    decoded = decoded.slice('api/photos/'.length);
  } else if (decoded.startsWith('/uploads/')) {
    decoded = decoded.slice('/uploads/'.length);
  } else if (decoded.startsWith('uploads/')) {
    decoded = decoded.slice('uploads/'.length);
  }

  // Strip potential query strings or hashes
  decoded = decoded.split('?')[0].split('#')[0];

  // Strict check: no directory traversal, no path separators, no null bytes
  if (
    decoded.includes('..') ||
    decoded.includes('/') ||
    decoded.includes('\\') ||
    decoded.includes('\0')
  ) {
    return null;
  }

  const baseName = path.basename(decoded);
  if (!baseName || baseName === '.' || baseName === '..') {
    return null;
  }

  // Filename format: alphanumeric, underscore, hyphen, and valid dot extension
  // Must not start with a dot (hidden files like .env, .git)
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(baseName) || baseName.startsWith('.')) {
    return null;
  }

  const resolvedBaseDir = path.resolve(baseDir);
  const resolvedTarget = path.resolve(baseDir, baseName);

  // Path containment check: target MUST start strictly with baseDir + separator
  if (!resolvedTarget.startsWith(resolvedBaseDir + path.sep)) {
    return null;
  }

  return resolvedTarget;
}

/**
 * Normaliza qualquer URL ou referência para o nome de arquivo físico seguro no disco.
 * Suporta referências como:
 * - /uploads/photos/foto.jpg
 * - uploads/photos/foto.jpg
 * - /api/photos/foto.jpg
 * - api/photos/foto.jpg
 * - foto.jpg
 * - referências com query params (?v=...) e hash anchors (#crop)
 * Rejeita explicitamente traversals (../), Data URIs, paths absolutos e arquivos ocultos (.env).
 */
export function extractFilenameFromPhotoUrl(urlInput: unknown): string | null {
  if (!urlInput || typeof urlInput !== 'string') return null;
  const trimmed = urlInput.trim();
  if (!trimmed) return null;

  // Rejeita Data URIs ou Base64 brutos
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return null;
  }

  // Remove query string e hash anchor
  const cleanUrl = trimmed.split('?')[0].split('#')[0].trim();
  if (!cleanUrl) return null;

  let decoded = cleanUrl;
  try {
    decoded = decodeURIComponent(cleanUrl);
  } catch {
    // Mantém cleanUrl caso decodeURIComponent falhe
  }

  // Remove prefixos conhecidos do sistema
  if (decoded.startsWith('/uploads/photos/')) {
    decoded = decoded.slice('/uploads/photos/'.length);
  } else if (decoded.startsWith('uploads/photos/')) {
    decoded = decoded.slice('uploads/photos/'.length);
  } else if (decoded.startsWith('/api/photos/')) {
    decoded = decoded.slice('/api/photos/'.length);
  } else if (decoded.startsWith('api/photos/')) {
    decoded = decoded.slice('api/photos/'.length);
  } else if (decoded.startsWith('/uploads/')) {
    decoded = decoded.slice('/uploads/'.length);
  } else if (decoded.startsWith('uploads/')) {
    decoded = decoded.slice('uploads/'.length);
  }

  // Prevenção estrita de Directory Traversal e caracteres maliciosos
  if (
    decoded.includes('..') ||
    decoded.includes('/') ||
    decoded.includes('\\') ||
    decoded.includes('\0')
  ) {
    return null;
  }

  const baseName = path.basename(decoded);
  if (!baseName || baseName === '.' || baseName === '..') {
    return null;
  }

  // Formato estrito: alfanumérico, hífen, sublinhado e extensão válida com ponto
  // Não pode iniciar com ponto (arquivos ocultos/de sistema)
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(baseName) || baseName.startsWith('.')) {
    return null;
  }

  return baseName;
}

export interface ActivePhotoCollectionOptions {
  extraProtectedUrls?: (string | null | undefined)[];
  authFilePath?: string;
  customPhotosDir?: string;
}

/**
 * Coleta exaustivamente todos os nomes de arquivos físicos de fotos que continuam ativos
 * e legitimamente referenciados em qualquer estrutura persistente do sistema:
 * - records (photoUrl, carometroCrop.photoUrl, carometroCircularCrop.photoUrl, autoFaceCrop.photoUrl, etc.)
 * - timelines (cada photoItem.photoUrl, fotos legadas, modelSnapshot imagens)
 * - school_data (config.schoolLogo)
 * - models (bgImageUrl, collaboratorBgImageUrl, primaryFrameUrl, secondaryFrameUrl, mainYearImageUrl)
 * - auth.json (admin.avatarUrl)
 * - URLs extras protegidas passadas explicitamente
 */
export function collectActivePhotoFilenames(
  store: LocalStorageData,
  options?: ActivePhotoCollectionOptions
): Set<string> {
  const activeFilenames = new Set<string>();

  const registerCandidateUrl = (url?: unknown) => {
    if (!url || typeof url !== 'string') return;
    const filename = extractFilenameFromPhotoUrl(url);
    if (filename) {
      activeFilenames.add(filename);
    }
  };

  if (!store) return activeFilenames;

  // 1. Coleta em store.records (matrículas e ajustes de fotos/carômetro)
  if (Array.isArray(store.records)) {
    for (const rec of store.records) {
      if (!rec) continue;
      registerCandidateUrl(rec.photoUrl);
      if (rec.carometroCrop) registerCandidateUrl(rec.carometroCrop.photoUrl);
      if (rec.carometroCircularCrop) registerCandidateUrl(rec.carometroCircularCrop.photoUrl);
      if (rec.autoFaceCrop) registerCandidateUrl(rec.autoFaceCrop.photoUrl);
      if ((rec as any).cropSettings?.photoUrl) registerCandidateUrl((rec as any).cropSettings.photoUrl);
      if ((rec as any).timelinePrimaryCrop?.photoUrl) registerCandidateUrl((rec as any).timelinePrimaryCrop.photoUrl);
      if ((rec as any).timelineSecondaryCrop?.photoUrl) registerCandidateUrl((rec as any).timelineSecondaryCrop.photoUrl);
    }
  }

  // 2. Coleta em store.timelines (produções da Linha do Tempo e snapshots de modelo)
  if (Array.isArray(store.timelines)) {
    for (const tl of store.timelines) {
      if (!tl) continue;
      const items = Array.isArray(tl.photoItems)
        ? tl.photoItems
        : Array.isArray((tl as any).photos)
        ? (tl as any).photos
        : [];
      for (const p of items) {
        if (p) registerCandidateUrl(p.photoUrl);
      }
      if (tl.modelSnapshot) {
        registerCandidateUrl(tl.modelSnapshot.bgImageUrl);
        registerCandidateUrl(tl.modelSnapshot.collaboratorBgImageUrl);
        registerCandidateUrl(tl.modelSnapshot.primaryFrameUrl);
        registerCandidateUrl(tl.modelSnapshot.secondaryFrameUrl);
        registerCandidateUrl((tl.modelSnapshot as any).mainYearImageUrl);
      }
    }
  }

  // 3. Coleta em store.config (logotipo institucional da escola)
  if (store.config?.schoolLogo) {
    registerCandidateUrl(store.config.schoolLogo);
  }

  // 4. Coleta em store.models (modelos de layout)
  if (Array.isArray(store.models)) {
    for (const m of store.models) {
      if (!m) continue;
      registerCandidateUrl(m.bgImageUrl);
      registerCandidateUrl(m.collaboratorBgImageUrl);
      registerCandidateUrl(m.primaryFrameUrl);
      registerCandidateUrl(m.secondaryFrameUrl);
      registerCandidateUrl((m as any).mainYearImageUrl);
    }
  }

  // 5. Coleta no auth.json (avatar do administrador do sistema)
  try {
    const authFile = options?.authFilePath || path.join(DATA_DIR, 'auth.json');
    if (fs.existsSync(authFile)) {
      const raw = fs.readFileSync(authFile, 'utf-8');
      if (raw.trim()) {
        const parsed = JSON.parse(raw);
        if (parsed?.admin?.avatarUrl) {
          registerCandidateUrl(parsed.admin.avatarUrl);
        }
      }
    }
  } catch {
    // Falha silenciosa de leitura de auth caso não exista ou esteja corrompido
  }

  // 6. URLs extras protegidas passadas pelo chamador
  if (Array.isArray(options?.extraProtectedUrls)) {
    for (const url of options.extraProtectedUrls) {
      registerCandidateUrl(url);
    }
  }

  return activeFilenames;
}

export interface SafePhotoDeletionResult {
  deletedFilenames: string[];
  preservedFilenames: string[];
  skippedInvalidCount: number;
}

/**
 * Executa a exclusão física estritamente baseada no estado FINAL do store após mutação.
 * Para cada candidato a exclusão:
 * 1. Normaliza para filename seguro;
 * 2. Verifica se o filename ainda existe no conjunto de referências ativas sobreviventes;
 * 3. Se existir em qualquer entidade sobrevivente (Record, Timeline, Carômetro, Logo, Model, Admin, etc.):
 *    PRESERVA o arquivo e NÃO apaga.
 * 4. Se não existir em nenhuma referência sobrevivente:
 *    Apaga fisicamente o arquivo do disco.
 */
export function safeDeletePhotosAgainstSurvivingReferences(
  candidateUrls: (string | undefined | null)[],
  finalStore: LocalStorageData,
  options?: ActivePhotoCollectionOptions & { targetPhotosDir?: string }
): SafePhotoDeletionResult {
  const result: SafePhotoDeletionResult = {
    deletedFilenames: [],
    preservedFilenames: [],
    skippedInvalidCount: 0,
  };

  if (!Array.isArray(candidateUrls) || candidateUrls.length === 0) {
    return result;
  }

  // 1. Coleta todas as referências ativas sobreviventes no estado FINAL
  const survivingFilenames = collectActivePhotoFilenames(finalStore, options);

  // 2. Normaliza candidatos únicos
  const candidateFilenames = new Set<string>();
  for (const url of candidateUrls) {
    const fn = extractFilenameFromPhotoUrl(url);
    if (fn) {
      candidateFilenames.add(fn);
    } else if (url && typeof url === 'string' && url.trim().length > 0) {
      result.skippedInvalidCount++;
    }
  }

  const baseDir = options?.targetPhotosDir || PHOTOS_DIR;

  // 3. Avalia cada candidato contra as referências sobreviventes
  for (const filename of candidateFilenames) {
    if (survivingFilenames.has(filename)) {
      // Arquivo ainda é referenciado por outra estrutura viva: PRESERVAR!
      result.preservedFilenames.push(filename);
    } else {
      // Arquivo não possui mais nenhuma referência no sistema: EXCLUIR com segurança!
      const deleted = deletePhotoFile(filename, baseDir);
      if (deleted) {
        result.deletedFilenames.push(filename);
      }
    }
  }

  return result;
}

/**
 * Deletes a photo file from disk if it exists inside the specified baseDir (defaults to data/uploads/photos/).
 */
export function deletePhotoFile(
  photoUrl: string | undefined | null,
  baseDir: string = PHOTOS_DIR
): boolean {
  if (!photoUrl || typeof photoUrl !== 'string') return false;
  const filename = extractFilenameFromPhotoUrl(photoUrl);
  if (!filename) return false;

  const targetPath = getSafePhotoFilePath(filename, baseDir);
  if (!targetPath) return false;

  if (fs.existsSync(targetPath)) {
    try {
      fs.unlinkSync(targetPath);
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
export function deletePhotoFilesForUrls(
  urls: (string | undefined | null)[],
  baseDir: string = PHOTOS_DIR
): number {
  let count = 0;
  if (!Array.isArray(urls)) return 0;
  for (const url of urls) {
    if (deletePhotoFile(url, baseDir)) {
      count++;
    }
  }
  return count;
}

/**
 * Scans the photos directory and deletes all physical photo files that are truly orphan
 * (no longer referenced in any persistent structure: records, timelines, school logo, models, or admin avatar).
 */
export function cleanupOrphanPhotos(
  store: LocalStorageData,
  options?: ActivePhotoCollectionOptions & { targetPhotosDir?: string }
): number {
  const baseDir = options?.targetPhotosDir || PHOTOS_DIR;
  if (!fs.existsSync(baseDir)) return 0;

  const activeFilenames = collectActivePhotoFilenames(store, options);

  let deletedCount = 0;
  try {
    const filesOnDisk = fs.readdirSync(baseDir);
    for (const file of filesOnDisk) {
      const filePath = path.join(baseDir, file);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        // Ignora arquivos do sistema como .gitkeep ou ocultos
        if (file.startsWith('.')) continue;

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
        try {
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
        } catch (err) {
          console.warn(`[PhotoStorage Migration] Não foi possível migrar foto legada do aluno ${record.studentId}:`, err);
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
          try {
            const originalLength = p.photoUrl.length;
            const newUrl = savePhotoFromBase64(
              p.photoUrl,
              timeline.studentId,
              String(p.year || timeline.year)
            );
            p.photoUrl = newUrl;
            savedBytesApprox += originalLength - newUrl.length;
            migratedTimelines++;
          } catch (err) {
            console.warn(`[PhotoStorage Migration] Não foi possível migrar foto de timeline do aluno ${timeline.studentId}:`, err);
          }
        }
      }
    }
  }

  // 3. Migrar Logo da Escola se em Base64
  if (store.config?.schoolLogo && isBase64Image(store.config.schoolLogo)) {
    try {
      const originalLength = store.config.schoolLogo.length;
      const newLogoUrl = savePhotoFromBase64(store.config.schoolLogo, 'logo', 'school');
      store.config.schoolLogo = newLogoUrl;
      savedBytesApprox += originalLength - newLogoUrl.length;
      migratedLogo = true;
    } catch (err) {
      console.warn('[PhotoStorage Migration] Não foi possível migrar logotipo legado da escola:', err);
    }
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
