import fs from 'fs';
import path from 'path';
import {
  savePhotoFromBase64,
  isBase64Image,
  deletePhotoFile,
  cleanupOrphanPhotos,
  migrateBase64PhotosInStore,
  PHOTOS_DIR,
  DATA_DIR,
} from '../server/photoStorageService';
import {
  createBackup,
  validateBackupZip,
  extractPhotosFromBackupZip,
  deleteBackup,
} from '../server/backupService';
import { LocalStorageData } from '../src/types';

// Sample tiny 1x1 base64 GIF / PNG
const SAMPLE_BASE64_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function runTests() {
  console.log('=== Iniciando Testes Automatizados de Armazenamento de Fotos no Disco ===\n');
  let passed = 0;
  let failed = 0;

  // Teste 1: Detecção e Decodificação de Base64
  console.log('Teste 1: isBase64Image detecta Data URI e rejeita URLs normais');
  if (
    isBase64Image(SAMPLE_BASE64_PNG) === true &&
    isBase64Image('/uploads/photos/foto.jpg') === false &&
    isBase64Image('') === false
  ) {
    console.log('✅ Teste 1 PASSOU');
    passed++;
  } else {
    console.error('❌ Teste 1 FALHOU');
    failed++;
  }

  // Teste 2: Gravação física de arquivo a partir de Base64
  console.log('\nTeste 2: savePhotoFromBase64 grava arquivo físico em data/uploads/photos/');
  const savedUrl = savePhotoFromBase64(SAMPLE_BASE64_PNG, 'std_test_123', '2026');
  const filename = path.basename(savedUrl);
  const physicalPath = path.join(PHOTOS_DIR, filename);

  if (
    savedUrl.startsWith('/uploads/photos/2026_std_test_123_') &&
    fs.existsSync(physicalPath) &&
    fs.statSync(physicalPath).size > 0
  ) {
    console.log(`✅ Teste 2 PASSOU (Arquivo gerado: ${savedUrl}, tamanho: ${fs.statSync(physicalPath).size} bytes)`);
    passed++;
  } else {
    console.error(`❌ Teste 2 FALHOU (savedUrl=${savedUrl})`);
    failed++;
  }

  // Teste 3: Idempotência de savePhotoFromBase64 (URLs já relativas não são regravadas)
  console.log('\nTeste 3: Idempotência de URLs relativas já existentes');
  const reSaved = savePhotoFromBase64(savedUrl, 'std_test_123', '2026');
  if (reSaved === savedUrl) {
    console.log('✅ Teste 3 PASSOU (Retornou a mesma URL sem duplicar arquivo)');
    passed++;
  } else {
    console.error('❌ Teste 3 FALHOU');
    failed++;
  }

  // Teste 4: Migração no Store
  console.log('\nTeste 4: migrateBase64PhotosInStore converte Base64 em records/timelines/config');
  const mockStore: LocalStorageData = {
    config: { schoolName: 'Escola Teste', schoolLogo: SAMPLE_BASE64_PNG, photoHistorySlots: 10 },
    periods: [{ id: 'per_2026', name: '2026', active: true, status: 'in_production', createdAt: new Date().toISOString() }],
    classes: [],
    students: [{ id: 'std_mock', enrollment: '1001', name: 'ALUNO TESTE', createdAt: new Date().toISOString() }],
    records: [
      {
        id: 'rec_mock_1',
        studentId: 'std_mock',
        year: '2026',
        className: '1A',
        photoUrl: SAMPLE_BASE64_PNG,
        cropSettings: { x: 50, y: 50, zoom: 1.0 },
        createdAt: new Date().toISOString(),
      },
    ],
    models: [],
    timelines: [],
  };

  const migrationRes = migrateBase64PhotosInStore(mockStore);
  if (
    migrationRes.migratedRecords === 1 &&
    migrationRes.migratedLogo === true &&
    mockStore.records[0].photoUrl.startsWith('/uploads/photos/') &&
    mockStore.config.schoolLogo.startsWith('/uploads/photos/')
  ) {
    console.log('✅ Teste 4 PASSOU (Store migrado com URLs relativas em disco)');
    passed++;
  } else {
    console.error('❌ Teste 4 FALHOU', migrationRes);
    failed++;
  }

  // Teste 5: Backup ZIP empacota fotos físicas de data/uploads/photos/ e valida
  console.log('\nTeste 5: Backup e Restauração com extração de fotos físicas');
  const backup = await createBackup(mockStore, 'manual', 'Teste de Fotos em Disco');
  const backupFile = path.join(DATA_DIR, 'backups', backup.filename);
  const backupBuffer = fs.readFileSync(backupFile);

  const validation = await validateBackupZip(backupBuffer);
  const extractedCount = await extractPhotosFromBackupZip(backupBuffer);

  if (validation.valid && validation.storeData && extractedCount > 0) {
    console.log(`✅ Teste 5 PASSOU (Backup validado com ${extractedCount} fotos físicas extraídas)`);
    passed++;
  } else {
    console.error('❌ Teste 5 FALHOU', validation);
    failed++;
  }

  // Teste 6: Limpeza segura com deletePhotoFile
  console.log('\nTeste 6: deletePhotoFile remove com segurança apenas arquivos permitidos');
  const deleted = deletePhotoFile(savedUrl);
  if (deleted && !fs.existsSync(physicalPath)) {
    console.log('✅ Teste 6 PASSOU (Arquivo de teste excluído com segurança)');
    passed++;
  } else {
    console.error('❌ Teste 6 FALHOU');
    failed++;
  }

  // Teste 7: Exclusão Física Real de Arquivos de Backup (.zip)
  console.log('\nTeste 7: deleteBackup exclui fisicamente o arquivo .zip de data/backups/ e remove do índice');
  const backupToDelete = await createBackup(mockStore, 'manual', 'Teste Exclusao Fisica');
  const bckFilePath = path.join(DATA_DIR, 'backups', backupToDelete.filename);
  const existsBefore = fs.existsSync(bckFilePath);
  const deleteResult = deleteBackup(backupToDelete.id);
  const existsAfter = fs.existsSync(bckFilePath);

  if (existsBefore && deleteResult && !existsAfter) {
    console.log('✅ Teste 7 PASSOU (Arquivo físico .zip deletado com sucesso do disco)');
    passed++;
  } else {
    console.error(`❌ Teste 7 FALHOU (existsBefore=${existsBefore}, deleteResult=${deleteResult}, existsAfter=${existsAfter})`);
    failed++;
  }

  // Teste 8: Limpeza de fotos órfãs em disco
  console.log('\nTeste 8: cleanupOrphanPhotos remove fotos físicas órfãs sem referências no store');
  const orphanPhotoUrl = savePhotoFromBase64(SAMPLE_BASE64_PNG, 'std_orphan', '2026');
  const orphanFile = path.join(PHOTOS_DIR, path.basename(orphanPhotoUrl));
  const orphanExistsBefore = fs.existsSync(orphanFile);

  // cleanup with a store that does NOT contain this orphan photo
  const emptyStoreForCleanup: LocalStorageData = {
    config: { schoolName: 'Teste', schoolLogo: '', photoHistorySlots: 10 },
    periods: [],
    classes: [],
    students: [],
    records: [],
    models: [],
    timelines: [],
  };
  const cleanedCount = cleanupOrphanPhotos(emptyStoreForCleanup);
  const orphanExistsAfter = fs.existsSync(orphanFile);

  if (orphanExistsBefore && cleanedCount > 0 && !orphanExistsAfter) {
    console.log(`✅ Teste 8 PASSOU (Foto órfã identificada e excluída fisicamente do disco, total limpas: ${cleanedCount})`);
    passed++;
  } else {
    console.error(`❌ Teste 8 FALHOU (orphanExistsBefore=${orphanExistsBefore}, cleanedCount=${cleanedCount}, orphanExistsAfter=${orphanExistsAfter})`);
    failed++;
  }

  console.log(`\n=== Resultado Final: ${passed} PASSOU / ${failed} FALHOU ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
