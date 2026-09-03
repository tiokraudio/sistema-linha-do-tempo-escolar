/**
 * UTF-8 & Mojibake Sanitization Utility
 * Reverses single and multiple Windows-1252 / ISO-8859-1 misinterpretations of UTF-8 strings
 * Preserves all valid characters, IDs, numbers, hashes, and Base64 images intact.
 */

const cp1252ToByte: Record<string, number> = {
  '\u20AC': 0x80, // €
  '\u201A': 0x82, // ‚
  '\u0192': 0x83, // ƒ
  '\u201E': 0x84, // „
  '\u2026': 0x85, // …
  '\u2020': 0x86, // †
  '\u2021': 0x87, // ‡
  '\u02C6': 0x88, // ˆ
  '\u2030': 0x89, // ‰
  '\u0160': 0x8A, // Š
  '\u2039': 0x8B, // ‹
  '\u0152': 0x8C, // Œ
  '\u017D': 0x8E, // Ž
  '\u2018': 0x91, // ‘
  '\u2019': 0x92, // ’
  '\u201C': 0x93, // “
  '\u201D': 0x94, // ”
  '\u2022': 0x95, // •
  '\u2013': 0x96, // –
  '\u2014': 0x97, // —
  '\u02DC': 0x98, // ˜
  '\u2122': 0x99, // ™
  '\u0161': 0x9A, // š
  '\u203A': 0x9B, // ›
  '\u0153': 0x9C, // œ
  '\u017E': 0x9E, // ž
  '\u0178': 0x9F, // Ÿ
};

export function stringToCp1252Bytes(str: string): Buffer | null {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const code = str.charCodeAt(i);
    if (cp1252ToByte[char] !== undefined) {
      bytes.push(cp1252ToByte[char]);
    } else if (code <= 0xFF) {
      bytes.push(code);
    } else {
      // Character not representable in CP1252 byte range
      return null;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Detects if a string contains common UTF-8 Mojibake signatures
 */
export function hasMojibake(str: string): boolean {
  if (typeof str !== 'string' || !str) return false;
  return /[ÃÂ][\u0080-\u024F\u2000-\u2150]|â€[™œž˜š›\u0080-\u00FF]|Ãƒ|Ã‚|Ã¢|Ã¡|Ã©|Ã­|Ã³|Ãº|Ã§|Ã£|Ãµ|Ãª|Ã´/.test(str);
}

/**
 * Reverses mojibake transformations up to 4 layers deep.
 * Safely leaves valid strings completely unchanged.
 */
export function fixMojibakeString(str: string): string {
  if (typeof str !== 'string' || !str) return str;
  // Ignore base64 images, long data, or strings without mojibake signatures
  if (str.startsWith('data:image/') || str.length > 20000) return str;

  let current = str;
  for (let iter = 0; iter < 4; iter++) {
    if (!hasMojibake(current)) {
      break;
    }
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
  return current;
}

/**
 * Removes dangerous or non-printable control characters from text strings (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F)
 * while safely preserving valid formatting characters (\t, \n, \r) and Unicode text.
 */
export function cleanControlCharacters(str: string): string {
  if (typeof str !== 'string' || !str) return str;
  if (str.startsWith('data:image/')) {
    // For base64 data URLs, strip any embedded whitespace or control characters
    return str.replace(/[\x00-\x20\x7F-\x9F]/g, '');
  }
  // Replace illegal ASCII control codes with nothing, except \t (0x09), \n (0x0A), \r (0x0D)
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Safely cleans unescaped ASCII control characters (0x00 - 0x1F) from inside raw JSON string literals.
 * This fixes "SyntaxError: Bad control character in string literal in JSON" when reading files.
 */
export function sanitizeRawJsonString(raw: string): string {
  if (typeof raw !== 'string') return '';
  let result = '';
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    const code = raw.charCodeAt(i);

    if (inString) {
      if (isEscaped) {
        result += char;
        isEscaped = false;
      } else if (char === '\\') {
        result += char;
        isEscaped = true;
      } else if (char === '"') {
        result += char;
        inString = false;
      } else if (code < 0x20) {
        if (char === '\n') result += '\\n';
        else if (char === '\r') result += '\\r';
        else if (char === '\t') result += '\\t';
        else if (char === '\b') result += '\\b';
        else if (char === '\f') result += '\\f';
        else if (code === 0x00) {
          // Ignore null byte
        } else {
          result += '\\u' + code.toString(16).padStart(4, '0');
        }
      } else {
        result += char;
      }
    } else {
      if (char === '"') {
        inString = true;
      }
      result += char;
    }
  }

  return result;
}

/**
 * Robust JSON parser that handles and repairs bad control characters in JSON string literals.
 */
export function safeJsonParse<T = any>(raw: string, fallback?: T): T {
  if (typeof raw !== 'string' || !raw.trim()) {
    if (fallback !== undefined) return fallback;
    throw new Error('String JSON vazia ou indefinida');
  }

  try {
    return JSON.parse(raw);
  } catch (firstErr: any) {
    // If standard parse failed (e.g. Bad control character in string literal), try sanitizing raw JSON string
    try {
      const sanitized = sanitizeRawJsonString(raw);
      return JSON.parse(sanitized);
    } catch (secondErr: any) {
      console.error('[safeJsonParse] Erro ao analisar JSON após sanitização:', secondErr?.message || secondErr);
      if (fallback !== undefined) return fallback;
      throw firstErr;
    }
  }
}

export interface SanitizerStats {
  checked: number;
  fixed: number;
  examples: Array<{ before: string; after: string }>;
}

/**
 * Recursively traverses objects/arrays and sanitizes string values.
 * Removes control characters and fixes Mojibake encoding issues.
 */
export function sanitizeUtf8Strings<T>(data: T, stats?: SanitizerStats): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (typeof data === 'string') {
    if (stats) stats.checked++;
    const cleaned = cleanControlCharacters(data);
    const fixed = fixMojibakeString(cleaned);
    if (fixed !== data) {
      if (stats) {
        stats.fixed++;
        if (stats.examples.length < 20) {
          stats.examples.push({ before: data, after: fixed });
        }
      }
      return fixed as unknown as T;
    }
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeUtf8Strings(item, stats)) as unknown as T;
  }
  if (typeof data === 'object') {
    const result: Record<string, any> = {};
    for (const key of Object.keys(data as Record<string, any>)) {
      const sanitizedKey = typeof key === 'string' ? fixMojibakeString(cleanControlCharacters(key)) : key;
      result[sanitizedKey] = sanitizeUtf8Strings((data as Record<string, any>)[key], stats);
    }
    return result as T;
  }
  return data;
}
