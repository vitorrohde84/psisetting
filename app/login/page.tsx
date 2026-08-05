"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  User,
  CheckCircle,
  ArrowLeft,
  KeyRound,
} from "lucide-react";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  // Mode
  const [mode, setMode] = useState<Mode>("login");

  // Shared fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Register fields
  const [nome, setNome] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [registerSuccess, setRegisterSuccess] = useState(false);

  // Check for invite code in URL and expired session
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);

      // Check expired session
      if (params.get("expired") === "true") {
        setError("Sua sessão expirou por inatividade. Faça login novamente.");
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      // Check invite code
      const convite = params.get("convite");
      if (convite) {
        setInviteCode(convite);
        setMode("register");
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  // Login handler
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("Supabase Login Error:", error);
      setError(
        `Erro Supabase: ${error.message} (Verifique se o e-mail foi confirmado)`
      );
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  // Register handler
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validate
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (!inviteCode.trim()) {
      setError("Código de convite é obrigatório.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          email: email.trim(),
          password,
          invite_code: inviteCode.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erro ao criar conta.");
        setLoading(false);
        return;
      }

      // Success
      setRegisterSuccess(true);
      setLoading(false);
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setLoading(false);
    }
  }

  // Switch mode and clear state
  function switchMode(newMode: Mode) {
    setMode(newMode);
    setError(null);
    setRegisterSuccess(false);
    setPassword("");
    setConfirmPassword("");
  }

  // Success message after registration
  if (registerSuccess) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-secondary/5 blur-3xl" />
        </div>

        <div className="relative w-full max-w-md">
          <div className="bg-surface rounded-2xl shadow-[0_4px_32px_rgba(0,0,0,0.06)] border border-border/60 p-8 text-center">
            <div className="w-14 h-14 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={28} />
            </div>
            <h2 className="text-xl font-serif font-semibold text-text mb-2">
              Conta criada com sucesso!
            </h2>
            <p className="text-sm text-text-muted mb-6">
              Sua conta foi criada. Faça login com suas credenciais para acessar
              o sistema.
            </p>
            <button
              onClick={() => switchMode("login")}
              className="w-full py-2.5 px-4 rounded-xl bg-primary text-white font-medium text-sm
                         hover:bg-primary-dark active:scale-[0.98]
                         focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2
                         transition-all duration-200 cursor-pointer"
            >
              Ir para o Login
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-secondary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-10">
          {/* Monogram */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
            <span className="text-2xl font-serif font-semibold text-primary">
              HL
            </span>
          </div>
          <h1 className="text-2xl font-serif font-semibold text-text tracking-tight">
            Sistema de Gestão
          </h1>
          <p className="mt-1.5 text-sm text-text-muted">
            Para profissionais de psicologia
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface rounded-2xl shadow-[0_4px_32px_rgba(0,0,0,0.06)] border border-border/60 p-8">
          {/* Mode Toggle */}
          <div className="flex bg-background rounded-xl p-1 mb-6">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                mode === "login"
                  ? "bg-surface text-text shadow-sm"
                  : "text-text-muted hover:text-text"
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                mode === "register"
                  ? "bg-surface text-text shadow-sm"
                  : "text-text-muted hover:text-text"
              }`}
            >
              Criar Conta
            </button>
          </div>

          {mode === "login" ? (
            /* ─── Login Form ─── */
            <form onSubmit={handleLogin} className="space-y-5">
              {/* Email */}
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-sm font-medium text-text-muted mb-1.5"
                >
                  E-mail
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/60"
                    size={18}
                  />
                  <input
                    id="login-email"
                    type="email"
                    required
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-border
                               text-text placeholder:text-text-muted/50
                               focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                               transition-all text-sm"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="login-password"
                  className="block text-sm font-medium text-text-muted mb-1.5"
                >
                  Senha
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/60"
                    size={18}
                  />
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-background border border-border
                               text-text placeholder:text-text-muted/50
                               focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                               transition-all text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted/60
                               hover:text-text-muted transition-colors"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-danger/5 border border-danger/15">
                  <AlertCircle
                    className="text-danger shrink-0 mt-0.5"
                    size={16}
                  />
                  <p className="text-sm text-danger">{error}</p>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-primary text-white font-medium text-sm
                           hover:bg-primary-dark active:scale-[0.98]
                           focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2
                           disabled:opacity-60 disabled:cursor-not-allowed
                           transition-all duration-200 cursor-pointer"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Entrando…
                  </span>
                ) : (
                  "Entrar"
                )}
              </button>
            </form>
          ) : (
            /* ─── Register Form ─── */
            <form onSubmit={handleRegister} className="space-y-4">
              {/* Invite Code */}
              <div>
                <label
                  htmlFor="register-invite"
                  className="block text-sm font-medium text-text-muted mb-1.5"
                >
                  Código de Convite
                </label>
                <div className="relative">
                  <KeyRound
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/60"
                    size={18}
                  />
                  <input
                    id="register-invite"
                    type="text"
                    required
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Cole o código recebido"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-border
                               text-text placeholder:text-text-muted/50
                               focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                               transition-all text-sm font-mono"
                  />
                </div>
              </div>

              {/* Nome */}
              <div>
                <label
                  htmlFor="register-nome"
                  className="block text-sm font-medium text-text-muted mb-1.5"
                >
                  Nome Completo
                </label>
                <div className="relative">
                  <User
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/60"
                    size={18}
                  />
                  <input
                    id="register-nome"
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Seu nome completo"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-border
                               text-text placeholder:text-text-muted/50
                               focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                               transition-all text-sm"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label
                  htmlFor="register-email"
                  className="block text-sm font-medium text-text-muted mb-1.5"
                >
                  E-mail
                </label>
                <div className="relative">
                  <Mail
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/60"
                    size={18}
                  />
                  <input
                    id="register-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-border
                               text-text placeholder:text-text-muted/50
                               focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                               transition-all text-sm"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="register-password"
                  className="block text-sm font-medium text-text-muted mb-1.5"
                >
                  Senha
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/60"
                    size={18}
                  />
                  <input
                    id="register-password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-background border border-border
                               text-text placeholder:text-text-muted/50
                               focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                               transition-all text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted/60
                               hover:text-text-muted transition-colors"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label
                  htmlFor="register-confirm"
                  className="block text-sm font-medium text-text-muted mb-1.5"
                >
                  Confirmar Senha
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/60"
                    size={18}
                  />
                  <input
                    id="register-confirm"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-border
                               text-text placeholder:text-text-muted/50
                               focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                               transition-all text-sm"
                  />
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-danger/5 border border-danger/15">
                  <AlertCircle
                    className="text-danger shrink-0 mt-0.5"
                    size={16}
                  />
                  <p className="text-sm text-danger">{error}</p>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-primary text-white font-medium text-sm
                           hover:bg-primary-dark active:scale-[0.98]
                           focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2
                           disabled:opacity-60 disabled:cursor-not-allowed
                           transition-all duration-200 cursor-pointer"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Criando conta…
                  </span>
                ) : (
                  "Criar Conta"
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-text-muted/60 mt-8">
          Sistema privado · Acesso restrito a profissionais autorizados
        </p>
      </div>
    </main>
  );
}
