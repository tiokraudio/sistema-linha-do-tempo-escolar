/**
 * Client-safe UTF-8 & Mojibake Sanitization Utility
 */

const cp1252ToByte: Record<string, number> = {
  '\u20AC': 0x80,
  '\u201A': 0x82,
  '\u0192': 0x83,
  '\u201E': 0x84,
  '\u2026': 0x85,
  '\u2020': 0x86,
  '\u2021': 0x87,
  '\u02C6': 0x88,
  '\u2030': 0x89,
  '\u0160': 0x8A,
  '\u2039': 0x8B,
  '\u0152': 0x8C,
  '\u017D': 0x8E,
  '\u2018': 0x91,
  '\u2019': 0x92,
  '\u201C': 0x93,
  '\u201D': 0x94,
  '\u2022': 0x95,
  '\u2013': 0x96,
  '\u2014': 0x97,
  '\u02DC': 0x98,
  '\u2122': 0x99,
  '\u0161': 0x9A,
  '\u203A': 0x9B,
  '\u0153': 0x9C,
  '\u017E': 0x9E,
  '\u0178': 0x9F,
};

function stringToCp1252Uint8Array(str: string): Uint8Array | null {
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
  return new Uint8Array(bytes);
}

export function hasMojibake(str: string): boolean {
  if (typeof str !== 'string' || !str) return false;
  return /[ÃÂ][\u0080-\u024F\u2000-\u2150]|â€[™œž˜š›\u0080-\u00FF]|Ãƒ|Ã‚|Ã¢|Ã¡|Ã©|Ã­|Ã³|Ãº|Ã§|Ã£|Ãµ|Ãª|Ã´/.test(str);
}

export function fixMojibakeString(str: string): string {
  if (typeof str !== 'string' || !str) return str;
  if (str.startsWith('data:image/') || str.length > 20000) return str;

  let current = str;
  const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { fatal: true }) : null;

  for (let iter = 0; iter < 4; iter++) {
    if (!hasMojibake(current)) {
      break;
    }
    const bytes = stringToCp1252Uint8Array(current);
    if (!bytes) break;
    try {
      if (decoder) {
        const decoded = decoder.decode(bytes);
        if (decoded && decoded !== current) {
          current = decoded;
        } else {
          break;
        }
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  return current;
}

export function sanitizeUtf8Strings<T>(data: T): T {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    return fixMojibakeString(data) as unknown as T;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeUtf8Strings(item)) as unknown as T;
  }
  if (typeof data === 'object') {
    const result: Record<string, any> = {};
    for (const key of Object.keys(data as Record<string, any>)) {
      const sanitizedKey = typeof key === 'string' ? fixMojibakeString(key) : key;
      result[sanitizedKey] = sanitizeUtf8Strings((data as Record<string, any>)[key]);
    }
    return result as T;
  }
  return data;
}
