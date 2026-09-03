import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getAuthToken, setAuthToken, clearAuthSession, getStoredEmail, apiFetch } from '../utils/api';
import { AuthStatusResponse } from '../types';

interface AuthContextType {
  isSetup: boolean;
  isAuthenticated: boolean;
  adminEmail: string | null;
  isLoading: boolean;
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<void>;
  setup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changeEmail: (currentPassword: string, newEmail: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  clearSessionExpired: () => void;
  refreshStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSetup, setIsSetup] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(getStoredEmail());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);

  const checkStatus = useCallback(async () => {
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await apiFetch('/api/auth/status', {
        method: 'GET',
        headers,
      });

      if (res.ok) {
        const data: AuthStatusResponse = await res.json();
        setIsSetup(data.isSetup);
        setIsAuthenticated(data.isAuthenticated);
        if (data.email) {
          setAdminEmail(data.email);
          setAuthToken(token, data.email);
        } else if (!data.isAuthenticated) {
          clearAuthSession();
        }
      } else {
        setIsAuthenticated(false);
        clearAuthSession();
      }
    } catch (err) {
      console.error('Erro ao verificar status de autenticação:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();

    const handleSessionExpired = () => {
      setIsAuthenticated(false);
      setSessionExpired(true);
    };

    window.addEventListener('auth:session_expired', handleSessionExpired);
    return () => {
      window.removeEventListener('auth:session_expired', handleSessionExpired);
    };
  }, [checkStatus]);

  const login = async (email: string, password: string) => {
    const cleanEmail = email.trim();
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'E-mail ou senha inválidos.');
    }

    setAuthToken(data.token, data.email);
    setAdminEmail(data.email);
    setIsAuthenticated(true);
    setSessionExpired(false);
  };

  const setup = async (email: string, password: string) => {
    const cleanEmail = email.trim();
    const res = await apiFetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao criar acesso administrativo.');
    }

    setAuthToken(data.token, data.email);
    setAdminEmail(data.email);
    setIsSetup(true);
    setIsAuthenticated(true);
    setSessionExpired(false);
  };

  const logout = async () => {
    try {
      const token = getAuthToken();
      if (token) {
        await apiFetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch (err) {
      console.error('Erro ao efetuar logout:', err);
    } finally {
      clearAuthSession();
      setAdminEmail(null);
      setIsAuthenticated(false);
      setSessionExpired(false);
    }
  };

  const changeEmail = async (currentPassword: string, newEmail: string) => {
    const cleanEmail = newEmail.trim();
    const res = await apiFetch('/api/auth/change-email', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newEmail: cleanEmail }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao atualizar e-mail.');
    }

    setAdminEmail(data.email);
    setAuthToken(getAuthToken(), data.email);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const res = await apiFetch('/api/auth/change-password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao atualizar senha.');
    }
  };

  const clearSessionExpired = () => {
    setSessionExpired(false);
  };

  return (
    <AuthContext.Provider
      value={{
        isSetup,
        isAuthenticated,
        adminEmail,
        isLoading,
        sessionExpired,
        login,
        setup,
        logout,
        changeEmail,
        changePassword,
        clearSessionExpired,
        refreshStatus: checkStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
};
