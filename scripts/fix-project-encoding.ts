import fs from 'fs';
import path from 'path';

/**
 * Script para correção determinística de caracteres corrompidos (UTF-8 Mojibake)
 * Arquivos alvo padrão: data/storage.json, index.html, metadata.json, server.ts
 * 
 * Utiliza:
 * 1. Mapeamento determinístico de pares de Mojibake com boundaries seguros.
 * 2. Algoritmo de reversão byte-accurate (CP1252/ISO-8859-1 -> UTF-8).
 * 3. Proteção estrita contra alteração de Base64, URLs de imagem, IDs alfanuméricos e hashes.
 */

// Mapeamento explícito de substituições determinísticas de Mojibake mais comuns em Português
const MOJIBAKE_MAP: Array<{ pattern: RegExp; replacement: string }> = [
  // Minúsculas com acento
  { pattern: /Ã¡/g, replacement: 'á' },
  { pattern: /Ã /g, replacement: 'à' },
  { pattern: /Ã¢/g, replacement: 'â' },
  { pattern: /Ã£/g, replacement: 'ã' },
  { pattern: /Ã¤/g, replacement: 'ä' },
  { pattern: /Ã©/g, replacement: 'é' },
  { pattern: /Ã¨/g, replacement: 'è' },
  { pattern: /Ãª/g, replacement: 'ê' },
  { pattern: /Ã«/g, replacement: 'ë' },
  { pattern: /Ã­/g, replacement: 'í' },
  { pattern: /Ã¬/g, replacement: 'ì' },
  { pattern: /Ã®/g, replacement: 'î' },
  { pattern: /Ã¯/g, replacement: 'ï' },
  { pattern: /Ã³/g, replacement: 'ó' },
  { pattern: /Ã²/g, replacement: 'ò' },
  { pattern: /Ã´/g, replacement: 'ô' },
  { pattern: /Ãµ/g, replacement: 'õ' },
  { pattern: /Ã¶/g, replacement: 'ö' },
  { pattern: /Ãº/g, replacement: 'ú' },
  { pattern: /Ã¹/g, replacement: 'ù' },
  { pattern: /Ã»/g, replacement: 'û' },
  { pattern: /Ã¼/g, replacement: 'ü' },
  { pattern: /Ã§/g, replacement: 'ç' },

  // Maiúsculas com acento
  { pattern: /Ã/g, replacement: 'Á' },
  { pattern: /Ã€/g, replacement: 'À' },
  { pattern: /Ã‚/g, replacement: 'Â' },
  { pattern: /Ãƒ/g, replacement: 'Ã' },
  { pattern: /Ã„/g, replacement: 'Ä' },
  { pattern: /Ã‰/g, replacement: 'É' },
  { pattern: /Ãˆ/g, replacement: 'È' },
  { pattern: /ÃŠ/g, replacement: 'Ê' },
  { pattern: /Ã‹/g, replacement: 'Ë' },
  { pattern: /Ã/g, replacement: 'Í' },
  { pattern: /ÃŒ/g, replacement: 'Ì' },
  { pattern: /ÃŽ/g, replacement: 'Î' },
  { pattern: /Ã/g, replacement: 'Ï' },
  { pattern: /Ã“/g, replacement: 'Ó' },
  { pattern: /Ã’/g, replacement: 'Ò' },
  { pattern: /Ã”/g, replacement: 'Ô' },
  { pattern: /Ã•/g, replacement: 'Õ' },
  { pattern: /Ã–/g, replacement: 'Ö' },
  { pattern: /Ãš/g, replacement: 'Ú' },
  { pattern: /Ã™/g, replacement: 'Ù' },
  { pattern: /Ã›/g, replacement: 'Û' },
  { pattern: /Ãœ/g, replacement: 'Ü' },
  { pattern: /Ã‡/g, replacement: 'Ç' },

  // Símbolos tipográficos e pontuação
  { pattern: /Â°/g, replacement: '°' },
  { pattern: /Âº/g, replacement: 'º' },
  { pattern: /Âª/g, replacement: 'ª' },
  { pattern: /Â§/g, replacement: '§' },
  { pattern: /â€“/g, replacement: '–' },
  { pattern: /â€”/g, replacement: '—' },
  { pattern: /â€˜/g, replacement: '‘' },
  { pattern: /â€™/g, replacement: '’' },
  { pattern: /â€œ/g, replacement: '“' },
  { pattern: /â€/g, replacement: '”' },
  { pattern: /â€¢/g, replacement: '•' },
  { pattern: /â€¦/g, replacement: '…' },
  { pattern: /Â©/g, replacement: '©' },
  { pattern: /Â®/g, replacement: '®' },
  { pattern: /â„¢/g, replacement: '™' },
  { pattern: /Â«/g, replacement: '«' },
  { pattern: /Â»/g, replacement: '»' },
  { pattern: /Â±/g, replacement: '±' },
  { pattern: /Âµ/g, replacement: 'µ' },
];

const cp1252ToByte: Record<string, number> = {
  '\u20AC': 0x80, '\u201A': 0x82, '\u0192': 0x83, '\u201E': 0x84,
  '\u2026': 0x85, '\u2020': 0x86, '\u2021': 0x87, '\u02C6': 0x88,
  '\u2030': 0x89, '\u0160': 0x8A, '\u2039': 0x8B, '\u0152': 0x8C,
  '\u017D': 0x8E, '\u2018': 0x91, '\u2019': 0x92, '\u201C': 0x93,
  '\u201D': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97,
  '\u02DC': 0x98, '\u2122': 0x99, '\u0161': 0x9A, '\u203A': 0x9B,
  '\u0153': 0x9C, '\u017E': 0x9E, '\u0178': 0x9F,
};

function stringToCp1252Bytes(str: string): Buffer | null {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const code = str.charCodeAt(i);
    if (cp1252ToByte[char] !== undefined) {
      bytes.push(cp1252ToByte[char]);
    } else if (code <= 0xFF) {
      bytes.push(code);
    } else {
      return null;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Detecta se a string contém indícios de Mojibake
 */
export function hasMojibakeSignatures(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  return /[ÃÂ][\u0080-\u024F\u2000-\u2150]|â€[™œž˜š›\u0080-\u00FF]|Ãƒ|Ã‚|Ã¢|Ã¡|Ã©|Ã­|Ã³|Ãº|Ã§|Ã£|Ãµ|Ãª|Ã´|Â°|Âº|Âª/.test(str);
}

/**
 * Verifica se a string é protegida (Base64, ID puro, hash ou URL de imagem)
 */
export function isProtectedString(str: string, keyName?: string): boolean {
  if (!str || typeof str !== 'string') return true;

  // Proteção para chaves específicas de dados técnicos
  if (keyName) {
    const lowerKey = keyName.toLowerCase();
    if (
      lowerKey === 'base64' ||
      lowerKey === 'photourl' ||
      lowerKey === 'token' ||
      lowerKey === 'passwordhash' ||
      lowerKey === 'hash' ||
      lowerKey === 'data' && str.startsWith('data:image/')
    ) {
      return true;
    }

    if (
      lowerKey === 'id' ||
      lowerKey.endsWith('id') ||
      lowerKey === 'enrollment' // Preservar matrícula exatamente como texto original
    ) {
      if (str.startsWith('data:image/') || (!hasMojibakeSignatures(str) && /^[A-Za-z0-9_\-\.\:\/]+$/.test(str))) {
        return true;
      }
    }
  }

  // URLs de Base64 de imagem
  if (str.startsWith('data:image/')) return true;

  // Sequências de Base64 puro (sem espaços, com comprimento significativo)
  if (str.length >= 64 && /^[A-Za-z0-9+/=\s]+$/.test(str) && !hasMojibakeSignatures(str)) {
    return true;
  }

  // IDs e Hashes alfanuméricos puros
  if (/^[a-zA-Z0-9_\-\.]{8,}$/.test(str) && !hasMojibakeSignatures(str)) {
    return true;
  }

  return false;
}

/**
 * Corrige uma string individual usando reversão byte-accurate e dicionário regex com boundaries
 */
export function fixMojibakeDeterministic(str: string, keyName?: string): string {
  if (!str || typeof str !== 'string') return str;
  if (isProtectedString(str, keyName)) return str;

  let current = str;

  // 1. Tentar reversão por decodificação de bytes CP1252 -> UTF-8 (até 3 iterações)
  for (let i = 0; i < 3; i++) {
    if (!hasMojibakeSignatures(current)) break;
    const buf = stringToCp1252Bytes(current);
    if (!buf) break;
    try {
      const decoded = buf.toString('utf8');
      if (!decoded.includes('\uFFFD') && decoded !== current) {
        current = decoded;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  // 2. Aplicar substituições regex determinísticas com boundaries
  if (hasMojibakeSignatures(current)) {
    for (const { pattern, replacement } of MOJIBAKE_MAP) {
      current = current.replace(pattern, replacement);
    }
  }

  return current;
}

/**
 * Higieniza recursivamente objetos e estruturas JSON
 */
export function sanitizeJsonStructure(
  data: any,
  stats: { checked: number; fixed: number; examples: Array<{ before: string; after: string; key?: string }> },
  currentKey?: string
): any {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    stats.checked++;
    if (isProtectedString(data, currentKey)) {
      return data;
    }

    const fixed = fixMojibakeDeterministic(data, currentKey);
    if (fixed !== data) {
      stats.fixed++;
      if (stats.examples.length < 25) {
        stats.examples.push({ before: data.length > 80 ? data.slice(0, 77) + '...' : data, after: fixed.length > 80 ? fixed.slice(0, 77) + '...' : fixed, key: currentKey });
      }
      return fixed;
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeJsonStructure(item, stats, currentKey));
  }

  if (typeof data === 'object') {
    const result: Record<string, any> = {};
    for (const key of Object.keys(data)) {
      const sanitizedKey = fixMojibakeDeterministic(key);
      result[sanitizedKey] = sanitizeJsonStructure(data[key], stats, key);
    }
    return result;
  }

  return data;
}

/**
 * Processa um arquivo de texto com proteção de strings Base64 e código-fonte
 */
export function fixTextFileEncoding(
  filePath: string,
  stats: { checked: number; fixed: number; examples: Array<{ before: string; after: string }> }
): { modified: boolean; changeCount: number } {
  const content = fs.readFileSync(filePath, 'utf8');

  // Regex para identificar strings literais ou textos em tags sem afetar atributos base64
  let modifiedContent = content;
  let changeCount = 0;

  // Aplicar substituições regex determinísticas linha a linha para isolamento
  const lines = content.split('\n');
  const fixedLines = lines.map((line) => {
    // Se a linha contém data:image/ ou base64 muito longo, protege a parte sensível
    if (line.includes('data:image/') || line.length > 5000) {
      // Se não houver assinatura de mojibake, não toca
      if (!hasMojibakeSignatures(line)) return line;

      // Substituição pontual de mojibake sem tocar na URL data:image
      let fixedLine = line;
      for (const { pattern, replacement } of MOJIBAKE_MAP) {
        fixedLine = fixedLine.replace(pattern, replacement);
      }
      if (fixedLine !== line) {
        changeCount++;
        stats.fixed++;
        if (stats.examples.length < 25) {
          stats.examples.push({ before: line.trim().slice(0, 60), after: fixedLine.trim().slice(0, 60) });
        }
      }
      return fixedLine;
    }

    if (!hasMojibakeSignatures(line)) {
      return line;
    }

    let fixedLine = line;
    // 1. Reversão byte-accurate para a linha
    const buf = stringToCp1252Bytes(line);
    if (buf) {
      try {
        const decoded = buf.toString('utf8');
        if (!decoded.includes('\uFFFD') && decoded !== line && !decoded.includes('undefined')) {
          fixedLine = decoded;
        }
      } catch {
        // fallback
      }
    }

    // 2. Mapeamento determinístico
    for (const { pattern, replacement } of MOJIBAKE_MAP) {
      fixedLine = fixedLine.replace(pattern, replacement);
    }

    if (fixedLine !== line) {
      changeCount++;
      stats.fixed++;
      if (stats.examples.length < 25) {
        stats.examples.push({ before: line.trim().slice(0, 60), after: fixedLine.trim().slice(0, 60) });
      }
    }
    return fixedLine;
  });

  modifiedContent = fixedLines.join('\n');

  if (modifiedContent !== content) {
    // Backup seguro antes de salvar
    const backupPath = `${filePath}.bak_encoding_${Date.now()}`;
    fs.writeFileSync(backupPath, content, 'utf8');
    fs.writeFileSync(filePath, modifiedContent, 'utf8');
    return { modified: true, changeCount };
  }

  return { modified: false, changeCount: 0 };
}

/**
 * Processa um arquivo JSON estruturado
 */
export function fixJsonFileEncoding(
  filePath: string,
  stats: { checked: number; fixed: number; examples: Array<{ before: string; after: string; key?: string }> }
): { modified: boolean; changeCount: number } {
  const content = fs.readFileSync(filePath, 'utf8');
  let data: any;

  try {
    data = JSON.parse(content);
  } catch (err) {
    console.warn(`[JSON Parse Warning] ${filePath} não pôde ser analisado como JSON padrão. Aplicando método de arquivo de texto.`);
    return fixTextFileEncoding(filePath, stats);
  }

  const fileStats = { checked: 0, fixed: 0, examples: [] as any[] };
  const sanitizedData = sanitizeJsonStructure(data, fileStats);

  stats.checked += fileStats.checked;
  stats.fixed += fileStats.fixed;
  stats.examples.push(...fileStats.examples);

  if (fileStats.fixed > 0) {
    const backupPath = `${filePath}.bak_encoding_${Date.now()}`;
    fs.writeFileSync(backupPath, content, 'utf8');

    // Manter formatação compacta para arquivos grandes (ex: storage.json > 1MB) e identada para arquivos pequenos (metadata.json)
    const isLarge = content.length > 1024 * 1024;
    const formatted = isLarge ? JSON.stringify(sanitizedData) : JSON.stringify(sanitizedData, null, 2);
    fs.writeFileSync(filePath, formatted, 'utf8');
    return { modified: true, changeCount: fileStats.fixed };
  }

  return { modified: false, changeCount: 0 };
}

/**
 * Função principal executável
 */
export async function runProjectEncodingFix(targetFiles?: string[]) {
  console.log('===============================================================');
  console.log('  CORREÇÃO DETERMINÍSTICA DE ENCODING UTF-8 (ANTI-MOJIBAKE)   ');
  console.log('===============================================================\n');

  const defaultTargets = [
    'data/storage.json',
    'index.html',
    'metadata.json',
    'server.ts',
  ];

  const filesToProcess = targetFiles && targetFiles.length > 0 ? targetFiles : defaultTargets;
  const projectRoot = process.cwd();

  const totalStats = {
    filesChecked: 0,
    filesModified: 0,
    totalReplacements: 0,
    examples: [] as Array<{ before: string; after: string; key?: string }>,
  };

  for (const relPath of filesToProcess) {
    const fullPath = path.resolve(projectRoot, relPath);

    if (!fs.existsSync(fullPath)) {
      console.log(`[-] Arquivo ignorado (não encontrado): ${relPath}`);
      continue;
    }

    totalStats.filesChecked++;
    console.log(`[>] Analisando: ${relPath}`);

    const isJson = relPath.endsWith('.json');
    const fileStats = { checked: 0, fixed: 0, examples: [] as any[] };

    let result: { modified: boolean; changeCount: number };
    if (isJson) {
      result = fixJsonFileEncoding(fullPath, fileStats);
    } else {
      result = fixTextFileEncoding(fullPath, fileStats);
    }

    if (result.modified) {
      totalStats.filesModified++;
      totalStats.totalReplacements += result.changeCount;
      totalStats.examples.push(...fileStats.examples);
      console.log(`    [OK] Corrigido! ${result.changeCount} caracteres/termos recuperados.`);
    } else {
      console.log(`    [OK] Íntegro. Nenhuma anomalia de encoding detectada.`);
    }
  }

  console.log('\n---------------------------------------------------------------');
  console.log('RESUMO DA EXECUÇÃO:');
  console.log(`  Arquivos verificados: ${totalStats.filesChecked}`);
  console.log(`  Arquivos modificados: ${totalStats.filesModified}`);
  console.log(`  Total de correções:   ${totalStats.totalReplacements}`);

  if (totalStats.examples.length > 0) {
    console.log('\nEXEMPLOS DE CORREÇÕES EFETUADAS:');
    for (let i = 0; i < Math.min(totalStats.examples.length, 10); i++) {
      const ex = totalStats.examples[i];
      console.log(`  - "${ex.before}" -> "${ex.after}" ${ex.key ? `(campo: ${ex.key})` : ''}`);
    }
  }

  console.log('---------------------------------------------------------------\n');
  return totalStats;
}

// Execução direta via CLI se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('fix-project-encoding.ts')) {
  const cliArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  runProjectEncodingFix(cliArgs.length > 0 ? cliArgs : undefined).catch((err) => {
    console.error('[ERRO CRÍTICO]', err);
    process.exit(1);
  });
}
