import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { School, Lock, Mail, KeyRound, AlertCircle, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react';
import { Button } from './ui/Button';
import { Footer } from './Footer';

export const LoginScreen: React.FC = () => {
  const { isSetup, login, setup, sessionExpired, clearSessionExpired } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setErrorMsg(null);
    clearSessionExpired();

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Informe o e-mail cadastrado.');
      return;
    }
    if (!password) {
      setErrorMsg('Informe a senha.');
      return;
    }

    setIsLoading(true);
    try {
      await login(cleanEmail, password);
    } catch (err: any) {
      setErrorMsg(err.message || 'E-mail ou senha inválidos.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setErrorMsg(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Informe um endereço de e-mail válido.');
      return;
    }
    if (!password) {
      setErrorMsg('Informe uma senha.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('A senha deve conter no mínimo 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('A confirmação da senha não confere com a senha informada.');
      return;
    }

    setIsLoading(true);
    try {
      await setup(cleanEmail, password);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao criar o acesso administrativo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden selection:bg-blue-600 selection:text-white">
      {/* Subtle Background Accents */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/30 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex p-3 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
              <School className="w-6 h-6" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100 tracking-tight">
              Linha do Tempo Escolar
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Sistema de Histórico Fotográfico e Matrículas
            </p>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800/90 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-5">
          {/* Card Title & Description */}
          <div className="border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-2 text-blue-400 text-xs font-semibold uppercase tracking-wider">
              {isSetup ? (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>Acesso Administrativo</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Primeira Configuração</span>
                </>
              )}
            </div>
            <h2 className="text-lg font-bold text-white mt-1">
              {isSetup ? 'Entrar no Sistema' : 'Configurar acesso administrativo'}
            </h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              {isSetup
                ? 'Informe suas credenciais de administrador para acessar o sistema.'
                : 'Defina o e-mail e a senha do administrador para iniciar o uso do sistema.'}
            </p>
          </div>

          {/* Session Expired Banner */}
          {sessionExpired && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2.5 text-xs text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <span>Sua sessão expirou. Por favor, informe suas credenciais novamente.</span>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2.5 text-xs text-rose-300 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span className="flex-1">{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          {isSetup ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  E-mail
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@escola.com.br"
                    autoComplete="email"
                    autoFocus
                    disabled={isLoading}
                    className="w-full pl-9 pr-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Senha
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite sua senha"
                    autoComplete="current-password"
                    disabled={isLoading}
                    className="w-full pl-9 pr-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isLoading}
                disabled={isLoading}
                className="w-full justify-center text-sm font-semibold mt-2 py-2.5"
              >
                {isLoading ? 'Entrando...' : 'Entrar'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSetupSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  E-mail do Administrador
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ex: admin@escola.com.br"
                    autoComplete="email"
                    autoFocus
                    disabled={isLoading}
                    className="w-full pl-9 pr-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Senha
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo de 6 caracteres"
                    autoComplete="new-password"
                    disabled={isLoading}
                    className="w-full pl-9 pr-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Confirmar Senha
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha"
                    autoComplete="new-password"
                    disabled={isLoading}
                    className="w-full pl-9 pr-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isLoading}
                disabled={isLoading}
                className="w-full justify-center text-sm font-semibold mt-2 py-2.5"
              >
                {isLoading ? 'Criando acesso...' : 'Criar acesso'}
              </Button>
            </form>
          )}
        </div>

        {/* Footer info */}
        <div className="text-center">
          <p className="text-[11px] text-slate-500">
            Acesso exclusivo para administradores autorizados.
          </p>
        </div>
      </div>

      <Footer variant="dark" className="mt-6 z-10" />
    </div>
  );
};
