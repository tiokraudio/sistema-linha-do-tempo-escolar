import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import {
  SchoolConfig,
  Student,
  AcademicYearRecord,
  LayoutModel,
  SavedComposition,
  TimelinePhotoItem,
  AcademicPeriod,
  ClassRecord,
  LocalStorageData,
  BackupType,
  BackupRecord,
} from './src/types';
import { getDefaultSingleLayoutModel, createDefaultDotsForConfig, ensureModelConfigurations, migrateDefaultLayoutModel } from './src/utils/defaultLayout';
import {
  OFFICIAL_CLASSES,
  sortClassesPedagogically,
  validateStudentProgression,
  mapLegacyClassToOfficial,
  getPedagogicalPosition,
  getPedagogicalStage,
} from './src/utils/pedagogicalStructure';
import {
  createBackup,
  listBackups,
  getBackupFilePath,
  validateBackupZip,
  deleteBackup,
  extractPhotosFromBackupZip,
} from './server/backupService';
import {
  savePhotoFromBase64,
  isBase64Image,
  migrateBase64PhotosInStore,
  deletePhotoFile,
  deletePhotoFilesForUrls,
  cleanupOrphanPhotos,
  PHOTOS_DIR,
} from './server/photoStorageService';
import { sanitizeUtf8Strings, safeJsonParse } from './server/utf8Sanitizer';
import {
  isAuthSetup,
  getAdminEmail,
  setupAdmin,
  authenticate,
  getLoginLockoutStatus,
  validateSession,
  revokeSession,
  updateAdminEmail,
  updateAdminPassword,
  requireAuth,
} from './server/authService';

const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'storage.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadData(): LocalStorageData {
  const dataFileExists = fs.existsSync(DATA_FILE);

  // CASO A: PRIMEIRA INSTALAÇÃO (storage.json não existe fisicamente no disco)
  if (!dataFileExists) {
    const photoHistorySlots = 10;
    const defaultModel = getDefaultSingleLayoutModel(photoHistorySlots);
    const initialPeriods: AcademicPeriod[] = ['2026', '2025', '2024', '2023'].map((yrStr) => ({
      id: `per_${yrStr}`,
      name: yrStr,
      active: true,
      status: 'in_production',
      createdAt: new Date().toISOString(),
    }));

    const initialClasses: ClassRecord[] = OFFICIAL_CLASSES.map((c) => ({
      id: c.id,
      name: c.name,
      stage: c.stage,
      stageName: c.stageName,
      position: c.position,
      active: true,
      order: c.position,
      createdAt: c.createdAt,
    }));

    const initialData: LocalStorageData = {
      config: {
        schoolName: '',
        schoolLogo: '',
        photoHistorySlots,
      },
      periods: initialPeriods,
      classes: initialClasses,
      students: [],
      records: [],
      models: [defaultModel],
      timelines: [],
    };

    saveData(initialData);
    return initialData;
  }

  // CASO B & C: O ARQUIVO EXISTE FISICAMENTE NO DISCO
  let rawContent = '';
  try {
    rawContent = fs.readFileSync(DATA_FILE, 'utf-8');
  } catch (err: any) {
    console.error('[Storage Error] Falha de I/O ao ler o arquivo storage.json existente:', err?.message || err);
    return {
      config: { schoolName: '', schoolLogo: '', photoHistorySlots: 10 },
      periods: [],
      classes: [],
      students: [],
      records: [],
      models: [],
      timelines: [],
    };
  }

  // CASO C: ARQUIVO EXISTENTE VAZIO (0 bytes ou apenas espaços)
  if (!rawContent || rawContent.trim().length === 0) {
    console.error(
      '[Storage Error] O arquivo storage.json existe fisicamente no disco, mas está vazio (0 bytes). Nenhum dado foi sobrescrito e nenhum backup foi restaurado automaticamente. O sistema operará em modo seguro até intervenção ou restauração explícita.'
    );
    return {
      config: { schoolName: '', schoolLogo: '', photoHistorySlots: 10 },
      periods: [],
      classes: [],
      students: [],
      records: [],
      models: [],
      timelines: [],
    };
  }

  // CASO B vs C: PARSE DO CONTEÚDO JSON
  let loadedData: Partial<LocalStorageData> | null = null;
  try {
    const parsed = safeJsonParse(rawContent);
    if (parsed && typeof parsed === 'object') {
      loadedData = sanitizeUtf8Strings(parsed);
    } else {
      throw new Error('Conteúdo do arquivo não é um objeto JSON válido.');
    }
  } catch (err: any) {
    console.error(
      `[Storage Error] O arquivo storage.json existe mas está corrompido ou contém formato JSON inválido: ${err?.message || err}. O arquivo físico em disco foi preservado intacto e NÃO foi sobrescrito. Nenhum backup foi restaurado automaticamente.`
    );
    return {
      config: { schoolName: '', schoolLogo: '', photoHistorySlots: 10 },
      periods: [],
      classes: [],
      students: [],
      records: [],
      models: [],
      timelines: [],
    };
  }

  // CASO B: SISTEMA EXISTENTE VÁLIDO
  // Mesma regra para todos os arrays: se foram salvos como [], permanecem [].
  // NÃO recriar turmas, modelos, períodos ou outros dados quando os arrays estão vazios.
  const photoHistorySlots =
    typeof loadedData.config?.photoHistorySlots === 'number' && loadedData.config.photoHistorySlots >= 0
      ? loadedData.config.photoHistorySlots
      : 10;

  const defaultModelRef = getDefaultSingleLayoutModel(photoHistorySlots);

  // 1. Classes: hidratar somente se o array existir no JSON carregado. Se estiver vazio [], permanece [].
  let classesList: ClassRecord[] = [];
  if (Array.isArray(loadedData.classes)) {
    classesList = loadedData.classes.map((cls, idx) => {
      const pos = cls.position ?? (getPedagogicalPosition(cls.name) ?? (idx + 1));
      const stage = cls.stage ?? getPedagogicalStage(pos);
      return {
        id: cls.id || `cls_${idx + 1}`,
        name: cls.name,
        stage: stage === 'OUTRA' ? 'EFAI' : stage,
        stageName:
          cls.stageName ||
          (stage === 'EI'
            ? 'Educação Infantil'
            : stage === 'EFAI'
            ? 'Ensino Fundamental - Anos Iniciais'
            : stage === 'EFAF'
            ? 'Ensino Fundamental - Anos Finais'
            : 'Ensino Médio'),
        position: pos,
        active: cls.active !== undefined ? Boolean(cls.active) : true,
        order: cls.order !== undefined ? Number(cls.order) : idx + 1,
        createdAt: cls.createdAt || new Date().toISOString(),
        updatedAt: cls.updatedAt,
      };
    });
  }

  // 2. Periods: carregar períodos salvos. Se estiver vazio [], permanece [].
  const periodMap = new Map<string, AcademicPeriod>();
  if (Array.isArray(loadedData.periods)) {
    for (const p of loadedData.periods) {
      if (p.name && /^\d{4}$/.test(String(p.name).trim())) {
        const cleanName = String(p.name).trim();
        periodMap.set(cleanName, {
          id: p.id || `per_${cleanName}`,
          name: cleanName,
          active: p.active !== undefined ? Boolean(p.active) : true,
          status: p.status || 'in_production',
          closedAt: p.closedAt,
          closedBy: p.closedBy,
          createdAt: p.createdAt || new Date().toISOString(),
          updatedAt: p.updatedAt,
        });
      }
    }
  }
  const periodsList = Array.from(periodMap.values()).sort(
    (a, b) => Number(b.name) - Number(a.name)
  );

  // 3. Models: carregar modelos salvos. Se estiver vazio [], permanece [].
  let modelsList: LayoutModel[] = [];
  if (Array.isArray(loadedData.models)) {
    modelsList = loadedData.models.map((m) => {
      if (m.id === 'single_default_model') {
        return migrateDefaultLayoutModel(m, photoHistorySlots);
      }
      const configs = ensureModelConfigurations(m.configurations || [], photoHistorySlots);
      return {
        ...m,
        configurations: configs,
        primaryPhotoPosition: m.primaryPhotoPosition || defaultModelRef.primaryPhotoPosition,
      };
    });
  }

  const studentsList: Student[] = Array.isArray(loadedData.students) ? loadedData.students : [];
  const recordsList: AcademicYearRecord[] = Array.isArray(loadedData.records) ? loadedData.records : [];
  const timelinesList: SavedComposition[] = Array.isArray(loadedData.timelines) ? loadedData.timelines : [];

  const initialStore: LocalStorageData = {
    config: {
      schoolName: loadedData.config?.schoolName || '',
      schoolLogo: loadedData.config?.schoolLogo || '',
      photoHistorySlots,
    },
    periods: periodsList,
    classes: classesList,
    students: studentsList,
    records: recordsList,
    models: modelsList,
    timelines: timelinesList,
  };

  // Automatic one-time migration of any legacy Base64 photos to physical disk files
  const migrationResult = migrateBase64PhotosInStore(initialStore);
  if (
    migrationResult.migratedRecords > 0 ||
    migrationResult.migratedTimelines > 0 ||
    migrationResult.migratedLogo
  ) {
    saveData(initialStore);
  }

  return initialStore;
}

function saveData(data: LocalStorageData) {
  const cleanData = sanitizeUtf8Strings(data);
  const jsonStr = JSON.stringify(cleanData, null, 2);
  const tmpFile = path.join(DATA_DIR, `storage.json.tmp_${Date.now()}`);
  try {
    fs.writeFileSync(tmpFile, jsonStr, 'utf-8');
    fs.renameSync(tmpFile, DATA_FILE);
  } catch (err) {
    // Fallback direct write if rename fails
    fs.writeFileSync(DATA_FILE, jsonStr, 'utf-8');
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {}
  }
}

let store = loadData();

function isPeriodClosed(year: string | number | undefined): boolean {
  if (!year) return false;
  const p = store.periods.find((item) => String(item.name) === String(year));
  return p?.status === 'closed';
}

function getActiveAcademicPeriod(): any | null {
  if (!store.periods || store.periods.length === 0) return null;
  const activePeriods = store.periods
    .filter((p) => p.active !== false)
    .sort((a, b) => Number(b.name) - Number(a.name));
  if (activePeriods.length > 0) return activePeriods[0];
  return null;
}

function getActiveAcademicYear(): string | null {
  const p = getActiveAcademicPeriod();
  return p?.name ? String(p.name) : null;
}

/**
 * Invalidação centralizada da composição da Linha do Tempo e do Carômetro do período letivo atual
 * - Exclui SOMENTE a composição do período letivo atual do aluno
 * - Preserva TODAS as composições de períodos anteriores (históricas)
 * - Invalida o ajuste/detecção do Carômetro vinculado à composição do período atual
 */
function invalidateCurrentTimelineComposition(
  studentId: string,
  reason: 'photo_changed' | 'historical_enrollment_confirmed'
): { timelineRemoved: boolean; message?: string } {
  const currentActivePeriod = getActiveAcademicPeriod();
  if (!currentActivePeriod) {
    return { timelineRemoved: false };
  }

  const activePeriodName = String(currentActivePeriod.name);
  const student = store.students.find((s) => s.id === studentId);

  // 1. Verificar se o aluno possui composição salva para o período letivo atual
  const hasCurrentTimeline = store.timelines.some((t) => {
    const isThisStudent =
      t.studentId === studentId ||
      (student?.enrollment && t.studentEnrollment === student.enrollment);
    const isCurrentActivePeriod = String(t.year) === activePeriodName;
    return isThisStudent && isCurrentActivePeriod;
  });

  if (!hasCurrentTimeline) {
    return { timelineRemoved: false };
  }

  // 2. Excluir somente a composição da Linha do Tempo do período letivo atual
  store.timelines = store.timelines.filter((t) => {
    const isThisStudent =
      t.studentId === studentId ||
      (student?.enrollment && t.studentEnrollment === student.enrollment);
    const isCurrentActivePeriod = String(t.year) === activePeriodName;
    return !(isThisStudent && isCurrentActivePeriod);
  });

  // 3. Invalidar ajuste/detecção do Carômetro do aluno no período letivo atual
  const currentRecord = store.records.find(
    (r) => r.studentId === studentId && String(r.year) === activePeriodName
  );
  if (currentRecord) {
    delete currentRecord.carometroCrop;
    delete currentRecord.autoFaceCrop;
  }

  const message =
    reason === 'photo_changed'
      ? 'Foto alterada. A composição da Linha do Tempo do período letivo atual foi excluída e deverá ser criada novamente.'
      : 'Matrícula confirmada. A composição da Linha do Tempo do período letivo atual foi excluída e deverá ser criada novamente.';

  return { timelineRemoved: true, message };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // Static file serving for student/collaborator photos and system uploads
  app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')));

  // UTF-8 & Mojibake sanitizer middleware for all API requests
  app.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeUtf8Strings(req.body);
    }
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeUtf8Strings(req.query);
    }
    next();
  });

  // Healthcheck (Public)
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // --- AUTHENTICATION PUBLIC ENDPOINTS ---

  // 1. Status do acesso administrativo e validação da sessão ativa
  app.get('/api/auth/status', (req, res) => {
    const isSetup = isAuthSetup();
    const authHeader = req.headers.authorization;
    let isAuthenticated = false;
    const currentEmail = isSetup ? getAdminEmail() : null;

    if (isSetup && authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      isAuthenticated = validateSession(token);
    }

    res.json({
      isSetup,
      isAuthenticated,
      email: isAuthenticated ? currentEmail : null,
    });
  });

  // 2. Configuração inicial do acesso administrativo (apenas quando ainda não configurado)
  app.post('/api/auth/setup', (req, res) => {
    try {
      const { email, password } = req.body;
      const result = setupAdmin(email, password);
      res.status(201).json({
        success: true,
        token: result.token,
        email: result.email,
        message: 'Acesso administrativo configurado com sucesso.',
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Erro ao configurar acesso administrativo.' });
    }
  });

  // 3. Login administrativo (e-mail + senha) com proteção contra força bruta
  app.post('/api/auth/login', (req, res) => {
    try {
      const { email, password } = req.body;
      const result = authenticate(email, password);
      res.json({
        success: true,
        token: result.token,
        email: result.email,
      });
    } catch (err: any) {
      const lockout = getLoginLockoutStatus();
      const statusCode = lockout.isLocked ? 429 : 401;
      res.status(statusCode).json({
        error: err.message || 'E-mail ou senha inválidos.',
        isLocked: lockout.isLocked,
        remainingSeconds: lockout.remainingSeconds,
      });
    }
  });

  // 4. Logout administrativo (revogação de sessão)
  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      revokeSession(token);
    }
    res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
  });

  // --- AUTHENTICATION PROTECTED ACCOUNT MANAGEMENT ---

  // Obter dados da conta administrativa autenticada
  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({
      email: getAdminEmail(),
      role: 'ADMIN',
    });
  });

  // Alteração de e-mail administrativo (valida formato e senha atual)
  app.put('/api/auth/change-email', requireAuth, (req, res) => {
    try {
      const { currentPassword, newEmail } = req.body;
      if (!currentPassword || !newEmail) {
        return res.status(400).json({ error: 'Senha atual e novo e-mail são obrigatórios.' });
      }
      const result = updateAdminEmail(currentPassword, newEmail);
      res.json({
        success: true,
        email: result.email,
        message: 'E-mail administrativo atualizado com sucesso.',
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Erro ao atualizar e-mail.' });
    }
  });

  // Alteração de senha administrativa (valida senha atual e nova senha)
  app.put('/api/auth/change-password', requireAuth, (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórios.' });
      }
      updateAdminPassword(currentPassword, newPassword);
      res.json({
        success: true,
        message: 'Senha administrativa atualizada com sucesso.',
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Erro ao atualizar senha.' });
    }
  });

  // --- CONFIGURAÇÃO PÚBLICA E FAVICON DINÂMICO ---
  const DEFAULT_FAVICON_SVG_RAW = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><rect width="32" height="32" rx="8" fill="#1e293b"/><path d="M16 6L4 12.5L16 19L28 12.5L16 6Z" fill="#3b82f6"/><path d="M8 15.5V22C8 24.5 11.5 26.5 16 26.5C20.5 26.5 24 24.5 24 22V15.5L16 20L8 15.5Z" fill="#60a5fa"/><circle cx="28" cy="15" r="1.5" fill="#93c5fd"/><line x1="28" y1="15" x2="28" y2="23" stroke="#93c5fd" stroke-width="1.5" stroke-linecap="round"/></svg>`;

  // Endpoint público para consulta do logotipo e dados básicos da escola (usado no arranque para favicon)
  app.get('/api/public-config', (req, res) => {
    res.json({
      schoolName: store.config?.schoolName || '',
      schoolLogo: store.config?.schoolLogo || '',
      photoHistorySlots: store.config?.photoHistorySlots ?? 10,
    });
  });

  // Rota de compatibilidade para requisições diretas de favicon no servidor
  app.get('/favicon.ico', (req, res) => {
    const logo = store.config?.schoolLogo;
    if (logo && typeof logo === 'string' && logo.trim().length > 0) {
      if (logo.startsWith('data:')) {
        const parts = logo.split(',');
        const meta = parts[0] || '';
        const data = parts[1] || '';
        const mimeMatch = meta.match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/png';
        const buffer = Buffer.from(data, 'base64');
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.send(buffer);
      }
    }
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(DEFAULT_FAVICON_SVG_RAW);
  });

  // --- PROTEÇÃO GLOBAL DE TODAS AS ROTAS OPERACIONAIS ---
  // Todas as rotas /api/* abaixo exigem sessão administrativa válida (HTTP 401 caso não autenticado)
  app.use('/api', requireAuth);

  // Config Endpoints
  app.get('/api/config', (req, res) => {
    res.json(store.config);
  });

  app.put('/api/config', (req, res) => {
    let logoUrl = req.body?.schoolLogo;
    if (logoUrl && isBase64Image(logoUrl)) {
      logoUrl = savePhotoFromBase64(logoUrl, 'logo', 'school');
    }
    store.config = {
      ...store.config,
      ...req.body,
      ...(logoUrl !== undefined ? { schoolLogo: logoUrl } : {}),
    };
    saveData(store);
    res.json(store.config);
  });

  // Períodos Letivos Endpoints (Apenas anos de 4 dígitos)
  app.get('/api/periods', (req, res) => {
    res.json([...store.periods].sort((a, b) => Number(b.name) - Number(a.name)));
  });

  app.post('/api/periods', (req, res) => {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Ano do período letivo é obrigatório.' });
    }

    const cleanName = String(name).trim();
    if (!/^\d{4}$/.test(cleanName)) {
      return res.status(400).json({ error: 'O ano do período letivo deve conter exatamente 4 dígitos numéricos (ex: 2026).' });
    }

    const exists = store.periods.find((p) => p.name === cleanName);
    if (exists) {
      return res.status(400).json({ error: `O período letivo ${cleanName} já está cadastrado.` });
    }

    const newPeriod: AcademicPeriod = {
      id: `per_${cleanName}_${Date.now()}`,
      name: cleanName,
      active: true,
      status: 'in_production',
      createdAt: new Date().toISOString(),
    };

    store.periods.push(newPeriod);
    store.periods.sort((a, b) => Number(b.name) - Number(a.name));
    saveData(store);
    res.status(201).json(newPeriod);
  });

  // Alterar Status Operacional do Ano Letivo (EM PRODUÇÃO / EM REVISÃO)
  app.put('/api/periods/:name/status', (req, res) => {
    const { name } = req.params;
    const { status } = req.body;

    if (!['in_production', 'in_review'].includes(status)) {
      return res.status(400).json({ error: 'Status operacional inválido. Permitido: "in_production" ou "in_review".' });
    }

    const period = store.periods.find((p) => p.name === name || p.id === name);
    if (!period) {
      return res.status(404).json({ error: `Período letivo ${name} não encontrado.` });
    }

    if (period.status === 'closed') {
      return res.status(400).json({ error: `O ano letivo ${name} está FECHADO e não pode ter seu status alterado.` });
    }

    period.status = status;
    saveData(store);
    res.json(period);
  });

  // Fechamento Formal do Ano Letivo (B.23 & B.24 com Backup Automático de Segurança)
  app.post('/api/periods/:name/close', async (req, res) => {
    const { name } = req.params;
    const { closedBy } = req.body;

    const period = store.periods.find((p) => p.name === name || p.id === name);
    if (!period) {
      return res.status(404).json({ error: `Período letivo ${name} não encontrado.` });
    }

    if (period.status === 'closed') {
      return res.status(400).json({ error: `O ano letivo ${name} já se encontra FECHADO.` });
    }

    // B.24: BACKUP AUTOMÁTICO OBRIGATÓRIO ANTES DO FECHAMENTO
    try {
      await createBackup(
        store,
        'pre_close',
        `Backup automático de segurança antes do fechamento do ano letivo ${name}`
      );
    } catch (backupErr: any) {
      console.error('Falha no backup automático pré-fechamento:', backupErr);
      return res.status(500).json({
        error: `Não foi possível fechar o ano letivo ${name}: falha na criação do backup automático de segurança obrigatório (${backupErr?.message || 'erro desconhecido'}).`,
      });
    }

    period.status = 'closed';
    period.closedAt = new Date().toISOString();
    period.closedBy = closedBy ? String(closedBy).trim() : 'Administrador';
    saveData(store);
    res.json(period);
  });

  // Atualizar Período Letivo (Ativar/Desativar em Configurações -> Períodos Letivos)
  app.put('/api/periods/:id', (req, res) => {
    const { id } = req.params;
    const { active } = req.body;

    const period = store.periods.find((p) => p.id === id || p.name === id);
    if (!period) {
      return res.status(404).json({ error: 'Período letivo não encontrado.' });
    }

    if (active !== undefined) {
      period.active = Boolean(active);
    }
    period.updatedAt = new Date().toISOString();
    saveData(store);
    res.json(period);
  });

  app.delete('/api/periods/:id', (req, res) => {
    const { id } = req.params;
    const period = store.periods.find((p) => p.id === id || p.name === id);
    if (!period) {
      return res.status(404).json({ error: 'Período letivo não encontrado.' });
    }

    const hasRecords = store.records.some((r) => String(r.year) === String(period.name));
    if (hasRecords) {
      return res.status(400).json({
        error: `Não é possível excluir o período ${period.name} pois existem registros de alunos vinculados a ele.`,
      });
    }

    const hasTimelines = store.timelines.some((t) => String(t.year) === String(period.name));
    if (hasTimelines) {
      return res.status(400).json({
        error: `Não é possível excluir o período ${period.name} pois existem composições salvas vinculadas a ele.`,
      });
    }

    store.periods = store.periods.filter((p) => p.id !== id && p.name !== id);
    saveData(store);
    res.json({ success: true });
  });

  // Turmas Endpoints (Catálogo e Gestão de Turmas em Configurações)
  app.get('/api/classes', (req, res) => {
    const onlyActive = req.query.active === 'true';
    let result = [...store.classes];
    if (onlyActive) {
      result = result.filter((c) => c.active !== false);
    }
    result.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    res.json(result);
  });

  app.post('/api/classes', (req, res) => {
    const { name, stage, position, active } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'O nome da turma é obrigatório.' });
    }
    const cleanName = String(name).trim();
    const maxOrder = store.classes.reduce((max, c) => Math.max(max, c.order ?? 0), 0);
    const pos = position ? Number(position) : (getPedagogicalPosition(cleanName) ?? (maxOrder + 1));
    const stageResolved = stage || getPedagogicalStage(pos);
    const newClass: ClassRecord = {
      id: `cls_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: cleanName,
      stage: stageResolved === 'OUTRA' ? 'EFAI' : stageResolved,
      stageName: stageResolved === 'EI' ? 'Educação Infantil' : stageResolved === 'EFAI' ? 'Ensino Fundamental - Anos Iniciais' : stageResolved === 'EFAF' ? 'Ensino Fundamental - Anos Finais' : 'Ensino Médio',
      position: pos,
      active: active !== undefined ? Boolean(active) : true,
      order: maxOrder + 1,
      createdAt: new Date().toISOString(),
    };
    store.classes.push(newClass);
    saveData(store);
    res.status(201).json(newClass);
  });

  app.put('/api/classes/reorder', (req, res) => {
    const { classIds } = req.body;
    if (Array.isArray(classIds)) {
      classIds.forEach((id: string, index: number) => {
        const cls = store.classes.find((c) => c.id === id);
        if (cls) {
          cls.order = index + 1;
          cls.updatedAt = new Date().toISOString();
        }
      });
      store.classes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      saveData(store);
      return res.json(store.classes);
    }
    return res.status(400).json({ error: 'Lista de IDs inválida.' });
  });

  app.put('/api/classes/reset-order', (req, res) => {
    // Ordenar de acordo com a matriz pedagógica oficial (1..15)
    store.classes.sort((a, b) => {
      const posA = a.position ?? (getPedagogicalPosition(a.name) ?? 99);
      const posB = b.position ?? (getPedagogicalPosition(b.name) ?? 99);
      if (posA !== posB) return posA - posB;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
    store.classes.forEach((cls, idx) => {
      cls.order = idx + 1;
      cls.updatedAt = new Date().toISOString();
    });
    saveData(store);
    return res.json(store.classes);
  });

  app.put('/api/classes/:id', (req, res) => {
    const { id } = req.params;
    const { name, active, order, stage, position } = req.body;
    const cls = store.classes.find((c) => c.id === id);
    if (!cls) {
      return res.status(404).json({ error: 'Turma não encontrada.' });
    }
    if (name !== undefined) {
      const cleanName = String(name).trim();
      if (!cleanName) {
        return res.status(400).json({ error: 'O nome da turma não pode ficar vazio.' });
      }
      cls.name = cleanName;
    }
    if (active !== undefined) {
      cls.active = Boolean(active);
    }
    if (order !== undefined) {
      cls.order = Number(order);
    }
    if (stage !== undefined) {
      cls.stage = stage;
    }
    if (position !== undefined) {
      cls.position = Number(position);
    }
    cls.updatedAt = new Date().toISOString();
    saveData(store);
    res.json(cls);
  });

  app.delete('/api/classes/:id', (req, res) => {
    const { id } = req.params;
    const cls = store.classes.find((c) => c.id === id);
    if (!cls) {
      return res.status(404).json({ error: 'Turma não encontrada.' });
    }
    const hasRecords = store.records.some((r) => r.className === cls.name);
    if (hasRecords) {
      cls.active = false;
      cls.updatedAt = new Date().toISOString();
      saveData(store);
      return res.json({ success: true, deactivated: true, message: 'Turma desativada pois possui registros históricos vinculados.' });
    }
    store.classes = store.classes.filter((c) => c.id !== id);
    saveData(store);
    res.json({ success: true, deleted: true });
  });

  // Students Endpoints
  app.get('/api/students', (req, res) => {
    const query = (req.query.q as string || '').toLowerCase().trim();
    const type = req.query.personType as string;
    let list = store.students;
    if (type === 'collaborator') {
      list = list.filter((s) => s.personType === 'collaborator');
    } else if (type === 'student') {
      list = list.filter((s) => !s.personType || s.personType === 'student');
    }

    if (!query) {
      return res.json(list);
    }
    const filtered = list.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.enrollment.toLowerCase().includes(query)
    );
    res.json(filtered);
  });

  app.post('/api/students', (req, res) => {
    const { enrollment, name, personType } = req.body;
    const isCollaborator = personType === 'collaborator';
    const entityLabel = isCollaborator ? 'colaborador' : 'aluno';

    if (!enrollment || !name) {
      return res.status(400).json({ error: `Identificador/Matrícula e nome completo são obrigatórios para o ${entityLabel}.` });
    }

    const cleanEnrollment = String(enrollment).trim();
    if (!isCollaborator && !/^\d+$/.test(cleanEnrollment)) {
      return res.status(400).json({ error: 'A matrícula do aluno deve conter apenas números.' });
    }

    const cleanName = String(name).trim().toUpperCase();
    if (!cleanName) {
      return res.status(400).json({ error: 'O nome completo é obrigatório.' });
    }

    const exists = store.students.find(
      (s) => s.enrollment === cleanEnrollment
    );
    if (exists) {
      return res.status(400).json({ error: `Este identificador/matrícula (${cleanEnrollment}) já está cadastrado.` });
    }

    const newStudent: Student = {
      id: isCollaborator ? `collab_${Date.now()}_${Math.random().toString(36).substring(2, 6)}` : `std_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      enrollment: cleanEnrollment,
      name: cleanName,
      personType: isCollaborator ? 'collaborator' : 'student',
      createdAt: new Date().toISOString(),
    };

    store.students.push(newStudent);
    saveData(store);
    res.status(201).json(newStudent);
  });

  app.put('/api/students/:id', (req, res) => {
    const { id } = req.params;
    const { enrollment, name } = req.body;

    const student = store.students.find((s) => s.id === id);
    if (!student) {
      return res.status(404).json({ error: 'Registro não encontrado.' });
    }

    const isCollaborator = student.personType === 'collaborator';

    // Regra: Bloquear edição se possuir uma ou mais composições salvas da Linha do Tempo
    const hasSavedTimelines = store.timelines.some(
      (t) => t.studentId === id || (student.enrollment && t.studentEnrollment === student.enrollment)
    );

    if (hasSavedTimelines) {
      return res.status(400).json({
        error:
          'Não é possível editar este registro enquanto existirem composições salvas. Exclua as composições antes de editar.',
      });
    }

    if (enrollment !== undefined) {
      const cleanEnrollment = String(enrollment).trim();
      if (!isCollaborator && !/^\d+$/.test(cleanEnrollment)) {
        return res.status(400).json({ error: 'A matrícula deve conter apenas números.' });
      }
      const duplicate = store.students.find(
        (s) => s.id !== id && s.enrollment === cleanEnrollment
      );
      if (duplicate) {
        return res.status(400).json({ error: 'Este identificador/matrícula já está cadastrado.' });
      }
      student.enrollment = cleanEnrollment;
    }

    if (name !== undefined) {
      const cleanName = String(name).trim().toUpperCase();
      if (!cleanName) {
        return res.status(400).json({ error: 'O nome completo é obrigatório.' });
      }
      student.name = cleanName;
    }

    student.updatedAt = new Date().toISOString();
    saveData(store);
    res.json(student);
  });

  app.delete('/api/students/:id', (req, res) => {
    const { id } = req.params;
    store.students = store.students.filter((s) => s.id !== id);
    store.records = store.records.filter((r) => r.studentId !== id);
    store.timelines = store.timelines.filter((t) => t.studentId !== id);
    saveData(store);
    res.json({ success: true });
  });

  // Records Endpoints
  app.get('/api/records', (req, res) => {
    const studentId = req.query.studentId as string;
    if (studentId) {
      const studentRecords = store.records
        .filter((r) => r.studentId === studentId)
        .sort((a, b) => String(b.year).localeCompare(String(a.year)));
      return res.json(studentRecords);
    }
    res.json(store.records);
  });

  app.post('/api/records', (req, res) => {
    const { studentId, year, className, photoUrl, cropSettings, timelinePrimaryCrop, timelineSecondaryCrop, carometroCrop } = req.body;

    const student = store.students.find((s) => s.id === studentId || (req.body.enrollment && s.enrollment === req.body.enrollment));
    const isCollab = (student?.personType === 'collaborator') || (req.body.personType === 'collaborator');

    if (!studentId || !year) {
      return res.status(400).json({ error: isCollab ? 'Colaborador e período letivo são obrigatórios.' : 'Aluno e período letivo são obrigatórios.' });
    }

    if (!isCollab && !className) {
      return res.status(400).json({ error: 'A turma é obrigatória para a matrícula do aluno.' });
    }

    // Check if period is active
    const targetPeriod = store.periods.find((p) => String(p.name) === String(year) || p.id === String(year));
    if (targetPeriod && targetPeriod.active === false) {
      return res.status(400).json({
        error: `O período letivo ${year} está inativo e não aceita novos registros. Ative o período em Configurações → Períodos Letivos.`,
      });
    }

    const cleanClassName = isCollab ? '' : String(className || '').trim().toUpperCase();

    // Pedagogical Progression and Period Duplicate Validation
    const studentExistingRecords = store.records.filter((r) => r.studentId === (student ? student.id : studentId));

    if (isCollab) {
      const sameYear = studentExistingRecords.find((r) => String(r.year) === String(year));
      if (sameYear) {
        return res.status(400).json({
          error: `Este colaborador já possui registro confirmado no período letivo ${year}.`,
        });
      }
    } else {
      const progressionCheck = validateStudentProgression(
        year,
        cleanClassName,
        studentExistingRecords
      );

      if (!progressionCheck.isValid) {
        return res.status(400).json({
          error: progressionCheck.errorMessage || 'Progressão escolar inválida.',
        });
      }
    }

    const resolvedStudentId = student ? student.id : studentId;
    let cleanPhotoUrl = photoUrl || '';
    if (cleanPhotoUrl && isBase64Image(cleanPhotoUrl)) {
      cleanPhotoUrl = savePhotoFromBase64(cleanPhotoUrl, resolvedStudentId, String(year));
    }

    const newRecord: AcademicYearRecord = {
      id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      studentId: resolvedStudentId,
      year: String(year),
      className: cleanClassName,
      photoUrl: cleanPhotoUrl,
      cropSettings: cropSettings || timelinePrimaryCrop || { x: 50, y: 50, zoom: 1.0 },
      timelinePrimaryCrop: timelinePrimaryCrop || cropSettings,
      timelineSecondaryCrop: timelineSecondaryCrop,
      carometroCrop: carometroCrop
        ? {
            x: typeof carometroCrop.x === 'number' ? carometroCrop.x : 50,
            y: typeof carometroCrop.y === 'number' ? carometroCrop.y : 50,
            zoom: typeof carometroCrop.zoom === 'number' ? carometroCrop.zoom : 1.0,
            photoUrl: cleanPhotoUrl,
            updatedAt: new Date().toISOString(),
          }
        : undefined,
      createdAt: new Date().toISOString(),
    };

    // Regra: se ano/período da matrícula for INFERIOR ao período letivo atual (< período atual),
    // e o aluno possuir composição salva no período atual, invalida a composição atual.
    const currentActivePeriod = getActiveAcademicPeriod();
    let timelineRemoved = false;
    let message = isCollab ? 'Período do colaborador registrado com sucesso.' : 'Matrícula confirmada com sucesso.';

    if (!isCollab && currentActivePeriod) {
      const activePeriodYearNum = Number(currentActivePeriod.name);
      const targetYearNum = Number(year);

      if (targetYearNum < activePeriodYearNum) {
        const invalidation = invalidateCurrentTimelineComposition(student ? student.id : studentId, 'historical_enrollment_confirmed');
        if (invalidation.timelineRemoved) {
          timelineRemoved = true;
          message = invalidation.message!;
        }
      }
    }

    store.records.push(newRecord);
    saveData(store);
    res.status(201).json({
      ...newRecord,
      timelineRemoved,
      message,
    });
  });

  app.put('/api/records/:id/crops', (req, res) => {
    const { id } = req.params;
    const { timelinePrimaryCrop, timelineSecondaryCrop, carometroCrop, carometroCircularCrop } = req.body;

    const record = store.records.find((r) => r.id === id);
    if (!record) {
      return res.status(404).json({ error: 'Matrícula/Registro não encontrado.' });
    }

    // Regra: A alteração de crop só é permitida no período ativo
    const activePeriod = getActiveAcademicPeriod();
    if (!activePeriod || String(record.year) !== String(activePeriod.name)) {
      return res.status(403).json({
        error: 'Não é possível alterar o enquadramento de um período letivo anterior ou inativo.',
      });
    }

    if (isPeriodClosed(record.year)) {
      return res.status(403).json({
        error: `O período letivo ${record.year} está FECHADO e não permite alteração de enquadramento.`,
      });
    }

    if (!record.photoUrl || record.photoUrl.trim() === '') {
      return res.status(400).json({ error: 'A matrícula não possui fotografia cadastrada.' });
    }

    // Regra: se o período possuir composição salva para este aluno, o ajuste fica bloqueado.
    const hasSavedComposition = store.timelines.some(
      (t) => t.studentId === record.studentId && String(t.year) === String(record.year)
    );
    if (hasSavedComposition) {
      return res.status(403).json({
        error: 'Este período possui uma composição salva e não pode mais ter o enquadramento alterado.',
      });
    }

    if (timelinePrimaryCrop !== undefined) {
      if (timelinePrimaryCrop === null) {
        delete record.timelinePrimaryCrop;
      } else {
        record.timelinePrimaryCrop = {
          x: typeof timelinePrimaryCrop.x === 'number' ? timelinePrimaryCrop.x : 50,
          y: typeof timelinePrimaryCrop.y === 'number' ? timelinePrimaryCrop.y : 50,
          zoom: typeof timelinePrimaryCrop.zoom === 'number' ? timelinePrimaryCrop.zoom : 1.0,
        };
        record.cropSettings = { ...record.timelinePrimaryCrop };
      }
    }

    if (timelineSecondaryCrop !== undefined) {
      if (timelineSecondaryCrop === null) {
        delete record.timelineSecondaryCrop;
      } else {
        record.timelineSecondaryCrop = {
          x: typeof timelineSecondaryCrop.x === 'number' ? timelineSecondaryCrop.x : 50,
          y: typeof timelineSecondaryCrop.y === 'number' ? timelineSecondaryCrop.y : 50,
          zoom: typeof timelineSecondaryCrop.zoom === 'number' ? timelineSecondaryCrop.zoom : 1.0,
        };
      }
    }

    if (carometroCrop !== undefined) {
      if (carometroCrop === null) {
        delete record.carometroCrop;
      } else {
        record.carometroCrop = {
          x: typeof carometroCrop.x === 'number' ? carometroCrop.x : 50,
          y: typeof carometroCrop.y === 'number' ? carometroCrop.y : 50,
          zoom: typeof carometroCrop.zoom === 'number' ? carometroCrop.zoom : 1.0,
          photoUrl: record.photoUrl,
          updatedAt: new Date().toISOString(),
        };
      }
    }

    if (carometroCircularCrop !== undefined) {
      if (carometroCircularCrop === null) {
        delete record.carometroCircularCrop;
      } else {
        record.carometroCircularCrop = {
          x: typeof carometroCircularCrop.x === 'number' ? carometroCircularCrop.x : 50,
          y: typeof carometroCircularCrop.y === 'number' ? carometroCircularCrop.y : 50,
          zoom: typeof carometroCircularCrop.zoom === 'number' ? carometroCircularCrop.zoom : 1.0,
          photoUrl: record.photoUrl,
          updatedAt: new Date().toISOString(),
        };
      }
    }

    saveData(store);
    res.json(record);
  });

  app.put('/api/records/:id/photo', (req, res) => {
    const { id } = req.params;
    const { photoUrl, cropSettings, carometroCrop, carometroCircularCrop } = req.body;

    const record = store.records.find((r) => r.id === id);
    if (!record) {
      return res.status(404).json({ error: 'Matrícula/Registro não encontrado.' });
    }

    // Validação estrita: somente o período letivo atual permite alteração de fotografia
    const activePeriod = getActiveAcademicPeriod();
    if (!activePeriod || String(record.year) !== String(activePeriod.name)) {
      return res.status(403).json({
        error: 'Operação bloqueada: não é permitido alterar ou cadastrar fotografia de um período letivo anterior ou inativo.',
      });
    }

    if (isPeriodClosed(record.year)) {
      return res.status(403).json({
        error: `O período letivo ${record.year} está FECHADO e não permite alteração de fotografia.`,
      });
    }

    let timelineRemoved = false;
    let message = 'Fotografia salva com sucesso.';

    if (photoUrl !== undefined) {
      let newPhoto = String(photoUrl);
      if (isBase64Image(newPhoto)) {
        newPhoto = savePhotoFromBase64(newPhoto, record.studentId, record.year);
      }
      if (newPhoto !== record.photoUrl) {
        record.photoUrl = newPhoto;
        // Invalidação completa dos crops da foto anterior ao substituir ou remover
        delete record.autoFaceCrop;
        delete record.carometroCrop;
        delete record.carometroCircularCrop;
        delete record.timelinePrimaryCrop;
        delete record.timelineSecondaryCrop;
        record.cropSettings = { x: 50, y: 50, zoom: 1.0 };

        // Invalida composição do período letivo atual caso exista
        const invalidation = invalidateCurrentTimelineComposition(record.studentId, 'photo_changed');
        if (invalidation.timelineRemoved) {
          timelineRemoved = true;
          message = invalidation.message!;
        }
      }
    }
    if (cropSettings) {
      record.cropSettings = {
        x: typeof cropSettings.x === 'number' ? cropSettings.x : 50,
        y: typeof cropSettings.y === 'number' ? cropSettings.y : 50,
        zoom: typeof cropSettings.zoom === 'number' ? cropSettings.zoom : 1.0,
      };
    }
    if (carometroCrop) {
      record.carometroCrop = {
        x: typeof carometroCrop.x === 'number' ? carometroCrop.x : 50,
        y: typeof carometroCrop.y === 'number' ? carometroCrop.y : 50,
        zoom: typeof carometroCrop.zoom === 'number' ? carometroCrop.zoom : 1.0,
      };
    }
    if (carometroCircularCrop) {
      record.carometroCircularCrop = {
        x: typeof carometroCircularCrop.x === 'number' ? carometroCircularCrop.x : 50,
        y: typeof carometroCircularCrop.y === 'number' ? carometroCircularCrop.y : 50,
        zoom: typeof carometroCircularCrop.zoom === 'number' ? carometroCircularCrop.zoom : 1.0,
      };
    }

    saveData(store);
    res.json({
      ...record,
      timelineRemoved,
      message,
    });
  });

  app.put('/api/records/:id/carometro-crop', (req, res) => {
    const { id } = req.params;
    const { carometroCrop } = req.body;

    const record = store.records.find((r) => r.id === id);
    if (!record) {
      return res.status(404).json({ error: 'Matrícula/Registro não encontrado.' });
    }

    // Validate that record belongs to active academic period (editing without active period or previous periods is forbidden)
    const activePeriod = getActiveAcademicPeriod();
    if (!activePeriod || String(record.year) !== String(activePeriod.name)) {
      return res.status(403).json({
        error: 'Não é possível alterar o Carômetro sem um período letivo ativo ou de um período letivo anterior.',
      });
    }

    // 1. Validate primary photo existence
    if (!record.photoUrl || record.photoUrl.trim() === '') {
      return res.status(400).json({
        error: 'Operação bloqueada: o registro não possui foto principal cadastrada.',
      });
    }

    // 2. Validate saved Timeline composition existence (Rule 4, 5, 6, 7)
    const hasSavedTimeline = store.timelines.some(
      (t) => t.studentId === record.studentId && String(t.year) === String(record.year)
    );

    if (!hasSavedTimeline) {
      return res.status(403).json({
        error:
          'Operação bloqueada: o Carômetro só pode ser ajustado após a Linha do Tempo ter sido composta e salva.',
      });
    }

    if (carometroCrop) {
      record.carometroCrop = {
        x: typeof carometroCrop.x === 'number' ? carometroCrop.x : 50,
        y: typeof carometroCrop.y === 'number' ? carometroCrop.y : 50,
        zoom: typeof carometroCrop.zoom === 'number' ? carometroCrop.zoom : 1.0,
        photoUrl: record.photoUrl,
        updatedAt: new Date().toISOString(),
      };
    }

    saveData(store);
    res.json(record);
  });

  app.put('/api/records/:id/carometro-circular-crop', (req, res) => {
    const { id } = req.params;
    const { carometroCircularCrop } = req.body;

    const record = store.records.find((r) => r.id === id);
    if (!record) {
      return res.status(404).json({ error: 'Matrícula/Registro não encontrado.' });
    }

    const activePeriod = getActiveAcademicPeriod();
    if (!activePeriod || String(record.year) !== String(activePeriod.name)) {
      return res.status(403).json({
        error: 'Não é possível alterar o Carômetro sem um período letivo ativo ou de um período letivo anterior.',
      });
    }

    if (!record.photoUrl || record.photoUrl.trim() === '') {
      return res.status(400).json({
        error: 'Operação bloqueada: o colaborador não possui foto principal cadastrada.',
      });
    }

    const hasSavedTimeline = store.timelines.some(
      (t) => t.studentId === record.studentId && String(t.year) === String(record.year)
    );

    if (!hasSavedTimeline) {
      return res.status(403).json({
        error:
          'Operação bloqueada: o Carômetro Circular só pode ser ajustado após a Linha do Tempo ter sido composta e salva.',
      });
    }

    if (carometroCircularCrop) {
      record.carometroCircularCrop = {
        x: typeof carometroCircularCrop.x === 'number' ? carometroCircularCrop.x : 50,
        y: typeof carometroCircularCrop.y === 'number' ? carometroCircularCrop.y : 50,
        zoom: typeof carometroCircularCrop.zoom === 'number' ? carometroCircularCrop.zoom : 1.0,
        photoUrl: record.photoUrl,
        updatedAt: new Date().toISOString(),
      };
    }

    saveData(store);
    res.json(record);
  });

  app.put('/api/records/:id/auto-face-crop', (req, res) => {
    const { id } = req.params;
    const { autoFaceCrop } = req.body;

    const record = store.records.find((r) => r.id === id);
    if (!record) {
      return res.status(404).json({ error: 'Matrícula/Registro não encontrado.' });
    }

    // Validate that record belongs to active academic period
    const activePeriod = getActiveAcademicPeriod();
    if (!activePeriod || String(record.year) !== String(activePeriod.name)) {
      return res.status(403).json({
        error: 'Não é possível alterar o Carômetro sem um período letivo ativo ou de um período letivo anterior.',
      });
    }

    if (!record.photoUrl || record.photoUrl.trim() === '') {
      return res.status(400).json({
        error: 'Operação bloqueada: o aluno não possui foto principal cadastrada.',
      });
    }

    const hasSavedTimeline = store.timelines.some(
      (t) => t.studentId === record.studentId && String(t.year) === String(record.year)
    );

    if (!hasSavedTimeline) {
      return res.status(403).json({
        error:
          'Operação bloqueada: a identificação automática só pode ser executada após a Linha do Tempo ter sido salva.',
      });
    }

    if (autoFaceCrop) {
      record.autoFaceCrop = {
        x: typeof autoFaceCrop.x === 'number' ? autoFaceCrop.x : 50,
        y: typeof autoFaceCrop.y === 'number' ? autoFaceCrop.y : 50,
        zoom: typeof autoFaceCrop.zoom === 'number' ? autoFaceCrop.zoom : 1.0,
        photoUrl: record.photoUrl,
        detectedAt: new Date().toISOString(),
      };
    }

    saveData(store);
    res.json(record);
  });

  app.put('/api/carometro/batch-auto-face-crop', (req, res) => {
    const { updates } = req.body;
    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: 'Lista de atualizações inválida.' });
    }

    const activePeriod = getActiveAcademicPeriod();
    if (!activePeriod) {
      return res.status(400).json({
        error: 'Operação bloqueada: nenhum período letivo ativo configurado.',
      });
    }

    let updatedCount = 0;
    updates.forEach((item: { recordId: string; autoFaceCrop: any }) => {
      const record = store.records.find((r) => r.id === item.recordId);
      if (
        record &&
        item.autoFaceCrop &&
        record.photoUrl &&
        record.photoUrl.trim() !== '' &&
        String(record.year) === String(activePeriod.name)
      ) {
        const hasSavedTimeline = store.timelines.some(
          (t) => t.studentId === record.studentId && String(t.year) === String(record.year)
        );
        if (hasSavedTimeline) {
          record.autoFaceCrop = {
            x: typeof item.autoFaceCrop.x === 'number' ? item.autoFaceCrop.x : 50,
            y: typeof item.autoFaceCrop.y === 'number' ? item.autoFaceCrop.y : 50,
            zoom: typeof item.autoFaceCrop.zoom === 'number' ? item.autoFaceCrop.zoom : 1.0,
            photoUrl: record.photoUrl,
            detectedAt: new Date().toISOString(),
          };
          updatedCount++;
        }
      }
    });

    saveData(store);
    res.json({ success: true, updatedCount });
  });

  app.put('/api/carometro/batch-crop', (req, res) => {
    const { updates } = req.body;
    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: 'Lista de atualizações inválida.' });
    }

    const activePeriod = getActiveAcademicPeriod();
    if (!activePeriod) {
      return res.status(400).json({
        error: 'Operação bloqueada: nenhum período letivo ativo configurado.',
      });
    }

    let updatedCount = 0;
    let blockedCount = 0;
    updates.forEach((item: { recordId: string; carometroCrop: any }) => {
      const record = store.records.find((r) => r.id === item.recordId);
      if (
        record &&
        item.carometroCrop &&
        record.photoUrl &&
        String(record.year) === String(activePeriod.name)
      ) {
        const hasSavedTimeline = store.timelines.some(
          (t) => t.studentId === record.studentId && String(t.year) === String(record.year)
        );
        if (hasSavedTimeline) {
          record.carometroCrop = {
            x: typeof item.carometroCrop.x === 'number' ? item.carometroCrop.x : 50,
            y: typeof item.carometroCrop.y === 'number' ? item.carometroCrop.y : 50,
            zoom: typeof item.carometroCrop.zoom === 'number' ? item.carometroCrop.zoom : 1.0,
            photoUrl: record.photoUrl,
            updatedAt: new Date().toISOString(),
          };
          updatedCount++;
        } else {
          blockedCount++;
        }
      }
    });

    saveData(store);
    res.json({ success: true, updatedCount, blockedCount });
  });

  app.put('/api/records/:id', (req, res) => {
    const { id } = req.params;
    const { photoUrl, cropSettings, carometroCrop } = req.body;

    const record = store.records.find((r) => r.id === id);
    if (!record) {
      return res.status(404).json({ error: 'Registro não encontrado.' });
    }

    if (photoUrl !== undefined || cropSettings !== undefined || carometroCrop !== undefined) {
      const activePeriod = getActiveAcademicPeriod();
      if (!activePeriod || String(record.year) !== String(activePeriod.name)) {
        return res.status(403).json({
          error: 'Operação bloqueada: não é permitido alterar fotografia ou ajustes sem um período letivo ativo ou de um período letivo anterior.',
        });
      }
    }

    let timelineRemoved = false;
    let message = 'Registro atualizado com sucesso.';

    if (photoUrl !== undefined) {
      let newPhoto = String(photoUrl);
      if (isBase64Image(newPhoto)) {
        newPhoto = savePhotoFromBase64(newPhoto, record.studentId, record.year);
      }
      if (newPhoto !== record.photoUrl) {
        record.photoUrl = newPhoto;
        // Invalidação completa dos crops da foto anterior ao substituir ou remover
        delete record.autoFaceCrop;
        delete record.carometroCrop;
        delete record.timelinePrimaryCrop;
        delete record.timelineSecondaryCrop;
        record.cropSettings = { x: 50, y: 50, zoom: 1.0 };

        // Invalida composição do período letivo atual caso exista
        const invalidation = invalidateCurrentTimelineComposition(record.studentId, 'photo_changed');
        if (invalidation.timelineRemoved) {
          timelineRemoved = true;
          message = invalidation.message!;
        }
      }
    }
    if (cropSettings) {
      record.cropSettings = {
        x: typeof cropSettings.x === 'number' ? cropSettings.x : 50,
        y: typeof cropSettings.y === 'number' ? cropSettings.y : 50,
        zoom: typeof cropSettings.zoom === 'number' ? cropSettings.zoom : 1.0,
      };
    }
    if (carometroCrop) {
      record.carometroCrop = {
        x: typeof carometroCrop.x === 'number' ? carometroCrop.x : 50,
        y: typeof carometroCrop.y === 'number' ? carometroCrop.y : 50,
        zoom: typeof carometroCrop.zoom === 'number' ? carometroCrop.zoom : 1.0,
      };
    }

    saveData(store);
    res.json({
      ...record,
      timelineRemoved,
      message,
    });
  });

  app.delete('/api/records/:id', (req, res) => {
    const { id } = req.params;
    const targetRecord = store.records.find((r) => r.id === id);
    if (!targetRecord) {
      return res.status(404).json({ error: 'Registro de matrícula não encontrado.' });
    }

    const targetYear = String(targetRecord.year);
    const targetStudentId = targetRecord.studentId;
    const targetStudent = store.students.find((s) => s.id === targetStudentId);

    // 1. Remover composições da Linha do Tempo diretamente vinculadas a este aluno especificamente no mesmo período excluído
    // (Integridade referencial estrita: composições de quaisquer outros períodos são preservadas intactas)
    store.timelines = store.timelines.filter((t) => {
      const isSameStudent =
        t.studentId === targetStudentId ||
        (targetStudent?.enrollment && t.studentEnrollment === targetStudent.enrollment);
      const isSamePeriod = String(t.year) === targetYear;
      return !(isSameStudent && isSamePeriod);
    });

    // 2. Remover a matrícula do período (elimina matrícula, turma vinculada, fotografia do período e ajustes de Carômetro deste período)
    store.records = store.records.filter((r) => r.id !== id);

    saveData(store);
    res.json({
      success: true,
      message: `Matrícula e fotografia do período ${targetYear} excluídas com sucesso.`,
    });
  });

  // Confirm Period Handler
  app.post('/api/confirm-period', (req, res) => {
    const { year, enrollment, name, className, photoUrl, cropSettings } = req.body;

    if (!year || !className) {
      return res.status(400).json({ error: 'Período letivo e turma são obrigatórios.' });
    }

    // Check if period is active
    const targetPeriod = store.periods.find((p) => String(p.name) === String(year) || p.id === String(year));
    if (targetPeriod && targetPeriod.active === false) {
      return res.status(400).json({
        error: `O período letivo ${year} está inativo e não aceita novas matrículas. Ative o período em Configurações → Períodos Letivos.`,
      });
    }

    let student = store.students.find(
      (s) => s.enrollment === (enrollment || '').trim()
    );

    // Se a pessoa localizada for colaborador, rejeitar estritamente a operação no fluxo escolar
    if (student && (student.personType || 'student') === 'collaborator') {
      return res.status(400).json({
        error: 'Colaboradores não podem ser matriculados pelo fluxo de matrícula escolar.',
      });
    }

    if (!student) {
      if (!name || !enrollment) {
        return res.status(400).json({ error: 'Matrícula e nome completo são obrigatórios para novo aluno.' });
      }

      const cleanEnrollment = String(enrollment).trim();
      if (!/^\d+$/.test(cleanEnrollment)) {
        return res.status(400).json({ error: 'A matrícula deve conter apenas números.' });
      }

      const cleanName = String(name).trim().toUpperCase();

      student = {
        id: `std_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        enrollment: cleanEnrollment,
        name: cleanName,
        createdAt: new Date().toISOString(),
      };
      store.students.push(student);
    }

    const cleanClassName = String(className).trim().toUpperCase();

    // Pedagogical Progression and Period Duplicate Validation
    const isCollab = student.personType === 'collaborator' || req.body.personType === 'collaborator';
    const studentExistingRecords = store.records.filter((r) => r.studentId === student!.id);

    if (isCollab) {
      const sameYear = studentExistingRecords.find((r) => String(r.year) === String(year));
      if (sameYear) {
        return res.status(400).json({
          error: `Este colaborador já possui registro confirmado no período letivo ${year}.`,
        });
      }
    } else {
      const progressionCheck = validateStudentProgression(
        year,
        cleanClassName,
        studentExistingRecords
      );

      if (!progressionCheck.isValid) {
        return res.status(400).json({
          error: progressionCheck.errorMessage || 'Progressão escolar inválida.',
        });
      }
    }

    let cleanPhotoUrl = photoUrl || '';
    if (cleanPhotoUrl && isBase64Image(cleanPhotoUrl)) {
      cleanPhotoUrl = savePhotoFromBase64(cleanPhotoUrl, student.id, String(year));
    }

    const record: AcademicYearRecord = {
      id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      studentId: student.id,
      year: String(year),
      className: cleanClassName,
      photoUrl: cleanPhotoUrl,
      cropSettings: cropSettings || { x: 50, y: 50, zoom: 1.0 },
      createdAt: new Date().toISOString(),
    };

    // Regra: se ano/período da matrícula for INFERIOR ao período letivo atual (< período atual),
    // e o aluno possuir composição salva no período atual, invalida a composição atual.
    const currentActivePeriod = getActiveAcademicPeriod();
    let timelineRemoved = false;
    let message = 'Matrícula confirmada com sucesso.';

    if (currentActivePeriod) {
      const activePeriodYearNum = Number(currentActivePeriod.name);
      const targetYearNum = Number(year);

      if (targetYearNum < activePeriodYearNum) {
        const invalidation = invalidateCurrentTimelineComposition(student.id, 'historical_enrollment_confirmed');
        if (invalidation.timelineRemoved) {
          timelineRemoved = true;
          message = invalidation.message!;
        }
      }
    }

    store.records.push(record);
    saveData(store);

    res.json({
      student,
      record,
      timelineRemoved,
      message,
    });
  });

  // Batch Import Students & Academic Records (ETAPA B.28.12)
  app.post('/api/students/batch-import', (req, res) => {
    const { year, items } = req.body;

    if (!year) {
      return res.status(400).json({ error: 'O período letivo de destino é obrigatório.' });
    }

    const cleanYear = String(year).trim();
    if (!/^\d{4}$/.test(cleanYear)) {
      return res.status(400).json({ error: 'O período letivo deve conter exatamente 4 dígitos numéricos (ex: 2026).' });
    }

    const targetPeriod = store.periods.find((p) => String(p.name) === cleanYear || p.id === cleanYear);
    if (targetPeriod && targetPeriod.active === false) {
      return res.status(400).json({
        error: `O período letivo ${cleanYear} está inativo e não aceita novas matrículas. Ative o período em Configurações → Períodos Letivos.`,
      });
    }

    if (isPeriodClosed(cleanYear)) {
      return res.status(400).json({ error: `O período letivo ${cleanYear} está FECHADO e não aceita novas matrículas.` });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Nenhum registro para importar.' });
    }

    // Active classes lookup from canonical configured classes
    const activeClasses = store.classes.filter((c) => c.active !== false);

    let newStudentsCount = 0;
    let existingStudentsCount = 0;
    let newRecordsCount = 0;
    let alreadyEnrolledCount = 0;
    let errorsCount = 0;

    const results: Array<{
      enrollment: string;
      name: string;
      className: string;
      status: 'new_student' | 'new_record' | 'already_enrolled' | 'error';
      message?: string;
      studentId?: string;
      recordId?: string;
    }> = [];

    const newlyCreatedStudents: Student[] = [];
    const newlyCreatedRecords: AcademicYearRecord[] = [];

    // Track enrollments seen within this batch to prevent internal duplicates
    const seenBatchEnrollments = new Set<string>();

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const rawEnrollment = item.enrollment !== undefined ? String(item.enrollment).trim() : '';
      const rawName = item.name !== undefined ? String(item.name).trim().toUpperCase() : '';
      const rawClassName = item.className !== undefined ? String(item.className).trim() : '';

      // 1. Enrollment validations
      if (!rawEnrollment) {
        errorsCount++;
        results.push({
          enrollment: '',
          name: rawName,
          className: rawClassName,
          status: 'error',
          message: 'Matrícula não informada.',
        });
        continue;
      }

      if (!/^\d+$/.test(rawEnrollment)) {
        errorsCount++;
        results.push({
          enrollment: rawEnrollment,
          name: rawName,
          className: rawClassName,
          status: 'error',
          message: 'A matrícula deve conter apenas números (preservando o formato texto).',
        });
        continue;
      }

      // Check duplicate in same batch
      if (seenBatchEnrollments.has(rawEnrollment)) {
        errorsCount++;
        results.push({
          enrollment: rawEnrollment,
          name: rawName,
          className: rawClassName,
          status: 'error',
          message: 'Matrícula duplicada no mesmo arquivo de importação.',
        });
        continue;
      }
      seenBatchEnrollments.add(rawEnrollment);

      // 2. Name validation
      if (!rawName) {
        errorsCount++;
        results.push({
          enrollment: rawEnrollment,
          name: '',
          className: rawClassName,
          status: 'error',
          message: 'Nome completo do aluno não informado.',
        });
        continue;
      }

      // 3. Class validation
      if (!rawClassName) {
        errorsCount++;
        results.push({
          enrollment: rawEnrollment,
          name: rawName,
          className: '',
          status: 'error',
          message: 'Turma não informada.',
        });
        continue;
      }

      // Verify class exists and is ACTIVE
      const matchedClass = activeClasses.find((c) => {
        if (c.active === false) return false;
        const cNorm = c.name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const rNorm = rawClassName.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return cNorm === rNorm || c.name.trim().toLowerCase() === rawClassName.trim().toLowerCase() || c.id === rawClassName;
      });

      if (!matchedClass) {
        errorsCount++;
        results.push({
          enrollment: rawEnrollment,
          name: rawName,
          className: rawClassName,
          status: 'error',
          message: 'Turma não encontrada ou inativa no sistema.',
        });
        continue;
      }

      const canonicalClassName = matchedClass.name;

      // 4. Student lookup (strict string match)
      let student = store.students.find((s) => s.enrollment === rawEnrollment);
      let isNewStudent = false;

      if (!student) {
        // Create student
        student = {
          id: `std_${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${index}`,
          enrollment: rawEnrollment,
          name: rawName,
          createdAt: new Date().toISOString(),
        };
        store.students.push(student);
        newlyCreatedStudents.push(student);
        newStudentsCount++;
        isNewStudent = true;
      } else {
        existingStudentsCount++;
      }

      // 5. Record lookup & progression check
      const studentRecords = store.records.filter((r) => r.studentId === student!.id);
      const existingInTargetYear = studentRecords.find((r) => String(r.year) === cleanYear);

      if (existingInTargetYear) {
        alreadyEnrolledCount++;
        results.push({
          enrollment: rawEnrollment,
          name: student.name,
          className: existingInTargetYear.className,
          status: 'already_enrolled',
          message: `Aluno já matriculado em ${cleanYear} na turma ${existingInTargetYear.className}.`,
          studentId: student.id,
          recordId: existingInTargetYear.id,
        });
        continue;
      }

      // Validate progression
      const progressionCheck = validateStudentProgression(
        cleanYear,
        canonicalClassName,
        studentRecords
      );

      if (!progressionCheck.isValid) {
        errorsCount++;
        results.push({
          enrollment: rawEnrollment,
          name: student.name,
          className: canonicalClassName,
          status: 'error',
          message: progressionCheck.errorMessage || 'Progressão pedagógica inválida.',
          studentId: student.id,
        });
        continue;
      }

      // Create Record (Photo: Pendente)
      const newRecord: AcademicYearRecord = {
        id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${index}`,
        studentId: student.id,
        year: cleanYear,
        className: canonicalClassName,
        photoUrl: '', // Foto: Pendente
        cropSettings: { x: 50, y: 50, zoom: 1.0 },
        createdAt: new Date().toISOString(),
      };

      // Se ano/período da matrícula for inferior ao período letivo atual, invalida composição atual se existir
      const currentActivePeriod = getActiveAcademicPeriod();
      if (currentActivePeriod) {
        const activePeriodYearNum = Number(currentActivePeriod.name);
        const cleanYearNum = Number(cleanYear);
        if (cleanYearNum < activePeriodYearNum) {
          invalidateCurrentTimelineComposition(student.id, 'historical_enrollment_confirmed');
        }
      }

      store.records.push(newRecord);
      newlyCreatedRecords.push(newRecord);
      newRecordsCount++;

      results.push({
        enrollment: rawEnrollment,
        name: student.name,
        className: canonicalClassName,
        status: isNewStudent ? 'new_student' : 'new_record',
        message: isNewStudent
          ? 'Novo aluno cadastrado e matriculado com sucesso.'
          : 'Nova matrícula confirmada para aluno existente.',
        studentId: student.id,
        recordId: newRecord.id,
      });
    }

    // Atomic persistence of batch
    saveData(store);

    res.json({
      success: true,
      totalProcessed: items.length,
      newStudentsCount,
      existingStudentsCount,
      newRecordsCount,
      alreadyEnrolledCount,
      errorsCount,
      results,
    });
  });

  // Batch Import Collaborators (Cadastro em Lote sem criação de turmas ou registros automáticos)
  app.post('/api/collaborators/batch-import', (req, res) => {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Nenhum colaborador para importar.' });
    }

    let newCount = 0;
    let alreadyExistsCount = 0;
    let errorsCount = 0;

    const results: Array<{
      enrollment: string;
      name: string;
      status: 'new_collaborator' | 'already_exists' | 'error';
      message?: string;
      collaboratorId?: string;
    }> = [];

    const newlyCreated: Student[] = [];
    const seenBatchEnrollments = new Set<string>();

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const rawEnrollment = item.enrollment !== undefined ? String(item.enrollment).trim() : '';
      const rawName = item.name !== undefined ? String(item.name).trim().toUpperCase() : '';

      if (!rawEnrollment) {
        errorsCount++;
        results.push({
          enrollment: '',
          name: rawName,
          status: 'error',
          message: 'Matrícula/Código do colaborador não informado.',
        });
        continue;
      }

      if (seenBatchEnrollments.has(rawEnrollment)) {
        errorsCount++;
        results.push({
          enrollment: rawEnrollment,
          name: rawName,
          status: 'error',
          message: 'Matrícula/Código repetido no mesmo arquivo de importação.',
        });
        continue;
      }
      seenBatchEnrollments.add(rawEnrollment);

      if (!rawName) {
        errorsCount++;
        results.push({
          enrollment: rawEnrollment,
          name: '',
          status: 'error',
          message: 'Nome completo do colaborador não informado.',
        });
        continue;
      }

      // Check if person already exists in store.students
      const existingPerson = store.students.find((s) => s.enrollment === rawEnrollment);
      if (existingPerson) {
        alreadyExistsCount++;
        results.push({
          enrollment: rawEnrollment,
          name: existingPerson.name,
          status: 'already_exists',
          message: `Identificador já cadastrado no sistema (${existingPerson.personType === 'collaborator' ? 'Colaborador' : 'Aluno'}). Ignorado para evitar duplicidade.`,
          collaboratorId: existingPerson.id,
        });
        continue;
      }

      // Create new collaborator
      const newCollaborator: Student = {
        id: `collab_${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${index}`,
        enrollment: rawEnrollment,
        name: rawName,
        personType: 'collaborator',
        createdAt: new Date().toISOString(),
      };

      store.students.push(newCollaborator);
      newlyCreated.push(newCollaborator);
      newCount++;

      results.push({
        enrollment: rawEnrollment,
        name: rawName,
        status: 'new_collaborator',
        message: 'Colaborador cadastrado com sucesso.',
        collaboratorId: newCollaborator.id,
      });
    }

    // Atomic persistence
    saveData(store);

    res.json({
      success: true,
      totalProcessed: items.length,
      newCount,
      alreadyExistsCount,
      errorsCount,
      results,
      newlyCreated,
    });
  });

  // Single Layout Model Endpoint
  app.get('/api/models', (req, res) => {
    res.json(store.models);
  });

  app.put('/api/models/:id', (req, res) => {
    const { id } = req.params;
    let index = store.models.findIndex((m) => m.id === id);
    if (index === -1) {
      index = 0;
    }

    const updatedModel: LayoutModel = {
      ...store.models[index],
      ...req.body,
      updatedAt: new Date().toISOString(),
    };

    store.models[index] = updatedModel;
    saveData(store);
    res.json(updatedModel);
  });

  // Helper to hydrate photo items from stored records
  function hydrateTimelinePhotoItems(
    studentId: string,
    photoItems: any[],
    targetCompositionYear?: string | number
  ): TimelinePhotoItem[] {
    if (!Array.isArray(photoItems) || photoItems.length === 0) {
      throw new Error('A composição precisa conter ao menos uma fotografia.');
    }

    const seenRecordIds = new Set<string>();
    const compYearNum =
      targetCompositionYear !== undefined && targetCompositionYear !== null && String(targetCompositionYear).trim() !== ''
        ? Number(targetCompositionYear)
        : null;

    const hydrated: TimelinePhotoItem[] = photoItems.map((item: any, idx: number) => {
      // 1. Identify student record securely
      let record = null;
      if (item.recordId) {
        record = store.records.find((r) => r.id === item.recordId);
      }
      if (!record && item.year) {
        record = store.records.find(
          (r) => r.studentId === studentId && String(r.year) === String(item.year)
        );
      }

      if (!record) {
        const periodLabel = item.year ? `do período ${item.year}` : `posição ${idx}`;
        throw new Error(`Registro escolar ${periodLabel} não encontrado.`);
      }

      // Requisito 9: Garantir que o registro pertence exatamente ao aluno da composição
      if (record.studentId !== studentId) {
        throw new Error(
          `Violação de segurança: o registro escolar informado (${record.year}) não pertence ao aluno da composição.`
        );
      }

      // Requisito 7 & 8: Validar corte temporal em relação ao período-alvo da composição
      const recordYearNum = Number(record.year);
      if (compYearNum !== null && !isNaN(compYearNum) && !isNaN(recordYearNum)) {
        if (recordYearNum > compYearNum) {
          throw new Error(
            `Composição inválida: a fotografia do período ${record.year} não pode pertencer a uma composição do período ${targetCompositionYear}.`
          );
        }
      }

      // Validação estrita: Não permitir recordId duplicado dentro da composição
      const recId = record.id;
      if (seenRecordIds.has(recId)) {
        throw new Error(
          `Erro de composição: registro duplicado detectado (${record.year} - ID ${recId}). O mesmo período escolar não pode ser utilizado mais de uma vez.`
        );
      }
      seenRecordIds.add(recId);

      // 2. Resolve photoUrl exclusivamente do seu próprio registro (ou do request se explicitamente fornecido)
      let photoUrl =
        typeof item.photoUrl === 'string' && item.photoUrl.trim().length > 0
          ? item.photoUrl
          : record.photoUrl || '';

      if (!photoUrl || photoUrl.trim().length === 0) {
        const periodLabel = item.year ? `do período ${item.year}` : '';
        throw new Error(`A fotografia ${periodLabel} não foi encontrada no registro.`);
      }

      if (isBase64Image(photoUrl)) {
        photoUrl = savePhotoFromBase64(photoUrl, studentId, String(record.year || item.year));
      }

      const isPrimary = typeof item.isPrimary === 'boolean' ? item.isPrimary : idx === 0;

      return {
        recordId: record.id,
        year: record.year || item.year,
        className: record.className || item.className || '',
        photoUrl: photoUrl,
        cropSettings: item.cropSettings || record.cropSettings || { x: 50, y: 50, zoom: 1.0 },
        isPrimary: isPrimary,
        ...(item.positionOverride ? { positionOverride: item.positionOverride } : {}),
      };
    });

    // Validar que exatamente 1 item é principal
    const primaryItems = hydrated.filter((p) => p.isPrimary);
    if (primaryItems.length === 0 && hydrated.length > 0) {
      hydrated[0].isPrimary = true;
    } else if (primaryItems.length > 1) {
      throw new Error('Erro de composição: existe mais de uma fotografia marcada como principal.');
    }

    // Requisito 7: Validações de papel Principal e Secundária em relação ao período-alvo
    if (compYearNum !== null && !isNaN(compYearNum)) {
      const targetYearItem = hydrated.find((p) => Number(p.year) === compYearNum);
      if (targetYearItem && !targetYearItem.isPrimary) {
        throw new Error(
          `Composição inválida: a fotografia do período-alvo (${targetCompositionYear}) deve ser configurada como Principal.`
        );
      }
      // Secundárias devem ter ano estritamente menor que o período-alvo
      const invalidSecondary = hydrated.find((p) => !p.isPrimary && Number(p.year) >= compYearNum);
      if (invalidSecondary) {
        throw new Error(
          `Composição inválida: fotografias secundárias devem pertencer estritamente a períodos anteriores ao período-alvo (${targetCompositionYear}).`
        );
      }
    }

    // Registro leve no console durante desenvolvimento (apenas metadados, nunca Base64)
    console.info(
      '[Linha do Tempo - Backend Hydration]',
      hydrated.map((h) => ({ recordId: h.recordId, year: h.year, isPrimary: h.isPrimary }))
    );

    return hydrated;
  }

  // Saved Compositions Endpoints
  app.get('/api/timelines', (req, res) => {
    const studentId = req.query.studentId as string;
    let filtered = store.timelines;
    if (studentId) {
      filtered = filtered.filter((t) => t.studentId === studentId);
    }
    res.json(filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
  });

  app.post('/api/timelines', (req, res) => {
    const timelineData = req.body;

    if (!timelineData || !timelineData.studentId) {
      return res.status(400).json({ error: 'Dados do aluno inválidos para salvar a composição.' });
    }

    const student = store.students.find((s) => s.id === timelineData.studentId);
    if (!student) {
      return res.status(400).json({ error: 'Aluno não encontrado.' });
    }

    // Reject composition creation/alteration for previous academic periods
    const currentActivePeriod = getActiveAcademicPeriod();
    if (currentActivePeriod && timelineData.year && String(timelineData.year) !== String(currentActivePeriod.name)) {
      return res.status(403).json({
        error: 'Não é possível alterar uma composição de um período letivo anterior.',
      });
    }

    // Hydrate photoItems from store.records com validação estrita de segurança e corte temporal
    let hydratedPhotoItems: TimelinePhotoItem[];
    try {
      hydratedPhotoItems = hydrateTimelinePhotoItems(
        timelineData.studentId,
        timelineData.photoItems,
        timelineData.year
      );
    } catch (err: any) {
      return res.status(400).json({
        error: err?.message || 'Erro ao validar fotografias da composição.',
      });
    }

    // Check if composition already exists for this student and reference year
    const existingIdx = store.timelines.findIndex(
      (t) => t.studentId === timelineData.studentId && String(t.year) === String(timelineData.year)
    );

    // Update record crops based on role in composition (Test 6: role-based crop update)
    for (const item of hydratedPhotoItems) {
      const targetRecord = store.records.find((r) => r.id === item.recordId);
      if (targetRecord && item.cropSettings) {
        if (item.isPrimary) {
          targetRecord.timelinePrimaryCrop = {
            x: typeof item.cropSettings.x === 'number' ? item.cropSettings.x : 50,
            y: typeof item.cropSettings.y === 'number' ? item.cropSettings.y : 50,
            zoom: typeof item.cropSettings.zoom === 'number' ? item.cropSettings.zoom : 1.0,
          };
          targetRecord.cropSettings = { ...targetRecord.timelinePrimaryCrop };
        } else {
          targetRecord.timelineSecondaryCrop = {
            x: typeof item.cropSettings.x === 'number' ? item.cropSettings.x : 50,
            y: typeof item.cropSettings.y === 'number' ? item.cropSettings.y : 50,
            zoom: typeof item.cropSettings.zoom === 'number' ? item.cropSettings.zoom : 1.0,
          };
        }
      }
    }

    if (existingIdx !== -1) {
      const updated: SavedComposition = {
        ...store.timelines[existingIdx],
        ...timelineData,
        personType: student.personType || 'student',
        photoItems: hydratedPhotoItems,
        updatedAt: new Date().toISOString(),
      };
      store.timelines[existingIdx] = updated;
      saveData(store);
      return res.json(updated);
    }

    const newTimeline: SavedComposition = {
      ...timelineData,
      personType: student.personType || 'student',
      photoItems: hydratedPhotoItems,
      id: `gt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    store.timelines.push(newTimeline);
    saveData(store);
    res.status(201).json(newTimeline);
  });

  app.put('/api/timelines/:id', (req, res) => {
    const { id } = req.params;
    const existingIdx = store.timelines.findIndex((t) => t.id === id);

    if (existingIdx === -1) {
      return res.status(404).json({ error: 'Composição não encontrada.' });
    }

    const currentTimeline = store.timelines[existingIdx];
    const currentActivePeriod = getActiveAcademicPeriod();
    if (currentActivePeriod && currentTimeline.year && String(currentTimeline.year) !== String(currentActivePeriod.name)) {
      return res.status(403).json({
        error: 'Não é possível alterar uma composição de um período letivo anterior.',
      });
    }

    // Hydrate photoItems if present in update body
    let hydratedPhotoItems = currentTimeline.photoItems;
    if (req.body.photoItems) {
      try {
        hydratedPhotoItems = hydrateTimelinePhotoItems(
          currentTimeline.studentId,
          req.body.photoItems,
          currentTimeline.year
        );
      } catch (err: any) {
        return res.status(400).json({
          error: err?.message || 'Erro ao validar fotografias da composição.',
        });
      }
    }

    // Update record crops based on role in composition
    if (hydratedPhotoItems) {
      for (const item of hydratedPhotoItems) {
        const targetRecord = store.records.find((r) => r.id === item.recordId);
        if (targetRecord && item.cropSettings) {
          if (item.isPrimary) {
            targetRecord.timelinePrimaryCrop = {
              x: typeof item.cropSettings.x === 'number' ? item.cropSettings.x : 50,
              y: typeof item.cropSettings.y === 'number' ? item.cropSettings.y : 50,
              zoom: typeof item.cropSettings.zoom === 'number' ? item.cropSettings.zoom : 1.0,
            };
            targetRecord.cropSettings = { ...targetRecord.timelinePrimaryCrop };
          } else {
            targetRecord.timelineSecondaryCrop = {
              x: typeof item.cropSettings.x === 'number' ? item.cropSettings.x : 50,
              y: typeof item.cropSettings.y === 'number' ? item.cropSettings.y : 50,
              zoom: typeof item.cropSettings.zoom === 'number' ? item.cropSettings.zoom : 1.0,
            };
          }
        }
      }
    }

    const updated: SavedComposition = {
      ...store.timelines[existingIdx],
      ...req.body,
      photoItems: hydratedPhotoItems,
      updatedAt: new Date().toISOString(),
    };

    store.timelines[existingIdx] = updated;
    saveData(store);
    res.json(updated);
  });

  app.delete('/api/timelines/:id', (req, res) => {
    const { id } = req.params;
    const targetTimeline = store.timelines.find((t) => t.id === id);
    if (!targetTimeline) {
      return res.status(404).json({ error: 'Composição não encontrada.' });
    }

    const currentActivePeriod = getActiveAcademicPeriod();
    if (currentActivePeriod && String(targetTimeline.year) !== String(currentActivePeriod.name)) {
      return res.status(403).json({
        error: 'Não é possível excluir uma composição de período letivo anterior.',
      });
    }

    store.timelines = store.timelines.filter((t) => t.id !== id);
    saveData(store);
    res.json({ success: true });
  });

  // ==================================================
  // B.24 — BACKUP E RESTAURAÇÃO DE DADOS (ENDPOINTS)
  // ==================================================

  // Listar todos os backups
  app.get('/api/backups', (req, res) => {
    try {
      const list = listBackups();
      res.json(list);
    } catch (err: any) {
      console.error('Erro ao listar backups:', err);
      res.status(500).json({ error: 'Erro ao listar histórico de backups.' });
    }
  });

  // Criar novo backup manual ou automático
  app.post('/api/backups', async (req, res) => {
    const { backupType, reason } = req.body || {};
    try {
      const newBackup = await createBackup(
        store,
        (backupType as BackupType) || 'manual',
        reason || 'Backup manual'
      );
      res.status(201).json(newBackup);
    } catch (err: any) {
      console.error('Erro ao criar backup:', err);
      res.status(500).json({
        error: `Falha ao gerar backup: ${err?.message || 'erro interno do servidor.'}`,
      });
    }
  });

  // Download do arquivo de backup (.zip)
  app.get('/api/backups/:id/download', (req, res) => {
    const { id } = req.params;
    const filePath = getBackupFilePath(id);

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Arquivo de backup não encontrado no servidor.' });
    }

    const filename = path.basename(filePath);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.download(filePath, filename);
  });

  // Validar pacote de backup sem aplicar
  app.post('/api/backups/validate', async (req, res) => {
    const { backupId, zipBase64 } = req.body || {};
    try {
      let zipBuffer: Buffer;
      if (backupId) {
        const filePath = getBackupFilePath(backupId);
        if (!filePath || !fs.existsSync(filePath)) {
          return res.status(404).json({ error: 'Arquivo de backup não encontrado no servidor.' });
        }
        zipBuffer = fs.readFileSync(filePath);
      } else if (zipBase64) {
        zipBuffer = Buffer.from(zipBase64, 'base64');
      } else {
        return res.status(400).json({ error: 'Nenhum backup fornecido para validação.' });
      }

      const validation = await validateBackupZip(zipBuffer);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error || 'Backup inválido ou corrompido.' });
      }

      res.json({
        valid: true,
        manifest: validation.manifest,
        counts: validation.manifest?.counts,
      });
    } catch (err: any) {
      console.error('Erro na validação do backup:', err);
      res.status(500).json({ error: err?.message || 'Erro ao validar pacote de backup.' });
    }
  });

  // Restaurar Backup com Backup Automático de Segurança Prévio
  app.post('/api/backups/restore', async (req, res) => {
    const { backupId, zipBase64 } = req.body || {};

    // 1. BACKUP AUTOMÁTICO OBRIGATÓRIO DO ESTADO ATUAL (PRÉ-RESTAURAÇÃO)
    let safetyBackup: any = null;
    try {
      safetyBackup = await createBackup(
        store,
        'pre_restore',
        'Backup automático de segurança do estado atual antes da restauração'
      );
    } catch (err: any) {
      console.error('Falha no backup de segurança pré-restauração:', err);
      return res.status(500).json({
        error: `Falha crítica de segurança: não foi possível gerar o backup do estado atual antes da restauração (${err?.message || 'erro interno'}). A restauração foi cancelada para proteger os dados.`,
      });
    }

    // 2. OBTER E VALIDAR O PACOTE DE BACKUP ALVO
    try {
      let targetZipBuffer: Buffer;
      if (backupId) {
        const filePath = getBackupFilePath(backupId);
        if (!filePath || !fs.existsSync(filePath)) {
          return res.status(404).json({
            error: `Arquivo de backup (${backupId}) não encontrado no servidor. O estado atual está protegido pelo backup de segurança ${safetyBackup.filename}.`,
          });
        }
        targetZipBuffer = fs.readFileSync(filePath);
      } else if (zipBase64) {
        targetZipBuffer = Buffer.from(zipBase64, 'base64');
      } else {
        return res.status(400).json({
          error: 'Nenhum backup especificado para restauração. O estado atual foi mantido.',
        });
      }

      const validation = await validateBackupZip(targetZipBuffer);
      if (!validation.valid || !validation.storeData) {
        return res.status(400).json({
          error: `Falha na validação do backup: ${validation.error || 'dados inconsistentes'}. Os dados atuais não foram modificados e estão preservados no backup ${safetyBackup.filename}.`,
        });
      }

      // 3. RESTAURAÇÃO INTEGRAL E PRESERVAÇÃO FIEL DO ESTADO DO BACKUP
      const rawStore = validation.storeData;

      if (!Array.isArray(rawStore.classes) || !Array.isArray(rawStore.models)) {
        return res.status(400).json({
          error: `Falha na validação de integridade: o backup não contém as coleções estruturais de turmas (classes) ou modelos (models). O armazenamento atual foi mantido sem alterações.`,
        });
      }

      // Unpack any physical photos bundled into the backup
      await extractPhotosFromBackupZip(targetZipBuffer);

      const photoHistorySlots =
        typeof rawStore.config?.photoHistorySlots === 'number' && rawStore.config.photoHistorySlots >= 0
          ? rawStore.config.photoHistorySlots
          : 10;

      const restoredPeriods = Array.isArray(rawStore.periods)
        ? rawStore.periods.map((p) => ({
            ...p,
            status: p.status || 'in_production',
            closedAt: p.closedAt,
            closedBy: p.closedBy,
          }))
        : [];

      const restoredStore: LocalStorageData = {
        config: {
          schoolName: rawStore.config?.schoolName || '',
          schoolLogo: rawStore.config?.schoolLogo || '',
          photoHistorySlots,
        },
        periods: restoredPeriods,
        classes: rawStore.classes,
        students: Array.isArray(rawStore.students) ? rawStore.students : [],
        records: Array.isArray(rawStore.records) ? rawStore.records : [],
        models: rawStore.models,
        timelines: Array.isArray(rawStore.timelines) ? rawStore.timelines : [],
      };

      // Ensure any legacy Base64 photos in restored data are safely written to disk
      migrateBase64PhotosInStore(restoredStore);

      // 4. PERSISTIR E ATUALIZAR STORE EM MEMÓRIA
      saveData(restoredStore);
      store = restoredStore;

      res.json({
        success: true,
        restoredAt: new Date().toISOString(),
        safetyBackupId: safetyBackup.id,
        safetyBackupFilename: safetyBackup.filename,
        manifest: validation.manifest,
        restoredCounts: {
          students: restoredStore.students.length,
          records: restoredStore.records.length,
          periods: restoredStore.periods.length,
          timelines: restoredStore.timelines.length,
          closedYears: restoredStore.periods.filter((p) => p.status === 'closed').length,
        },
      });
    } catch (restoreErr: any) {
      console.error('Erro durante o processo de restauração:', restoreErr);
      res.status(500).json({
        error: `Erro durante a restauração: ${restoreErr?.message || 'falha desconhecida'}. O backup de segurança pré-restauração está disponível em ${safetyBackup.filename}.`,
      });
    }
  });

  // Excluir backup do histórico
  app.delete('/api/backups/:id', (req, res) => {
    const { id } = req.params;
    const ok = deleteBackup(id);
    if (!ok) {
      return res.status(404).json({ error: 'Backup não encontrado ou não pôde ser excluído.' });
    }
    res.json({ success: true });
  });

  // Limpeza Seletiva Segura de Dados do Sistema (Minha Conta -> Manutenção do Sistema)
  app.post('/api/maintenance/clear-production-data', async (req, res) => {
    try {
      if (req.body?.confirmation !== 'LIMPAR PRODUÇÃO') {
        return res.status(400).json({
          error: 'Confirmação textual obrigatória ausente ou incorreta. Digite exatamente "LIMPAR PRODUÇÃO" para autorizar a operação.',
        });
      }

      const ALLOWED_CATEGORIES = new Set([
        'students',
        'collaborators',
        'records',
        'photos',
        'timelines',
        'carometro',
        'crops',
        'classes',
        'periods',
        'school_data',
        'models',
      ]);

      const requestedCategories: string[] = Array.isArray(req.body?.categories)
        ? req.body.categories.filter((c: string) => ALLOWED_CATEGORIES.has(c))
        : [];

      if (requestedCategories.length === 0) {
        return res.status(400).json({
          error: 'Nenhuma categoria válida foi selecionada para limpeza.',
        });
      }

      // Validações de Integridade Relacional Específicas e Cirúrgicas:

      // 1. ALUNOS selecionados sem MATRÍCULAS
      // Verificar se existem matrículas que realmente pertencem aos alunos que seriam removidos
      if (requestedCategories.includes('students') && !requestedCategories.includes('records')) {
        const studentIds = new Set((store.students || []).filter((s) => s.personType !== 'collaborator').map((s) => s.id));
        const dependentRecords = (store.records || []).filter(
          (r) => r.studentId && studentIds.has(r.studentId)
        );
        if (dependentRecords.length > 0) {
          return res.status(400).json({
            error: `Operação bloqueada por integridade: não é permitido excluir os Alunos selecionados porque existem ${dependentRecords.length} matrícula(s) vinculadas a esses alunos. Selecione também a categoria "Matrículas" ou cancele a operação.`,
          });
        }
      }

      // 1b. COLABORADORES selecionados sem MATRÍCULAS / REGISTROS
      if (requestedCategories.includes('collaborators') && !requestedCategories.includes('records')) {
        const collabIds = new Set((store.students || []).filter((s) => s.personType === 'collaborator').map((s) => s.id));
        const dependentRecords = (store.records || []).filter(
          (r) => r.studentId && collabIds.has(r.studentId)
        );
        if (dependentRecords.length > 0) {
          return res.status(400).json({
            error: `Operação bloqueada por integridade: não é permitido excluir os Colaboradores selecionados porque existem ${dependentRecords.length} registro(s) de períodos vinculados a esses colaboradores. Selecione também a categoria "Matrículas" ou cancele a operação.`,
          });
        }
      }

      // 2. ALUNOS selecionados sem PRODUÇÕES DA LINHA DO TEMPO
      // Verificar se existem composições da Linha do Tempo vinculadas aos alunos que seriam removidos
      if (requestedCategories.includes('students') && !requestedCategories.includes('timelines')) {
        const studentIds = new Set((store.students || []).filter((s) => s.personType !== 'collaborator').map((s) => s.id));
        const dependentTimelines = (store.timelines || []).filter(
          (t) => t.studentId && studentIds.has(t.studentId)
        );
        if (dependentTimelines.length > 0) {
          return res.status(400).json({
            error: `Operação bloqueada por integridade: não é permitido excluir os Alunos selecionados porque existem ${dependentTimelines.length} composição(ões) da Linha do Tempo vinculadas a esses alunos. Selecione também a categoria "Produções da Linha do Tempo" ou cancele a operação.`,
          });
        }
      }

      // 2b. COLABORADORES selecionados sem PRODUÇÕES DA LINHA DO TEMPO
      // Verificar se existem composições da Linha do Tempo vinculadas aos colaboradores que seriam removidos
      if (requestedCategories.includes('collaborators') && !requestedCategories.includes('timelines')) {
        const collabIds = new Set((store.students || []).filter((s) => s.personType === 'collaborator').map((s) => s.id));
        const dependentTimelines = (store.timelines || []).filter(
          (t) => t.studentId && collabIds.has(t.studentId)
        );
        if (dependentTimelines.length > 0) {
          return res.status(400).json({
            error: `Operação bloqueada por integridade: não é permitido excluir os Colaboradores selecionados porque existem ${dependentTimelines.length} composição(ões) da Linha do Tempo vinculadas a esses colaboradores. Selecione também a categoria "Produções da Linha do Tempo" ou cancele a operação.`,
          });
        }
      }

      // 3. TURMAS selecionadas sem MATRÍCULAS
      // Verificar se existem matrículas que realmente pertencem às turmas que seriam removidas
      if (requestedCategories.includes('classes') && !requestedCategories.includes('records')) {
        const classNames = new Set((store.classes || []).map((c) => c.name.trim().toUpperCase()));
        const dependentRecords = (store.records || []).filter((r) => {
          if (!r.className) return false;
          const cleanName = r.className.trim().toUpperCase();
          return classNames.has(cleanName);
        });
        if (dependentRecords.length > 0) {
          return res.status(400).json({
            error: `Operação bloqueada por integridade: não é permitido excluir as Turmas selecionadas porque existem ${dependentRecords.length} matrícula(s) vinculadas a essas turmas. Selecione também a categoria "Matrículas" ou cancele a operação.`,
          });
        }
      }

      // 4. PERÍODOS LETIVOS selecionados sem MATRÍCULAS
      // Verificar se existem matrículas que realmente pertencem aos períodos que seriam removidos
      if (requestedCategories.includes('periods') && !requestedCategories.includes('records')) {
        const periodNames = new Set((store.periods || []).map((p) => String(p.name).trim()));
        const dependentRecords = (store.records || []).filter((r) => {
          if (r.year === undefined || r.year === null) return false;
          const yrStr = String(r.year).trim();
          return periodNames.has(yrStr);
        });
        if (dependentRecords.length > 0) {
          return res.status(400).json({
            error: `Operação bloqueada por integridade: não é permitido excluir os Períodos Letivos selecionados porque existem ${dependentRecords.length} matrícula(s) vinculadas a esses períodos. Selecione também a categoria "Matrículas" ou cancele a operação.`,
          });
        }
      }

      // 5. MODELOS DA LINHA DO TEMPO selecionados sem PRODUÇÕES DA LINHA DO TEMPO
      // Verificar se existem composições da Linha do Tempo vinculadas aos modelos que seriam removidos
      if (requestedCategories.includes('models') && !requestedCategories.includes('timelines')) {
        const modelIds = new Set((store.models || []).map((m) => m.id));
        const dependentTimelines = (store.timelines || []).filter(
          (t) => t.modelId && modelIds.has(t.modelId)
        );
        if (dependentTimelines.length > 0) {
          return res.status(400).json({
            error: `Operação bloqueada por integridade: não é permitido excluir os Modelos da Linha do Tempo selecionados porque existem ${dependentTimelines.length} composição(ões) salvas vinculadas a esses modelos. Selecione também a categoria "Produções da Linha do Tempo" ou cancele a operação.`,
          });
        }
      }

      // 1. Snapshot e contagem dos dados antes da limpeza
      const previousCounts = {
        students: (store.students || []).filter((s) => (s.personType || 'student') === 'student').length,
        collaborators: (store.students || []).filter((s) => s.personType === 'collaborator').length,
        records: (store.records || []).length,
        photos: (store.records || []).filter((r) => r.photoUrl && r.photoUrl.trim() !== '').length,
        timelines: (store.timelines || []).length,
        carometro: (store.records || []).filter((r) => r.carometroCrop || r.autoFaceCrop).length,
        crops: (store.records || []).filter(
          (r) =>
            r.timelinePrimaryCrop ||
            r.timelineSecondaryCrop ||
            r.carometroCrop ||
            r.autoFaceCrop ||
            r.cropSettings
        ).length,
        classes: (store.classes || []).length,
        periods: (store.periods || []).length,
        models: (store.models || []).length,
        school_data: {
          schoolName: store.config?.schoolName || '',
          hasLogo: Boolean(store.config?.schoolLogo),
        },
      };

      // 2. BACKUP AUTOMÁTICO PRÉVIO OBRIGATÓRIO (Se falhar, NUNCA executa a limpeza)
      let safetyBackup: BackupRecord;
      try {
        const categoriesLabel = requestedCategories.join(', ');
        safetyBackup = await createBackup(
          store,
          'pre_clear',
          `Backup automático de segurança pré-limpeza seletiva (${categoriesLabel})`
        );

        // Validação física de que o backup foi gerado e salvo em disco com tamanho válido
        const backupFilePath = getBackupFilePath(safetyBackup.id);
        if (!backupFilePath || !fs.existsSync(backupFilePath)) {
          throw new Error('Arquivo de backup ZIP não foi encontrado no servidor após a geração.');
        }
        const fileStats = fs.statSync(backupFilePath);
        if (fileStats.size === 0) {
          throw new Error('Arquivo de backup ZIP gerado está vazio (0 bytes).');
        }

        // Validação profunda da estrutura do ZIP, checksum e manifest
        const zipBuffer = fs.readFileSync(backupFilePath);
        const validation = await validateBackupZip(zipBuffer);
        if (!validation.valid) {
          throw new Error(`Validação de integridade do backup falhou: ${validation.error || 'estrutura corrompida'}`);
        }
      } catch (backupErr: any) {
        console.error('Falha crítica no backup pré-limpeza seletiva:', backupErr);
        return res.status(500).json({
          error: 'Não foi possível criar ou validar o backup. A limpeza foi cancelada e nenhum dado foi excluído.',
        });
      }

      // 3. REMOÇÃO SELETIVA CIRÚRGICA CONFORME CATEGORIAS SELECIONADAS
      // Conta Admin em auth.json NUNCA é tocada
      // data/backups NUNCA é apagada

      const photosToDeleteFromDisk: string[] = [];

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
          if (rec.photoUrl) photosToDeleteFromDisk.push(rec.photoUrl);
          if (rec.carometroCrop?.photoUrl) photosToDeleteFromDisk.push(rec.carometroCrop.photoUrl);
          if (rec.carometroCircularCrop?.photoUrl) photosToDeleteFromDisk.push(rec.carometroCircularCrop.photoUrl);
          if (rec.autoFaceCrop?.photoUrl) photosToDeleteFromDisk.push(rec.autoFaceCrop.photoUrl);
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
            if (p?.photoUrl) photosToDeleteFromDisk.push(p.photoUrl);
          }
        }
        store.timelines = [];
      }

      // D. Fotografias (quando registros de matrícula NÃO foram excluídos)
      if (requestedCategories.includes('photos') && !requestedCategories.includes('records')) {
        for (const rec of store.records || []) {
          if (rec.photoUrl) {
            photosToDeleteFromDisk.push(rec.photoUrl);
            rec.photoUrl = '';
          }
          if (rec.carometroCrop?.photoUrl) photosToDeleteFromDisk.push(rec.carometroCrop.photoUrl);
          if (rec.carometroCircularCrop?.photoUrl) photosToDeleteFromDisk.push(rec.carometroCircularCrop.photoUrl);
          if (rec.autoFaceCrop?.photoUrl) photosToDeleteFromDisk.push(rec.autoFaceCrop.photoUrl);
        }
      }

      // E. Enquadramentos / Ajustes completos (quando registros NÃO foram excluídos)
      if (requestedCategories.includes('crops') && !requestedCategories.includes('records')) {
        for (const rec of store.records || []) {
          delete rec.timelinePrimaryCrop;
          delete rec.timelineSecondaryCrop;
          delete rec.carometroCrop;
          delete rec.autoFaceCrop;
          delete rec.cropSettings;
        }
      } else if (
        requestedCategories.includes('carometro') &&
        !requestedCategories.includes('records') &&
        !requestedCategories.includes('crops')
      ) {
        // F. Apenas ajustes do Carômetro (quando enquadramentos gerais NÃO foram selecionados)
        for (const rec of store.records || []) {
          delete rec.carometroCrop;
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
          photosToDeleteFromDisk.push(store.config.schoolLogo);
        }
        store.config = {
          schoolName: '',
          schoolLogo: '',
          photoHistorySlots: store.config?.photoHistorySlots || 10,
        };
      }

      // J. Modelos da Linha do Tempo
      if (requestedCategories.includes('models')) {
        store.models = [];
      }

      // Exclusão física das fotos identificadas no disco
      if (photosToDeleteFromDisk.length > 0) {
        deletePhotoFilesForUrls(photosToDeleteFromDisk);
      }

      // Limpeza de fotos órfãs remanescentes em disco
      cleanupOrphanPhotos(store);

      // 4. Salvar estado atualizado em disco
      saveData(store);

      res.json({
        success: true,
        message: 'Limpeza seletiva executada com sucesso. Um backup completo do estado anterior foi criado antes da limpeza.',
        backup: {
          id: safetyBackup.id,
          filename: safetyBackup.filename,
          createdAt: safetyBackup.createdAt,
          sizeBytes: safetyBackup.sizeBytes,
        },
        selectedCategories: requestedCategories,
        previousCounts,
        currentCounts: {
          students: (store.students || []).filter((s) => (s.personType || 'student') === 'student').length,
          collaborators: (store.students || []).filter((s) => s.personType === 'collaborator').length,
          records: (store.records || []).length,
          photos: (store.records || []).filter((r) => r.photoUrl && r.photoUrl.trim() !== '').length,
          timelines: (store.timelines || []).length,
          classes: (store.classes || []).length,
          periods: (store.periods || []).length,
          models: (store.models || []).length,
        },
      });
    } catch (err: any) {
      console.error('Erro ao executar limpeza seletiva do sistema:', err);
      res.status(500).json({
        error: `Erro ao executar limpeza seletiva: ${err?.message || 'erro interno do servidor'}.`,
      });
    }
  });

  // Global error handler for API routes to safely capture any unhandled exceptions or persistence failures
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[API Internal Error]:', err);
    if (res.headersSent) {
      return next(err);
    }
    const statusCode = typeof err.status === 'number' ? err.status : 500;
    res.status(statusCode).json({
      error: err.message || 'Erro interno do servidor ao processar ou persistir a operação.',
    });
  });

  // Catch-all for unmatched /api routes so they return JSON instead of Vite HTML fallback
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `Rota de API não encontrada: ${req.method} ${req.path}` });
  });

  // Vite Middleware for Dev / Static Files for Production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Linha do Tempo Escolar server running at http://localhost:${PORT}`);
  });
}

startServer();
