"use client";

import { useEffect, useState, useRef } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface MercadoPagoBrickProps {
  amount: number;
  couponCode?: string;
  onSuccess: () => void;
}

export function MercadoPagoBrick({ amount, couponCode, onSuccess }: MercadoPagoBrickProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const brickControllerRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadBrick() {
      const publicKey = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY;
      if (!publicKey) {
        setError("Chave pública do Mercado Pago não configurada.");
        setLoading(false);
        return;
      }

      // 1. Carregar script do Mercado Pago se ainda não estiver na página
      if (!(window as any).MercadoPago) {
        const script = document.createElement("script");
        script.src = "https://sdk.mercadopago.com/js/v2";
        script.async = true;
        document.body.appendChild(script);

        await new Promise((resolve) => {
          script.onload = resolve;
          script.onerror = () => {
            if (isMounted) {
              setError("Não foi possível carregar o checkout do Mercado Pago.");
              setLoading(false);
            }
          };
        });
      }

      if (!isMounted) return;

      try {
        const mp = new (window as any).MercadoPago(publicKey, { locale: "pt-BR" });
        const bricksBuilder = mp.bricks();

        // Limpar container anterior se houver
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }

        const formattedAmount = amount.toFixed(2).replace(".", ",");

        // Criar o Payment Brick transparente (Cartão e Pix embutidos)
        brickControllerRef.current = await bricksBuilder.create(
          "payment",
          "paymentBrick_container",
          {
            initialization: {
              amount: amount,
            },
            customization: {
              paymentMethods: {
                creditCard: "all",
                maxInstallments: 1,
              },
              visual: {
                style: {
                  theme: "bootstrap",
                },
                hideFormTitle: true,
                texts: {
                  customButtonText: `Confirmar Assinatura (R$ ${formattedAmount}/mês)`,
                },
              },
            },
            callbacks: {
              onReady: () => {
                if (isMounted) setLoading(false);
              },
              onSubmit: ({ selectedPaymentMethod, formData }: any) => {
                return new Promise(async (resolve, reject) => {
                  try {
                    const res = await fetch("/api/subscription/process-payment", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ formData, coupon_code: couponCode }),
                    });

                    const data = await res.json();

                    if (res.ok && (data.status === "approved" || data.status === "in_process")) {
                      if (isMounted) setSuccess(true);
                      onSuccess();
                      resolve(data);
                    } else {
                      alert(data.error || "Pagamento não aprovado. Verifique os dados do cartão.");
                      reject(data);
                    }
                  } catch (err) {
                    console.error("Erro no submit do Brick:", err);
                    reject(err);
                  }
                });
              },
              onError: (err: any) => {
                console.error("Erro interno do Brick:", err);
                if (isMounted) {
                  setError("Erro ao inicializar o formulário de pagamento.");
                  setLoading(false);
                }
              },
            },
          }
        );
      } catch (err: any) {
        console.error("Erro ao inicializar Brick:", err);
        if (isMounted) {
          setError(err?.message || "Erro ao carregar formulário de cartão.");
          setLoading(false);
        }
      }
    }

    loadBrick();

    return () => {
      isMounted = false;
      if (brickControllerRef.current?.unmount) {
        try {
          brickControllerRef.current.unmount();
        } catch {}
      }
    };
  }, [amount, couponCode, onSuccess]);

  if (success) {
    const formattedAmount = amount.toFixed(2).replace(".", ",");
    return (
      <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-300 text-center space-y-3 animate-in zoom-in-95">
        <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-sm">
          <CheckCircle2 size={28} />
        </div>
        <h3 className="text-base font-bold text-emerald-950">
          Pagamento Aprovado com Sucesso!
        </h3>
        <p className="text-xs text-emerald-800">
          Sua assinatura profissional de R$ {formattedAmount}/mês foi ativada.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {loading && (
        <div className="flex flex-col items-center justify-center py-10 space-y-2 text-text-muted">
          <Loader2 size={24} className="animate-spin text-primary" />
          <p className="text-xs font-medium">Carregando gateway seguro...</p>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle size={16} className="text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div
        id="paymentBrick_container"
        ref={containerRef}
        className={loading ? "hidden" : "block"}
      />
    </div>
  );
}
