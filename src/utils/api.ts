const TOKEN_KEY = 'auth_token';
const EMAIL_KEY = 'auth_email';

// Salva referência nativa de fetch para evitar qualquer recursão ou interferência de interceptores
const nativeFetch: typeof fetch =
  typeof window !== 'undefined' && typeof window.fetch === 'function'
    ? window.fetch.bind(window)
    : fetch;

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null, email?: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      if (email) {
        localStorage.setItem(EMAIL_KEY, email);
      }
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EMAIL_KEY);
    }
  } catch (err) {
    console.error('Error saving auth token to localStorage:', err);
  }
}

export function getStoredEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

export function clearAuthSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
  } catch (err) {
    console.error('Error clearing auth session:', err);
  }
}

/**
 * Standard API request wrapper that automatically attaches the Authorization header
 * and handles 401 unauthorized session expiration cleanly.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  let finalInit: RequestInit = init ? { ...init } : {};

  if (url.startsWith('/api/') || url.includes('/api/')) {
    const token = getAuthToken();
    const isPublicEndpoint =
      url.includes('/api/auth/login') ||
      url.includes('/api/auth/setup') ||
      url.includes('/api/public-config') ||
      url.includes('/api/health');

    if (token && !isPublicEndpoint) {
      const existingHeaders = init?.headers || (input instanceof Request ? input.headers : {});
      const headers = new Headers(existingHeaders);
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      finalInit.headers = headers;
    }
  }

  // Usa estritamente a referência nativa de fetch
  const response = await nativeFetch(input, finalInit);

  if (response.status === 401) {
    const isAuthAction =
      url.includes('/api/auth/login') ||
      url.includes('/api/auth/setup') ||
      url.includes('/api/auth/status');

    if (!isAuthAction) {
      clearAuthSession();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:session_expired'));
      }
    }
  }

  return response;
}

/**
 * Safe initializer for API client listeners (não substitui globalmente o window.fetch para evitar recursões)
 */
export function initApiInterceptor() {
  // Mantido para compatibilidade de inicialização limpa sem monkey-patching global de fetch
}


