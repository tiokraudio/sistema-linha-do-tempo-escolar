import fs from 'fs';
import path from 'path';
import {
  extractFilenameFromPhotoUrl,
  collectActivePhotoFilenames,
  safeDeletePhotosAgainstSurvivingReferences,
  cleanupOrphanPhotos,
  getSafePhotoFilePath,
} from '../server/photoStorageService';
import { LocalStorageData } from '../src/types';

// Diretório temporário isolado exclusivo para execução de testes (nunca toca em data/uploads/photos)
const TEST_TEMP_DIR = path.join(process.cwd(), 'data', 'test_tmp_photos_integrity');

function setupTestEnvironment() {
  if (fs.existsSync(TEST_TEMP_DIR)) {
    fs.rmSync(TEST_TEMP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
}

function cleanupTestEnvironment() {
  if (fs.existsSync(TEST_TEMP_DIR)) {
    fs.rmSync(TEST_TEMP_DIR, { recursive: true, force: true });
  }
}

function createDummyFile(filename: string, content = 'dummy-photo-content') {
  const filePath = path.join(TEST_TEMP_DIR, filename);
  fs.writeFileSync(filePath, Buffer.from(content));
  return filePath;
}

async function runIntegrityTests() {
  console.log('================================================================');
  console.log(' TESTE DE INTEGRIDADE: LIMPEZA SELETIVA E PRESERVAÇÃO DE FOTOS');
  console.log(' Diretório de Teste Isolado:', TEST_TEMP_DIR);
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  try {
    setupTestEnvironment();

    // -------------------------------------------------------------
    // Teste 1: Normalização e extração de filenames seguros
    // -------------------------------------------------------------
    console.log('TESTE 1: extractFilenameFromPhotoUrl extrai filenames seguros e bloqueia traversals');
    const t1a = extractFilenameFromPhotoUrl('/uploads/photos/foto_aluno_2026.jpg');
    const t1b = extractFilenameFromPhotoUrl('/api/photos/foto_aluno_2026.jpg?v=123#crop');
    const t1c = extractFilenameFromPhotoUrl('../etc/passwd');
    const t1d = extractFilenameFromPhotoUrl('data:image/png;base64,iVBORw0KGgo=');
    const t1e = extractFilenameFromPhotoUrl('/uploads/photos/../../secret.txt');

    if (
      t1a === 'foto_aluno_2026.jpg' &&
      t1b === 'foto_aluno_2026.jpg' &&
      t1c === null &&
      t1d === null &&
      t1e === null
    ) {
      console.log('✅ TESTE 1 PASSOU: Extração e sanitização estritas funcionam perfeitamente.');
      passed++;
    } else {
      console.error('❌ TESTE 1 FALHOU:', { t1a, t1b, t1c, t1d, t1e });
      failed++;
    }

    // -------------------------------------------------------------
    // Teste 2: Cenário Real do Incidente - Foto compartilhada entre Record e Timeline
    // -------------------------------------------------------------
    console.log('\nTESTE 2 (INCIDENTE REAL): Limpeza da Linha do Tempo NÃO pode apagar foto física ainda vinculada a Matrícula');
    
    // Criação dos arquivos físicos artificiais no diretório temporário
    createDummyFile('shared_aluno_foto.jpg');
    createDummyFile('exclusive_timeline_foto.jpg');
    createDummyFile('exclusive_record_foto.jpg');

    // Estado antes da mutação:
    // - Registro de matrícula tem 'shared_aluno_foto.jpg' e 'exclusive_record_foto.jpg'
    // - Linha do tempo tem 'shared_aluno_foto.jpg' e 'exclusive_timeline_foto.jpg'
    const storeStateAfterTimelineCleaning: LocalStorageData = {
      config: { schoolName: 'Escola Modelo', schoolLogo: '', photoHistorySlots: 15 },
      periods: [{ id: 'p1', name: '2026', active: true, status: 'in_production', createdAt: new Date().toISOString() }],
      classes: [{ id: 'c1', name: '1A', createdAt: new Date().toISOString() }],
      students: [{ id: 's1', enrollment: '101', name: 'JOAO SILVA', createdAt: new Date().toISOString() }],
      records: [
        {
          id: 'r1',
          studentId: 's1',
          year: '2026',
          className: '1A',
          photoUrl: '/uploads/photos/shared_aluno_foto.jpg',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'r2',
          studentId: 's1',
          year: '2025',
          className: 'Infantil',
          photoUrl: '/uploads/photos/exclusive_record_foto.jpg',
          createdAt: new Date().toISOString(),
        },
      ],
      models: [],
      timelines: [], // Timelines foram limpas pelo usuário!
    };

    // Candidatos gerados pela remoção da Linha do Tempo:
    const candidatesFromTimeline = [
      '/uploads/photos/shared_aluno_foto.jpg',
      '/uploads/photos/exclusive_timeline_foto.jpg',
    ];

    // Executa a exclusão segura contra o estado sobrevivente
    const resultTimelineClean = safeDeletePhotosAgainstSurvivingReferences(
      candidatesFromTimeline,
      storeStateAfterTimelineCleaning,
      { targetPhotosDir: TEST_TEMP_DIR }
    );

    const sharedPhotoExists = fs.existsSync(path.join(TEST_TEMP_DIR, 'shared_aluno_foto.jpg'));
    const exclusiveTimelineExists = fs.existsSync(path.join(TEST_TEMP_DIR, 'exclusive_timeline_foto.jpg'));
    const exclusiveRecordExists = fs.existsSync(path.join(TEST_TEMP_DIR, 'exclusive_record_foto.jpg'));

    if (
      sharedPhotoExists === true && // PRESERVADA!
      exclusiveTimelineExists === false && // APAGADA!
      exclusiveRecordExists === true && // PRESERVADA!
      resultTimelineClean.preservedFilenames.includes('shared_aluno_foto.jpg') &&
      resultTimelineClean.deletedFilenames.includes('exclusive_timeline_foto.jpg')
    ) {
      console.log('✅ TESTE 2 PASSOU: Foto compartilhada foi preservada no disco! Matrícula não sofrerá 404.');
      passed++;
    } else {
      console.error('❌ TESTE 2 FALHOU:', {
        sharedPhotoExists,
        exclusiveTimelineExists,
        exclusiveRecordExists,
        resultTimelineClean,
      });
      failed++;
    }

    // -------------------------------------------------------------
    // Teste 3: Cenário Inverso - Limpeza de Matrículas não apaga foto usada pela Linha do Tempo
    // -------------------------------------------------------------
    console.log('\nTESTE 3: Limpeza de Matrículas NÃO pode apagar foto física ainda vinculada à Linha do Tempo');
    
    // Recria a foto exclusiva que testaremos
    createDummyFile('exclusive_record_2.jpg');

    const storeStateAfterRecordCleaning: LocalStorageData = {
      config: { schoolName: 'Escola Modelo', schoolLogo: '', photoHistorySlots: 15 },
      periods: [{ id: 'p1', name: '2026', active: true, status: 'in_production', createdAt: new Date().toISOString() }],
      classes: [],
      students: [{ id: 's1', enrollment: '101', name: 'JOAO SILVA', createdAt: new Date().toISOString() }],
      records: [], // Registros foram limpos!
      models: [],
      timelines: [
        {
          id: 'tl_1',
          studentId: 's1',
          studentName: 'JOAO SILVA',
          studentEnrollment: '101',
          year: '2026',
          modelId: 'm1',
          modelTitle: 'Modelo Padrão',
          modelSnapshot: {
            id: 'm1',
            title: 'Modelo Padrão',
            bgImageUrl: '',
            collaboratorBgImageUrl: '',
            primaryFrameUrl: '',
            secondaryFrameUrl: '',
            fontFamily: 'Inter',
            primaryColor: '#000',
            accentColor: '#fff',
            updatedAt: new Date().toISOString(),
          },
          photoItems: [
            {
              year: '2026',
              className: '1A',
              photoUrl: '/uploads/photos/shared_aluno_foto.jpg',
              cropSettings: { x: 50, y: 50, zoom: 1.0 },
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    const candidatesFromRecords = [
      '/uploads/photos/shared_aluno_foto.jpg',
      '/uploads/photos/exclusive_record_2.jpg',
    ];

    const resultRecordClean = safeDeletePhotosAgainstSurvivingReferences(
      candidatesFromRecords,
      storeStateAfterRecordCleaning,
      { targetPhotosDir: TEST_TEMP_DIR }
    );

    const sharedPhotoStillExists = fs.existsSync(path.join(TEST_TEMP_DIR, 'shared_aluno_foto.jpg'));
    const exclusiveRecord2Exists = fs.existsSync(path.join(TEST_TEMP_DIR, 'exclusive_record_2.jpg'));

    if (
      sharedPhotoStillExists === true &&
      exclusiveRecord2Exists === false &&
      resultRecordClean.preservedFilenames.includes('shared_aluno_foto.jpg') &&
      resultRecordClean.deletedFilenames.includes('exclusive_record_2.jpg')
    ) {
      console.log('✅ TESTE 3 PASSOU: Foto compartilhada foi preservada! Linha do tempo sobrevivente segue íntegra.');
      passed++;
    } else {
      console.error('❌ TESTE 3 FALHOU:', {
        sharedPhotoStillExists,
        exclusiveRecord2Exists,
        resultRecordClean,
      });
      failed++;
    }

    // -------------------------------------------------------------
    // Teste 4: Limpeza de Enquadramentos / Carômetro NÃO pode apagar foto física
    // -------------------------------------------------------------
    console.log('\nTESTE 4: Limpeza de Enquadramentos/Carômetro NÃO pode apagar a foto original de records');
    
    createDummyFile('original_crop_foto.jpg');
    const storeWithCrops: LocalStorageData = {
      config: { schoolName: 'Escola Modelo', schoolLogo: '', photoHistorySlots: 15 },
      periods: [],
      classes: [],
      students: [],
      records: [
        {
          id: 'r_crop',
          studentId: 's1',
          year: '2026',
          className: '1A',
          photoUrl: '/uploads/photos/original_crop_foto.jpg',
          carometroCrop: { photoUrl: '/uploads/photos/original_crop_foto.jpg', x: 10, y: 10, zoom: 1.0 },
          createdAt: new Date().toISOString(),
        },
      ],
      models: [],
      timelines: [],
    };

    // Usuário selecionou apenas 'carometro': os campos de carometroCrop são removidos,
    // mas a foto principal photoUrl continua intacta no record.
    delete storeWithCrops.records[0].carometroCrop;

    const activeAfterCropRemoval = collectActivePhotoFilenames(storeWithCrops);
    if (activeAfterCropRemoval.has('original_crop_foto.jpg')) {
      console.log('✅ TESTE 4 PASSOU: Foto original continua ativa e protegida mesmo após remoção de ajustes de carômetro.');
      passed++;
    } else {
      console.error('❌ TESTE 4 FALHOU: original_crop_foto.jpg foi desprotegida indevidamente.');
      failed++;
    }

    // -------------------------------------------------------------
    // Teste 5: Logotipo institucional e Avatar do Administrador nunca são apagados
    // -------------------------------------------------------------
    console.log('\nTESTE 5: Logotipo da escola e Avatar Administrativo são coletados e preservados');
    
    createDummyFile('school_logo.png');
    createDummyFile('admin_avatar.jpg');

    const fakeAuthFile = path.join(TEST_TEMP_DIR, 'fake_auth.json');
    fs.writeFileSync(
      fakeAuthFile,
      JSON.stringify({
        admin: {
          email: 'admin@escola.com',
          avatarUrl: '/uploads/photos/admin_avatar.jpg',
        },
      })
    );

    const storeWithLogo: LocalStorageData = {
      config: { schoolName: 'Escola Modelo', schoolLogo: '/uploads/photos/school_logo.png', photoHistorySlots: 15 },
      periods: [],
      classes: [],
      students: [],
      records: [],
      models: [],
      timelines: [],
    };

    const activeWithLogoAndAdmin = collectActivePhotoFilenames(storeWithLogo, {
      authFilePath: fakeAuthFile,
    });

    if (
      activeWithLogoAndAdmin.has('school_logo.png') &&
      activeWithLogoAndAdmin.has('admin_avatar.jpg')
    ) {
      console.log('✅ TESTE 5 PASSOU: Logo institucional e avatar administrativo devidamente protegidos.');
      passed++;
    } else {
      console.error('❌ TESTE 5 FALHOU: Logo ou Admin não foram protegidos:', activeWithLogoAndAdmin);
      failed++;
    }

    // -------------------------------------------------------------
    // Teste 6: cleanupOrphanPhotos remove apenas arquivos verdadeiramente órfãos
    // -------------------------------------------------------------
    console.log('\nTESTE 6: cleanupOrphanPhotos remove apenas arquivos órfãos sem referências ativas');
    
    createDummyFile('truly_orphan_photo.jpg');
    const orphanFileBefore = fs.existsSync(path.join(TEST_TEMP_DIR, 'truly_orphan_photo.jpg'));
    const sharedFileBefore = fs.existsSync(path.join(TEST_TEMP_DIR, 'shared_aluno_foto.jpg'));

    // Executa cleanupOrphanPhotos com o store que contém 'shared_aluno_foto.jpg'
    const orphanCleanedCount = cleanupOrphanPhotos(storeStateAfterRecordCleaning, {
      targetPhotosDir: TEST_TEMP_DIR,
      authFilePath: fakeAuthFile,
    });

    const orphanFileAfter = fs.existsSync(path.join(TEST_TEMP_DIR, 'truly_orphan_photo.jpg'));
    const sharedFileAfter = fs.existsSync(path.join(TEST_TEMP_DIR, 'shared_aluno_foto.jpg'));

    if (
      orphanFileBefore === true &&
      orphanFileAfter === false &&
      sharedFileBefore === true &&
      sharedFileAfter === true &&
      orphanCleanedCount >= 1
    ) {
      console.log('✅ TESTE 6 PASSOU: Foto verdadeiramente órfã foi removida, fotos ativas permaneceram intactas.');
      passed++;
    } else {
      console.error('❌ TESTE 6 FALHOU:', {
        orphanFileBefore,
        orphanFileAfter,
        sharedFileBefore,
        sharedFileAfter,
        orphanCleanedCount,
      });
      failed++;
    }

  } finally {
    cleanupTestEnvironment();
    console.log('\nDiretório de testes limpo com sucesso (zero impactos no disco de produção).');
  }

  console.log(`\n================================================================`);
  console.log(` RESULTADO FINAL DOS TESTES DE INTEGRIDADE: ${passed} PASSOU / ${failed} FALHOU`);
  console.log(`================================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runIntegrityTests().catch((err) => {
  console.error('Erro fatal no executor de testes:', err);
  process.exit(1);
});
