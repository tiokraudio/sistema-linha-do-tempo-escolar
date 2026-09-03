import fs from 'fs';
import path from 'path';
import { DATA_DIR, DATA_FILE, migrateBase64PhotosInStore, PHOTOS_DIR } from '../server/photoStorageService';
import { LocalStorageData } from '../src/types';
import { sanitizeUtf8Strings, safeJsonParse } from '../server/utf8Sanitizer';

function runMigration() {
  console.log('=== Início da Migração de Fotografias para Armazenamento em Disco ===');
  console.log(`Diretório de destino: ${PHOTOS_DIR}`);

  if (!fs.existsSync(DATA_FILE)) {
    console.log(`Arquivo ${DATA_FILE} não encontrado. Nada a migrar.`);
    return;
  }

  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  const initialSizeBytes = Buffer.byteLength(raw, 'utf-8');
  console.log(`Tamanho inicial de storage.json: ${(initialSizeBytes / (1024 * 1024)).toFixed(2)} MB (${initialSizeBytes} bytes)`);

  const store: LocalStorageData = safeJsonParse(raw);
  const result = migrateBase64PhotosInStore(store);

  const cleanStore = sanitizeUtf8Strings(store);
  const updatedRaw = JSON.stringify(cleanStore, null, 2);
  const finalSizeBytes = Buffer.byteLength(updatedRaw, 'utf-8');

  fs.writeFileSync(DATA_FILE, updatedRaw, 'utf-8');

  console.log('\n--- Relatório de Migração ---');
  console.log(`- Registros com fotos migradas: ${result.migratedRecords}`);
  console.log(`- Composições com fotos migradas: ${result.migratedTimelines}`);
  console.log(`- Logo escolar migrado: ${result.migratedLogo ? 'Sim' : 'Não'}`);
  console.log(`- Redução de tamanho no storage.json: ${((initialSizeBytes - finalSizeBytes) / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`- Tamanho final de storage.json: ${(finalSizeBytes / 1024).toFixed(2)} KB`);

  const diskFiles = fs.readdirSync(PHOTOS_DIR);
  console.log(`- Total de fotos físicas em ${PHOTOS_DIR}: ${diskFiles.length} arquivos.`);
  console.log('=== Migração Concluída com Sucesso ===');
}

runMigration();
