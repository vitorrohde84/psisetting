"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  User,
  CheckCircle,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { PsiSettingBrand } from "@/app/components/psi-setting-brand";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: any;
  }
}

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const googleBtnRef = useRef<HTMLDivElement>(null);

  // Mode
  const [mode, setMode] = useState<Mode>("login");

  // Shared fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [gisLoaded, setGisLoaded] = useState(false);

  // Register fields
  const [nome, setNome] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  // Handle Google Credential Response directly on client
  const handleGoogleCredentialResponse = useCallback(
    async (response: { credential?: string }) => {
      if (!response?.credential) return;
      setError(null);
      setGoogleLoading(true);

      try {
        const { error: authError } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: response.credential,
        });

        if (authError) {
          console.error("Erro no signInWithIdToken:", authError);
          setError(`Erro ao autenticar com Google: ${authError.message}`);
          setGoogleLoading(false);
          return;
        }

        router.push("/");
        router.refresh();
      } catch (err: unknown) {
        console.error("Erro inesperado no Google Sign-in:", err);
        setError("Erro ao processar login com Google.");
        setGoogleLoading(false);
      }
    },
    [supabase, router]
  );

  // Initialize Google Identity Services (GIS)
  useEffect(() => {
    const googleClientId =
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
      "196841692254-1c82nvlr1qrq2a44tjq1mk0q7nt45hte.apps.googleusercontent.com";

    // Load Google Identity Services script
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.id) {
        setGisLoaded(true);
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        // Render standard Google button in container if available
        if (googleBtnRef.current) {
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            type: "standard",
            theme: "outline",
            size: "large",
            text: "continue_with",
            shape: "rectangular",
            logo_alignment: "left",
            width: googleBtnRef.current.offsetWidth || 340,
            locale: "pt-BR",
          });
        }
      }
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [handleGoogleCredentialResponse]);

  // Check for invite code in URL, errors, and expired session
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);

      // Check expired session
      if (params.get("expired") === "true") {
        setError("Sua sessão expirou por inatividade. Faça login novamente.");
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      // Check auth callback error
      if (params.get("error") === "auth_callback_failed") {
        setError("Falha na autenticação. Por favor, tente novamente.");
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

  // Google OAuth Login trigger
  async function handleGoogleLogin() {
    setError(null);
    setGoogleLoading(true);

    // If Google Identity Services is available, open native Google prompt
    if (gisLoaded && window.google?.accounts?.id) {
      window.google.accounts.id.prompt((notification: { isNotDisplayed: () => boolean }) => {
        if (notification.isNotDisplayed()) {
          // Fallback to standard Supabase OAuth if One Tap was dismissed
          supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo: `${window.location.origin}/auth/callback`,
            },
          });
        }
      });
      setGoogleLoading(false);
      return;
    }

    // Standard OAuth fallback
    try {
      const { error: oAuthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (oAuthError) {
        console.error("Google Auth Error:", oAuthError);
        setError(`Erro ao autenticar com Google: ${oAuthError.message}`);
        setGoogleLoading(false);
      }
    } catch {
      setError("Erro de conexão ao tentar login com Google.");
      setGoogleLoading(false);
    }
  }

  // Email + Password Login handler
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      console.error("Supabase Login Error:", error);
      if (error.message.includes("Invalid login credentials")) {
        setError("E-mail ou senha incorretos.");
      } else if (error.message.includes("Email not confirmed")) {
        setError("E-mail ainda não confirmado. Verifique sua caixa de entrada.");
      } else {
        setError(error.message);
      }
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

    setLoading(true);

    // If invite code is provided, use the invite validation endpoint
    if (inviteCode.trim()) {
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
          setError(data.error || "Erro ao criar conta com código.");
          setLoading(false);
          return;
        }

        setRegisterSuccess(true);
        setLoading(false);
        return;
      } catch {
        setError("Erro de conexão com o servidor. Tente novamente.");
        setLoading(false);
        return;
      }
    }

    // Direct registration with Supabase Auth
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            nome: nome.trim(),
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signUpError) {
        const msg =
          typeof signUpError.message === "string" &&
          signUpError.message !== "{}" &&
          signUpError.message.trim().length > 0
            ? signUpError.message
            : "Erro ao processar o cadastro. Tente novamente.";

        if (
          msg.includes("already registered") ||
          msg.includes("already exists") ||
          msg.includes("User already registered")
        ) {
          setError("Este e-mail já está cadastrado no sistema.");
        } else {
          setError(msg);
        }
        setLoading(false);
        return;
      }

      // If user needs email verification
      if (data?.user && !data.session) {
        setVerificationSent(true);
      } else {
        setRegisterSuccess(true);
      }
      setLoading(false);
    } catch {
      setError("Erro ao criar conta. Tente novamente.");
      setLoading(false);
    }
  }

  // Switch mode and clear state
  function switchMode(newMode: Mode) {
    setMode(newMode);
    setError(null);
    setRegisterSuccess(false);
    setVerificationSent(false);
    setPassword("");
    setConfirmPassword("");
  }

  // Message if email verification was sent
  if (verificationSent) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="relative w-full max-w-md">
          <div className="bg-surface rounded-2xl shadow-[0_4px_32px_rgba(0,0,0,0.06)] border border-border/60 p-8 text-center">
            <div className="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail size={28} />
            </div>
            <h2 className="text-xl font-serif font-semibold text-text mb-2">
              Verifique seu e-mail
            </h2>
            <p className="text-sm text-text-muted mb-6 leading-relaxed">
              Enviamos um link de confirmação para <strong>{email}</strong>. Por favor, clique no link recebido para ativar sua conta profissional.
            </p>
            <button
              onClick={() => switchMode("login")}
              className="w-full py-2.5 px-4 rounded-xl bg-primary text-white font-medium text-sm
                         hover:bg-primary-dark active:scale-[0.98] transition-all duration-200 cursor-pointer"
            >
              Voltar para o Login
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Success message after registration
  if (registerSuccess) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="relative w-full max-w-md">
          <div className="bg-surface rounded-2xl shadow-[0_4px_32px_rgba(0,0,0,0.06)] border border-border/60 p-8 text-center">
            <div className="w-14 h-14 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={28} />
            </div>
            <h2 className="text-xl font-serif font-semibold text-text mb-2">
              Conta criada com sucesso!
            </h2>
            <p className="text-sm text-text-muted mb-6 leading-relaxed">
              Sua conta profissional foi criada. Acesse agora com suas credenciais.
            </p>
            <button
              onClick={() => switchMode("login")}
              className="w-full py-2.5 px-4 rounded-xl bg-primary text-white font-medium text-sm
                         hover:bg-primary-dark active:scale-[0.98] transition-all duration-200 cursor-pointer"
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
      {/* Background ambient gradient */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-secondary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Header com Identidade Visual Oficial */}
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl overflow-hidden mb-3 bg-transparent">
            <Image
              src="/logo.png"
              alt="PsiSetting"
              width={64}
              height={64}
              className="w-full h-full object-contain"
              priority
            />
          </div>
          <PsiSettingBrand size="lg" showIcon={false} showSubtitle={true} subtitleText="Gestão Clínica e Prontuários para Psicólogos" />
        </div>

        {/* Card Principal */}
        <div className="bg-surface rounded-2xl shadow-[0_4px_32px_rgba(0,0,0,0.06)] border border-border/60 p-8">
          
          {/* Container do Botão Nativo do Google (Google Identity Services) */}
          <div className="mb-5 flex flex-col items-center">
            <div
              id="google-signin-btn-container"
              ref={googleBtnRef}
              className="w-full flex justify-center min-h-[40px]"
            />

            {/* Fallback button caso o GIS demore para carregar */}
            {!gisLoaded && (
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading || loading}
                className="w-full py-2.5 px-4 rounded-xl border border-border bg-background hover:bg-surface text-text font-medium text-sm
                           flex items-center justify-center gap-3 shadow-xs hover:border-text-muted/40 active:scale-[0.98]
                           transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {googleLoading ? (
                  <svg className="animate-spin h-4 w-4 text-text" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>Continuar com o Google</span>
              </button>
            )}
          </div>

          {/* Divisor */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 border-t border-border/70" />
            <span className="text-xs text-text-muted uppercase tracking-wider font-medium whitespace-nowrap select-none">
              ou com e-mail
            </span>
            <div className="flex-1 border-t border-border/70" />
          </div>

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
            <form onSubmit={handleLogin} className="space-y-4">
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
                               hover:text-text-muted transition-colors cursor-pointer"
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
                disabled={loading || googleLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-primary text-white font-medium text-sm
                           hover:bg-primary-dark active:scale-[0.98]
                           focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2
                           disabled:opacity-60 disabled:cursor-not-allowed
                           transition-all duration-200 cursor-pointer shadow-sm"
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
                  "Entrar no Sistema"
                )}
              </button>
            </form>
          ) : (
            /* ─── Register Form ─── */
            <form onSubmit={handleRegister} className="space-y-4">
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
                    placeholder="Seu nome profissional"
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
                               hover:text-text-muted transition-colors cursor-pointer"
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

              {/* Invite Code (Opcional) */}
              <div>
                <label
                  htmlFor="register-invite"
                  className="block text-xs font-medium text-text-muted mb-1 flex items-center justify-between"
                >
                  <span>Código de Convite / Parceria</span>
                  <span className="text-[10px] text-text-muted/70">(Opcional)</span>
                </label>
                <div className="relative">
                  <KeyRound
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/60"
                    size={16}
                  />
                  <input
                    id="register-invite"
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Se tiver, cole seu código aqui"
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-background border border-border
                               text-text placeholder:text-text-muted/50
                               focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
                               transition-all text-xs font-mono"
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
                disabled={loading || googleLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-primary text-white font-medium text-sm
                           hover:bg-primary-dark active:scale-[0.98]
                           focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2
                           disabled:opacity-60 disabled:cursor-not-allowed
                           transition-all duration-200 cursor-pointer shadow-sm"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
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
                  "Criar Conta Profissional"
                )}
              </button>

              <p className="text-[11px] text-text-muted text-center pt-2 leading-relaxed">
                Ao criar uma conta, você declara ciência e concordância com os{" "}
                <a href="/termos" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  Termos de Uso
                </a>{" "}
                e com a{" "}
                <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  Política de Privacidade
                </a>.
              </p>
            </form>
          )}
        </div>

        {/* Footer com Selo de Segurança e Sigilo */}
        <div className="mt-8 text-center flex flex-col items-center justify-center gap-2 text-xs text-text-muted/70">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-primary" />
            <span>Plataforma Segura · Criptografia AES-256 · Privacidade & Proteção de Dados</span>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <a href="/termos" target="_blank" rel="noopener noreferrer" className="hover:text-primary underline">
              Termos de Uso
            </a>
            <span>·</span>
            <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="hover:text-primary underline">
              Política de Privacidade
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
