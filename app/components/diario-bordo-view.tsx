"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Lock,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Mail,
  ArrowLeft,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { Carregando } from "@/app/components/carregando";
import { hashDiarioPin, verifyDiarioPin } from "@/utils/crypto";
import { DiarioList } from "./diario-list";

type PinMode =
  | "unlock"
  | "create_step1"
  | "create_step2"
  | "forgot_send"
  | "forgot_verify"
  | "reset_step1"
  | "reset_step2";

export function DiarioBordoView() {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  const [loadingAuth, setLoadingAuth] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  // Estados do PIN
  const [storedPinHash, setStoredPinHash] = useState<string | null>(null);
  const [mode, setMode] = useState<PinMode>("unlock");
  const [pin, setPin] = useState("");
  const [tempPin, setTempPin] = useState(""); // para confirmação
  const [otpCode, setOtpCode] = useState(""); // código de 6 dígitos do e-mail
  const [error, setError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [shake, setShake] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Timer do cooldown de reenvio de e-mail
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  // Roda só na abertura da tela. A leitura fica dentro do efeito e grava o
  // estado só depois do await; `loadingAuth` já começa true, então não há o
  // que ligar antes (um setState síncrono aqui só causaria uma renderização a
  // mais). `supabase` é a instância única do navegador (createBrowserClient):
  // estar na lista não faz a leitura rodar de novo.
  useEffect(() => {
    async function loadUserState() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoadingAuth(false);
        return;
      }

      setUserId(user.id);
      setUserEmail(user.email || null);

      // 1. Verificar se já desbloqueou nesta sessão do navegador
      if (typeof window !== "undefined") {
        const sessionUnlocked = sessionStorage.getItem(`diario_unlocked_${user.id}`);
        if (sessionUnlocked === "true") {
          setUnlocked(true);
          setLoadingAuth(false);
          return;
        }
      }

      // 2. Verificar se possui PIN cadastrado (user_metadata ou profiles)
      let pinHash = user.user_metadata?.diario_pin_hash || null;

      if (!pinHash) {
        try {
          const { data: prof } = await supabase
            .from("profiles")
            .select("diario_pin_hash")
            .eq("id", user.id)
            .single();
          if (prof?.diario_pin_hash) {
            pinHash = prof.diario_pin_hash;
          }
        } catch {
          // Ignora caso coluna não exista
        }
      }

      setStoredPinHash(pinHash);

      if (!pinHash) {
        setMode("create_step1");
      } else {
        setMode("unlock");
      }

      setLoadingAuth(false);
    }
    loadUserState();
  }, [supabase]);

  // Foco automático nos inputs
  useEffect(() => {
    if (!unlocked && !loadingAuth) {
      const timer = setTimeout(() => {
        if (mode === "forgot_verify") {
          otpInputRef.current?.focus();
        } else {
          inputRef.current?.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [unlocked, loadingAuth, mode]);

  // Animação de erro com vibração visual
  const triggerError = (msg: string) => {
    setError(msg);
    setShake(true);
    setTimeout(() => {
      setShake(false);
      setPin("");
    }, 500);
  };

  // Processamento automático de PIN de 6 dígitos
  const handlePinComplete = useCallback(
    async (completedPin: string) => {
      if (!userId) return;

      if (mode === "unlock") {
        if (!storedPinHash) return;
        setLoadingAction(true);
        setError(null);

        const isValid = await verifyDiarioPin(completedPin, userId, storedPinHash);

        if (isValid) {
          sessionStorage.setItem(`diario_unlocked_${userId}`, "true");
          setUnlocked(true);
          setPin("");
        } else {
          triggerError("PIN incorreto. Tente novamente.");
        }
        setLoadingAction(false);
      } else if (mode === "create_step1") {
        setTempPin(completedPin);
        setPin("");
        setError(null);
        setMode("create_step2");
      } else if (mode === "create_step2" || mode === "reset_step2") {
        if (completedPin !== tempPin) {
          triggerError("Os PINs não coincidem. Digite novamente.");
          setTempPin("");
          setMode(mode === "reset_step2" ? "reset_step1" : "create_step1");
          return;
        }

        setLoadingAction(true);
        setError(null);

        try {
          const newHash = await hashDiarioPin(completedPin, userId);

          // 1. Salvar no user_metadata do Supabase
          await supabase.auth.updateUser({
            data: { diario_pin_hash: newHash },
          });

          // 2. Salvar na tabela profiles se a coluna existir
          try {
            await supabase
              .from("profiles")
              .update({ diario_pin_hash: newHash })
              .eq("id", userId);
          } catch {
            // Ignora se não existir
          }

          setStoredPinHash(newHash);
          setSuccessMessage("Novo PIN configurado com sucesso!");
          sessionStorage.setItem(`diario_unlocked_${userId}`, "true");

          setTimeout(() => {
            setUnlocked(true);
            setSuccessMessage(null);
            setPin("");
            setTempPin("");
          }, 1000);
        } catch (err) {
          console.error("Erro ao salvar PIN:", err);
          setError("Erro ao salvar o PIN. Tente novamente.");
        } finally {
          setLoadingAction(false);
        }
      } else if (mode === "reset_step1") {
        setTempPin(completedPin);
        setPin("");
        setError(null);
        setMode("reset_step2");
      }
    },
    [userId, mode, storedPinHash, tempPin, supabase]
  );

  // Solicitar envio do código de segurança por e-mail
  async function handleSendEmailCode() {
    if (!userEmail) return;
    setLoadingAction(true);
    setError(null);

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: userEmail,
        options: { shouldCreateUser: false },
      });

      if (otpError) {
        console.error("Erro ao disparar OTP:", otpError);
        setError("Não foi possível enviar o código por e-mail. Tente novamente.");
        setLoadingAction(false);
        return;
      }

      setCooldown(60); // 60 segundos para reenviar
      setMode("forgot_verify");
      setOtpCode("");
    } catch (err) {
      console.error("Erro inesperado:", err);
      setError("Erro de conexão ao enviar e-mail.");
    } finally {
      setLoadingAction(false);
    }
  }

  // Validar código recebido no e-mail
  async function handleVerifyEmailCode(e: React.FormEvent) {
    e.preventDefault();
    if (!userEmail || otpCode.length < 6) return;

    setLoadingAction(true);
    setError(null);

    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: userEmail,
        token: otpCode.trim(),
        type: "email",
      });

      if (verifyError || !data?.user) {
        console.error("Erro na verificação de OTP:", verifyError);
        setError("Código incorreto ou expirado. Verifique seu e-mail.");
        setLoadingAction(false);
        return;
      }

      // Código do e-mail validado! Identidade confirmada com segurança.
      setSuccessMessage("Identidade confirmada!");
      setTimeout(() => {
        setSuccessMessage(null);
        setMode("reset_step1");
        setPin("");
        setTempPin("");
      }, 900);
    } catch (err) {
      console.error("Erro inesperado:", err);
      setError("Erro ao validar código.");
    } finally {
      setLoadingAction(false);
    }
  }

  // Bloquear manualmente o Diário de Bordo
  const handleLockNow = () => {
    if (userId) {
      sessionStorage.removeItem(`diario_unlocked_${userId}`);
    }
    setUnlocked(false);
    setPin("");
    setMode("unlock");
  };

  if (loadingAuth) {
    return <Carregando className="py-24" />;
  }

  // Mascarar e-mail para exibição segura (ex: psih***@gmail.com)
  const maskedEmail = userEmail
    ? userEmail.replace(/(.{3})(.*)(?=@)/, (_, a, b) => a + "*".repeat(b.length))
    : "";

  // ─── TELA COMPACTA DE BLOQUEIO / PIN ───
  if (!unlocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 py-8">
        <div
          className={`w-full max-w-[340px] bg-surface rounded-2xl border border-border shadow-xl p-6 transition-all duration-200 ${
            shake ? "animate-shake border-danger/60 ring-2 ring-danger/20" : ""
          }`}
        >
          {/* 1. MODO: DIGITAR CÓDIGO DO E-MAIL (VERIFICAÇÃO DE SEGURANÇA) */}
          {mode === "forgot_verify" ? (
            <form onSubmit={handleVerifyEmailCode} className="space-y-4 text-center">
              <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-2xs">
                <Mail size={20} />
              </div>

              <div>
                <h3 className="text-base font-serif font-bold text-text">
                  Código de Segurança
                </h3>
                <p className="text-xs text-text-muted mt-1 leading-relaxed">
                  Enviamos um código de 6 dígitos para{" "}
                  <strong className="text-text">{maskedEmail}</strong>.
                </p>
              </div>

              {error && (
                <div className="p-2.5 rounded-xl bg-danger/10 text-danger text-xs font-medium flex items-center justify-center gap-1.5 animate-fadeIn">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {successMessage && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 text-xs font-medium flex items-center justify-center gap-1.5 animate-fadeIn">
                  <CheckCircle2 size={14} className="shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              <div>
                <input
                  ref={otpInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoFocus
                  required
                  className="w-full py-2.5 px-3 rounded-xl bg-background border border-border text-center text-xl font-mono tracking-widest text-text focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-text-muted/30"
                />
              </div>

              <button
                type="submit"
                disabled={loadingAction || otpCode.length < 6}
                className="w-full py-2.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-dark active:scale-[0.98] transition-all cursor-pointer shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {loadingAction ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <span>Confirmar Código</span>
                )}
              </button>

              <div className="flex items-center justify-between text-[11px] pt-1 text-text-muted">
                <button
                  type="button"
                  onClick={() => {
                    setMode("unlock");
                    setError(null);
                  }}
                  className="hover:text-text cursor-pointer flex items-center gap-1"
                >
                  <ArrowLeft size={11} />
                  <span>Voltar</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendEmailCode}
                  disabled={cooldown > 0 || loadingAction}
                  className="text-primary hover:underline cursor-pointer disabled:opacity-50 disabled:no-underline"
                >
                  {cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar código"}
                </button>
              </div>
            </form>
          ) : (
            /* 2. MODO: ENTRADA DE PIN DE 6 DÍGITOS (DESBLOQUEIO OU CRIAÇÃO) */
            <div
              onClick={() => inputRef.current?.focus()}
              className="text-center space-y-4 cursor-pointer"
            >
              {/* Input invisível com foco automático para capturar digitação nativa */}
              <input
                ref={inputRef}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setPin(val);
                  setError(null);
                  if (val.length === 6) {
                    handlePinComplete(val);
                  }
                }}
                className="sr-only"
                autoFocus
              />

              {/* Ícone sutil e compacto */}
              <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-2xs">
                {mode === "unlock" ? <Lock size={20} /> : <KeyRound size={20} />}
              </div>

              {/* Título e Subtítulo */}
              <div>
                <h3 className="text-base font-serif font-bold text-text">
                  {mode === "unlock"
                    ? "Diário de Bordo"
                    : mode === "create_step1" || mode === "reset_step1"
                    ? "Definir PIN de 6 Dígitos"
                    : "Confirme o Novo PIN"}
                </h3>
                <p className="text-xs text-text-muted mt-1 leading-relaxed">
                  {mode === "unlock"
                    ? "Digite seu PIN para abrir o Diário de Bordo."
                    : mode === "create_step1" || mode === "reset_step1"
                    ? "Escolha 6 números para proteger suas anotações."
                    : "Digite os 6 números novamente para confirmar."}
                </p>
              </div>

              {/* Alertas */}
              {error && (
                <div className="p-2 rounded-xl bg-danger/10 text-danger text-xs font-medium flex items-center justify-center gap-1.5 animate-fadeIn">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {successMessage && (
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 text-xs font-medium flex items-center justify-center gap-1.5 animate-fadeIn">
                  <CheckCircle2 size={14} className="shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              {/* As 6 Bolinhas Minimalistas (Dots) */}
              <div className="flex items-center justify-center gap-3 py-3">
                {[0, 1, 2, 3, 4, 5].map((index) => {
                  const isFilled = pin.length > index;
                  return (
                    <div
                      key={index}
                      className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${
                        isFilled
                          ? "bg-primary scale-125 shadow-xs"
                          : "border-2 border-border/80 bg-background/60"
                      }`}
                    />
                  );
                })}
              </div>

              {loadingAction ? (
                <div className="py-2 flex items-center justify-center gap-1.5 text-xs text-text-muted">
                  <Loader2 size={14} className="animate-spin text-primary" />
                  <span>Validando...</span>
                </div>
              ) : (
                <p className="text-[11px] text-text-muted">
                  Clique ou toque na tela para digitar
                </p>
              )}

              {/* Opção Segura: Esqueci meu PIN */}
              {mode === "unlock" && (
                <div className="pt-2 border-t border-border/50">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSendEmailCode();
                    }}
                    disabled={loadingAction}
                    className="text-xs text-text-muted hover:text-primary transition-colors cursor-pointer inline-flex items-center gap-1"
                  >
                    <Mail size={12} />
                    <span>Esqueci meu PIN (Verificar por E-mail)</span>
                  </button>
                </div>
              )}

              {/* Voltar se estiver no passo 2 de criação/redefinição */}
              {(mode === "create_step2" || mode === "reset_step2") && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPin("");
                    setTempPin("");
                    setMode(mode === "reset_step2" ? "reset_step1" : "create_step1");
                  }}
                  className="text-xs text-text-muted hover:text-text transition-colors cursor-pointer flex items-center justify-center gap-1 mx-auto"
                >
                  <ArrowLeft size={12} />
                  <span>Voltar ao passo anterior</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── SE ESTIVER DESBLOQUEADO: EXIBE O DIÁRIO DE BORDO ───
  return (
    <div className="print:hidden select-none" onContextMenu={(e) => e.preventDefault()}>
      {/* Barra de Segurança com Bloqueio Rápido */}
      <div className="flex items-center justify-between gap-3 p-3.5 mb-6 rounded-2xl bg-primary/10 border border-primary/20 shadow-2xs">
        <div className="flex items-center gap-2.5 text-primary">
          <ShieldAlert size={19} className="shrink-0" />
          <div>
            <p className="text-xs sm:text-sm font-semibold text-primary">
              Diário de Bordo aberto nesta sessão
            </p>
            <p className="text-[11px] text-text-muted hidden sm:block">
              Fecha sozinho ao sair ou ao encerrar a sessão
            </p>
          </div>
        </div>

        <button
          onClick={handleLockNow}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-border/80 text-text text-xs font-semibold hover:bg-surface-hover hover:border-primary/40 active:scale-95 transition-all cursor-pointer shadow-xs"
          title="Bloquear Diário de Bordo agora"
        >
          <Lock size={13} />
          <span>Fechar Diário</span>
        </button>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          body { display: none !important; }
        }
      `,
        }}
      />

      <DiarioList />
    </div>
  );
}
