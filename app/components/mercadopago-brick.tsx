"use client";

import { useEffect, useState, useRef } from "react";
import { CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { Carregando } from "@/app/components/carregando";
import { formatarReais } from "@/utils/preco-desconto";
import { useSubscription } from "@/utils/subscription-context";
import {
  ehErroDeCupom,
  lerPreco,
  mensagemRecusaCartao,
  resumoLiberacao,
  type PrecoTela,
} from "@/utils/assinatura-tela";

/**
 * Dias que o banco concedeu na aprovação (process-payment). Ausente quando a
 * aprovação chegou por outro caminho (webhook, reconciliação) e a tela só
 * soube pelo status.
 */
export interface DiasLiberados {
  dias?: number;
  observacao?: string | null;
}

interface MercadoPagoBrickProps {
  /**
   * O valor que a tela mostrou. É o `amount` do Brick e vai como
   * valor_esperado: se o servidor chegar a outro número, ele não cobra e
   * devolve 409 com o preço novo. Quem usa o Brick deve remontá-lo (key) quando
   * este valor mudar — o Brick não aceita troca de valor depois de criado.
   */
  valorEsperado: number;
  /** Só o cupom DIGITADO agora. O cupom que a pessoa já usa o servidor aplica sozinho. */
  couponCode?: string | null;
  /**
   * Aprovado: na hora (com os dias concedidos) ou depois de uma análise, pela
   * espera do contexto (sem os dias — liberacao vazia).
   */
  onSuccess: (liberacao: DiasLiberados) => void;
  /** 409: o valor mudou entre abrir a tela e pagar. Nada foi cobrado. */
  onPrecoMudou: (preco: PrecoTela, mensagem: string) => void;
  /** 400 por causa do cupom digitado (deixou de valer). Nada foi cobrado. */
  onCupomRecusado?: (mensagem: string) => void;
  /** O Mercado Pago recebeu o pagamento e está analisando. O Brick espera a aprovação sozinho. */
  onEmAnalise?: () => void;
}

// O SDK do Mercado Pago não tem tipos publicados; isto cobre só o que usamos.
interface BrickController {
  unmount?: () => void;
}
interface MercadoPagoSdk {
  bricks(): {
    create(tipo: "payment", containerId: string, config: unknown): Promise<BrickController>;
  };
}
type MercadoPagoConstrutor = new (chave: string, opcoes: { locale: string }) => MercadoPagoSdk;

function sdkNaJanela(): MercadoPagoConstrutor | undefined {
  return (window as unknown as { MercadoPago?: MercadoPagoConstrutor }).MercadoPago;
}

// Uma carga por página: o Brick é remontado quando o valor muda, e antes cada
// montagem que chegava antes do script terminar de baixar injetava outro.
let cargaDoSdk: Promise<MercadoPagoConstrutor | null> | null = null;

function carregarSdk(): Promise<MercadoPagoConstrutor | null> {
  const pronto = sdkNaJanela();
  if (pronto) return Promise.resolve(pronto);

  if (!cargaDoSdk) {
    cargaDoSdk = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://sdk.mercadopago.com/js/v2";
      script.async = true;
      script.onload = () => resolve(sdkNaJanela() ?? null);
      script.onerror = () => {
        // Deixa a próxima abertura tentar de novo (rede instável, bloqueador).
        cargaDoSdk = null;
        script.remove();
        resolve(null);
      };
      document.body.appendChild(script);
    });
  }
  return cargaDoSdk;
}

type Resultado = "aprovado" | "em_analise" | null;

function lerDiasLiberados(data: Record<string, unknown>): DiasLiberados {
  return {
    dias: typeof data.dias === "number" ? data.dias : undefined,
    observacao: typeof data.observacao === "string" ? data.observacao : null,
  };
}

export function MercadoPagoBrick({
  valorEsperado,
  couponCode,
  onSuccess,
  onPrecoMudou,
  onCupomRecusado,
  onEmAnalise,
}: MercadoPagoBrickProps) {
  const [loading, setLoading] = useState(true);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [erroPagamento, setErroPagamento] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado>(null);
  const [liberacao, setLiberacao] = useState<DiasLiberados>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const { aguardarConfirmacaoPagamento } = useSubscription();

  // Os callbacks chegam como funções novas a cada render do modal. Se fossem
  // dependência do efeito, o formulário do cartão era destruído e recriado a
  // cada tique do polling do PIX — e a pessoa perdia o que tinha digitado.
  const callbacksRef = useRef({
    onSuccess,
    onPrecoMudou,
    onCupomRecusado,
    onEmAnalise,
    aguardarConfirmacaoPagamento,
  });
  useEffect(() => {
    callbacksRef.current = { onSuccess, onPrecoMudou, onCupomRecusado, onEmAnalise, aguardarConfirmacaoPagamento };
  });

  useEffect(() => {
    let isMounted = true;
    let controller: BrickController | null = null;
    // Aprovado nesta montagem: a espera que termina depois (por causa de um
    // pagamento anterior incerto) não pode trocar os dias reais por "liberado".
    let aprovado = false;

    function desmontar(c: BrickController | null) {
      try {
        c?.unmount?.();
      } catch {
        // O Brick já pode ter sido removido junto com o container.
      }
    }

    async function loadBrick() {
      const publicKey = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY;
      if (!publicKey) {
        setErroCarregar("Chave pública do Mercado Pago não configurada.");
        setLoading(false);
        return;
      }

      const MercadoPago = await carregarSdk();
      if (!isMounted) return;
      if (!MercadoPago) {
        setErroCarregar("Não foi possível carregar o checkout do Mercado Pago. Confira sua conexão ou use o PIX.");
        setLoading(false);
        return;
      }

      try {
        const mp = new MercadoPago(publicKey, { locale: "pt-BR" });
        const bricksBuilder = mp.bricks();

        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }

        const criado = await bricksBuilder.create("payment", "paymentBrick_container", {
          initialization: {
            amount: valorEsperado,
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
                // Pagamento único de 30 dias: "/mês" ou "assinatura" aqui
                // prometeria uma cobrança automática que não existe.
                customButtonText: `Pagar R$ ${formatarReais(valorEsperado)} · 30 dias de acesso`,
              },
            },
          },
          callbacks: {
            onReady: () => {
              if (isMounted) setLoading(false);
            },
            onSubmit: ({ formData }: { formData: unknown }) => enviarPagamento(formData),
            onError: (err: unknown) => {
              console.error("Erro interno do Brick:", err);
              if (isMounted) {
                setErroCarregar("Erro ao carregar o formulário de pagamento. Feche e abra de novo, ou use o PIX.");
                setLoading(false);
              }
            },
          },
        });

        // Remontagem rápida (o valor mudou enquanto o Brick nascia): o antigo
        // não pode ficar vivo desenhando por cima do novo.
        if (!isMounted) {
          desmontar(criado);
          return;
        }
        controller = criado;
      } catch (err: unknown) {
        console.error("Erro ao inicializar Brick:", err);
        if (isMounted) {
          setErroCarregar("Erro ao carregar o formulário de cartão. Feche e abra de novo, ou use o PIX.");
          setLoading(false);
        }
      }
    }

    // "Assim que for aprovado, seu acesso é liberado automaticamente" só é
    // verdade porque o contexto consulta o status até a aprovação chegar (pelo
    // webhook ou pela reconciliação). Se chegar com o Brick na tela, ele vira
    // "aprovado" sozinho; se o modal já fechou, a faixa do topo se atualiza.
    function esperarAprovacao() {
      void callbacksRef.current.aguardarConfirmacaoPagamento().then((confirmado) => {
        if (!confirmado || !isMounted || aprovado) return;
        aprovado = true;
        setLiberacao({});
        setResultado("aprovado");
        callbacksRef.current.onSuccess({});
      });
    }

    // Promessa resolvida = o Brick encerra o "processando" como concluído;
    // rejeitada = libera o formulário para nova tentativa.
    async function enviarPagamento(formData: unknown): Promise<void> {
      setErroPagamento(null);
      const cb = callbacksRef.current;

      let res: Response;
      let data: Record<string, unknown>;
      try {
        res = await fetch("/api/subscription/process-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formData, coupon_code: couponCode || null, valor_esperado: valorEsperado }),
        });
        data = await res.json().catch(() => ({}));
      } catch (err) {
        console.error("Erro no submit do Brick:", err);
        // Sem resposta não dá para saber se o Mercado Pago cobrou: pedir para
        // esperar antes evita a segunda cobrança, e a espera mostra o
        // resultado sozinha se o pagamento tiver passado.
        if (isMounted) {
          setErroPagamento(
            "Não conseguimos confirmar o pagamento por falha de conexão. Se ele foi aprovado, esta tela mostra em alguns minutos; antes de tentar de novo, aguarde um pouco."
          );
        }
        esperarAprovacao();
        throw err;
      }

      const erro = typeof data.error === "string" ? data.error : null;

      // 202 "incerto": o servidor não conseguiu confirmar com o Mercado Pago se
      // a cobrança aconteceu. Mesmo tratamento da falha de conexão: pedir para
      // não pagar de novo e esperar — a espera mostra o resultado sozinha.
      if (res.status === 202 && data.incerto) {
        if (isMounted) {
          setErroPagamento(
            erro ??
              "Não conseguimos confirmar o pagamento agora. Não pague de novo: aguarde alguns minutos — se ele foi aprovado, seu acesso é liberado automaticamente."
          );
        }
        esperarAprovacao();
        throw new Error("pagamento incerto");
      }

      if (res.ok) {
        if (data.status === "approved") {
          aprovado = true;
          const dias = lerDiasLiberados(data);
          if (isMounted) {
            setLiberacao(dias);
            setResultado("aprovado");
          }
          cb.onSuccess(dias);
          return;
        }
        // Cartão em análise: o dinheiro ainda não entrou, então não se diz que
        // o acesso foi liberado. Quando aprovar, o webhook (ou a reconciliação
        // em /api/subscription/status) registra os dias sozinho.
        if (data.status === "in_process" || data.status === "pending") {
          if (isMounted) setResultado("em_analise");
          cb.onEmAnalise?.();
          esperarAprovacao();
          return;
        }
        if (isMounted) setErroPagamento(mensagemRecusaCartao(data.status_detail));
        throw new Error(String(data.status ?? "recusado"));
      }

      if (res.status === 409) {
        const preco = lerPreco(data.preco);
        if (preco) {
          cb.onPrecoMudou(preco, erro ?? "O valor mudou. Confira o novo valor antes de pagar.");
          throw new Error("valor mudou");
        }
      }

      if (ehErroDeCupom(res.status, erro, Boolean(couponCode)) && cb.onCupomRecusado) {
        cb.onCupomRecusado(erro as string);
        throw new Error("cupom recusado");
      }

      if (isMounted) {
        setErroPagamento(erro ?? "Não foi possível processar o pagamento agora. Tente de novo em instantes.");
      }
      throw new Error(erro ?? `HTTP ${res.status}`);
    }

    loadBrick();

    return () => {
      isMounted = false;
      desmontar(controller);
    };
  }, [valorEsperado, couponCode]);

  if (resultado === "aprovado") {
    const { texto } = resumoLiberacao(liberacao.dias, liberacao.observacao);
    return (
      <div className="p-6 rounded-2xl bg-success/10 border border-success/30 text-center space-y-3 animate-in zoom-in-95">
        <div className="w-12 h-12 rounded-full bg-success text-white flex items-center justify-center mx-auto shadow-sm">
          <CheckCircle2 size={28} />
        </div>
        <h3 className="text-base font-bold text-text">Pagamento aprovado!</h3>
        <p className="text-xs text-text-muted leading-relaxed">
          Pagamento de R$ {formatarReais(valorEsperado)} confirmado. {texto}
        </p>
      </div>
    );
  }

  if (resultado === "em_analise") {
    return (
      <div className="p-5 rounded-2xl bg-secondary/15 border border-secondary/40 text-center space-y-2.5 animate-in zoom-in-95">
        <div className="w-11 h-11 rounded-full bg-secondary/30 text-text flex items-center justify-center mx-auto">
          <Clock size={22} />
        </div>
        <h3 className="text-sm font-bold text-text">Pagamento em análise</h3>
        <p className="text-xs text-text-muted leading-relaxed">
          Pagamento em análise pelo Mercado Pago. Assim que for aprovado, seu acesso é liberado
          automaticamente; você pode fechar esta janela.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {loading && (
        <Carregando tamanho="sm" mensagem="Carregando gateway seguro…" className="py-10" />
      )}

      {(erroCarregar || erroPagamento) && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-danger/10 border border-danger/25 text-text text-xs flex items-start gap-2"
        >
          <AlertCircle size={16} className="text-danger shrink-0 mt-px" />
          <span>{erroCarregar || erroPagamento}</span>
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
