/**
 * Utilitário de Gerenciamento Dinâmico do Favicon da Aplicação
 *
 * Fonte Única da Verdade: Logotipo cadastrado em Configurações -> Dados da Escola (schoolConfig.schoolLogo)
 * Sem duplicação de dados, campos extras ou recompreção do arquivo original.
 */

import { apiFetch } from './api';

export const DEFAULT_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><rect width="32" height="32" rx="8" fill="%231e293b"/><path d="M16 6L4 12.5L16 19L28 12.5L16 6Z" fill="%233b82f6"/><path d="M8 15.5V22C8 24.5 11.5 26.5 16 26.5C20.5 26.5 24 24.5 24 22V15.5L16 20L8 15.5Z" fill="%2360a5fa"/><circle cx="28" cy="15" r="1.5" fill="%2393c5fd"/><line x1="28" y1="15" x2="28" y2="23" stroke="%2393c5fd" stroke-width="1.5" stroke-linecap="round"/></svg>`;

export const DEFAULT_FAVICON_DATA_URL = `data:image/svg+xml;utf8,${DEFAULT_FAVICON_SVG}`;

/**
 * Detecta o tipo MIME correspondente ao logotipo fornecido
 */
function detectMimeType(dataUrlOrUrl: string): string {
  if (dataUrlOrUrl.startsWith('data:image/svg+xml')) return 'image/svg+xml';
  if (dataUrlOrUrl.startsWith('data:image/png')) return 'image/png';
  if (dataUrlOrUrl.startsWith('data:image/jpeg') || dataUrlOrUrl.startsWith('data:image/jpg')) return 'image/jpeg';
  if (dataUrlOrUrl.startsWith('data:image/webp')) return 'image/webp';
  if (dataUrlOrUrl.startsWith('data:image/x-icon') || dataUrlOrUrl.startsWith('data:image/vnd.microsoft.icon')) return 'image/x-icon';
  if (dataUrlOrUrl.startsWith('data:image/gif')) return 'image/gif';

  // Se for URL externa ou relativa
  const cleanUrl = dataUrlOrUrl.split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.svg')) return 'image/svg+xml';
  if (cleanUrl.endsWith('.png')) return 'image/png';
  if (cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg')) return 'image/jpeg';
  if (cleanUrl.endsWith('.webp')) return 'image/webp';
  if (cleanUrl.endsWith('.ico')) return 'image/x-icon';
  if (cleanUrl.endsWith('.gif')) return 'image/gif';

  return 'image/png';
}

/**
 * Atualiza dinamicamente o favicon e o apple-touch-icon da aplicação
 * Substitui os links no DOM do documento para forçar o navegador a renderizar o novo ícone imediatamente
 */
export function updateAppFavicon(schoolLogo?: string | null): void {
  if (typeof document === 'undefined') return;

  const hasCustomLogo = Boolean(schoolLogo && typeof schoolLogo === 'string' && schoolLogo.trim().length > 0);
  const targetHref = hasCustomLogo ? (schoolLogo as string).trim() : DEFAULT_FAVICON_DATA_URL;
  const targetType = hasCustomLogo ? detectMimeType(targetHref) : 'image/svg+xml';

  // Remover links de favicon existentes para disparar atualização imediata no navegador
  const existingFavicons = document.querySelectorAll(
    "link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon'], link#app-favicon"
  );
  existingFavicons.forEach((el) => el.remove());

  // 1. Criar novo link rel="icon"
  const iconLink = document.createElement('link');
  iconLink.id = 'app-favicon';
  iconLink.rel = 'icon';
  iconLink.type = targetType;
  iconLink.href = targetHref;
  document.head.appendChild(iconLink);

  // 2. Criar novo link rel="apple-touch-icon" para atalhos e Safari móvel/desktop
  const appleLink = document.createElement('link');
  appleLink.rel = 'apple-touch-icon';
  appleLink.href = targetHref;
  document.head.appendChild(appleLink);
}

/**
 * Inicialização imediata do favicon buscando a configuração pública inicial da escola
 * Executado logo no arranque da página, antes ou durante a autenticação
 */
export async function initFaviconFromPublicConfig(): Promise<void> {
  try {
    const res = await apiFetch('/api/public-config');
    if (res.ok) {
      const data = await res.json();
      if (data && data.schoolLogo) {
        updateAppFavicon(data.schoolLogo);
        return;
      }
    }
  } catch (err) {
    // Silently fallback to default favicon
  }
  updateAppFavicon(null);
}
