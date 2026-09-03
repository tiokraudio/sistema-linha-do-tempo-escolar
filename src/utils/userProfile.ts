import { UserProfile } from '../types';
import { apiFetch, getStoredEmail } from './api';

const PROFILE_STORAGE_KEY = 'school_user_profile';

export const DEFAULT_PROFILE: UserProfile = {
  email: '',
  displayName: 'Administrador Geral',
  role: 'Administrador',
  avatarUrl: null,
  department: 'Gestão Escolar & Secretaria',
  preferences: {
    confirmCriticalActions: true,
    notifyBackups: true,
    uppercaseNames: true,
  },
};

/**
 * Loads stored profile from local storage, with fallback to default.
 */
export function getLocalUserProfile(fallbackEmail?: string | null): UserProfile {
  const email = fallbackEmail || getStoredEmail() || '';
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_PROFILE,
        ...parsed,
        email: parsed.email || email,
      };
    }
  } catch (e) {
    console.error('Erro ao ler perfil do localStorage:', e);
  }

  return {
    ...DEFAULT_PROFILE,
    email,
  };
}

/**
 * Saves profile to local storage and dispatches update event.
 */
export function setLocalUserProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:profile_updated', { detail: profile }));
    }
  } catch (e) {
    console.error('Erro ao gravar perfil no localStorage:', e);
  }
}

/**
 * Fetches user profile from backend with local fallback.
 */
export async function fetchServerUserProfile(fallbackEmail?: string | null): Promise<UserProfile> {
  const local = getLocalUserProfile(fallbackEmail);
  try {
    const res = await apiFetch('/api/auth/profile');
    if (res.ok) {
      const data: UserProfile = await res.json();
      const merged: UserProfile = {
        ...DEFAULT_PROFILE,
        ...local,
        ...data,
        email: data.email || local.email,
        preferences: {
          ...DEFAULT_PROFILE.preferences,
          ...(local.preferences || {}),
          ...(data.preferences || {}),
        },
      };
      setLocalUserProfile(merged);
      return merged;
    }
  } catch (e) {
    console.warn('Usando perfil local (servidor inacessível ou offline):', e);
  }
  return local;
}

/**
 * Updates user profile on backend and locally.
 */
export async function updateServerUserProfile(
  updates: Partial<UserProfile>
): Promise<UserProfile> {
  const current = getLocalUserProfile();
  const nextProfile: UserProfile = {
    ...current,
    ...updates,
    preferences: {
      ...current.preferences,
      ...(updates.preferences || {}),
    },
  };

  // Atualiza localmente primeiro (otimista)
  setLocalUserProfile(nextProfile);

  try {
    const res = await apiFetch('/api/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.profile) {
        const confirmedProfile: UserProfile = {
          ...nextProfile,
          ...data.profile,
        };
        setLocalUserProfile(confirmedProfile);
        return confirmedProfile;
      }
    }
  } catch (err) {
    console.error('Erro ao persistir perfil no servidor:', err);
  }

  return nextProfile;
}
