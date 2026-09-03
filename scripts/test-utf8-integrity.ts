import fs from 'fs';
import path from 'path';
import express from 'express';
import { sanitizeUtf8Strings, fixMojibakeString, hasMojibake } from '../server/utf8Sanitizer';
import { createBackup, validateBackupZip } from '../server/backupService';
import { LocalStorageData } from '../src/types';

// CP1252 byte-accurate corruption simulation for testing resilience
const cp1252ToByte: Record<string, number> = {
  '\u20AC': 0x80, '\u201A': 0x82, '\u0192': 0x83, '\u201E': 0x84,
  '\u2026': 0x85, '\u2020': 0x86, '\u2021': 0x87, '\u02C6': 0x88,
  '\u2030': 0x89, '\u0160': 0x8A, '\u2039': 0x8B, '\u0152': 0x8C,
  '\u017D': 0x8E, '\u2018': 0x91, '\u2019': 0x92, '\u201C': 0x93,
  '\u201D': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97,
  '\u02DC': 0x98, '\u2122': 0x99, '\u0161': 0x9A, '\u203A': 0x9B,
  '\u0153': 0x9C, '\u017E': 0x9E, '\u0178': 0x9F,
};
const byteToCp1252: Record<number, string> = {};
for (let i = 0; i <= 255; i++) byteToCp1252[i] = String.fromCharCode(i);
for (const [char, byte] of Object.entries(cp1252ToByte)) byteToCp1252[byte] = char;

function corruptToMojibake(str: string): string {
  const utf8Buf = Buffer.from(str, 'utf8');
  let result = '';
  for (let i = 0; i < utf8Buf.length; i++) {
    const b = utf8Buf[i];
    result += byteToCp1252[b] || String.fromCharCode(b);
  }
  return result;
}

async function runTests() {
  console.log('=== INICIANDO BATERIA DE TESTES DE INTEGRIDADE UTF-8 ===\n');

  const testStrings = [
    'COLÉGIO',
    'COLÉGIO BATISTA DE PALMAS',
    'João',
    'José',
    'Gonçalves',
    'Guimarães',
    'Louíse',
    'Ângela',
    'São Paulo',
    'Período Letivo',
    'Configurações',
    'Matrícula',
    'Fotografias',
    'á à â ã ä é è ê ë í ì î ï ó ò ô õ ö ú ù û ü ç Á À Â Ã É Ê Í Ó Ô Õ Ú Ç'
  ];

  let testPassed = 0;
  let testTotal = 0;

  function assert(condition: boolean, msg: string) {
    testTotal++;
    if (condition) {
      testPassed++;
      console.log(`  [OK] ${msg}`);
    } else {
      console.error(`  [FALHA] ${msg}`);
    }
  }

  // TESTE 1: Preservação de strings íntegras
  console.log('1. Teste de não-degradação de strings UTF-8 já corretas:');
  for (const s of testStrings) {
    const res = fixMojibakeString(s);
    assert(res === s, `String intacta: "${s}" -> "${res}"`);
  }

  // TESTE 2: Reversão de 1x Mojibake (UTF-8 -> CP1252)
  console.log('\n2. Teste de reversão de Mojibake simples (1x):');
  for (const s of testStrings) {
    const mojibake1 = corruptToMojibake(s);
    const recovered1 = fixMojibakeString(mojibake1);
    assert(recovered1 === s, `Recuperado 1x: "${mojibake1}" -> "${recovered1}"`);
  }

  // TESTE 3: Reversão de 2x Mojibake (UTF-8 -> CP1252 -> UTF-8 -> CP1252)
  console.log('\n3. Teste de reversão de Mojibake duplo (2x):');
  for (const s of testStrings) {
    const mojibake1 = corruptToMojibake(s);
    const mojibake2 = corruptToMojibake(mojibake1);
    const recovered2 = fixMojibakeString(mojibake2);
    assert(recovered2 === s, `Recuperado 2x: "${mojibake2}" -> "${recovered2}"`);
  }

  // TESTE 4: Teste de preservação de estruturas complexas
  console.log('\n4. Teste de higienização recursiva de estruturas de dados:');
  const mockPayload = {
    id: 'rec_987654_xyz',
    count: 42,
    active: true,
    logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    config: {
      schoolName: corruptToMojibake(corruptToMojibake('COLÉGIO BATISTA DE PALMAS')),
    },
    students: [
      { id: 'st_1', name: corruptToMojibake('JOÃO MIGUEL GONÇALVES'), city: corruptToMojibake('SÃO PAULO') },
      { id: 'st_2', name: 'LÍDIA LOPES GUIMARÃES', city: 'PALMAS' }
    ]
  };

  const stats = { checked: 0, fixed: 0, examples: [] };
  const sanitizedPayload = sanitizeUtf8Strings(mockPayload, stats);

  assert(sanitizedPayload.id === 'rec_987654_xyz', 'ID preservado');
  assert(sanitizedPayload.count === 42, 'Número preservado');
  assert(sanitizedPayload.active === true, 'Boolean preservado');
  assert(sanitizedPayload.logo === mockPayload.logo, 'Base64 image preservada');
  assert(sanitizedPayload.config.schoolName === 'COLÉGIO BATISTA DE PALMAS', 'Nome da escola recuperado perfeitamente');
  assert(sanitizedPayload.students[0].name === 'JOÃO MIGUEL GONÇALVES', 'Aluno 1 recuperado perfeitamente');
  assert(sanitizedPayload.students[0].city === 'SÃO PAULO', 'Cidade 1 recuperada perfeitamente');
  assert(sanitizedPayload.students[1].name === 'LÍDIA LOPES GUIMARÃES', 'Aluno 2 mantido intacto');

  // TESTE 5: Ciclo completo com API Express e Backup ZIP
  console.log('\n5. Teste de ciclo de vida completo (API + Backup ZIP + Restore):');
  
  const mockStore: LocalStorageData = {
    config: {
      schoolName: 'COLÉGIO BATISTA DE PALMAS',
      schoolLogo: '',
      photoHistorySlots: 10
    },
    periods: [
      { id: 'per_2026', name: '2026', active: true, status: 'in_production', createdAt: new Date().toISOString() }
    ],
    classes: [
      { id: 'cls_1', name: 'EI | 3 Anos', stage: 'EI', stageName: 'Educação Infantil', position: 1, active: true, order: 1, createdAt: new Date().toISOString() }
    ],
    students: [
      { id: 'std_1', enrollment: 'MAT-001', name: 'JOÃO GUIMARÃES', createdAt: new Date().toISOString() }
    ],
    records: [],
    models: [],
    timelines: []
  };

  // Test create backup
  const backupRecord = await createBackup(mockStore, 'manual', 'Teste UTF-8');
  assert(fs.existsSync(path.join(process.cwd(), 'data', 'backups', backupRecord.filename)), 'Arquivo de backup .zip criado no disco');

  // Test read zip buffer and validate
  const zipBuffer = fs.readFileSync(path.join(process.cwd(), 'data', 'backups', backupRecord.filename));
  const validation = await validateBackupZip(zipBuffer);
  
  assert(validation.valid === true, 'Validação do backup ZIP bem-sucedida');
  assert(validation.storeData?.config.schoolName === 'COLÉGIO BATISTA DE PALMAS', 'Nome da escola restaurado intacto do ZIP');
  assert(validation.storeData?.classes[0].stageName === 'Educação Infantil', 'Nome da etapa pedagógica restaurado intacto');
  assert(validation.storeData?.students[0].name === 'JOÃO GUIMARÃES', 'Nome do aluno restaurado intacto');

  // Clean test backup
  try {
    fs.unlinkSync(path.join(process.cwd(), 'data', 'backups', backupRecord.filename));
  } catch {}

  console.log(`\n=== RESULTADO FINAL: ${testPassed}/${testTotal} TESTES PASSARAM COM SUCESSO ===\n`);
  if (testPassed !== testTotal) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro nos testes:', err);
  process.exit(1);
});
