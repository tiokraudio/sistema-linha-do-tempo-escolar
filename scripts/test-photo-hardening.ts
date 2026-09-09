import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  savePhotoFromBase64,
  isBase64Image,
  validateAndExtractImageBuffer,
  PhotoValidationError,
  PHOTOS_DIR,
  MAX_IMAGE_SIZE_BYTES,
  getSafePhotoFilePath,
} from '../server/photoStorageService';

function sha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

console.log('================================================================');
console.log('TESTES DE HARDENING DE UPLOAD DE FOTOS (ETAPA 2)');
console.log('================================================================\n');

let allPassed = true;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}${detail ? ` -> ${detail}` : ''}`);
  } else {
    console.error(`[FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
    allPassed = false;
  }
}

// Exemplos binários válidos reais mínimos
// JPEG mínimo válido (SOI, APP0 marker, EOI)
const validJpegBuffer = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xbf, 0x00, 0xff, 0xd9
]);

// PNG mínimo válido 1x1 pixel
const validPngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

// WEBP mínimo válido 1x1 pixel
const validWebpBuffer = Buffer.from(
  'UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAkA4JaQAA3AA/vuUAAA=',
  'base64'
);

// Contagem de arquivos antes dos testes
const filesBefore = new Set(fs.readdirSync(PHOTOS_DIR));

// A) JPEG VÁLIDO
try {
  const base64Jpeg = `data:image/jpeg;base64,${validJpegBuffer.toString('base64')}`;
  const resultUrl = savePhotoFromBase64(base64Jpeg, 'std_test_a', '2026');
  const filename = path.basename(resultUrl);
  const filePath = path.join(PHOTOS_DIR, filename);

  const fileExists = fs.existsSync(filePath);
  const extMatches = filename.endsWith('.jpg');
  const diskBytes = fs.readFileSync(filePath);
  const hashMatches = sha256(diskBytes) === sha256(validJpegBuffer);

  assert(
    fileExists && extMatches && hashMatches,
    'Teste A - JPEG Válido',
    `Extensão: .jpg, SHA256 arquivo === SHA256 original: ${hashMatches}`
  );
  // Limpeza do teste
  fs.unlinkSync(filePath);
} catch (err: any) {
  assert(false, 'Teste A - JPEG Válido', `Erro inesperado: ${err.message}`);
}

// B) PNG VÁLIDO
try {
  const base64Png = `data:image/png;base64,${validPngBuffer.toString('base64')}`;
  const resultUrl = savePhotoFromBase64(base64Png, 'std_test_b', '2026');
  const filename = path.basename(resultUrl);
  const filePath = path.join(PHOTOS_DIR, filename);

  const fileExists = fs.existsSync(filePath);
  const extMatches = filename.endsWith('.png');
  const diskBytes = fs.readFileSync(filePath);
  const hashMatches = sha256(diskBytes) === sha256(validPngBuffer);

  assert(
    fileExists && extMatches && hashMatches,
    'Teste B - PNG Válido',
    `Extensão: .png, SHA256 arquivo === SHA256 original: ${hashMatches}`
  );
  // Limpeza do teste
  fs.unlinkSync(filePath);
} catch (err: any) {
  assert(false, 'Teste B - PNG Válido', `Erro inesperado: ${err.message}`);
}

// C) WEBP VÁLIDO
try {
  const base64Webp = `data:image/webp;base64,${validWebpBuffer.toString('base64')}`;
  const resultUrl = savePhotoFromBase64(base64Webp, 'std_test_c', '2026');
  const filename = path.basename(resultUrl);
  const filePath = path.join(PHOTOS_DIR, filename);

  const fileExists = fs.existsSync(filePath);
  const extMatches = filename.endsWith('.webp');
  const diskBytes = fs.readFileSync(filePath);
  const hashMatches = sha256(diskBytes) === sha256(validWebpBuffer);

  assert(
    fileExists && extMatches && hashMatches,
    'Teste C - WEBP Válido',
    `Extensão: .webp, SHA256 arquivo === SHA256 original: ${hashMatches}`
  );
  // Limpeza do teste
  fs.unlinkSync(filePath);
} catch (err: any) {
  assert(false, 'Teste C - WEBP Válido', `Erro inesperado: ${err.message}`);
}

// D) SVG DATA URI REJEITADO
try {
  const svgDataUri = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0Lz48L3N2Zz4=';
  const countBefore = fs.readdirSync(PHOTOS_DIR).length;
  let rejected = false;
  let errorMsg = '';
  try {
    savePhotoFromBase64(svgDataUri, 'std_test_d', '2026');
  } catch (err: any) {
    rejected = true;
    errorMsg = err.message;
  }
  const countAfter = fs.readdirSync(PHOTOS_DIR).length;
  assert(
    rejected && countAfter === countBefore,
    'Teste D - SVG Rejeitado',
    `Erro capturado: "${errorMsg}", Nenhum arquivo gravado no disco.`
  );
} catch (err: any) {
  assert(false, 'Teste D - SVG Rejeitado', err.message);
}

// E) GIF REJEITADO
try {
  const gifDataUri = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const countBefore = fs.readdirSync(PHOTOS_DIR).length;
  let rejected = false;
  let errorMsg = '';
  try {
    savePhotoFromBase64(gifDataUri, 'std_test_e', '2026');
  } catch (err: any) {
    rejected = true;
    errorMsg = err.message;
  }
  const countAfter = fs.readdirSync(PHOTOS_DIR).length;
  assert(
    rejected && countAfter === countBefore,
    'Teste E - GIF Rejeitado',
    `Erro capturado: "${errorMsg}", Nenhum arquivo gravado no disco.`
  );
} catch (err: any) {
  assert(false, 'Teste E - GIF Rejeitado', err.message);
}

// F) DIVERGÊNCIA DE FORMATO (Cabeçalho PNG com bytes JPEG)
try {
  const fakePng = `data:image/png;base64,${validJpegBuffer.toString('base64')}`;
  const countBefore = fs.readdirSync(PHOTOS_DIR).length;
  let rejected = false;
  let errorMsg = '';
  try {
    savePhotoFromBase64(fakePng, 'std_test_f', '2026');
  } catch (err: any) {
    rejected = true;
    errorMsg = err.message;
  }
  const countAfter = fs.readdirSync(PHOTOS_DIR).length;
  assert(
    rejected && countAfter === countBefore && errorMsg.includes('diverge'),
    'Teste F - Divergência MIME vs Magic Bytes',
    `Erro capturado: "${errorMsg}", Nenhum arquivo gravado no disco.`
  );
} catch (err: any) {
  assert(false, 'Teste F - Divergência MIME vs Magic Bytes', err.message);
}

// G) BASE64 INVÁLIDO (Caracteres inválidos)
try {
  const invalidBase64 = 'data:image/jpeg;base64,12345!@#$%';
  const countBefore = fs.readdirSync(PHOTOS_DIR).length;
  let rejected = false;
  let errorMsg = '';
  try {
    savePhotoFromBase64(invalidBase64, 'std_test_g', '2026');
  } catch (err: any) {
    rejected = true;
    errorMsg = err.message;
  }
  const countAfter = fs.readdirSync(PHOTOS_DIR).length;
  assert(
    rejected && countAfter === countBefore,
    'Teste G - Base64 Inválido',
    `Erro capturado: "${errorMsg}", Nenhum arquivo gravado no disco.`
  );
} catch (err: any) {
  assert(false, 'Teste G - Base64 Inválido', err.message);
}

// H) ARQUIVO DISFARÇADO (Texto simples "Hello World" disfarçado com cabeçalho JPEG)
try {
  const textFakeJpeg = `data:image/jpeg;base64,${Buffer.from('Hello World - isto nao e uma imagem').toString('base64')}`;
  const countBefore = fs.readdirSync(PHOTOS_DIR).length;
  let rejected = false;
  let errorMsg = '';
  try {
    savePhotoFromBase64(textFakeJpeg, 'std_test_h', '2026');
  } catch (err: any) {
    rejected = true;
    errorMsg = err.message;
  }
  const countAfter = fs.readdirSync(PHOTOS_DIR).length;
  assert(
    rejected && countAfter === countBefore && (errorMsg.includes('magic bytes') || errorMsg.includes('Assinatura')),
    'Teste H - Texto disfarçado de JPEG Rejeitado',
    `Erro capturado: "${errorMsg}", Nenhum arquivo gravado no disco.`
  );
} catch (err: any) {
  assert(false, 'Teste H - Texto disfarçado de JPEG Rejeitado', err.message);
}

// I) IMAGEM ACIMA DO LIMITE (Buffer simulado acima de 20 MB)
try {
  // Criamos um buffer que começa com bytes JPEG, mas excede 20 MB (21 MB)
  const oversizedLength = 21 * 1024 * 1024; // 21 MB
  const oversizedBuffer = Buffer.alloc(oversizedLength);
  oversizedBuffer[0] = 0xff;
  oversizedBuffer[1] = 0xd8;
  oversizedBuffer[2] = 0xff;
  oversizedBuffer[3] = 0xe0;

  const oversizedBase64 = `data:image/jpeg;base64,${oversizedBuffer.toString('base64')}`;
  const countBefore = fs.readdirSync(PHOTOS_DIR).length;
  let rejected = false;
  let errorMsg = '';
  try {
    savePhotoFromBase64(oversizedBase64, 'std_test_i', '2026');
  } catch (err: any) {
    rejected = true;
    errorMsg = err.message;
  }
  const countAfter = fs.readdirSync(PHOTOS_DIR).length;
  assert(
    rejected && countAfter === countBefore && errorMsg.includes('20MB'),
    'Teste I - Imagem acima de 20MB Rejeitada',
    `Erro capturado: "${errorMsg}", Nenhum arquivo gravado no disco.`
  );
} catch (err: any) {
  assert(false, 'Teste I - Imagem acima de 20MB Rejeitada', err.message);
}

// J) PRESERVAÇÃO INTEGRAL DOS BYTES (SHA-256 idênticos)
try {
  // Teste de integridade byte-a-byte para JPEG
  const base64Jpeg = `data:image/jpeg;base64,${validJpegBuffer.toString('base64')}`;
  const urlJ = savePhotoFromBase64(base64Jpeg, 'std_test_j', '2026');
  const pathJ = path.join(PHOTOS_DIR, path.basename(urlJ));
  const writtenBytes = fs.readFileSync(pathJ);

  const hashOriginal = sha256(validJpegBuffer);
  const hashDecoded = sha256(Buffer.from(validJpegBuffer.toString('base64'), 'base64'));
  const hashDisk = sha256(writtenBytes);

  const bytesIdentical = hashOriginal === hashDisk && hashDecoded === hashDisk;
  assert(
    bytesIdentical,
    'Teste J - Integridade dos Bytes (SHA-256)',
    `SHA-256 Original: ${hashOriginal}\n       SHA-256 Disco:    ${hashDisk}\n       Bytes idênticos: ${bytesIdentical}`
  );
  fs.unlinkSync(pathJ);
} catch (err: any) {
  assert(false, 'Teste J - Integridade dos Bytes (SHA-256)', err.message);
}

// K) COMPATIBILIDADE DE LEITURA (URLs existentes não são regravadas)
try {
  const existingUrl = '/uploads/photos/2026_std_existing_12345.jpg';
  const countBefore = fs.readdirSync(PHOTOS_DIR).length;
  const returnedUrl = savePhotoFromBase64(existingUrl, 'std_test_k', '2026');
  const countAfter = fs.readdirSync(PHOTOS_DIR).length;

  const notRegenerated = returnedUrl === existingUrl && countBefore === countAfter;
  assert(
    notRegenerated,
    'Teste K - Compatibilidade com URLs existentes',
    `Retornou exatamente: "${returnedUrl}", Nenhuma regravação em disco.`
  );
} catch (err: any) {
  assert(false, 'Teste K - Compatibilidade com URLs existentes', err.message);
}

// Path Traversal Security check
try {
  const result = getSafePhotoFilePath('../../etc/passwd');
  const traversalBlocked = result === null;
  assert(
    traversalBlocked,
    'Segurança de Path Traversal',
    'getSafePhotoFilePath retornou null e bloqueou ../../etc/passwd com sucesso.'
  );
} catch (err: any) {
  assert(false, 'Segurança de Path Traversal', err.message);
}

console.log('\n================================================================');
if (allPassed) {
  console.log('RESULTADO GERAL: TODOS OS TESTES FORAM APROVADOS COM SUCESSO (100%)');
} else {
  console.error('RESULTADO GERAL: ALGUNS TESTES FALHARAM');
}
console.log('================================================================\n');

process.exit(allPassed ? 0 : 1);
