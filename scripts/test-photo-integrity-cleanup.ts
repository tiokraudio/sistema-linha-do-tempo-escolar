import os from 'os';
import fs from 'fs';
import path from 'path';
import {
  extractFilenameFromPhotoUrl,
  collectActivePhotoFilenames,
  safeDeletePhotosAgainstSurvivingReferences,
  cleanupOrphanPhotos,
  getSafePhotoFilePath,
} from '../server/photoStorageService';
import { getDefaultSingleLayoutModel } from '../src/utils/defaultLayout';
import { LocalStorageData } from '../src/types';

// Diretório temporário isolado exclusivo em os.tmpdir() (nunca toca em data/uploads/photos ou storage.json)
const TEST_TEMP_DIR = path.join(
  os.tmpdir(),
  `alunocad_photo_integrity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
);

const dummyModelSnapshot = {
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
};

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

function createDummyFile(filename: string, content = 'dummy-photo-content-for-integrity-test') {
  const filePath = path.join(TEST_TEMP_DIR, filename);
  fs.writeFileSync(filePath, Buffer.from(content));
  return filePath;
}

interface PipelineResult {
  blocked: boolean;
  statusCode: number;
  errorMessage?: string;
  store: LocalStorageData;
  deletedPhotos: string[];
  preservedPhotos: string[];
}

/**
 * Executa fielmente a lógica real da Limpeza Seletiva (como implementada em /server.ts):
 * 1. Validações de integridade relacional entre entidades dependentes.
 * 2. Mutações cirúrgicas de remoção seletiva por categoria no store.
 * 3. Coleta de fotos candidatas.
 * 4. Exclusão física segura contra referências ativas sobreviventes (safeDeletePhotosAgainstSurvivingReferences).
 * 5. Limpeza de órfãos remanescentes (cleanupOrphanPhotos).
 */
function runSelectiveCleanPipeline(
  initialStore: LocalStorageData,
  requestedCategories: string[],
  options?: {
    adminAvatarUrl?: string;
    authFilePath?: string;
  }
): PipelineResult {
  const store: LocalStorageData = JSON.parse(JSON.stringify(initialStore));

  // --- 1. VALIDAÇÕES DE INTEGRIDADE RELACIONAL ---

  // 1. Alunos selecionados sem Matrículas / Timelines
  if (requestedCategories.includes('students') && !requestedCategories.includes('records')) {
    const studentIds = new Set(
      (store.students || []).filter((s) => (s.personType || 'student') === 'student').map((s) => s.id)
    );
    const dependentRecords = (store.records || []).filter(
      (r) => r.studentId && studentIds.has(r.studentId)
    );
    if (dependentRecords.length > 0) {
      return {
        blocked: true,
        statusCode: 400,
        errorMessage: `Operação bloqueada por integridade: existem matrículas vinculadas a alunos.`,
        store,
        deletedPhotos: [],
        preservedPhotos: [],
      };
    }
  }

  // 2. Colaboradores selecionados sem Matrículas / Timelines
  if (requestedCategories.includes('collaborators') && !requestedCategories.includes('records')) {
    const collabIds = new Set(
      (store.students || []).filter((s) => s.personType === 'collaborator').map((s) => s.id)
    );
    const dependentRecords = (store.records || []).filter(
      (r) => r.studentId && collabIds.has(r.studentId)
    );
    if (dependentRecords.length > 0) {
      return {
        blocked: true,
        statusCode: 400,
        errorMessage: `Operação bloqueada por integridade: existem matrículas vinculadas a colaboradores.`,
        store,
        deletedPhotos: [],
        preservedPhotos: [],
      };
    }
  }

  // 3. Turmas selecionadas sem Matrículas
  if (requestedCategories.includes('classes') && !requestedCategories.includes('records')) {
    const classNames = new Set((store.classes || []).map((c) => c.name.trim().toUpperCase()));
    const dependentRecords = (store.records || []).filter((r) => {
      if (!r.className) return false;
      return classNames.has(r.className.trim().toUpperCase());
    });
    if (dependentRecords.length > 0) {
      return {
        blocked: true,
        statusCode: 400,
        errorMessage: `Operação bloqueada por integridade: existem matrículas vinculadas às turmas.`,
        store,
        deletedPhotos: [],
        preservedPhotos: [],
      };
    }
  }

  // 4. Períodos Letivos selecionados sem Matrículas
  if (requestedCategories.includes('periods') && !requestedCategories.includes('records')) {
    const periodNames = new Set((store.periods || []).map((p) => String(p.name).trim()));
    const dependentRecords = (store.records || []).filter((r) => {
      if (r.year === undefined || r.year === null) return false;
      return periodNames.has(String(r.year).trim());
    });
    if (dependentRecords.length > 0) {
      return {
        blocked: true,
        statusCode: 400,
        errorMessage: `Operação bloqueada por integridade: existem matrículas vinculadas aos períodos.`,
        store,
        deletedPhotos: [],
        preservedPhotos: [],
      };
    }
  }

  // 4b. Períodos Letivos selecionados sem Produções da Linha do Tempo
  if (requestedCategories.includes('periods') && !requestedCategories.includes('timelines')) {
    const periodNames = new Set((store.periods || []).map((p) => String(p.name).trim()));
    const dependentTimelines = (store.timelines || []).filter((t) => {
      if (t.year === undefined || t.year === null) return false;
      return periodNames.has(String(t.year).trim());
    });
    if (dependentTimelines.length > 0) {
      return {
        blocked: true,
        statusCode: 400,
        errorMessage: `Operação bloqueada por integridade: não é permitido excluir os Períodos Letivos selecionados porque existem ${dependentTimelines.length} composição(ões) da Linha do Tempo vinculadas a esses períodos.`,
        store,
        deletedPhotos: [],
        preservedPhotos: [],
      };
    }
  }

  // 5. Modelos selecionados sem Produções da Linha do Tempo
  if (requestedCategories.includes('models') && !requestedCategories.includes('timelines')) {
    const modelIds = new Set((store.models || []).map((m) => m.id));
    const dependentTimelines = (store.timelines || []).filter(
      (t) => t.modelId && modelIds.has(t.modelId)
    );
    if (dependentTimelines.length > 0) {
      return {
        blocked: true,
        statusCode: 400,
        errorMessage: `Operação bloqueada por integridade: existem composições vinculadas a modelos.`,
        store,
        deletedPhotos: [],
        preservedPhotos: [],
      };
    }
  }

  // --- 2. MUTAÇÕES CIRÚRGICAS DO STORE E COLETA DE CANDIDATOS ---
  const photoCandidates: string[] = [];

  // A. Alunos & Colaboradores
  if (requestedCategories.includes('students') && requestedCategories.includes('collaborators')) {
    store.students = [];
  } else if (requestedCategories.includes('students')) {
    store.students = (store.students || []).filter((s) => s.personType === 'collaborator');
  } else if (requestedCategories.includes('collaborators')) {
    store.students = (store.students || []).filter((s) => s.personType !== 'collaborator');
  }

  // B. Matrículas / Registros
  if (requestedCategories.includes('records')) {
    for (const rec of store.records || []) {
      if (rec.photoUrl) photoCandidates.push(rec.photoUrl);
      if (rec.carometroCrop?.photoUrl) photoCandidates.push(rec.carometroCrop.photoUrl);
      if (rec.carometroCircularCrop?.photoUrl) photoCandidates.push(rec.carometroCircularCrop.photoUrl);
      if (rec.autoFaceCrop?.photoUrl) photoCandidates.push(rec.autoFaceCrop.photoUrl);
    }
    store.records = [];
  }

  // C. Produções da Linha do Tempo
  if (requestedCategories.includes('timelines')) {
    for (const tl of store.timelines || []) {
      const items = Array.isArray(tl.photoItems)
        ? tl.photoItems
        : Array.isArray((tl as any).photos)
        ? (tl as any).photos
        : [];
      for (const p of items) {
        if (p?.photoUrl) photoCandidates.push(p.photoUrl);
      }
    }
    store.timelines = [];
  }

  // D. Fotografias (quando registros de matrícula NÃO foram excluídos)
  if (requestedCategories.includes('photos') && !requestedCategories.includes('records')) {
    for (const rec of store.records || []) {
      if (rec.photoUrl) {
        photoCandidates.push(rec.photoUrl);
        rec.photoUrl = '';
      }
      if (rec.carometroCrop?.photoUrl) photoCandidates.push(rec.carometroCrop.photoUrl);
      if (rec.carometroCircularCrop?.photoUrl) photoCandidates.push(rec.carometroCircularCrop.photoUrl);
      if (rec.autoFaceCrop?.photoUrl) photoCandidates.push(rec.autoFaceCrop.photoUrl);

      delete rec.timelinePrimaryCrop;
      delete rec.timelineSecondaryCrop;
      delete rec.carometroCrop;
      delete rec.carometroCircularCrop;
      delete rec.autoFaceCrop;
      delete rec.cropSettings;
    }
  }

  // E. Enquadramentos / Ajustes completos (quando registros NÃO foram excluídos)
  if (requestedCategories.includes('crops') && !requestedCategories.includes('records')) {
    for (const rec of store.records || []) {
      delete rec.timelinePrimaryCrop;
      delete rec.timelineSecondaryCrop;
      delete rec.carometroCrop;
      delete rec.carometroCircularCrop;
      delete rec.autoFaceCrop;
      delete rec.cropSettings;
    }
  } else if (
    requestedCategories.includes('carometro') &&
    !requestedCategories.includes('records') &&
    !requestedCategories.includes('crops')
  ) {
    // F. Apenas ajustes do Carômetro
    for (const rec of store.records || []) {
      delete rec.carometroCrop;
      delete rec.carometroCircularCrop;
      delete rec.autoFaceCrop;
    }
  }

  // G. Turmas
  if (requestedCategories.includes('classes')) {
    store.classes = [];
  }

  // H. Períodos Letivos
  if (requestedCategories.includes('periods')) {
    store.periods = [];
  }

  // I. Dados da Escola
  if (requestedCategories.includes('school_data')) {
    if (store.config?.schoolLogo) {
      photoCandidates.push(store.config.schoolLogo);
    }
    store.config = {
      schoolName: '',
      schoolLogo: '',
      photoHistorySlots: store.config?.photoHistorySlots || 15,
    };
  }

  // J. Modelos da Linha do Tempo
  if (requestedCategories.includes('models')) {
    const photoHistorySlots = store.config?.photoHistorySlots || 15;
    const defaultModel = getDefaultSingleLayoutModel(photoHistorySlots);
    store.models = [defaultModel];
  }

  // --- 3. EXCLUSÃO FÍSICA SEGURA ---
  const safeDeleteResult = safeDeletePhotosAgainstSurvivingReferences(photoCandidates, store, {
    targetPhotosDir: TEST_TEMP_DIR,
    extraProtectedUrls: options?.adminAvatarUrl ? [options.adminAvatarUrl] : undefined,
    authFilePath: options?.authFilePath,
  });

  cleanupOrphanPhotos(store, {
    targetPhotosDir: TEST_TEMP_DIR,
    extraProtectedUrls: options?.adminAvatarUrl ? [options.adminAvatarUrl] : undefined,
    authFilePath: options?.authFilePath,
  });

  return {
    blocked: false,
    statusCode: 200,
    store,
    deletedPhotos: safeDeleteResult.deletedFilenames,
    preservedPhotos: safeDeleteResult.preservedFilenames,
  };
}

async function runIntegrityTests() {
  console.log('================================================================');
  console.log(' TESTE DE INTEGRIDADE: COBERTURA COMPLETA DA LIMPEZA SELETIVA');
  console.log(' Diretório Temporário de Teste (Isolado):', TEST_TEMP_DIR);
  console.log(' (Ambiente de produção data/ e fotos reais NUNCA são tocados)');
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
      console.log('✅ TESTE 1 PASSOU: Sanitização estrita contra traversals funcionando com precisão.');
      passed++;
    } else {
      console.error('❌ TESTE 1 FALHOU:', { t1a, t1b, t1c, t1d, t1e });
      failed++;
    }

    // -------------------------------------------------------------
    // Teste 2: Mesma foto referenciada por dois Records; remover um → arquivo deve permanecer
    // -------------------------------------------------------------
    console.log('\nTESTE 2: Mesma foto referenciada por dois Records; remover um → arquivo físico DEVE permanecer');
    createDummyFile('shared_two_records.jpg');

    const storeTwoRecords: LocalStorageData = {
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
          photoUrl: '/uploads/photos/shared_two_records.jpg',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'r2',
          studentId: 's1',
          year: '2025',
          className: 'Infantil',
          photoUrl: '/uploads/photos/shared_two_records.jpg',
          createdAt: new Date().toISOString(),
        },
      ],
      models: [],
      timelines: [],
    };

    // Simula remoção do Record r1 mantendo Record r2
    const storeAfterRemovingRecord1: LocalStorageData = {
      ...storeTwoRecords,
      records: [storeTwoRecords.records[1]],
    };

    // O candidato a exclusão veio da remoção de r1
    const candidateUrls = ['/uploads/photos/shared_two_records.jpg'];
    const resultTwoRec = safeDeletePhotosAgainstSurvivingReferences(
      candidateUrls,
      storeAfterRemovingRecord1,
      { targetPhotosDir: TEST_TEMP_DIR }
    );

    const fileStillExists = fs.existsSync(path.join(TEST_TEMP_DIR, 'shared_two_records.jpg'));
    if (
      fileStillExists === true &&
      resultTwoRec.preservedFilenames.includes('shared_two_records.jpg') &&
      resultTwoRec.deletedFilenames.length === 0
    ) {
      console.log('✅ TESTE 2 PASSOU: Foto compartilhada entre 2 registros foi preservada no disco após excluir um deles.');
      passed++;
    } else {
      console.error('❌ TESTE 2 FALHOU:', { fileStillExists, resultTwoRec });
      failed++;
    }

    // -------------------------------------------------------------
    // Teste 3: Limpeza da categoria photos → nenhuma referência sobrevivente pode apontar para arquivo fisicamente removido
    // -------------------------------------------------------------
    console.log('\nTESTE 3: Limpeza da categoria photos → nenhuma referência sobrevivente aponta para arquivo fisicamente removido');
    createDummyFile('photo_exclusive_cat_clean.jpg');

    const storePhotosCategory: LocalStorageData = {
      config: { schoolName: 'Escola Modelo', schoolLogo: '', photoHistorySlots: 15 },
      periods: [{ id: 'p1', name: '2026', active: true, status: 'in_production', createdAt: new Date().toISOString() }],
      classes: [{ id: 'c1', name: '1A', createdAt: new Date().toISOString() }],
      students: [{ id: 's1', enrollment: '101', name: 'JOAO SILVA', createdAt: new Date().toISOString() }],
      records: [
        {
          id: 'r_photo',
          studentId: 's1',
          year: '2026',
          className: '1A',
          photoUrl: '/uploads/photos/photo_exclusive_cat_clean.jpg',
          timelinePrimaryCrop: { x: 5, y: 5, zoom: 1.2 },
          carometroCrop: { photoUrl: '/uploads/photos/photo_exclusive_cat_clean.jpg', x: 10, y: 10, zoom: 1.0 },
          carometroCircularCrop: { photoUrl: '/uploads/photos/photo_exclusive_cat_clean.jpg', x: 12, y: 12, zoom: 1.1 },
          autoFaceCrop: { photoUrl: '/uploads/photos/photo_exclusive_cat_clean.jpg', x: 8, y: 8, zoom: 1.0 },
          createdAt: new Date().toISOString(),
        },
      ],
      models: [],
      timelines: [],
    };

    // Executa pipeline real com categoria 'photos'
    const resPhotosClean = runSelectiveCleanPipeline(storePhotosCategory, ['photos']);

    const physicalFileRemoved = !fs.existsSync(path.join(TEST_TEMP_DIR, 'photo_exclusive_cat_clean.jpg'));
    const recFinal = resPhotosClean.store.records[0];
    const noSurvivingRef =
      recFinal.photoUrl === '' &&
      recFinal.timelinePrimaryCrop === undefined &&
      recFinal.carometroCrop === undefined &&
      recFinal.carometroCircularCrop === undefined &&
      recFinal.autoFaceCrop === undefined;

    // Coleta todas as referências sobreviventes no store
    const remainingRefs = collectActivePhotoFilenames(resPhotosClean.store);
    const zeroOrphanRefs = !remainingRefs.has('photo_exclusive_cat_clean.jpg');

    if (physicalFileRemoved && noSurvivingRef && zeroOrphanRefs) {
      console.log('✅ TESTE 3 PASSOU: Arquivo foi removido do disco e todas as referências no store foram devidamente limpas (zero 404).');
      passed++;
    } else {
      console.error('❌ TESTE 3 FALHOU:', { physicalFileRemoved, noSurvivingRef, zeroOrphanRefs, recFinal });
      failed++;
    }

    // -------------------------------------------------------------
    // Teste 4: carometroCircularCrop é removido corretamente em crops e carometro
    // -------------------------------------------------------------
    console.log('\nTESTE 4: carometroCircularCrop é removido corretamente em "crops" e em "carometro"');
    createDummyFile('photo_crops_test.jpg');

    const baseRecordWithAllCrops = {
      id: 'r_crops_test',
      studentId: 's1',
      year: '2026',
      className: '1A',
      photoUrl: '/uploads/photos/photo_crops_test.jpg',
      timelinePrimaryCrop: { photoUrl: '/uploads/photos/photo_crops_test.jpg', x: 1, y: 1, zoom: 1 },
      timelineSecondaryCrop: { photoUrl: '/uploads/photos/photo_crops_test.jpg', x: 2, y: 2, zoom: 1 },
      carometroCrop: { photoUrl: '/uploads/photos/photo_crops_test.jpg', x: 3, y: 3, zoom: 1 },
      carometroCircularCrop: { photoUrl: '/uploads/photos/photo_crops_test.jpg', x: 4, y: 4, zoom: 1 },
      autoFaceCrop: { photoUrl: '/uploads/photos/photo_crops_test.jpg', x: 5, y: 5, zoom: 1 },
      cropSettings: { x: 50, y: 50, zoom: 1 },
      createdAt: new Date().toISOString(),
    };

    const storeWithCrops: LocalStorageData = {
      config: { schoolName: 'Escola Modelo', schoolLogo: '', photoHistorySlots: 15 },
      periods: [{ id: 'p1', name: '2026', active: true, status: 'in_production', createdAt: new Date().toISOString() }],
      classes: [{ id: 'c1', name: '1A', createdAt: new Date().toISOString() }],
      students: [{ id: 's1', enrollment: '101', name: 'JOAO SILVA', createdAt: new Date().toISOString() }],
      records: [JSON.parse(JSON.stringify(baseRecordWithAllCrops))],
      models: [],
      timelines: [],
    };

    // Sub-teste 4A: categoria 'crops'
    const resCrops = runSelectiveCleanPipeline(storeWithCrops, ['crops']);
    const recCrops = resCrops.store.records[0];
    const cropsAllRemoved =
      recCrops.timelinePrimaryCrop === undefined &&
      recCrops.timelineSecondaryCrop === undefined &&
      recCrops.carometroCrop === undefined &&
      recCrops.carometroCircularCrop === undefined &&
      recCrops.autoFaceCrop === undefined &&
      recCrops.cropSettings === undefined &&
      recCrops.photoUrl === '/uploads/photos/photo_crops_test.jpg'; // Foto original intacta!

    // Sub-teste 4B: categoria 'carometro'
    const resCarometro = runSelectiveCleanPipeline(storeWithCrops, ['carometro']);
    const recCarometro = resCarometro.store.records[0];
    const carometroRemovedCropsKept =
      recCarometro.carometroCrop === undefined &&
      recCarometro.carometroCircularCrop === undefined &&
      recCarometro.autoFaceCrop === undefined &&
      recCarometro.timelinePrimaryCrop !== undefined && // Linha do tempo primária preservada
      recCarometro.photoUrl === '/uploads/photos/photo_crops_test.jpg'; // Foto original intacta!

    const cropPhotoStillExistsOnDisk = fs.existsSync(path.join(TEST_TEMP_DIR, 'photo_crops_test.jpg'));

    if (cropsAllRemoved && carometroRemovedCropsKept && cropPhotoStillExistsOnDisk) {
      console.log('✅ TESTE 4 PASSOU: carometroCircularCrop removido em ambas categorias e foto original preservada no disco.');
      passed++;
    } else {
      console.error('❌ TESTE 4 FALHOU:', { cropsAllRemoved, carometroRemovedCropsKept, cropPhotoStillExistsOnDisk });
      failed++;
    }

    // -------------------------------------------------------------
    // Teste 5: Foto usada por modelo/layout permanece protegida
    // -------------------------------------------------------------
    console.log('\nTESTE 5: Foto usada por modelo/layout permanece protegida');
    createDummyFile('model_primary_frame.png');
    createDummyFile('model_bg_custom.jpg');

    const storeWithModelImages: LocalStorageData = {
      config: { schoolName: 'Escola Modelo', schoolLogo: '', photoHistorySlots: 15 },
      periods: [],
      classes: [],
      students: [],
      records: [],
      models: [
        {
          id: 'model_custom_1',
          title: 'Modelo Graduação',
          bgImageUrl: '/uploads/photos/model_bg_custom.jpg',
          collaboratorBgImageUrl: '',
          primaryFrameUrl: '/uploads/photos/model_primary_frame.png',
          secondaryFrameUrl: '',
          fontFamily: 'Inter',
          primaryColor: '#1e3a8a',
          accentColor: '#3b82f6',
          updatedAt: new Date().toISOString(),
        },
      ],
      timelines: [],
    };

    // Limpeza de 'records' e 'photos'
    runSelectiveCleanPipeline(storeWithModelImages, ['records', 'photos']);

    const modelFrameExists = fs.existsSync(path.join(TEST_TEMP_DIR, 'model_primary_frame.png'));
    const modelBgExists = fs.existsSync(path.join(TEST_TEMP_DIR, 'model_bg_custom.jpg'));

    if (modelFrameExists && modelBgExists) {
      console.log('✅ TESTE 5 PASSOU: Imagens de moldura e fundo de modelos foram protegidas no disco.');
      passed++;
    } else {
      console.error('❌ TESTE 5 FALHOU:', { modelFrameExists, modelBgExists });
      failed++;
    }

    // -------------------------------------------------------------
    // Teste 6: Foto usada em modelSnapshot de Timeline permanece protegida
    // -------------------------------------------------------------
    console.log('\nTESTE 6: Foto usada em modelSnapshot de Timeline permanece protegida');
    createDummyFile('timeline_snapshot_bg.jpg');

    const storeWithTimelineSnapshot: LocalStorageData = {
      config: { schoolName: 'Escola Modelo', schoolLogo: '', photoHistorySlots: 15 },
      periods: [{ id: 'p1', name: '2026', active: true, status: 'in_production', createdAt: new Date().toISOString() }],
      classes: [],
      students: [{ id: 's1', enrollment: '101', name: 'JOAO SILVA', createdAt: new Date().toISOString() }],
      records: [],
      models: [],
      timelines: [
        {
          id: 'tl_snap_1',
          studentId: 's1',
          studentName: 'JOAO SILVA',
          studentEnrollment: '101',
          year: '2026',
          modelId: 'm_hist',
          modelTitle: 'Modelo Histórico',
          modelSnapshot: {
            id: 'm_hist',
            title: 'Modelo Histórico',
            bgImageUrl: '/uploads/photos/timeline_snapshot_bg.jpg',
            collaboratorBgImageUrl: '',
            primaryFrameUrl: '',
            secondaryFrameUrl: '',
            fontFamily: 'Inter',
            primaryColor: '#000',
            accentColor: '#fff',
            updatedAt: new Date().toISOString(),
          },
          photoItems: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    // Limpeza de records e photos sem mexer em timelines
    runSelectiveCleanPipeline(storeWithTimelineSnapshot, ['records', 'photos']);

    const snapshotBgExists = fs.existsSync(path.join(TEST_TEMP_DIR, 'timeline_snapshot_bg.jpg'));
    if (snapshotBgExists) {
      console.log('✅ TESTE 6 PASSOU: Imagem em modelSnapshot de timeline sobreviveu com segurança.');
      passed++;
    } else {
      console.error('❌ TESTE 6 FALHOU: timeline_snapshot_bg.jpg foi indevidamente apagada.');
      failed++;
    }

    // -------------------------------------------------------------
    // Teste 7: Combinação records + timelines → arquivo sem nenhuma referência restante pode ser removido
    // -------------------------------------------------------------
    console.log('\nTESTE 7: Combinação records + timelines → arquivo sem nenhuma referência restante é removido');
    createDummyFile('photo_rec_and_tl_shared.jpg');

    const storeRecAndTl: LocalStorageData = {
      config: { schoolName: 'Escola Modelo', schoolLogo: '', photoHistorySlots: 15 },
      periods: [{ id: 'p1', name: '2026', active: true, status: 'in_production', createdAt: new Date().toISOString() }],
      classes: [{ id: 'c1', name: '1A', createdAt: new Date().toISOString() }],
      students: [{ id: 's1', enrollment: '101', name: 'JOAO SILVA', createdAt: new Date().toISOString() }],
      records: [
        {
          id: 'r_shared',
          studentId: 's1',
          year: '2026',
          className: '1A',
          photoUrl: '/uploads/photos/photo_rec_and_tl_shared.jpg',
          createdAt: new Date().toISOString(),
        },
      ],
      models: [],
      timelines: [
        {
          id: 'tl_shared_1',
          studentId: 's1',
          studentName: 'JOAO SILVA',
          studentEnrollment: '101',
          year: '2026',
          modelId: 'm1',
          modelTitle: 'Modelo Padrão',
          modelSnapshot: dummyModelSnapshot,
          photoItems: [
            {
              year: '2026',
              className: '1A',
              photoUrl: '/uploads/photos/photo_rec_and_tl_shared.jpg',
              cropSettings: { x: 50, y: 50, zoom: 1.0 },
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    // Executa com 'records' E 'timelines' juntos
    const resRecAndTl = runSelectiveCleanPipeline(storeRecAndTl, ['records', 'timelines']);

    const fileRecAndTlDeleted = !fs.existsSync(path.join(TEST_TEMP_DIR, 'photo_rec_and_tl_shared.jpg'));
    const recAndTlActiveRefs = collectActivePhotoFilenames(resRecAndTl.store);

    if (fileRecAndTlDeleted && !recAndTlActiveRefs.has('photo_rec_and_tl_shared.jpg')) {
      console.log('✅ TESTE 7 PASSOU: Arquivo sem nenhuma referência sobrevivente foi excluído com sucesso.');
      passed++;
    } else {
      console.error('❌ TESTE 7 FALHOU:', { fileRecAndTlDeleted, recAndTlActiveRefs });
      failed++;
    }

    // -------------------------------------------------------------
    // Teste 8: Combinação photos + timelines → não criar referência 404 sobrevivente
    // -------------------------------------------------------------
    console.log('\nTESTE 8: Combinação photos + timelines → não criar referência 404 sobrevivente');
    createDummyFile('photo_photos_and_tl.jpg');
    createDummyFile('timeline_only_pic.jpg');

    const storePhotosAndTl: LocalStorageData = {
      config: { schoolName: 'Escola Modelo', schoolLogo: '', photoHistorySlots: 15 },
      periods: [{ id: 'p1', name: '2026', active: true, status: 'in_production', createdAt: new Date().toISOString() }],
      classes: [{ id: 'c1', name: '1A', createdAt: new Date().toISOString() }],
      students: [{ id: 's1', enrollment: '101', name: 'JOAO SILVA', createdAt: new Date().toISOString() }],
      records: [
        {
          id: 'r_pt',
          studentId: 's1',
          year: '2026',
          className: '1A',
          photoUrl: '/uploads/photos/photo_photos_and_tl.jpg',
          timelinePrimaryCrop: { x: 10, y: 10, zoom: 1 },
          createdAt: new Date().toISOString(),
        },
      ],
      models: [],
      timelines: [
        {
          id: 'tl_pt',
          studentId: 's1',
          studentName: 'JOAO SILVA',
          studentEnrollment: '101',
          year: '2026',
          modelId: 'm1',
          modelTitle: 'Modelo Padrão',
          modelSnapshot: dummyModelSnapshot,
          photoItems: [
            {
              year: '2026',
              className: '1A',
              photoUrl: '/uploads/photos/photo_photos_and_tl.jpg',
              cropSettings: { x: 50, y: 50, zoom: 1.0 },
            },
            {
              year: '2025',
              className: 'Infantil',
              photoUrl: '/uploads/photos/timeline_only_pic.jpg',
              cropSettings: { x: 50, y: 50, zoom: 1.0 },
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    const resPhotosAndTl = runSelectiveCleanPipeline(storePhotosAndTl, ['photos', 'timelines']);

    const filePhotosAndTlDeleted = !fs.existsSync(path.join(TEST_TEMP_DIR, 'photo_photos_and_tl.jpg'));
    const fileTlOnlyDeleted = !fs.existsSync(path.join(TEST_TEMP_DIR, 'timeline_only_pic.jpg'));
    const survivingRefsPt = collectActivePhotoFilenames(resPhotosAndTl.store);

    const recordClean = resPhotosAndTl.store.records[0];
    const noOrphanInRecord = recordClean.photoUrl === '' && recordClean.timelinePrimaryCrop === undefined;

    if (
      filePhotosAndTlDeleted &&
      fileTlOnlyDeleted &&
      !survivingRefsPt.has('photo_photos_and_tl.jpg') &&
      !survivingRefsPt.has('timeline_only_pic.jpg') &&
      noOrphanInRecord
    ) {
      console.log('✅ TESTE 8 PASSOU: Ambas as fotos foram removidas sem deixar nenhuma referência 404 órfã.');
      passed++;
    } else {
      console.error('❌ TESTE 8 FALHOU:', {
        filePhotosAndTlDeleted,
        fileTlOnlyDeleted,
        survivingRefsPt,
        recordClean,
      });
      failed++;
    }

    // -------------------------------------------------------------
    // Teste 9: Período com Timeline dependente sem selecionar timelines → operação bloqueada
    // -------------------------------------------------------------
    console.log('\nTESTE 9: Período com Timeline dependente sem selecionar timelines → OPERAÇÃO BLOQUEADA');
    const storePeriodDep: LocalStorageData = {
      config: { schoolName: 'Escola Modelo', schoolLogo: '', photoHistorySlots: 15 },
      periods: [{ id: 'p_2026', name: '2026', active: true, status: 'in_production', createdAt: new Date().toISOString() }],
      classes: [],
      students: [{ id: 's1', enrollment: '101', name: 'JOAO SILVA', createdAt: new Date().toISOString() }],
      records: [],
      models: [],
      timelines: [
        {
          id: 'tl_dep_1',
          studentId: 's1',
          studentName: 'JOAO SILVA',
          studentEnrollment: '101',
          year: '2026',
          modelId: 'm1',
          modelTitle: 'Modelo Padrão',
          modelSnapshot: dummyModelSnapshot,
          photoItems: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    // Tenta excluir 'periods' sem selecionar 'timelines'
    const resPeriodBlocked = runSelectiveCleanPipeline(storePeriodDep, ['periods']);

    if (
      resPeriodBlocked.blocked === true &&
      resPeriodBlocked.statusCode === 400 &&
      resPeriodBlocked.errorMessage?.includes('Linha do Tempo')
    ) {
      console.log('✅ TESTE 9 PASSOU: Validação de integridade bloqueou exclusão de período com timelines ativas.');
      passed++;
    } else {
      console.error('❌ TESTE 9 FALHOU: Deveria ter bloqueado a exclusão.', resPeriodBlocked);
      failed++;
    }

    // -------------------------------------------------------------
    // Teste 10: Período + Timelines juntos → operação permitida
    // -------------------------------------------------------------
    console.log('\nTESTE 10: Período + Timelines selecionados juntos → OPERAÇÃO PERMITIDA');
    const resPeriodAllowed = runSelectiveCleanPipeline(storePeriodDep, ['periods', 'timelines']);

    if (
      resPeriodAllowed.blocked === false &&
      resPeriodAllowed.statusCode === 200 &&
      resPeriodAllowed.store.periods?.length === 0 &&
      resPeriodAllowed.store.timelines?.length === 0
    ) {
      console.log('✅ TESTE 10 PASSOU: Operação permitida quando ambas categorias dependentes foram selecionadas juntas.');
      passed++;
    } else {
      console.error('❌ TESTE 10 FALHOU:', resPeriodAllowed);
      failed++;
    }

    // -------------------------------------------------------------
    // Teste 11 (Incidente Real): Limpeza da Linha do Tempo NÃO pode apagar foto física ainda vinculada a Matrícula
    // -------------------------------------------------------------
    console.log('\nTESTE 11 (INCIDENTE REAL EM PIPELINE COMPLETO): Limpeza de Linha do Tempo preserva foto vinculada a Matrícula');
    createDummyFile('shared_incident_foto.jpg');
    createDummyFile('exclusive_timeline_incident.jpg');

    const storeIncident: LocalStorageData = {
      config: { schoolName: 'Escola Modelo', schoolLogo: '', photoHistorySlots: 15 },
      periods: [{ id: 'p1', name: '2026', active: true, status: 'in_production', createdAt: new Date().toISOString() }],
      classes: [{ id: 'c1', name: '1A', createdAt: new Date().toISOString() }],
      students: [{ id: 's1', enrollment: '101', name: 'JOAO SILVA', createdAt: new Date().toISOString() }],
      records: [
        {
          id: 'r_inc',
          studentId: 's1',
          year: '2026',
          className: '1A',
          photoUrl: '/uploads/photos/shared_incident_foto.jpg',
          createdAt: new Date().toISOString(),
        },
      ],
      models: [],
      timelines: [
        {
          id: 'tl_inc',
          studentId: 's1',
          studentName: 'JOAO SILVA',
          studentEnrollment: '101',
          year: '2026',
          modelId: 'm1',
          modelTitle: 'Modelo Padrão',
          modelSnapshot: dummyModelSnapshot,
          photoItems: [
            {
              year: '2026',
              className: '1A',
              photoUrl: '/uploads/photos/shared_incident_foto.jpg',
              cropSettings: { x: 50, y: 50, zoom: 1.0 },
            },
            {
              year: '2025',
              className: 'Infantil',
              photoUrl: '/uploads/photos/exclusive_timeline_incident.jpg',
              cropSettings: { x: 50, y: 50, zoom: 1.0 },
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    // Usuário executa limpeza de 'timelines'
    const resIncident = runSelectiveCleanPipeline(storeIncident, ['timelines']);

    const sharedIncidentExists = fs.existsSync(path.join(TEST_TEMP_DIR, 'shared_incident_foto.jpg'));
    const exclusiveTimelineIncidentDeleted = !fs.existsSync(path.join(TEST_TEMP_DIR, 'exclusive_timeline_incident.jpg'));

    if (
      sharedIncidentExists === true &&
      exclusiveTimelineIncidentDeleted === true &&
      resIncident.preservedPhotos.includes('shared_incident_foto.jpg') &&
      resIncident.deletedPhotos.includes('exclusive_timeline_incident.jpg')
    ) {
      console.log('✅ TESTE 11 PASSOU: Foto compartilhada foi preservada no disco! Matrícula não sofre 404.');
      passed++;
    } else {
      console.error('❌ TESTE 11 FALHOU:', {
        sharedIncidentExists,
        exclusiveTimelineIncidentDeleted,
        resIncident,
      });
      failed++;
    }

    // -------------------------------------------------------------
    // Teste 12: Logotipo institucional e Avatar Administrativo protegidos no disco
    // -------------------------------------------------------------
    console.log('\nTESTE 12: Logotipo institucional e Avatar Administrativo protegidos contra deleção');
    createDummyFile('school_logo_test.png');
    createDummyFile('admin_avatar_test.jpg');

    const fakeAuthFile = path.join(TEST_TEMP_DIR, 'fake_auth.json');
    fs.writeFileSync(
      fakeAuthFile,
      JSON.stringify({
        admin: {
          email: 'admin@escola.com',
          avatarUrl: '/uploads/photos/admin_avatar_test.jpg',
        },
      })
    );

    const storeWithLogo: LocalStorageData = {
      config: { schoolName: 'Escola Modelo', schoolLogo: '/uploads/photos/school_logo_test.png', photoHistorySlots: 15 },
      periods: [],
      classes: [],
      students: [],
      records: [],
      models: [],
      timelines: [],
    };

    // Limpeza de 'records' e 'photos'
    runSelectiveCleanPipeline(storeWithLogo, ['records', 'photos'], {
      adminAvatarUrl: '/uploads/photos/admin_avatar_test.jpg',
      authFilePath: fakeAuthFile,
    });

    const logoStillExists = fs.existsSync(path.join(TEST_TEMP_DIR, 'school_logo_test.png'));
    const adminAvatarStillExists = fs.existsSync(path.join(TEST_TEMP_DIR, 'admin_avatar_test.jpg'));

    if (logoStillExists && adminAvatarStillExists) {
      console.log('✅ TESTE 12 PASSOU: Logo institucional e avatar administrativo continuam intactos no disco.');
      passed++;
    } else {
      console.error('❌ TESTE 12 FALHOU:', { logoStillExists, adminAvatarStillExists });
      failed++;
    }

    // -------------------------------------------------------------
    // Teste 13: cleanupOrphanPhotos remove apenas arquivos verdadeiramente órfãos
    // -------------------------------------------------------------
    console.log('\nTESTE 13: cleanupOrphanPhotos remove apenas arquivos órfãos sem referências ativas');
    createDummyFile('truly_orphan_photo_test.jpg');
    createDummyFile('active_preserved_for_orphan_test.jpg');

    const storeForOrphanTest: LocalStorageData = {
      config: { schoolName: 'Escola Modelo', schoolLogo: '', photoHistorySlots: 15 },
      periods: [],
      classes: [],
      students: [],
      records: [
        {
          id: 'r_orphan_test',
          studentId: 's1',
          year: '2026',
          className: '1A',
          photoUrl: '/uploads/photos/active_preserved_for_orphan_test.jpg',
          createdAt: new Date().toISOString(),
        },
      ],
      models: [],
      timelines: [],
    };

    const orphanBefore = fs.existsSync(path.join(TEST_TEMP_DIR, 'truly_orphan_photo_test.jpg'));
    const activeBefore = fs.existsSync(path.join(TEST_TEMP_DIR, 'active_preserved_for_orphan_test.jpg'));

    const orphanCleaned = cleanupOrphanPhotos(storeForOrphanTest, {
      targetPhotosDir: TEST_TEMP_DIR,
      authFilePath: fakeAuthFile,
    });

    const orphanAfter = fs.existsSync(path.join(TEST_TEMP_DIR, 'truly_orphan_photo_test.jpg'));
    const activeAfter = fs.existsSync(path.join(TEST_TEMP_DIR, 'active_preserved_for_orphan_test.jpg'));

    if (orphanBefore && !orphanAfter && activeBefore && activeAfter && orphanCleaned >= 1) {
      console.log('✅ TESTE 13 PASSOU: Foto órfã foi removida, fotos ativas permaneceram intactas.');
      passed++;
    } else {
      console.error('❌ TESTE 13 FALHOU:', { orphanBefore, orphanAfter, activeBefore, activeAfter, orphanCleaned });
      failed++;
    }

  } finally {
    cleanupTestEnvironment();
    console.log('\nDiretório temporário de testes (os.tmpdir) limpo com sucesso (zero impactos no disco).');
  }

  console.log(`\n================================================================`);
  console.log(` RESULTADO TOTAL DOS TESTES DE INTEGRIDADE: ${passed} PASSOU / ${failed} FALHOU`);
  console.log(`================================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runIntegrityTests().catch((err) => {
  console.error('Erro fatal no executor de testes:', err);
  process.exit(1);
});
