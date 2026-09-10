import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import express from 'express';
import { safeJsonParse } from './utf8Sanitizer';

const DATA_DIR = path.join(process.cwd(), 'data');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

export interface AdminAccount {
  email: string;
  passwordHash: string; // hex string of derived key
  passwordSalt: string; // hex string of salt
  displayName?: string;
  role?: string;
  avatarUrl?: string | null;
  department?: string;
  preferences?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSession {
  token: string;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string; // ISO String (e.g. 7 days from creation)
}

export interface AuthStore {
  admin: AdminAccount | null;
  sessions: AdminSession[];
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadAuthStore(): AuthStore {
  if (fs.existsSync(AUTH_FILE)) {
    try {
      const raw = fs.readFileSync(AUTH_FILE, 'utf-8');
      if (raw.trim()) {
        const parsed = safeJsonParse(raw, null);
        if (parsed) {
          return {
            admin: parsed.admin || null,
            sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
          };
        }
      }
    } catch (err) {
      console.error('[Auth] Erro ao ler auth.json:', err);
    }
  }
  return { admin: null, sessions: [] };
}

function saveAuthStore(store: AuthStore) {
  try {
    fs.writeFileSync(AUTH_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Auth] Erro ao gravar auth.json:', err);
  }
}

let authStore: AuthStore = loadAuthStore();

/**
 * Derives a PBKDF2 hash from a plain text password and salt.
 */
function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

/**
 * Constant-time safe password verification.
 */
function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const derived = hashPassword(password, salt);
    const hashBuf = Buffer.from(hash, 'hex');
    const derivedBuf = Buffer.from(derived, 'hex');
    if (hashBuf.length !== derivedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(hashBuf, derivedBuf);
  } catch (err) {
    return false;
  }
}

/**
 * Validates email format.
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= 254;
}

/**
 * Checks if the initial admin account is already set up.
 */
export function isAuthSetup(): boolean {
  return Boolean(authStore.admin && authStore.admin.email && authStore.admin.passwordHash);
}

/**
 * Gets the current admin email (or null if not setup).
 */
export function getAdminEmail(): string | null {
  return authStore.admin?.email || null;
}

/**
 * Gets the current admin profile info.
 */
export function getAdminProfile() {
  if (!authStore.admin) return null;
  return {
    email: authStore.admin.email,
    displayName: authStore.admin.displayName || 'Administrador Geral',
    role: authStore.admin.role || 'Administrador',
    avatarUrl: authStore.admin.avatarUrl || null,
    department: authStore.admin.department || 'Gestão Escolar & Tecnologia',
    preferences: authStore.admin.preferences || {
      confirmCriticalActions: true,
      notifyBackups: true,
      uppercaseNames: true,
    },
    createdAt: authStore.admin.createdAt,
    updatedAt: authStore.admin.updatedAt,
  };
}

/**
 * Updates administrator profile details (display name, role, avatar, department, preferences).
 */
export function updateAdminProfile(data: {
  displayName?: string;
  role?: string;
  avatarUrl?: string | null;
  department?: string;
  preferences?: Record<string, any>;
}) {
  if (!isAuthSetup() || !authStore.admin) {
    throw new Error('Acesso administrativo não configurado.');
  }

  if (data.displayName !== undefined) {
    authStore.admin.displayName = String(data.displayName).trim();
  }
  if (data.role !== undefined) {
    authStore.admin.role = String(data.role).trim();
  }
  if (data.avatarUrl !== undefined) {
    authStore.admin.avatarUrl = data.avatarUrl;
  }
  if (data.department !== undefined) {
    authStore.admin.department = String(data.department).trim();
  }
  if (data.preferences !== undefined && typeof data.preferences === 'object') {
    authStore.admin.preferences = {
      ...(authStore.admin.preferences || {}),
      ...data.preferences,
    };
  }

  authStore.admin.updatedAt = new Date().toISOString();
  saveAuthStore(authStore);

  return getAdminProfile();
}

/**
 * Cleans up expired sessions.
 */
function purgeExpiredSessions() {
  const now = new Date().getTime();
  const valid = authStore.sessions.filter((s) => {
    const exp = new Date(s.expiresAt).getTime();
    return exp > now;
  });
  if (valid.length !== authStore.sessions.length) {
    authStore.sessions = valid;
    saveAuthStore(authStore);
  }
}

/**
 * Creates a new authenticated session for the admin.
 */
export function createSession(): AdminSession {
  purgeExpiredSessions();
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days session

  const session: AdminSession = {
    token,
    createdAt: now.toISOString(),
    lastActivityAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };

  authStore.sessions.push(session);
  saveAuthStore(authStore);
  return session;
}

/**
 * Validates a session token.
 */
export function validateSession(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  authStore = loadAuthStore();
  if (!isAuthSetup()) return false;

  const now = new Date().getTime();
  const session = authStore.sessions.find((s) => s.token === token);
  if (!session) return false;

  const exp = new Date(session.expiresAt).getTime();
  if (exp <= now) {
    // Expired, remove
    authStore.sessions = authStore.sessions.filter((s) => s.token !== token);
    saveAuthStore(authStore);
    return false;
  }

  // Update last activity
  session.lastActivityAt = new Date().toISOString();
  return true;
}

/**
 * Revokes a single session (Logout).
 */
export function revokeSession(token: string): boolean {
  if (!token) return false;
  authStore = loadAuthStore();
  const initialLength = authStore.sessions.length;
  authStore.sessions = authStore.sessions.filter((s) => s.token !== token);
  if (authStore.sessions.length !== initialLength) {
    saveAuthStore(authStore);
    return true;
  }
  return false;
}

/**
 * First-time admin setup.
 */
export function setupAdmin(emailInput: string, passwordInput: string): { token: string; email: string } {
  if (isAuthSetup()) {
    throw new Error('O acesso administrativo já foi configurado anteriormente.');
  }

  const cleanEmail = String(emailInput || '').trim().toLowerCase();
  if (!isValidEmail(cleanEmail)) {
    throw new Error('E-mail informado é inválido.');
  }

  const cleanPassword = String(passwordInput || '');
  if (cleanPassword.length < 6) {
    throw new Error('A senha deve conter no mínimo 6 caracteres.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(cleanPassword, salt);
  const now = new Date().toISOString();

  authStore.admin = {
    email: cleanEmail,
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: now,
    updatedAt: now,
  };
  authStore.sessions = [];

  const session = createSession();
  saveAuthStore(authStore);

  return {
    token: session.token,
    email: cleanEmail,
  };
}

// --- PROTEÇÃO CONTRA TENTATIVAS EXCESSIVAS DE AUTENTICAÇÃO (BRUTE FORCE RATE LIMITING) ---
// Configuração em memória de segurança para o único acesso administrativo:
// 1. Limite de tentativas consecutivas inválidas antes do bloqueio temporário: 5 tentativas
// 2. Duração do bloqueio temporário: 5 minutos (300.000 ms)
export const MAX_CONSECUTIVE_LOGIN_FAILURES = 5;
export const LOGIN_LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutos

let consecutiveFailedLoginAttempts = 0;
let loginLockoutExpiresAt: number | null = null;

/**
 * Retorna o status atual do bloqueio temporário de login em memória.
 */
export function getLoginLockoutStatus(): { isLocked: boolean; remainingSeconds: number } {
  if (loginLockoutExpiresAt !== null) {
    const now = Date.now();
    if (now < loginLockoutExpiresAt) {
      const remainingSeconds = Math.ceil((loginLockoutExpiresAt - now) / 1000);
      return { isLocked: true, remainingSeconds };
    }
    // O período de bloqueio expirou: liberar acesso e resetar contador
    loginLockoutExpiresAt = null;
    consecutiveFailedLoginAttempts = 0;
  }
  return { isLocked: false, remainingSeconds: 0 };
}

/**
 * Authenticates the admin user with brute force rate limiting.
 */
export function authenticate(emailInput: string, passwordInput: string): { token: string; email: string } {
  if (!isAuthSetup() || !authStore.admin) {
    throw new Error('Acesso administrativo não configurado.');
  }

  // 1. Verificar se há bloqueio temporário ativo
  const lockout = getLoginLockoutStatus();
  if (lockout.isLocked) {
    const minutes = Math.ceil(lockout.remainingSeconds / 60);
    throw new Error(
      `Acesso administrativo temporariamente bloqueado por excesso de tentativas inválidas. Tente novamente em ${
        minutes > 1 ? `${minutes} minutos` : `${lockout.remainingSeconds} segundos`
      }.`
    );
  }

  const cleanEmail = String(emailInput || '').trim().toLowerCase();
  const cleanPassword = String(passwordInput || '');

  const isEmailMatch = authStore.admin.email.toLowerCase() === cleanEmail;
  const isPasswordMatch = isEmailMatch
    ? verifyPassword(cleanPassword, authStore.admin.passwordHash, authStore.admin.passwordSalt)
    : false;

  if (!isEmailMatch || !isPasswordMatch) {
    consecutiveFailedLoginAttempts += 1;

    if (consecutiveFailedLoginAttempts >= MAX_CONSECUTIVE_LOGIN_FAILURES) {
      loginLockoutExpiresAt = Date.now() + LOGIN_LOCKOUT_DURATION_MS;
      throw new Error(
        'E-mail ou senha inválidos. Limite de 5 tentativas consecutivas atingido. Acesso bloqueado por 5 minutos por segurança.'
      );
    }

    throw new Error(
      `E-mail ou senha inválidos. (Tentativa ${consecutiveFailedLoginAttempts} de ${MAX_CONSECUTIVE_LOGIN_FAILURES})`
    );
  }

  // Autenticação bem-sucedida: resetar contadores de falhas e bloqueios
  consecutiveFailedLoginAttempts = 0;
  loginLockoutExpiresAt = null;

  const session = createSession();
  return {
    token: session.token,
    email: authStore.admin.email,
  };
}

/**
 * Updates administrator email. Requires current password verification.
 */
export function updateAdminEmail(currentPassword: string, newEmailInput: string): { email: string } {
  if (!isAuthSetup() || !authStore.admin) {
    throw new Error('Acesso administrativo não configurado.');
  }

  const isMatch = verifyPassword(currentPassword, authStore.admin.passwordHash, authStore.admin.passwordSalt);
  if (!isMatch) {
    throw new Error('Senha atual incorreta.');
  }

  const cleanEmail = String(newEmailInput || '').trim().toLowerCase();
  if (!isValidEmail(cleanEmail)) {
    throw new Error('Novo e-mail informado é inválido.');
  }

  authStore.admin.email = cleanEmail;
  authStore.admin.updatedAt = new Date().toISOString();
  saveAuthStore(authStore);

  return { email: cleanEmail };
}

/**
 * Updates administrator password. Requires current password verification.
 */
export function updateAdminPassword(currentPassword: string, newPasswordInput: string, currentToken?: string): boolean {
  if (!isAuthSetup() || !authStore.admin) {
    throw new Error('Acesso administrativo não configurado.');
  }

  const isMatch = verifyPassword(currentPassword, authStore.admin.passwordHash, authStore.admin.passwordSalt);
  if (!isMatch) {
    throw new Error('Senha atual incorreta.');
  }

  const cleanNewPassword = String(newPasswordInput || '');
  if (cleanNewPassword.length < 6) {
    throw new Error('A nova senha deve conter no mínimo 6 caracteres.');
  }

  const newSalt = crypto.randomBytes(16).toString('hex');
  const newHash = hashPassword(cleanNewPassword, newSalt);

  authStore.admin.passwordHash = newHash;
  authStore.admin.passwordSalt = newSalt;
  authStore.admin.updatedAt = new Date().toISOString();
  // Revogação de segurança de todas as sessões anteriores após troca de senha
  if (currentToken) {
    authStore.sessions = authStore.sessions.filter((s) => s.token === currentToken);
  } else {
    authStore.sessions = [];
  }
  saveAuthStore(authStore);

  return true;
}

/**
 * Nome padronizado do cookie de sessão HTTP
 */
export const AUTH_COOKIE_NAME = 'auth_session';

/**
 * Utilitário leve e nativo para parser de cookies do cabeçalho HTTP.
 */
export function parseCookies(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return list;

  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const name = parts[0]?.trim();
    if (!name) return;
    const value = parts.slice(1).join('=').trim();
    try {
      list[name] = decodeURIComponent(value);
    } catch {
      list[name] = value;
    }
  });

  return list;
}

/**
 * Determina se a requisição atual deve utilizar o atributo Secure no cookie.
 * 
 * Regras estritas de segurança para o atributo Secure:
 * 1. HTTPS direto (req.secure === true ou req.protocol === 'https') → true
 * 2. Proxy HTTPS confiável informando protocolo HTTPS (X-Forwarded-Proto: https, etc.) → true
 * 3. Qualquer conexão HTTP real (localhost, 127.0.0.1, IP de rede local privada como 10.10.4.10:3000, 
 *    192.168.x.x, mesmo em NODE_ENV=production) → false
 *
 * CRÍTICO: O atributo Secure NUNCA deve depender cegamente de NODE_ENV === 'production'.
 * Em redes locais de escolas ou empresas onde o servidor é acessado via HTTP (ex: http://10.10.4.10:3000),
 * se o cookie receber 'Secure', navegadores modernos descartam ou recusam-se a enviar o cookie
 * em requisições de fotos e recursos protegidos (como <img src="/api/photos/:filename">).
 */
export function isSecureRequest(req: express.Request): boolean {
  // 1. Conexão direta HTTPS (TLS no socket ou protocolo HTTPS do Express)
  if (req.secure === true || req.protocol === 'https') {
    return true;
  }

  // 2. Proxy reverso informando protocolo HTTPS (Cloud Run, Nginx, Caddy, Traefik, etc.)
  const proto = req.headers['x-forwarded-proto'];
  if (proto) {
    const protoStr = Array.isArray(proto) ? proto[0] : proto;
    if (typeof protoStr === 'string') {
      const clientProto = protoStr.split(',')[0].trim().toLowerCase();
      if (clientProto === 'https') {
        return true;
      }
    }
  }

  // 3. Cabeçalhos alternativos padrão de terminação SSL por proxies (IIS ARR, AWS ELB, etc.)
  const forwardedSsl = req.headers['x-forwarded-ssl'];
  if (typeof forwardedSsl === 'string' && forwardedSsl.toLowerCase() === 'on') {
    return true;
  }

  const frontEndHttps = req.headers['front-end-https'];
  if (typeof frontEndHttps === 'string' && frontEndHttps.toLowerCase() === 'on') {
    return true;
  }

  // 4. Qualquer conexão HTTP não criptografada (localhost, 127.0.0.1, LAN IP como 10.10.4.10, etc.)
  return false;
}

/**
 * Retorna as opções padronizadas para emissão do cookie de sessão.
 * Coerente com a duração da sessão no backend (7 dias).
 */
export function getSessionCookieOptions(
  req: express.Request,
  maxAgeMs: number = 7 * 24 * 60 * 60 * 1000
): express.CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: maxAgeMs,
    secure: isSecureRequest(req),
  };
}

/**
 * Retorna as opções para remoção/expiração imediata do cookie no navegador.
 * Mantém paridade estrita com getSessionCookieOptions para garantir que o navegador
 * encontre e descarte o cookie corretamente (mesmo path, httpOnly, sameSite e secure).
 */
export function getClearCookieOptions(req: express.Request): express.CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    secure: isSecureRequest(req),
  };
}

/**
 * Extrai o token de sessão da requisição seguindo a ordem de precedência:
 * 1. Cookie HTTP seguro (HttpOnly: auth_session)
 * 2. Header Authorization (Bearer <token>) para compatibilidade transitória da API
 *
 * NOTA DE SEGURANÇA: req.query.token foi expressamente REMOVIDO para eliminar credenciais em URLs.
 */
export function extractTokenFromRequest(req: express.Request): string | null {
  // 1. Prioridade máxima: Cookie de sessão HTTP
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    const sessionCookie = cookies[AUTH_COOKIE_NAME];
    if (sessionCookie && typeof sessionCookie === 'string' && sessionCookie.trim()) {
      return sessionCookie.trim();
    }
  }

  // 2. Compatibilidade para chamadas da API via frontend: Authorization Bearer
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.substring(7).trim();
    if (bearerToken) {
      return bearerToken;
    }
  }

  // Query string ?token= NÃO é mais aceita para autenticação
  return null;
}

/**
 * Reusable Express authentication middleware.
 * Autentica preferencialmente pelo Cookie de Sessão HttpOnly ou por Bearer Token.
 * Query string ?token= NÃO autentica mais (HTTP 401).
 */
export function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = extractTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ error: 'Não autorizado. Sessão inválida ou não informada.' });
  }

  if (!validateSession(token)) {
    return res.status(401).json({ error: 'Não autorizado. Sessão expirada ou inválida.' });
  }

  next();
}
