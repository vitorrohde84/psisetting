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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-surface border border-border/80 shadow-2xl p-6 sm:p-8 overflow-hidden max-h-[92vh] overflow-y-auto">
        {/* Botão Fechar */}
        <button
          type="button"
          onClick={closeSubscriptionModal}
          className="absolute top-5 right-5 p-2 rounded-xl text-text-muted hover:text-text hover:bg-background transition-colors cursor-pointer z-10"
          aria-label="Fechar"
        >
          <X size={18} />
        </button>

        {/* ═══════════════════════════════════════════════════════════════
            ETAPA 1: VISÃO GERAL DO PLANO ÚNICO & BENEFÍCIOS
        ═══════════════════════════════════════════════════════════════ */}
        {step === "overview" && (
          <div className="space-y-5 animate-in fade-in">
            {/* Cabeçalho */}
            <div>
              {isReadOnly ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold border border-amber-200">
                  <AlertTriangle size={13} className="text-amber-700" />
                  <span>Modo Somente Leitura Ativo</span>
                </div>
              ) : isTrialing ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
                  <Sparkles size={13} />
                  <span>Período de Teste: {trialDaysLeft} dias restantes</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20">
                  <ShieldCheck size={13} />
                  <span>Plano Único & Completo</span>
                </div>
              )}

              <h2 className="text-2xl font-serif font-bold text-text mt-3">
                Plano Único Profissional Clínico
              </h2>
              <p className="text-xs sm:text-sm text-text-muted mt-1 leading-relaxed">
                Acesso total, irrestrito e ilimitado a todas as ferramentas e modelos do sistema.
              </p>
            </div>

            {/* Card de Preço */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/10 via-surface to-secondary/10 border border-primary/25 flex items-baseline justify-between shadow-2xs">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                  Assinatura Mensal
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-xs font-bold text-text">R$</span>
                  <span className="text-3xl font-serif font-black text-text">29</span>
                  <span className="text-lg font-serif font-bold text-text">,90</span>
                  <span className="text-xs text-text-muted font-medium">/mês</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                  Sem fidelidade
                </span>
                <p className="text-[10px] text-text-muted mt-1">Cancele quando quiser</p>
              </div>
            </div>

            {/* Lista Detalhada de Benefícios */}
            <div className="space-y-2.5 py-1">
              <p className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Tudo o que está incluído no seu plano:
              </p>

              <div className="space-y-2">
                {[
                  {
                    icon: Users,
                    title: "Pacientes e Prontuários Ilimitados",
                    desc: "Sem limite de cadastros, evoluções ou histórico clínico.",
                  },
                  {
                    icon: FileCheck2,
                    title: "5 Modelos Oficiais CFP (Res. 06/2019)",
                    desc: "Declaração, Atestado, Relatório, Parecer e Laudo com PDF timbrado.",
                  },
                  {
                    icon: Calendar,
                    title: "Agenda Inteligente & Sincronização iCal",
                    desc: "Integração em tempo real com Apple Calendar, iPhone e Google Agenda.",
                  },
                  {
                    icon: DollarSign,
                    title: "Controle Financeiro de Sessões & Recibos",
                    desc: "Gestão completa de pagamentos recebidos, pendentes e recibos.",
                  },
                  {
                    icon: BookOpen,
                    title: "Diário de Bordo para Supervisão",
                    desc: "Espaço confidencial para reflexões e casos clínicos.",
                  },
                  {
                    icon: Lock,
                    title: "Criptografia AES-256 & Conformidade CFP/LGPD",
                    desc: "Seus dados e prontuários protegidos com chave de segurança exclusiva.",
                  },
                  {
                    icon: EyeOff,
                    title: "Modo Privacidade com 1 Clique",
                    desc: "Ofusque nomes e diagnósticos na tela para atendimentos seguros.",
                  },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 text-xs text-text">
                    <div className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                      <Check size={13} strokeWidth={3} />
                    </div>
                    <div>
                      <span className="font-bold text-text">{item.title}: </span>
                      <span className="text-text-muted">{item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Botão de Ação Principal */}
            <div className="pt-2 space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  setStep("payment");
                  setActiveTab("pix");
                }}
                className="w-full py-3.5 px-5 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-all flex items-center justify-center gap-2 text-sm shadow-md hover:shadow-lg cursor-pointer"
              >
                <span>Assinar Plano Ilimitado (R$ 29,90/mês)</span>
                <ArrowRight size={16} />
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setStep("payment");
                    setActiveTab("cupom");
                  }}
                  className="text-[11px] text-text-muted hover:text-primary transition-colors cursor-pointer font-medium"
                >
                  Possui um cupom de parceiro? <span className="underline font-bold">Clique aqui para aplicar</span>
                </button>
              </div>
            </div>

            {/* Selo Oficial de Segurança Mercado Pago */}
            <div className="pt-3 border-t border-border/60">
              <MercadoPagoBadge variant="full" />
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            ETAPA 2: OPÇÕES DE PAGAMENTO (PIX, CARTÃO E CUPOM)
        ═══════════════════════════════════════════════════════════════ */}
        {step === "payment" && (
          <div className="space-y-4 animate-in fade-in">
            {/* Botão Voltar */}
            <button
              type="button"
              onClick={() => setStep("overview")}
              className="inline-flex items-center gap-1 text-xs font-bold text-text-muted hover:text-text transition-colors cursor-pointer mb-1"
            >
              <ArrowLeft size={14} />
              <span>Voltar aos benefícios</span>
            </button>

            <div>
              <h2 className="text-xl font-serif font-bold text-text">
                Escolha a forma de pagamento
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Plano Profissional Ilimitado · <strong>R$ 29,90/mês</strong>
              </p>
            </div>

            {/* SELETOR DE ABAS (PIX / CARTÃO / CUPOM) */}
            <div className="flex rounded-xl bg-background p-1 border border-border/80 gap-1">
              <button
                type="button"
                onClick={() => setActiveTab("pix")}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === "pix"
                    ? "bg-primary text-white shadow-xs"
                    : "text-text-muted hover:text-text"
                }`}
              >
                <QrCode size={14} />
                <span>Pagar com Pix</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("cartao")}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === "cartao"
                    ? "bg-primary text-white shadow-xs"
                    : "text-text-muted hover:text-text"
                }`}
              >
                <CreditCard size={14} />
                <span>Cartão de Crédito</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("cupom")}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === "cupom"
                    ? "bg-primary text-white shadow-xs"
                    : "text-text-muted hover:text-text"
                }`}
              >
                <Tag size={13} />
                <span>Cupom</span>
              </button>
            </div>

            {/* ───────── CONTEÚDO DA ABA 1: PIX INSTANTÂNEO ───────── */}
            {activeTab === "pix" && (
              <div className="space-y-4 pt-1">
                {pixApproved ? (
                  <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-300 text-center space-y-3 animate-in zoom-in-95">
                    <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-sm">
                      <CheckCircle2 size={28} />
                    </div>
                    <h3 className="text-base font-bold text-emerald-950">
                      Pagamento Confirmado via Pix!
                    </h3>
                    <p className="text-xs text-emerald-800">
                      Seu plano ilimitado foi ativado com sucesso por 30 dias. Aproveite todos os recursos!
                    </p>
                  </div>
                ) : pixData ? (
                  <div className="space-y-4 animate-in fade-in">
                    {/* QR Code Imagem */}
                    <div className="p-4 bg-white rounded-2xl border border-border flex flex-col items-center justify-center text-center shadow-inner max-w-[240px] mx-auto">
                      {pixData.qr_code_base64 ? (
                        <img
                          src={`data:image/png;base64,${pixData.qr_code_base64}`}
                          alt="QR Code Pix"
                          className="w-48 h-48 object-contain rounded-lg"
                        />
                      ) : (
                        <div className="w-48 h-48 flex items-center justify-center bg-gray-100 rounded-lg">
                          <QrCode size={48} className="text-gray-400" />
                        </div>
                      )}
                      <p className="text-[11px] font-semibold text-gray-600 mt-2">
                        Abra o app do seu banco e escaneie o código
                      </p>
                    </div>

                    {/* Copia e Cola */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                        Ou copie a chave Pix Copia e Cola:
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={pixData.qr_code}
                          className="flex-1 px-3 py-2 rounded-xl bg-background border border-border/80 text-[11px] text-text font-mono truncate select-all"
                        />
                        <button
                          type="button"
                          onClick={handleCopyPix}
                          className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-all cursor-pointer flex items-center gap-1.5 shrink-0 shadow-xs"
                        >
                          {copiedPix ? <Check size={14} /> : <Copy size={14} />}
                          <span>{copiedPix ? "Copiado!" : "Copiar"}</span>
                        </button>
                      </div>
                    </div>

                    {/* Status de Aguardo em Tempo Real */}
                    <div className="flex items-center justify-center gap-2 text-xs text-text-muted py-1">
                      <Loader2 size={14} className="animate-spin text-primary" />
                      <span>Aguardando confirmação do banco em tempo real...</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 text-center py-2">
                    <p className="text-xs text-text-muted leading-relaxed">
                      Clique no botão abaixo para gerar o <strong>QR Code Pix de R$ 29,90</strong>. A liberação do seu plano ilimitado é imediata assim que o banco confirmar.
                    </p>

                    <button
                      type="button"
                      onClick={handleGeneratePix}
                      disabled={pixLoading}
                      className="w-full py-3.5 px-5 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-all flex items-center justify-center gap-2 text-sm shadow-md hover:shadow-lg cursor-pointer disabled:opacity-60"
                    >
                      {pixLoading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Gerando chave Pix instantânea...</span>
                        </>
                      ) : (
                        <>
                          <QrCode size={17} />
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
              <div className="space-y-3 py-1">
                <p className="text-xs text-text-muted text-center">
                  Preencha os dados do seu cartão com segurança criptografada do Mercado Pago:
                </p>

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
              <div className="space-y-3 py-1">
                <p className="text-xs text-text-muted">
                  Se você recebeu um código promocional ou de parceria, digite-o abaixo:
                </p>

                <form onSubmit={handleApplyCoupon} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Digite seu código de cupom"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-background border border-border/80 text-xs text-text placeholder:text-text-muted uppercase font-mono tracking-wider focus:outline-hidden focus:border-primary"
                  />
                  <button
                    type="submit"
                    disabled={couponLoading || !couponCode.trim()}
                    className="px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-all cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {couponLoading ? <Loader2 size={14} className="animate-spin" /> : "Aplicar"}
                  </button>
                </form>

                {couponMessage && (
                  <p
                    className={`text-xs mt-2 font-medium ${
                      couponMessage.type === "success" ? "text-emerald-700" : "text-rose-600"
                    }`}
                  >
                    {couponMessage.text}
                  </p>
                )}
              </div>
            )}

            {/* Selo Oficial de Segurança */}
            <div className="pt-3 border-t border-border/60">
              <MercadoPagoBadge variant="compact" className="w-full justify-center" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
