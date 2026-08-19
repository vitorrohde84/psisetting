"use client";

import { useState, useEffect, useRef } from "react";
import { useSubscription } from "@/utils/subscription-context";
import { MercadoPagoBrick } from "./mercadopago-brick";
import { MercadoPagoBadge } from "./mercadopago-badge";
import {
  X,
  Sparkles,
  Check,
  Tag,
  Lock,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  QrCode,
  CreditCard,
  Copy,
  CheckCircle2,
  FileCheck2,
  Users,
  Calendar,
  DollarSign,
  BookOpen,
  EyeOff,
  RefreshCw,
} from "lucide-react";

export function SubscriptionModal() {
  const {
    isModalOpen,
    closeSubscriptionModal,
    isReadOnly,
    isTrialing,
    trialDaysLeft,
    refreshSubscription,
  } = useSubscription();

  // Modal Step: "overview" (Apresentação dos Benefícios) ou "payment" (Opções de Pagamento)
  const [step, setStep] = useState<"overview" | "payment">("overview");
  const [activeTab, setActiveTab] = useState<"pix" | "cartao" | "cupom">("pix");

  // Pix State
  const [pixLoading, setPixLoading] = useState(false);
  const [pixData, setPixData] = useState<{
    payment_id: string | number;
    qr_code: string;
    qr_code_base64: string;
    amount: number;
    expires_at?: string;
  } | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [pixApproved, setPixApproved] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Cupom State
  const [couponCode, setCouponCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponMessage, setCouponMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Limpar estados ao fechar modal
  useEffect(() => {
    if (!isModalOpen) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      setStep("overview");
      setActiveTab("pix");
      setPixData(null);
      setPixApproved(false);
      setCouponMessage(null);
    }
  }, [isModalOpen]);

  // Polling para checar se o Pix foi pago
  useEffect(() => {
    if (pixData?.payment_id && !pixApproved) {
      pollingRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/subscription/pix/check?payment_id=${pixData.payment_id}`);
          if (res.ok) {
            const data = await res.json();
            if (data.approved) {
              setPixApproved(true);
              if (pollingRef.current) clearInterval(pollingRef.current);
              await refreshSubscription();
              setTimeout(() => {
                closeSubscriptionModal();
              }, 3000);
            }
          }
        } catch (err) {
          console.error("Erro no polling de status do Pix:", err);
        }
      }, 3000);

      return () => {
        if (pollingRef.current) clearInterval(pollingRef.current);
      };
    }
  }, [pixData, pixApproved, refreshSubscription, closeSubscriptionModal]);

  if (!isModalOpen) return null;

  async function handleGeneratePix() {
    setPixLoading(true);
    setPixData(null);
    setPixApproved(false);

    try {
      const res = await fetch("/api/subscription/pix", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Erro ao gerar cobrança Pix.");
        return;
      }

      setPixData({
        payment_id: data.payment_id,
        qr_code: data.qr_code,
        qr_code_base64: data.qr_code_base64,
        amount: data.amount || 29.9,
        expires_at: data.date_of_expiration,
      });
    } catch (err) {
      console.error("Erro ao gerar Pix:", err);
      alert("Erro de conexão ao gerar o Pix.");
    } finally {
      setPixLoading(false);
    }
  }

  function handleCopyPix() {
    if (!pixData?.qr_code) return;
    navigator.clipboard.writeText(pixData.qr_code);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 3000);
  }

  async function handleApplyCoupon(e: React.FormEvent) {
    e.preventDefault();
    if (!couponCode.trim()) return;

    setCouponLoading(true);
    setCouponMessage(null);

    try {
      const res = await fetch("/api/coupons/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCode.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setCouponMessage({ type: "error", text: data.error || "Erro ao aplicar cupom." });
      } else {
        setCouponMessage({ type: "success", text: data.message });
        setCouponCode("");
        await refreshSubscription();
      }
    } catch (err: any) {
      setCouponMessage({ type: "error", text: "Erro de conexão ao aplicar cupom." });
    } finally {
      setCouponLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md sm:max-w-lg rounded-2xl sm:rounded-3xl bg-surface border border-border/80 shadow-2xl p-5 sm:p-6 overflow-hidden max-h-[95vh] flex flex-col justify-between">
        {/* Botão Fechar */}
        <button
          type="button"
          onClick={closeSubscriptionModal}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-text-muted hover:text-text hover:bg-background transition-colors cursor-pointer z-10"
          aria-label="Fechar"
        >
          <X size={18} />
        </button>

        {/* ═══════════════════════════════════════════════════════════════
            ETAPA 1: VISÃO GERAL COMPACTA DO PLANO ÚNICO & BENEFÍCIOS
        ═══════════════════════════════════════════════════════════════ */}
        {step === "overview" && (
          <div className="space-y-3.5 animate-in fade-in">
            {/* Cabeçalho Enxuto */}
            <div>
              {isReadOnly ? (
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-bold border border-amber-200">
                  <AlertTriangle size={12} className="text-amber-700" />
                  <span>Modo Somente Leitura Ativo</span>
                </div>
              ) : isTrialing ? (
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-200">
                  <Sparkles size={12} />
                  <span>Período de Teste: {trialDaysLeft} dias restantes</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-bold border border-primary/20">
                  <ShieldCheck size={12} />
                  <span>Plano Único Profissional</span>
                </div>
              )}

              <h2 className="text-xl sm:text-2xl font-serif font-bold text-text mt-2">
                Plano Único Profissional Clínico
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Acesso total e ilimitado a todas as ferramentas do sistema.
              </p>
            </div>

            {/* Card de Preço Compacto */}
            <div className="p-3 sm:p-3.5 rounded-xl bg-gradient-to-r from-primary/10 via-surface to-secondary/10 border border-primary/20 flex items-center justify-between shadow-2xs">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Assinatura Mensal</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-bold text-text">R$</span>
                  <span className="text-2xl sm:text-3xl font-serif font-black text-text">29</span>
                  <span className="text-base font-serif font-bold text-text">,90</span>
                  <span className="text-xs text-text-muted">/mês</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  Sem fidelidade
                </span>
                <p className="text-[10px] text-text-muted mt-0.5">Cancele quando quiser</p>
              </div>
            </div>

            {/* Lista Enxuta de Benefícios em 2 Colunas / Linhas Compactas */}
            <div className="space-y-1.5 py-0.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                Tudo incluído sem limites:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-text">
                {[
                  { icon: Users, text: "Pacientes e Prontuários ilimitados" },
                  { icon: FileCheck2, text: "5 Modelos conforme a Res. CFP 06/2019" },
                  { icon: Calendar, text: "Agenda com Sincronização iCal" },
                  { icon: DollarSign, text: "Controle Financeiro de Sessões" },
                  { icon: BookOpen, text: "Diário de Bordo para Supervisão" },
                  { icon: Lock, text: "Criptografia AES-256 (CFP/LGPD)" },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <Check size={11} strokeWidth={3} />
                    </div>
                    <span className="text-[11px] sm:text-xs font-medium text-text">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Botão de Ação Principal (SEMPRE VISÍVEL) */}
            <div className="pt-1 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setStep("payment");
                  setActiveTab("pix");
                }}
                className="w-full py-3 px-4 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-all flex items-center justify-center gap-2 text-sm shadow-md hover:shadow-lg cursor-pointer"
              >
                <span>Assinar Plano Ilimitado (R$ 29,90/mês)</span>
                <ArrowRight size={15} />
              </button>

              <div className="flex items-center justify-between text-[11px] text-text-muted px-1">
                <button
                  type="button"
                  onClick={() => {
                    setStep("payment");
                    setActiveTab("cupom");
                  }}
                  className="hover:text-primary transition-colors cursor-pointer font-medium underline"
                >
                  Possui um cupom?
                </button>
                <span className="flex items-center gap-1 text-emerald-700">
                  <Lock size={10} /> Mercado Pago Seguro
                </span>
              </div>
            </div>

            {/* Selo Compacto Mercado Pago */}
            <div className="pt-2 border-t border-border/60">
              <MercadoPagoBadge variant="compact" className="w-full justify-center text-[10px]" />
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            ETAPA 2: OPÇÕES DE PAGAMENTO (PIX, CARTÃO E CUPOM)
        ═══════════════════════════════════════════════════════════════ */}
        {step === "payment" && (
          <div className="space-y-3.5 animate-in fade-in overflow-y-auto">
            {/* Botão Voltar */}
            <button
              type="button"
              onClick={() => setStep("overview")}
              className="inline-flex items-center gap-1 text-xs font-bold text-text-muted hover:text-text transition-colors cursor-pointer"
            >
              <ArrowLeft size={13} />
              <span>Voltar aos benefícios</span>
            </button>

            <div>
              <h2 className="text-lg sm:text-xl font-serif font-bold text-text">
                Escolha a forma de pagamento
              </h2>
              <p className="text-xs text-text-muted">
                Plano Ilimitado · <strong>R$ 29,90/mês</strong>
              </p>
            </div>

            {/* SELETOR DE ABAS (PIX / CARTÃO / CUPOM) */}
            <div className="flex rounded-xl bg-background p-1 border border-border/80 gap-1">
              <button
                type="button"
                onClick={() => setActiveTab("pix")}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === "pix"
                    ? "bg-primary text-white shadow-xs"
                    : "text-text-muted hover:text-text"
                }`}
              >
                <QrCode size={13} />
                <span>Pix</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("cartao")}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === "cartao"
                    ? "bg-primary text-white shadow-xs"
                    : "text-text-muted hover:text-text"
                }`}
              >
                <CreditCard size={13} />
                <span>Cartão</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("cupom")}
                className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === "cupom"
                    ? "bg-primary text-white shadow-xs"
                    : "text-text-muted hover:text-text"
                }`}
              >
                <Tag size={12} />
                <span>Cupom</span>
              </button>
            </div>

            {/* ───────── CONTEÚDO DA ABA 1: PIX INSTANTÂNEO ───────── */}
            {activeTab === "pix" && (
              <div className="space-y-2.5">
                <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2 text-xs">
                  <QrCode size={14} className="text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-emerald-950 text-[11px]">Pagamento Avulso (30 Dias)</p>
                    <p className="text-[10px] text-emerald-800 leading-tight">
                      Acesso completo por 30 dias. Não há débito automático.
                    </p>
                  </div>
                </div>

                {pixApproved ? (
                  <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-300 text-center space-y-2 animate-in zoom-in-95">
                    <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-sm">
                      <CheckCircle2 size={24} />
                    </div>
                    <h3 className="text-sm font-bold text-emerald-950">
                      Pagamento Confirmado via Pix!
                    </h3>
                    <p className="text-xs text-emerald-800">
                      Seu plano ilimitado foi ativado com sucesso por 30 dias.
                    </p>
                  </div>
                ) : pixData ? (
                  <div className="space-y-3 animate-in fade-in">
                    {/* QR Code Imagem */}
                    <div className="p-3 bg-white rounded-xl border border-border flex flex-col items-center justify-center text-center shadow-inner max-w-[200px] mx-auto">
                      {pixData.qr_code_base64 ? (
                        <img
                          src={`data:image/png;base64,${pixData.qr_code_base64}`}
                          alt="QR Code Pix"
                          className="w-36 h-36 object-contain rounded-md"
                        />
                      ) : (
                        <div className="w-36 h-36 flex items-center justify-center bg-gray-100 rounded-md">
                          <QrCode size={36} className="text-gray-400" />
                        </div>
                      )}
                      <p className="text-[10px] font-semibold text-gray-600 mt-1">
                        Escaneie no app do seu banco
                      </p>
                    </div>

                    {/* Copia e Cola */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                        Chave Pix Copia e Cola:
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          readOnly
                          value={pixData.qr_code}
                          className="flex-1 px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-[10px] text-text font-mono truncate select-all"
                        />
                        <button
                          type="button"
                          onClick={handleCopyPix}
                          className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-all cursor-pointer flex items-center gap-1 shrink-0 shadow-xs"
                        >
                          {copiedPix ? <Check size={12} /> : <Copy size={12} />}
                          <span>{copiedPix ? "Copiado!" : "Copiar"}</span>
                        </button>
                      </div>
                    </div>

                    {/* Status de Aguardo em Tempo Real */}
                    <div className="flex items-center justify-center gap-1.5 text-[11px] text-text-muted py-0.5">
                      <Loader2 size={12} className="animate-spin text-primary" />
                      <span>Aguardando confirmação bancária...</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 text-center py-1">
                    <p className="text-xs text-text-muted leading-relaxed">
                      Gere o <strong>QR Code Pix de R$ 29,90</strong>. A liberação do seu plano é instantânea.
                    </p>

                    <button
                      type="button"
                      onClick={handleGeneratePix}
                      disabled={pixLoading}
                      className="w-full py-3 px-4 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-all flex items-center justify-center gap-2 text-xs sm:text-sm shadow-md hover:shadow-lg cursor-pointer disabled:opacity-60"
                    >
                      {pixLoading ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          <span>Gerando chave Pix instantânea...</span>
                        </>
                      ) : (
                        <>
                          <QrCode size={15} />
                          <span>Gerar QR Code Pix (R$ 29,90)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ───────── CONTEÚDO DA ABA 2: CARTÃO DE CRÉDITO (EMBUTIDO) ───────── */}
            {activeTab === "cartao" && (
              <div className="space-y-2 py-0.5">
                <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 flex items-start gap-2 text-xs">
                  <RefreshCw size={14} className="text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-text text-[11px]">Assinatura Mensal Recorrente Automática</p>
                    <p className="text-[10px] text-text-muted leading-tight">
                      Cobrança automática de <strong>R$ 29,90/mês</strong> a cada 30 dias na sua fatura. Cancele quando quiser sem multas ou fidelidade.
                    </p>
                  </div>
                </div>

                <MercadoPagoBrick
                  amount={29.9}
                  onSuccess={async () => {
                    await refreshSubscription();
                    setTimeout(() => {
                      closeSubscriptionModal();
                    }, 3000);
                  }}
                />
              </div>
            )}

            {/* ───────── CONTEÚDO DA ABA 3: CUPOM ───────── */}
            {activeTab === "cupom" && (
              <div className="space-y-2 py-1">
                <p className="text-xs text-text-muted">
                  Digite seu código de cupom exclusivo:
                </p>

                <form onSubmit={handleApplyCoupon} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Digite seu código de cupom"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    className="flex-1 px-3 py-2 rounded-xl bg-background border border-border/80 text-xs text-text placeholder:text-text-muted uppercase font-mono tracking-wider focus:outline-hidden focus:border-primary"
                  />
                  <button
                    type="submit"
                    disabled={couponLoading || !couponCode.trim()}
                    className="px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-all cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {couponLoading ? <Loader2 size={13} className="animate-spin" /> : "Aplicar"}
                  </button>
                </form>

                {couponMessage && (
                  <p
                    className={`text-xs mt-1.5 font-medium ${
                      couponMessage.type === "success" ? "text-emerald-700" : "text-rose-600"
                    }`}
                  >
                    {couponMessage.text}
                  </p>
                )}
              </div>
            )}

            {/* Selo Compacto */}
            <div className="pt-2 border-t border-border/60">
              <MercadoPagoBadge variant="compact" className="w-full justify-center text-[10px]" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
