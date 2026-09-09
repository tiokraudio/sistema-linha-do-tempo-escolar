import { getAuthToken } from './api';

/**
 * Converte qualquer referência de foto do sistema (/uploads/photos/... ou /api/photos/...)
 * em uma URL autenticada segura (/api/photos/:filename?token=<token>).
 * Preserva data: URIs, blob: URLs e URLs externas inalteradas.
 */
export function getProtectedPhotoUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  // Data URIs e Blob URLs não necessitam de requisição ao servidor
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  // URLs absolutas externas (ex: CDN ou outro host)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      if (typeof window !== 'undefined' && parsed.origin !== window.location.origin) {
        return trimmed;
      }
      return getProtectedPhotoUrl(parsed.pathname + parsed.search);
    } catch {
      return trimmed;
    }
  }

  const token = getAuthToken();

  let filename = '';
  if (trimmed.startsWith('/uploads/photos/')) {
    filename = trimmed.slice('/uploads/photos/'.length);
  } else if (trimmed.startsWith('uploads/photos/')) {
    filename = trimmed.slice('uploads/photos/'.length);
  } else if (trimmed.startsWith('/api/photos/')) {
    filename = trimmed.slice('/api/photos/'.length);
  } else if (trimmed.startsWith('api/photos/')) {
    filename = trimmed.slice('api/photos/'.length);
  }

  if (filename) {
    const cleanFilename = filename.split('?')[0].split('#')[0];
    if (token) {
      return `/api/photos/${encodeURIComponent(cleanFilename)}?token=${encodeURIComponent(token)}`;
    }
    return `/api/photos/${encodeURIComponent(cleanFilename)}`;
  }

  // Caso seja outra rota relativa do sistema que exija token
  if (token && (trimmed.startsWith('/uploads/') || trimmed.startsWith('/api/'))) {
    const clean = trimmed.split('?')[0].split('#')[0];
    return `${clean}?token=${encodeURIComponent(token)}`;
  }

  return trimmed;
}
