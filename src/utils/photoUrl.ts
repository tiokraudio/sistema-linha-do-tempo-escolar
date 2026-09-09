import { getAuthToken } from './api';

/**
 * Converte exclusivamente referências conhecidas de fotos do sistema
 * (/uploads/photos/<arquivo>, uploads/photos/<arquivo>, /api/photos/<arquivo>, api/photos/<arquivo>)
 * em uma URL autenticada segura (/api/photos/<arquivo>?token=<token>).
 *
 * Preserva estritamente inalteradas:
 * - Data URIs (data:image/...)
 * - Blob URLs (blob:...)
 * - Rota pública do logotipo institucional (/api/public-logo)
 * - URLs externas
 * - Qualquer rota que não seja foto pessoal protegida
 */
export function getProtectedPhotoUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  // 1. Data URIs e Blob URLs não necessitam de requisição ao servidor
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  // 2. Rota pública do logotipo institucional (não requer token)
  if (trimmed === '/api/public-logo' || trimmed === 'api/public-logo') {
    return '/api/public-logo';
  }

  // 3. Resolução de caminhos provenientes de URLs absolutas
  let pathname = trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      // Se a URL absoluta contiver um caminho de fotos do sistema, extrai o pathname
      if (
        parsed.pathname.includes('/uploads/photos/') ||
        parsed.pathname.includes('/api/photos/')
      ) {
        pathname = parsed.pathname;
      } else {
        // URL externa legítima fora do escopo de fotos internas: preservar inalterada
        return trimmed;
      }
    } catch {
      return trimmed;
    }
  }

  // 4. Identificar estritamente referências de fotos conhecidas
  let rawFilename: string | null = null;
  if (pathname.startsWith('/uploads/photos/')) {
    rawFilename = pathname.slice('/uploads/photos/'.length);
  } else if (pathname.startsWith('uploads/photos/')) {
    rawFilename = pathname.slice('uploads/photos/'.length);
  } else if (pathname.startsWith('/api/photos/')) {
    rawFilename = pathname.slice('/api/photos/'.length);
  } else if (pathname.startsWith('api/photos/')) {
    rawFilename = pathname.slice('api/photos/'.length);
  }

  // Se NÃO for uma referência de foto conhecida, não modifica a URL (sem comportamento genérico)
  if (rawFilename === null) {
    return trimmed;
  }

  // 5. Normalizar o filename: descarta query strings ou hashes anteriores para não duplicar token
  let cleanFilename = rawFilename.split('?')[0].split('#')[0];
  while (cleanFilename.startsWith('/')) {
    cleanFilename = cleanFilename.slice(1);
  }
  if (!cleanFilename) {
    return '';
  }

  // Decodifica caso já tenha vindo codificado, evitando dupla codificação (%2520)
  let decodedFilename: string;
  try {
    decodedFilename = decodeURIComponent(cleanFilename);
  } catch {
    decodedFilename = cleanFilename;
  }

  // 6. Montagem da URL autenticada usando a sessão atual
  const token = getAuthToken();
  const encodedName = encodeURIComponent(decodedFilename);

  if (token) {
    return `/api/photos/${encodedName}?token=${encodeURIComponent(token)}`;
  }
  return `/api/photos/${encodedName}`;
}
