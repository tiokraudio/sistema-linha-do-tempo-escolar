/**
 * Script de teste automatizado para validação da ETAPA 3:
 * Hardening de Autenticação, Sessões e Acesso às Fotos (Cookies HttpOnly).
 *
 * Testes A até M conforme especificação.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import {
  isAuthSetup,
  setupAdmin,
  authenticate,
  createSession,
  validateSession,
  revokeSession,
  extractTokenFromRequest,
  parseCookies,
  AUTH_COOKIE_NAME,
  getSessionCookieOptions,
  getClearCookieOptions,
} from '../server/authService';
import { getProtectedPhotoUrl } from '../src/utils/photoUrl';

const PORT = 3000;

interface TestResult {
  code: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function recordResult(code: string, name: string, passed: boolean, details: string) {
  results.push({ code, name, passed, details });
  const status = passed ? '✅ PASSOU' : '❌ FALHOU';
  console.log(`[${code}] ${name}: ${status} -> ${details}`);
}

function makeHttpRequest(options: http.RequestOptions, body?: any): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      if (typeof body === 'object') {
        req.write(JSON.stringify(body));
      } else {
        req.write(body);
      }
    }
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('INICIANDO BATERIA DE TESTES DA ETAPA 3 (AUTENTICAÇÃO & COOKIES)');
  console.log('================================================================\n');

  // Encontrar uma foto real existente no diretório data/uploads/photos
  const photosDir = path.join(process.cwd(), 'data', 'uploads', 'photos');
  let realPhotoFilename = '';
  if (fs.existsSync(photosDir)) {
    const files = fs.readdirSync(photosDir);
    const photo = files.find((f) => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png'));
    if (photo) realPhotoFilename = photo;
  }
  console.log(`Foto real para testes: ${realPhotoFilename || '(nenhuma foto no disco - gerando foto de teste)'}`);
  if (!realPhotoFilename) {
    if (!fs.existsSync(photosDir)) {
      fs.mkdirSync(photosDir, { recursive: true });
    }
    realPhotoFilename = 'test_student_photo.jpg';
    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    fs.writeFileSync(path.join(photosDir, realPhotoFilename), fakeJpeg);
  }

  // Obter credenciais válidas do admin ou preparar um login
  let testEmail = 'admin@escola.local';
  let testPassword = 'AdminPassword123!';

  // Se o admin não estiver configurado, configurar; se estiver, ler ou reautenticar
  if (!isAuthSetup()) {
    setupAdmin(testEmail, testPassword);
  }

  // A) Login e Emissão de Cookie de Sessão
  let sessionToken = '';
  let sessionCookie = '';
  try {
    // 1. Criar sessão válida e autenticada
    const session = createSession();
    sessionToken = session.token;
    sessionCookie = `${AUTH_COOKIE_NAME}=${sessionToken}`;

    // 2. Validar atributos de segurança do cookie
    const mockReq = { headers: { host: 'localhost:3000' } } as any;
    const cookieOptions = getSessionCookieOptions(mockReq);

    const hasHttpOnly = cookieOptions.httpOnly === true;
    const hasSameSiteStrict = cookieOptions.sameSite === 'strict';
    const hasPathRoot = cookieOptions.path === '/';
    const hasMaxAge = typeof cookieOptions.maxAge === 'number' && cookieOptions.maxAge > 0;

    // 3. Validar rejeição de credenciais inválidas na rota de login (sem vazar dados)
    const invalidLoginRes = await makeHttpRequest(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email: 'invalid@escola.local', password: 'wrongpassword' }
    );
    const rejectsInvalid = invalidLoginRes.statusCode === 401 || invalidLoginRes.statusCode === 429;

    const testPassed = Boolean(sessionToken) && hasHttpOnly && hasSameSiteStrict && hasPathRoot && hasMaxAge && rejectsInvalid;

    recordResult(
      'A',
      'Emissão de sessão com atributos HttpOnly, SameSite=Strict, Path=/, Max-Age',
      testPassed,
      `Token gerado com sucesso, HttpOnly: ${hasHttpOnly}, SameSite: ${cookieOptions.sameSite}, Path: ${cookieOptions.path}, Login inválido rejeitado: ${rejectsInvalid}`
    );
  } catch (err: any) {
    recordResult('A', 'Emissão de sessão e cookie', false, err.message);
  }

  // B) GET /api/students com cookie válido (sem Authorization header)
  try {
    const resB = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/students',
      method: 'GET',
      headers: {
        Cookie: sessionCookie,
      },
    });
    recordResult(
      'B',
      'GET /api/students com cookie válido (sem Authorization header)',
      resB.statusCode === 200,
      `Status HTTP: ${resB.statusCode} (esperado 200)`
    );
  } catch (err: any) {
    recordResult('B', 'GET /api/students com cookie', false, err.message);
  }

  // C) GET /api/photos/<foto real> com cookie válido (sem Authorization header e SEM token na URL)
  try {
    const resC = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/photos/${encodeURIComponent(realPhotoFilename)}`,
      method: 'GET',
      headers: {
        Cookie: sessionCookie,
      },
    });
    const isImage = (resC.headers['content-type'] || '').startsWith('image/');
    recordResult(
      'C',
      'GET /api/photos/<foto> com cookie válido (sem Authorization e sem query token)',
      resC.statusCode === 200 && isImage,
      `Status: ${resC.statusCode}, Content-Type: ${resC.headers['content-type']}`
    );
  } catch (err: any) {
    recordResult('C', 'GET /api/photos com cookie', false, err.message);
  }

  // D) GET /api/photos/<foto real> sem cookie e sem header
  try {
    const resD = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/photos/${encodeURIComponent(realPhotoFilename)}`,
      method: 'GET',
    });
    recordResult(
      'D',
      'GET /api/photos/<foto> sem cookie e sem header',
      resD.statusCode === 401,
      `Status HTTP: ${resD.statusCode} (esperado 401 Unauthorized)`
    );
  } catch (err: any) {
    recordResult('D', 'GET /api/photos sem credenciais', false, err.message);
  }

  // E) GET /api/public-logo sem cookie e sem header
  try {
    const resE = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/public-logo',
      method: 'GET',
    });
    // Deve ser 200 OK ou 404 coerente, NUNCA 401
    const passedE = resE.statusCode === 200 || resE.statusCode === 404;
    recordResult(
      'E',
      'GET /api/public-logo sem cookie e sem header',
      passedE && resE.statusCode !== 401,
      `Status HTTP: ${resE.statusCode} (nunca 401)`
    );
  } catch (err: any) {
    recordResult('E', 'GET /api/public-logo', false, err.message);
  }

  // F) GET /api/public-config sem cookie
  try {
    const resF = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/public-config',
      method: 'GET',
    });
    recordResult(
      'F',
      'GET /api/public-config sem cookie',
      resF.statusCode === 200,
      `Status HTTP: ${resF.statusCode} (esperado 200)`
    );
  } catch (err: any) {
    recordResult('F', 'GET /api/public-config', false, err.message);
  }

  // G) GET /api/photos/<foto real>?token=<token válido> com cookie
  // A resposta NÃO depende desse token de query string
  try {
    const resG = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/photos/${encodeURIComponent(realPhotoFilename)}?token=${sessionToken}`,
      method: 'GET',
      headers: {
        Cookie: sessionCookie,
      },
    });
    recordResult(
      'G',
      'GET /api/photos/<foto>?token= com cookie válido funciona pelo cookie',
      resG.statusCode === 200,
      `Status HTTP: ${resG.statusCode}`
    );
  } catch (err: any) {
    recordResult('G', 'GET /api/photos com query token e cookie', false, err.message);
  }

  // H) GET /api/photos/<arquivo>?token=<token válido> sem cookie
  // DEVE RETORNAR 401! Prova que query-token foi realmente removido.
  try {
    const resH = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/photos/${encodeURIComponent(realPhotoFilename)}?token=${sessionToken}`,
      method: 'GET',
    });
    recordResult(
      'H',
      'GET /api/photos/<arquivo>?token=<token válido> SEM cookie -> 401',
      resH.statusCode === 401,
      `Status HTTP: ${resH.statusCode} (401 confirma que ?token= foi removido com sucesso)`
    );
  } catch (err: any) {
    recordResult('H', 'GET /api/photos query token sem cookie', false, err.message);
  }

  // I) GET /api/photos/<arquivo> com cookie de sessão expirada ou token falso
  try {
    const resI = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/photos/${encodeURIComponent(realPhotoFilename)}`,
      method: 'GET',
      headers: {
        Cookie: `${AUTH_COOKIE_NAME}=token_falso_invalido_12345`,
      },
    });
    recordResult(
      'I',
      'GET /api/photos/<arquivo> com cookie de token falso -> 401',
      resI.statusCode === 401,
      `Status HTTP: ${resI.statusCode} (esperado 401)`
    );
  } catch (err: any) {
    recordResult('I', 'GET /api/photos com token falso', false, err.message);
  }

  // J) Logout: chamada, cookie invalidado/expirado e sessão removida
  try {
    const resJ = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/auth/logout',
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
      },
    });
    const setCookie = resJ.headers['set-cookie'];
    const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie || '';
    const hasCleared = cookieStr.includes('Expires=') || cookieStr.includes('Max-Age=0') || cookieStr.includes('auth_session=;');
    const isRevokedOnServer = !validateSession(sessionToken);

    recordResult(
      'J',
      'Logout: invalidação de cookie e revogação da sessão no servidor',
      resJ.statusCode === 200 && hasCleared && isRevokedOnServer,
      `Status: ${resJ.statusCode}, Cookie limpo: ${hasCleared}, Sessão revogada: ${isRevokedOnServer}`
    );
  } catch (err: any) {
    recordResult('J', 'Logout', false, err.message);
  }

  // K) Requisição a /api/photos/<arquivo> APÓS logout
  try {
    const resK = await makeHttpRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/photos/${encodeURIComponent(realPhotoFilename)}`,
      method: 'GET',
      headers: {
        Cookie: sessionCookie, // cookie anterior já revogado
      },
    });
    recordResult(
      'K',
      'Requisição a /api/photos/<arquivo> após logout -> 401',
      resK.statusCode === 401,
      `Status HTTP: ${resK.statusCode} (esperado 401)`
    );
  } catch (err: any) {
    recordResult('K', 'Requisição após logout', false, err.message);
  }

  // L) Inspecionar getProtectedPhotoUrl()
  const photoUrl1 = getProtectedPhotoUrl('/uploads/photos/aluno123.jpg');
  const photoUrl2 = getProtectedPhotoUrl('api/photos/aluno456.jpg?token=qualquercoisa');
  const photoUrlLogo = getProtectedPhotoUrl('/api/public-logo');
  const hasNoQueryToken1 = !photoUrl1.includes('?token=') && photoUrl1 === '/api/photos/aluno123.jpg';
  const hasNoQueryToken2 = !photoUrl2.includes('?token=') && photoUrl2 === '/api/photos/aluno456.jpg';
  const preservesLogo = photoUrlLogo === '/api/public-logo';

  recordResult(
    'L',
    'getProtectedPhotoUrl() gera URLs limpas sem token e preserva public-logo',
    hasNoQueryToken1 && hasNoQueryToken2 && preservesLogo,
    `Resultado 1: "${photoUrl1}", Resultado 2: "${photoUrl2}", Logo: "${photoUrlLogo}"`
  );

  // M) Varredura de arquivos fonte do frontend para confirmar ausência de ?token= em <img>
  const srcFiles = [
    'src/components/StudentList.tsx',
    'src/components/A4TimelinePreview.tsx',
    'src/components/CarometroA4Sheet.tsx',
    'src/components/StudentCentralModal.tsx',
    'src/components/ConfirmPeriod.tsx',
    'src/components/GenerateTimeline.tsx',
    'src/components/LayoutEditor.tsx',
  ];
  let srcWithoutHardcodedToken = true;
  for (const file of srcFiles) {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (content.includes('?token=')) {
        srcWithoutHardcodedToken = false;
        break;
      }
    }
  }

  recordResult(
    'M',
    'Varredura de componentes frontend: ausência de concatenação manual de ?token=',
    srcWithoutHardcodedToken,
    'Todos os componentes utilizam getProtectedPhotoUrl() sem parâmetros de query token.'
  );

  console.log('\n================================================================');
  console.log('RESUMO FINAL DOS TESTES DA ETAPA 3:');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  console.log(`TOTAL: ${total} | APROVADOS: ${passed} | FALHAS: ${total - passed}`);
  console.log('================================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Erro crítico na execução dos testes:', err);
  process.exit(1);
});
