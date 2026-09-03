import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import JSZip from 'jszip';
import {
  BackupManifest,
  BackupRecord,
  BackupType,
  LocalStorageData,
  AcademicPeriod,
} from '../src/types';
import { sanitizeUtf8Strings, safeJsonParse } from './utf8Sanitizer';
import { PHOTOS_DIR, migrateBase64PhotosInStore } from './photoStorageService';

const DATA_DIR = path.join(process.cwd(), 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const BACKUPS_INDEX_FILE = path.join(BACKUPS_DIR, 'backups-index.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

function computeSha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function loadBackupsIndex(): BackupRecord[] {
  if (fs.existsSync(BACKUPS_INDEX_FILE)) {
    try {
      const raw = fs.readFileSync(BACKUPS_INDEX_FILE, 'utf-8').trim();
      if (!raw) {
        return [];
      }
      const list = safeJsonParse(raw, []);
      if (Array.isArray(list)) {
        return list;
      }
    } catch (err) {
      console.error('Error reading backups index:', err);
    }
  }
  return [];
}

function saveBackupsIndex(list: BackupRecord[]) {
  try {
    fs.writeFileSync(BACKUPS_INDEX_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving backups index:', err);
  }
}

/**
 * Creates a complete ZIP backup of current LocalStorageData.
 */
export async function createBackup(
  store: LocalStorageData,
  type: BackupType = 'manual',
  reason: string = 'Backup manual'
): Promise<BackupRecord> {
  const cleanStore = sanitizeUtf8Strings(store);
  const createdAt = new Date().toISOString();
  const rawStorageJson = JSON.stringify(cleanStore, null, 2);
  const storageSha256 = computeSha256(rawStorageJson);

  // Compute counts
  const studentsCount = (cleanStore.students || []).length;
  const recordsCount = (cleanStore.records || []).length;
  const periodsCount = (cleanStore.periods || []).length;
  const timelinesCount = (cleanStore.timelines || []).length;
  const modelsCount = (cleanStore.models || []).length;
  const classesCount = (cleanStore.classes || []).length;
  const closedYearsCount = (cleanStore.periods || []).filter((p) => p.status === 'closed').length;
  
  // Count total photos referenced in records
  const photosCount = (cleanStore.records || []).filter(
    (r) => r.photoUrl && r.photoUrl.trim() !== ''
  ).length;

  const manifest: BackupManifest = {
    backupVersion: '1.0',
    systemVersion: '2.4.0',
    createdAt,
    backupType: type,
    reason,
    dataFormatVersion: '1.0',
    counts: {
      studentsCount,
      recordsCount,
      periodsCount,
      timelinesCount,
      modelsCount,
      classesCount,
      photosCount,
      closedYearsCount,
    },
    checksums: {
      storageSha256,
    },
  };

  const systemInfo = {
    appName: 'Sistema Linha do Tempo Escolar',
    version: '2.4.0',
    stage: 'B.24 — Backup e Segurança',
    createdAt,
    platform: process.platform,
    nodeVersion: process.version,
  };

  // Build ZIP package
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('data/storage.json', rawStorageJson);
  zip.file('metadata/system_info.json', JSON.stringify(systemInfo, null, 2));

  // Efficiently pack physical photo files from disk without holding all buffers in memory
  if (fs.existsSync(PHOTOS_DIR)) {
    try {
      const photoFiles = fs.readdirSync(PHOTOS_DIR);
      for (const photoFile of photoFiles) {
        const fullPath = path.join(PHOTOS_DIR, photoFile);
        if (fs.existsSync(fullPath)) {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            const fileBuf = fs.readFileSync(fullPath);
            zip.file(`uploads/photos/${photoFile}`, fileBuf);
          }
        }
      }
    } catch (photoErr) {
      console.warn('[Backup] Aviso ao adicionar fotos ao pacote de backup:', photoErr);
    }
  }

  // Generate buffer
  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const timestampStr = createdAt
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  const filename = `backup_linhadotempo_${timestampStr}_${type}.zip`;
  const filePath = path.join(BACKUPS_DIR, filename);

  fs.writeFileSync(filePath, zipBuffer);

  const backupRecord: BackupRecord = {
    id: `bck_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    filename,
    createdAt,
    backupType: type,
    reason,
    sizeBytes: zipBuffer.length,
    systemVersion: '2.4.0',
    status: 'valid',
    counts: {
      studentsCount,
      recordsCount,
      periodsCount,
      timelinesCount,
      photosCount,
    },
    manifest,
  };

  const currentList = loadBackupsIndex();
  const updatedList = [backupRecord, ...currentList.filter((b) => b.filename !== filename)];
  saveBackupsIndex(updatedList);

  return backupRecord;
}

/**
 * Lists all registered and discovered backups.
 */
export function listBackups(): BackupRecord[] {
  const indexList = loadBackupsIndex();
  // Verify files exist on disk
  const verifiedList: BackupRecord[] = [];

  for (const b of indexList) {
    const p = path.join(BACKUPS_DIR, b.filename);
    if (fs.existsSync(p)) {
      const stats = fs.statSync(p);
      verifiedList.push({
        ...b,
        sizeBytes: stats.size,
      });
    }
  }

  // Sort descending by creation date
  return verifiedList.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Gets path to a backup ZIP file by backup ID or filename, strictly protected against path traversal.
 */
export function getBackupFilePath(identifier: string): string | null {
  if (!identifier || typeof identifier !== 'string') {
    return null;
  }

  // Reject explicit path traversal characters or invalid tokens immediately
  if (
    identifier.includes('..') ||
    identifier.includes('/') ||
    identifier.includes('\\') ||
    identifier.includes('\0')
  ) {
    return null;
  }

  const safeIdentifier = path.basename(identifier.trim());
  if (!safeIdentifier || safeIdentifier === '.' || safeIdentifier === '..') {
    return null;
  }

  const list = loadBackupsIndex();
  const found = list.find((b) => b.id === safeIdentifier || b.filename === safeIdentifier);

  const targetFilename = found ? found.filename : safeIdentifier;

  // Resolve absolute paths and guarantee boundaries
  const resolvedBackupsDir = path.resolve(BACKUPS_DIR);
  const resolvedPath = path.resolve(resolvedBackupsDir, targetFilename);

  // Path must be strictly inside the authorized backups directory
  if (!resolvedPath.startsWith(resolvedBackupsDir + path.sep)) {
    return null;
  }

  // Must exist and be a regular file
  if (fs.existsSync(resolvedPath)) {
    try {
      const stats = fs.statSync(resolvedPath);
      if (stats.isFile()) {
        return resolvedPath;
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Validates a backup ZIP buffer and returns manifest and storage data.
 */
export async function validateBackupZip(
  zipBuffer: Buffer
): Promise<{
  valid: boolean;
  manifest?: BackupManifest;
  storeData?: LocalStorageData;
  error?: string;
}> {
  try {
    const zip = await JSZip.loadAsync(zipBuffer);

    // 1. Check manifest.json
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      return { valid: false, error: 'Arquivo manifest.json não encontrado no pacote de backup.' };
    }

    const manifestRaw = await manifestFile.async('text');
    let manifest: BackupManifest;
    try {
      manifest = safeJsonParse(manifestRaw);
    } catch {
      return { valid: false, error: 'manifest.json corrompido ou formato JSON inválido.' };
    }

    if (!manifest.backupVersion || !manifest.createdAt) {
      return { valid: false, error: 'Estrutura do manifest.json incompleta ou incompatível.' };
    }

    // 2. Check data/storage.json
    const storageFile = zip.file('data/storage.json') || zip.file('storage.json');
    if (!storageFile) {
      return { valid: false, error: 'Arquivo data/storage.json não encontrado no pacote de backup.' };
    }

    const storageRaw = await storageFile.async('text');
    
    // 3. Verify Checksum if provided
    if (manifest.checksums?.storageSha256) {
      const calculatedSha = computeSha256(storageRaw);
      if (calculatedSha !== manifest.checksums.storageSha256) {
        return {
          valid: false,
          error: 'Falha na validação de integridade (checksum SHA-256 do storage.json não confere).',
        };
      }
    }

    // 4. Validate JSON Schema of storage.json
    let storeData: LocalStorageData;
    try {
      storeData = sanitizeUtf8Strings(safeJsonParse(storageRaw));
    } catch {
      return { valid: false, error: 'Conteúdo de storage.json é inválido ou corrompido.' };
    }

    if (
      !Array.isArray(storeData.students) ||
      !Array.isArray(storeData.records) ||
      !Array.isArray(storeData.periods) ||
      !Array.isArray(storeData.models) ||
      !Array.isArray(storeData.classes)
    ) {
      return {
        valid: false,
        error: 'storage.json não contém as coleções estruturais obrigatórias (students, records, periods, models, classes).',
      };
    }

    return {
      valid: true,
      manifest,
      storeData,
    };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'Erro ao descompactar ou ler pacote de backup.' };
  }
}

/**
 * Extracts any photo files packaged in the backup ZIP directly into data/uploads/photos/.
 */
export async function extractPhotosFromBackupZip(zipBuffer: Buffer): Promise<number> {
  let extractedCount = 0;
  try {
    const zip = await JSZip.loadAsync(zipBuffer);
    if (!fs.existsSync(PHOTOS_DIR)) {
      fs.mkdirSync(PHOTOS_DIR, { recursive: true });
    }

    const entries = Object.keys(zip.files);
    for (const entryPath of entries) {
      if (
        (entryPath.startsWith('uploads/photos/') || entryPath.startsWith('data/uploads/photos/')) &&
        !zip.files[entryPath].dir
      ) {
        const filename = path.basename(entryPath);
        if (filename && filename !== '.' && filename !== '..') {
          const destPath = path.join(PHOTOS_DIR, filename);
          const buffer = await zip.files[entryPath].async('nodebuffer');
          fs.writeFileSync(destPath, buffer);
          extractedCount++;
        }
      }
    }
  } catch (err) {
    console.error('[Backup] Erro ao extrair fotos do arquivo de backup:', err);
  }
  return extractedCount;
}

/**
 * Deletes a backup by ID or filename, ensuring physical file deletion from disk and index update.
 */
export function deleteBackup(backupId: string): boolean {
  if (!backupId || typeof backupId !== 'string') {
    return false;
  }

  const cleanId = backupId.trim();
  const list = loadBackupsIndex();
  const found = list.find((b) => b.id === cleanId || b.filename === cleanId);

  let deletedPhysicalFile = false;

  // 1. Resolve path through safe path resolution
  const resolvedPath = getBackupFilePath(cleanId);
  if (resolvedPath && fs.existsSync(resolvedPath)) {
    try {
      fs.unlinkSync(resolvedPath);
      deletedPhysicalFile = true;
    } catch (err) {
      console.error('[Backup] Erro ao excluir arquivo físico de backup:', err);
    }
  }

  // 2. Direct filename fallback check in BACKUPS_DIR
  if (!deletedPhysicalFile && found?.filename) {
    const directPath = path.join(BACKUPS_DIR, path.basename(found.filename));
    if (fs.existsSync(directPath)) {
      try {
        fs.unlinkSync(directPath);
        deletedPhysicalFile = true;
      } catch (err) {
        console.error('[Backup] Erro ao excluir arquivo físico por nome indexado:', err);
      }
    }
  }

  // 3. If identifier is directly a .zip filename
  if (!deletedPhysicalFile && cleanId.endsWith('.zip')) {
    const directPath = path.join(BACKUPS_DIR, path.basename(cleanId));
    if (fs.existsSync(directPath)) {
      try {
        fs.unlinkSync(directPath);
        deletedPhysicalFile = true;
      } catch (err) {
        console.error('[Backup] Erro ao excluir arquivo físico por nome direto:', err);
      }
    }
  }

  // 4. Update index
  const updated = list.filter((b) => b.id !== cleanId && b.filename !== cleanId);
  saveBackupsIndex(updated);

  return Boolean(found || deletedPhysicalFile);
}

