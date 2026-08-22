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
  Percent,
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
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discount_type: string;
    discount_value: number;
    final_amount: number;
    discount_description: string;
  } | null>(null);

  // Limpar estados ao fechar modal
  useEffect(() => {
    if (!isModalOpen) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      setStep("overview");
      setActiveTab("pix");
      setPixData(null);
      setPixApproved(false);
      setCouponMessage(null);
      setAppliedCoupon(null);
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

  const currentAmount = appliedCoupon ? appliedCoupon.final_amount : 34.9;
  const formattedCurrentAmount = currentAmount.toFixed(2).replace(".", ",");

  async function handleGeneratePix() {
    setPixLoading(true);
    setPixData(null);
    setPixApproved(false);

    try {
      const res = await fetch("/api/subscription/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coupon_code: appliedCoupon?.code }),
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Erro ao gerar cobrança Pix.");
        return;
      }

      setPixData({
        payment_id: data.payment_id,
        qr_code: data.qr_code,
        qr_code_base64: data.qr_code_base64,
        amount: data.amount || currentAmount,
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

        if (data.discount_type === "percent" || data.discount_type === "fixed") {
          setAppliedCoupon({
            code: data.coupon_code,
            discount_type: data.discount_type,
            discount_value: data.discount_value,
            final_amount: data.final_amount,
            discount_description: data.discount_description,
          });
          // Se já havia gerado um Pix antigo, limpa para gerar no novo valor
          setPixData(null);
          // Redireciona suavemente para a aba Pix para o usuário ver o desconto
          setTimeout(() => setActiveTab("pix"), 1500);
        } else {
          await refreshSubscription();
        }
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
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-[11px] font-bold">
                  <Sparkles size={12} />
                  <span>Plano Profissional Completo</span>
                </div>
              )}

              <h2 className="text-xl sm:text-2xl font-serif font-bold text-text mt-2">
                {isReadOnly
                  ? "Reative seu acesso total"
                  : "Desbloqueie o PsiSetting Ilimitado"}
              </h2>

              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                {isReadOnly
                  ? "Seus registros antigos continuam 100% seguros e guardados (CFP). Assine para cadastrar novos pacientes e documentos."
                  : "Organize seus atendimentos com segurança, criptografia clínica e sem fidelidade contratual."}
              </p>
            </div>

            {/* Benefícios em 2 Colunas */}
            <div className="grid grid-cols-2 gap-2 py-0.5">
              {[
                { icon: Users, title: "Pacientes Ilimitados", desc: "Sem limites ou custos por cadastro" },
                { icon: FileCheck2, title: "5 Modelos CFP", desc: "Resolução CFP nº 06/2019" },
                { icon: Lock, title: "Criptografia AES-256", desc: "Chave isolada por profissional" },
                { icon: EyeOff, title: "Modo Privacidade", desc: "Oculte nomes com 1 clique" },
                { icon: Calendar, title: "Agenda Integrada", desc: "Sincronização com Apple & Google" },
                { icon: BookOpen, title: "Diário de Bordo", desc: "Anotações e supervisão" },
              ].map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-background border border-border/80 flex items-start gap-2"
                  >
                    <div className="p-1 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
                      <Icon size={13} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-text truncate">{item.title}</p>
                      <p className="text-[10px] text-text-muted leading-tight">{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bloco de Preço & Garantia */}
            <div className="p-3.5 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Assinatura Única
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-xs font-bold text-text">R$</span>
                  <span className="text-2xl font-serif font-black text-text">34</span>
                  <span className="text-xs font-serif font-bold text-text">,90</span>
                  <span className="text-[11px] text-text-muted">/mês</span>
                </div>
              </div>

              <div className="text-right text-[11px] text-text-muted space-y-0.5">
                <p className="flex items-center gap-1 font-medium text-text justify-end">
                  <ShieldCheck size={13} className="text-primary" />
                  <span>Sem fidelidade</span>
                </p>
                <p>Cancele quando quiser</p>
              </div>
            </div>

            {/* Botão de Avanço */}
            <button
              type="button"
              onClick={() => setStep("payment")}
              className="w-full py-3 px-4 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-all flex items-center justify-center gap-2 text-xs sm:text-sm shadow-md hover:shadow-lg cursor-pointer group"
            >
              <span>Assinar Plano Ilimitado (R$ 34,90/mês)</span>
              <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
            </button>

            {/* Rodapé Compacto */}
            <div className="pt-2 border-t border-border/60">
              <MercadoPagoBadge variant="compact" className="w-full justify-center text-[10px]" />
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            ETAPA 2: FORMAS DE PAGAMENTO EMBUTIDAS (PIX / CARTÃO / CUPOM)
        ═══════════════════════════════════════════════════════════════ */}
        {step === "payment" && (
          <div className="space-y-3 animate-in fade-in">
            {/* Botão Voltar */}
            <button
              type="button"
              onClick={() => setStep("overview")}
              className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text cursor-pointer transition-colors"
            >
              <ArrowLeft size={13} />
              <span>Voltar aos benefícios</span>
            </button>

            <div>
              <h2 className="text-lg sm:text-xl font-serif font-bold text-text">
                Escolha a forma de pagamento
              </h2>
              {appliedCoupon ? (
                <p className="text-xs text-emerald-800 font-medium">
                  Plano Ilimitado · De <span className="line-through text-text-muted">R$ 34,90</span> por <strong>R$ {formattedCurrentAmount}/mês</strong> ({appliedCoupon.discount_description})
                </p>
              ) : (
                <p className="text-xs text-text-muted">
                  Plano Ilimitado · <strong>R$ 34,90/mês</strong>
                </p>
              )}
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
                    : appliedCoupon
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
                    : "text-text-muted hover:text-text"
                }`}
              >
                <Tag size={12} />
                <span>{appliedCoupon ? "Cupom Ativo ✓" : "Cupom"}</span>
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
                      Gere o <strong>QR Code Pix de R$ {formattedCurrentAmount}</strong>. A liberação do seu plano é instantânea.
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
                          <span>Gerar QR Code Pix (R$ {formattedCurrentAmount})</span>
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
                      Cobrança automática de <strong>R$ {formattedCurrentAmount}/mês</strong> a cada 30 dias na sua fatura. Cancele quando quiser sem multas ou fidelidade.
                    </p>
                  </div>
                </div>

                <MercadoPagoBrick
                  amount={currentAmount}
                  couponCode={appliedCoupon?.code}
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
                  Digite seu código de cupom promocional exclusivo:
                </p>

                <form onSubmit={handleApplyCoupon} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ex: PROMO20, HELLEN30"
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
                    className={`text-xs mt-1.5 font-medium leading-relaxed ${
                      couponMessage.type === "success" ? "text-emerald-700 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200" : "text-rose-600"
                    }`}
                  >
                    {couponMessage.text}
                  </p>
                )}

                {appliedCoupon && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-center justify-between">
                    <div>
                      <p className="font-bold">Cupom {appliedCoupon.code} Ativo</p>
                      <p className="text-[11px] text-emerald-800">
                        Novo valor: <strong>R$ {formattedCurrentAmount}/mês</strong>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAppliedCoupon(null);
                        setCouponMessage(null);
                      }}
                      className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                    >
                      Remover
                    </button>
                  </div>
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
