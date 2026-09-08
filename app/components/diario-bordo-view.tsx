"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Lock,
  Unlock,
  ShieldAlert,
  Loader2,
  KeyRound,
  CheckCircle2,
  Delete,
  AlertCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { hashDiarioPin, verifyDiarioPin } from "@/utils/crypto";
import { DiarioList } from "./diario-list";

type PinMode = "unlock" | "create_step1" | "create_step2" | "reset_confirm";

export function DiarioBordoView() {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [loadingAuth, setLoadingAuth] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  // Estados do PIN
  const [storedPinHash, setStoredPinHash] = useState<string | null>(null);
  const [mode, setMode] = useState<PinMode>("unlock");
  const [pin, setPin] = useState("");
  const [tempPin, setTempPin] = useState(""); // usado no passo 1 de criação
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [shake, setShake] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadUserState = useCallback(async () => {
    setLoadingAuth(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoadingAuth(false);
      return;
    }

    setUserId(user.id);

    // 1. Verificar se já desbloqueou nesta sessão do navegador
    if (typeof window !== "undefined") {
      const sessionUnlocked = sessionStorage.getItem(`diario_unlocked_${user.id}`);
      if (sessionUnlocked === "true") {
        setUnlocked(true);
        setLoadingAuth(false);
        return;
      }
    }

    // 2. Verificar se o usuário já possui um PIN cadastrado
    // Busca no user_metadata (funciona 100% sem migration) ou no profiles
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
        // Ignora caso a coluna ainda não exista no profiles
      }
    }

    setStoredPinHash(pinHash);

    if (!pinHash) {
      setMode("create_step1");
    } else {
      setMode("unlock");
    }

    setLoadingAuth(false);
  }, [supabase]);

  useEffect(() => {
    loadUserState();
  }, [loadUserState]);

  // Foco automático no input invisível para captura de teclado
  useEffect(() => {
    if (!unlocked && !loadingAuth) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [unlocked, loadingAuth, mode]);

  // Efeito de erro com vibração visual (shake)
  const triggerError = (msg: string) => {
    setError(msg);
    setShake(true);
    setTimeout(() => {
      setShake(false);
      setPin("");
    }, 500);
  };

  // Processamento automático ao atingir 6 dígitos
  const handlePinComplete = useCallback(
    async (completedPin: string) => {
      if (!userId) return;

      if (mode === "unlock") {
        if (!storedPinHash) return;
        setVerifying(true);
        setError(null);

        const isValid = await verifyDiarioPin(completedPin, userId, storedPinHash);

        if (isValid) {
          sessionStorage.setItem(`diario_unlocked_${userId}`, "true");
          setUnlocked(true);
          setPin("");
        } else {
          triggerError("PIN incorreto. Tente novamente.");
        }
        setVerifying(false);
      } else if (mode === "create_step1") {
        setTempPin(completedPin);
        setPin("");
        setError(null);
        setMode("create_step2");
      } else if (mode === "create_step2") {
        if (completedPin !== tempPin) {
          triggerError("Os PINs não coincidem. Tente novamente.");
          setTempPin("");
          setMode("create_step1");
          return;
        }

        setVerifying(true);
        setError(null);

        try {
          const newHash = await hashDiarioPin(completedPin, userId);

          // 1. Salvar no user_metadata do Supabase Auth (instantâneo e sem migration)
          await supabase.auth.updateUser({
            data: { diario_pin_hash: newHash },
          });

          // 2. Tentar salvar também na tabela profiles
          try {
            await supabase
              .from("profiles")
              .update({ diario_pin_hash: newHash })
              .eq("id", userId);
          } catch {
            // Ignora se coluna não existir no profiles
          }

          setStoredPinHash(newHash);
          setSuccessMessage("PIN de 6 dígitos configurado com sucesso!");
          sessionStorage.setItem(`diario_unlocked_${userId}`, "true");

          setTimeout(() => {
            setUnlocked(true);
            setSuccessMessage(null);
            setPin("");
          }, 1200);
        } catch (err) {
          console.error("Erro ao salvar PIN:", err);
          setError("Erro ao salvar o PIN. Tente novamente.");
        } finally {
          setVerifying(false);
        }
      }
    },
    [userId, mode, storedPinHash, tempPin, supabase]
  );

  // Manipulação de dígitos (via input ou teclado virtual)
  const handleDigitPress = (digit: string) => {
    if (verifying || pin.length >= 6) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError(null);

    if (newPin.length === 6) {
      handlePinComplete(newPin);
    }
  };

  const handleDeletePress = () => {
    if (verifying || pin.length === 0) return;
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  // Bloquear manualmente o cofre
  const handleLockNow = () => {
    if (userId) {
      sessionStorage.removeItem(`diario_unlocked_${userId}`);
    }
    setUnlocked(false);
    setPin("");
    setMode("unlock");
  };

  // Iniciar fluxo de redefinição ("Esqueci meu PIN")
  const handleStartReset = () => {
    setMode("create_step1");
    setPin("");
    setTempPin("");
    setError(null);
  };

  if (loadingAuth) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  // --- TELA DE BLOQUEIO / CADASTRO DE PIN ---
  if (!unlocked) {
    return (
      <div className="max-w-md mx-auto mt-6 sm:mt-12 px-4">
        {/* Input invisível para suportar teclado físico e mobile nativo */}
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

        <div
          onClick={() => inputRef.current?.focus()}
          className={`bg-surface rounded-3xl border border-border/80 shadow-xl overflow-hidden transition-all duration-200 cursor-pointer ${
            shake ? "animate-shake border-danger/60" : ""
          }`}
        >
          {/* Cabeçalho do Card */}
          <div className="p-6 text-center border-b border-border/40 bg-surface-hover/30">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3 shadow-xs">
              {mode === "unlock" ? <Lock size={26} /> : <KeyRound size={26} />}
            </div>

            <h2 className="text-xl font-serif font-bold text-text">
              {mode === "unlock"
                ? "Cofre do Diário de Bordo"
                : mode === "create_step1"
                ? "Criar PIN de Acesso"
                : "Confirme seu PIN"}
            </h2>

            <p className="text-xs text-text-muted mt-1.5 max-w-xs mx-auto leading-relaxed">
              {mode === "unlock"
                ? "Digite seu PIN de 6 dígitos para acessar suas anotações confidenciais."
                : mode === "create_step1"
                ? "Escolha um PIN de 6 números para proteger seu Diário sem depender de senhas externas."
                : "Digite novamente o PIN de 6 dígitos para confirmar."}
            </p>
          </div>

          {/* Área Central: Os 6 Círculos do PIN */}
          <div className="p-6 sm:p-8 space-y-6">
            {/* Mensagem de Erro ou Sucesso */}
            {error && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-xs font-medium text-danger flex items-center justify-center gap-2 animate-fadeIn">
                <AlertCircle size={15} />
                <span>{error}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-2 animate-fadeIn">
                <CheckCircle2 size={16} />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Os 6 Indicadores Visuais */}
            <div className="flex items-center justify-center gap-3 sm:gap-4 py-2">
              {[0, 1, 2, 3, 4, 5].map((index) => {
                const isFilled = pin.length > index;
                const isCurrent = pin.length === index;
                return (
                  <div
                    key={index}
                    className={`w-10 h-12 sm:w-11 sm:h-13 rounded-2xl border flex items-center justify-center transition-all duration-200 ${
                      isFilled
                        ? "bg-primary border-primary text-white shadow-xs scale-105"
                        : isCurrent
                        ? "bg-surface border-primary/60 ring-2 ring-primary/20"
                        : "bg-surface border-border text-text-muted/30"
                    }`}
                  >
                    {isFilled ? (
                      <span className="w-3 h-3 rounded-full bg-white block animate-scaleIn" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-border block" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Teclado Numérico Virtual (Perfeito para iPad / Celular / Touch) */}
            <div className="grid grid-cols-3 gap-2.5 max-w-xs mx-auto pt-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDigitPress(num);
                  }}
                  disabled={verifying}
                  className="h-12 rounded-2xl bg-surface-hover/60 hover:bg-surface-hover text-text font-semibold text-lg border border-border/40 active:scale-95 transition-all cursor-pointer select-none"
                >
                  {num}
                </button>
              ))}

              {/* Botão Limpar */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPin("");
                  setError(null);
                }}
                className="h-12 rounded-2xl text-text-muted hover:text-text hover:bg-surface-hover/40 text-xs font-medium transition-all cursor-pointer select-none"
              >
                Limpar
              </button>

              {/* Dígito Zero */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDigitPress("0");
                }}
                disabled={verifying}
                className="h-12 rounded-2xl bg-surface-hover/60 hover:bg-surface-hover text-text font-semibold text-lg border border-border/40 active:scale-95 transition-all cursor-pointer select-none"
              >
                0
              </button>

              {/* Botão Backspace */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeletePress();
                }}
                disabled={verifying}
                className="h-12 rounded-2xl bg-surface-hover/30 hover:bg-surface-hover text-text-muted hover:text-text flex items-center justify-center border border-border/40 active:scale-95 transition-all cursor-pointer select-none"
                aria-label="Apagar último número"
              >
                <Delete size={20} />
              </button>
            </div>

            {/* Opção Esqueci meu PIN / Redefinir */}
            <div className="text-center pt-2">
              {mode === "unlock" ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartReset();
                  }}
                  className="text-xs text-text-muted hover:text-primary transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <RefreshCw size={13} />
                  <span>Esqueci meu PIN / Redefinir PIN</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMode("unlock");
                    setPin("");
                    setTempPin("");
                    setError(null);
                  }}
                  className="text-xs text-text-muted hover:text-text transition-colors cursor-pointer"
                >
                  Voltar para tela de desbloqueio
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- SE ESTIVER DESBLOQUEADO: EXIBE O DIÁRIO DE BORDO ---
  return (
    <div className="print:hidden select-none" onContextMenu={(e) => e.preventDefault()}>
      {/* Banner de Segurança com Botão de Bloqueio Rápido */}
      <div className="flex items-center justify-between gap-3 p-3.5 mb-6 rounded-2xl bg-primary/10 border border-primary/20 shadow-2xs">
        <div className="flex items-center gap-2.5 text-primary">
          <ShieldAlert size={19} className="shrink-0" />
          <div>
            <p className="text-xs sm:text-sm font-semibold text-primary">
              Cofre do Diário de Bordo Desbloqueado
            </p>
            <p className="text-[11px] text-text-muted hidden sm:block">
              Conteúdo de altíssima sensibilidade — uso exclusivo da profissional
            </p>
          </div>
        </div>

        <button
          onClick={handleLockNow}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-border/80 text-text text-xs font-semibold hover:bg-surface-hover hover:border-primary/40 active:scale-95 transition-all cursor-pointer shadow-xs"
          title="Bloquear Diário de Bordo agora"
        >
          <Lock size={13} />
          <span>Bloquear Cofre</span>
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
