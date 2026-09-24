"use client";

import { useEffect, useState, useRef } from "react";
import { CheckCircle2, AlertCircle, Clock, Loader2 } from "lucide-react";
import { Carregando } from "@/app/components/carregando";
import { formatarReais } from "@/utils/preco-desconto";
import { useSubscription } from "@/utils/subscription-context";
import { quatroUltimos } from "@/utils/assinatura-cartao";
import { sucessoAutomatico, type ModoCartao } from "@/utils/renovacao-tela";
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

/** Resposta 200 de /api/subscription/automatica. */
export interface RenovacaoLigada {
  valor: number;
  /** null = a 1ª cobrança sai em seguida; com data = nada foi cobrado agora. */
  primeiraCobranca: string | null;
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
   * "avulso": paga 30 dias agora (process-payment). "automatico": liga a
   * renovação automática (/api/subscription/automatica), e o Mercado Pago
   * passa a cobrar todo mês. Nada muda de um para o outro depois de criado:
   * trocar o modo pede um Brick novo (key).
   */
  modo: ModoCartao;
  /** Texto do botão do formulário (textoBotaoCartao, em utils/renovacao-tela.ts). */
  textoBotao: string;
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
  /**
   * Renovação automática ligada. Sem primeiraCobranca, o Brick espera a 1ª
   * cobrança ser aprovada (pelo contexto) e chama onSuccess quando ela chegar.
   */
  onAutomaticoLigado?: (ligada: RenovacaoLigada) => void;
  /**
   * 409 porque já existe renovação ligada (ou, no avulso, o servidor recusou
   * pagar com ela ligada). Quem usa o Brick atualiza o status e mostra a situação.
   */
  onRenovacaoJaLigada?: () => void;
  /**
   * Automático sem resposta clara: a assinatura pode ter sido criada. O Brick
   * não oferece nova tentativa — ela esbarraria na primeira.
   */
  onIncerto?: () => void;
  /** Envio em andamento: trocar de modo ou de aba agora desmontaria o Brick no meio da resposta. */
  onProcessando?: (processando: boolean) => void;
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

// Sem onReady nem onError até aqui, o formulário não vai aparecer: o Brick não
// avisa quando um recurso dele é bloqueado (foi assim com o CSP, em 23/09/2026)
// e a tela ficava girando para sempre.
const LIMITE_CARREGAMENTO_MS = 20_000;

const HOSTS_MERCADO_PAGO = /mercadopago|mlstatic|mercadoli[bv]re/;

type Resultado =
  | "aprovado"
  | "em_analise"
  /** Renovação ligada com a 1ª cobrança numa data futura. */
  | "automatico_agendado"
  /** Renovação ligada e a 1ª cobrança saindo agora: espera a aprovação. */
  | "automatico_aguardando"
  /** Sem resposta clara do Mercado Pago: pode ter sido criada. */
  | "automatico_incerto"
  | null;

const MENSAGEM_INCERTA_CONEXAO =
  "Não conseguimos confirmar a renovação automática por falha de conexão. Não tente de novo: em alguns minutos ela aparece em Configurações, se tiver sido criada.";

function lerDiasLiberados(data: Record<string, unknown>): DiasLiberados {
  return {
    dias: typeof data.dias === "number" ? data.dias : undefined,
    observacao: typeof data.observacao === "string" ? data.observacao : null,
  };
}

/**
 * Os 4 últimos dígitos do cartão. O Payment Brick chama o onSubmit com
 * (dadosDoEnvio, additionalData) — conferido no payment.js 3.17.1 dos Bricks e
 * nos tipos de @mercadopago/sdk-react (TPaymentType.onSubmit) —, e os tipos
 * também preveem additionalData dentro do 1º argumento.
 */
function finalDoCartao(adicionais: unknown): string | null {
  if (!adicionais || typeof adicionais !== "object") return null;
  return quatroUltimos((adicionais as { lastFourDigits?: unknown }).lastFourDigits);
}

export function MercadoPagoBrick({
  valorEsperado,
  couponCode,
  modo,
  textoBotao,
  onSuccess,
  onPrecoMudou,
  onCupomRecusado,
  onEmAnalise,
  onAutomaticoLigado,
  onRenovacaoJaLigada,
  onIncerto,
  onProcessando,
}: MercadoPagoBrickProps) {
  const [loading, setLoading] = useState(true);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [erroPagamento, setErroPagamento] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado>(null);
  const [liberacao, setLiberacao] = useState<DiasLiberados>({});
  const [renovacaoLigada, setRenovacaoLigada] = useState<RenovacaoLigada | null>(null);
  const [mensagemIncerta, setMensagemIncerta] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { aguardarConfirmacaoPagamento, renovacao } = useSubscription();
  /** A espera da confirmação acabou sem resposta (15 min): para de girar. */
  const [esperaSemResposta, setEsperaSemResposta] = useState(false);

  // Os callbacks chegam como funções novas a cada render do modal. Se fossem
  // dependência do efeito, o formulário do cartão era destruído e recriado a
  // cada tique do polling do PIX — e a pessoa perdia o que tinha digitado.
  const callbacksRef = useRef({
    onSuccess,
    onPrecoMudou,
    onCupomRecusado,
    onEmAnalise,
    onAutomaticoLigado,
    onRenovacaoJaLigada,
    onIncerto,
    onProcessando,
    aguardarConfirmacaoPagamento,
  });
  useEffect(() => {
    callbacksRef.current = {
      onSuccess,
      onPrecoMudou,
      onCupomRecusado,
      onEmAnalise,
      onAutomaticoLigado,
      onRenovacaoJaLigada,
      onIncerto,
      onProcessando,
      aguardarConfirmacaoPagamento,
    };
  });

  useEffect(() => {
    let isMounted = true;
    let controller: BrickController | null = null;
    // Aprovado nesta montagem: a espera que termina depois (por causa de um
    // pagamento anterior incerto) não pode trocar os dias reais por "liberado".
    let aprovado = false;
    // O formulário apareceu (onReady). Até lá vale o limite de tempo.
    let pronto = false;
    const limite = window.setTimeout(() => {
      if (!isMounted || pronto) return;
      setErroCarregar("O formulário do cartão não carregou. Recarregue a página ou use o PIX.");
      setLoading(false);
    }, LIMITE_CARREGAMENTO_MS);

    // Recurso do Mercado Pago barrado pelo CSP: o Brick não reclama, então o
    // console é o único lugar onde o motivo aparece.
    function aoBloquear(e: SecurityPolicyViolationEvent) {
      if (HOSTS_MERCADO_PAGO.test(e.blockedURI)) {
        console.error(`[cartão] CSP bloqueou ${e.blockedURI} (${e.violatedDirective}). Libere o domínio em next.config.ts.`);
      }
    }
    document.addEventListener("securitypolicyviolation", aoBloquear);

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
        window.clearTimeout(limite);
        setErroCarregar("Chave pública do Mercado Pago não configurada.");
        setLoading(false);
        return;
      }

      const MercadoPago = await carregarSdk();
      if (!isMounted) return;
      if (!MercadoPago) {
        window.clearTimeout(limite);
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
                // A chave do botão no Payment Brick é formSubmit (documentação
                // de textos do Payment Brick e a lista de chaves do payment.js
                // 3.17.1). Chave fora da lista é ignorada com um aviso no
                // console: o customButtonText de antes nunca apareceu.
                formSubmit: textoBotao,
              },
            },
          },
          callbacks: {
            onReady: () => {
              pronto = true;
              window.clearTimeout(limite);
              if (!isMounted) return;
              // Chegou depois do limite: o aviso de falha já não vale.
              setErroCarregar(null);
              setLoading(false);
            },
            onSubmit: (dados: { formData: unknown; additionalData?: unknown }, adicionais?: unknown) =>
              enviar(dados.formData, finalDoCartao(adicionais ?? dados.additionalData)),
            onError: (err: unknown) => {
              window.clearTimeout(limite);
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
        window.clearTimeout(limite);
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
        if (!confirmado) {
          if (isMounted) setEsperaSemResposta(true);
          return;
        }
        if (!isMounted || aprovado) return;
        aprovado = true;
        setLiberacao({});
        setResultado("aprovado");
        callbacksRef.current.onSuccess({});
      });
    }

    // Promessa resolvida = o Brick encerra o "processando" como concluído;
    // rejeitada = libera o formulário para nova tentativa.
    async function enviar(formData: unknown, final: string | null): Promise<void> {
      setErroPagamento(null);
      callbacksRef.current.onProcessando?.(true);
      try {
        if (modo === "automatico") await ligarRenovacao(formData, final);
        else await enviarPagamento(formData);
      } finally {
        callbacksRef.current.onProcessando?.(false);
      }
    }

    /** Sem resposta clara: a assinatura pode existir. O formulário sai da tela. */
    function marcarIncerta(mensagem: string) {
      if (isMounted) {
        setMensagemIncerta(mensagem);
        setResultado("automatico_incerto");
      }
      callbacksRef.current.onIncerto?.();
    }

    // Liga a renovação automática. Nada é cobrado nesta chamada: a 1ª
    // cobrança sai em seguida (quem não tem dias) ou no fim dos dias atuais,
    // e os dias de acesso vêm de cada cobrança aprovada, pelo webhook.
    async function ligarRenovacao(formData: unknown, final: string | null): Promise<void> {
      const cb = callbacksRef.current;

      let res: Response;
      let data: Record<string, unknown>;
      try {
        res = await fetch("/api/subscription/automatica", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            formData,
            coupon_code: couponCode || null,
            valor_esperado: valorEsperado,
            cartao: { final },
          }),
        });
        data = await res.json().catch(() => ({}));
      } catch (err) {
        console.error("Erro ao ligar a renovação automática:", err);
        // A requisição pode ter chegado: tentar de novo esbarraria na
        // assinatura criada (ou, se a trava falhasse, criaria outra).
        marcarIncerta(MENSAGEM_INCERTA_CONEXAO);
        return;
      }

      const erro = typeof data.error === "string" ? data.error : null;

      if (res.status === 202 && data.incerto) {
        marcarIncerta(
          erro ??
            "Não conseguimos confirmar a renovação automática agora. Não tente de novo: em alguns minutos ela aparece em Configurações, se tiver sido criada."
        );
        return;
      }

      if (res.ok && data.ok) {
        const ligada: RenovacaoLigada = {
          // O valor que o Mercado Pago gravou, não o que a tela calculava.
          valor: typeof data.valor === "number" && Number.isFinite(data.valor) ? data.valor : valorEsperado,
          primeiraCobranca:
            typeof data.primeira_cobranca === "string" && data.primeira_cobranca ? data.primeira_cobranca : null,
        };
        if (isMounted) {
          setRenovacaoLigada(ligada);
          setResultado(ligada.primeiraCobranca ? "automatico_agendado" : "automatico_aguardando");
        }
        cb.onAutomaticoLigado?.(ligada);
        // Cobrança agendada: o acesso não muda agora, e esperar só deixaria a
        // faixa "Aguardando a confirmação do pagamento" no topo por 15 min.
        if (!ligada.primeiraCobranca) esperarAprovacao();
        return;
      }

      if (res.status === 409) {
        const preco = lerPreco(data.preco);
        if (preco) {
          cb.onPrecoMudou(preco, erro ?? "O valor mudou. Confira o novo valor antes de continuar.");
          throw new Error("valor mudou");
        }
        if (data.ja_tem) {
          if (isMounted) setErroPagamento(erro ?? "Você já tem a renovação automática ligada.");
          cb.onRenovacaoJaLigada?.();
          throw new Error("renovação já ligada");
        }
      }

      if (ehErroDeCupom(res.status, erro, Boolean(couponCode)) && cb.onCupomRecusado) {
        cb.onCupomRecusado(erro as string);
        throw new Error("cupom recusado");
      }

      // 400 do cartão ou do e-mail (mensagem pronta do servidor), 401, 429, 500.
      if (isMounted) {
        setErroPagamento(erro ?? "Não foi possível ligar a renovação automática agora. Tente de novo em instantes.");
      }
      throw new Error(erro ?? `HTTP ${res.status}`);
    }

    async function enviarPagamento(formData: unknown): Promise<void> {
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
        // Renovação automática ligada (em outra aba, por exemplo): o servidor
        // não cobra o avulso por cima dela.
        if (data.renovacao) {
          if (isMounted) setErroPagamento(erro ?? "Você já tem a renovação automática ligada.");
          cb.onRenovacaoJaLigada?.();
          throw new Error("renovação ligada");
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
      window.clearTimeout(limite);
      document.removeEventListener("securitypolicyviolation", aoBloquear);
      desmontar(controller);
    };
  }, [valorEsperado, couponCode, modo, textoBotao]);

  if (resultado === "aprovado") {
    const { texto } = resumoLiberacao(liberacao.dias, liberacao.observacao);
    // Automático: só chega aqui pela espera da 1ª cobrança (sem os dias).
    const automatico = modo === "automatico";
    const valor = renovacaoLigada?.valor ?? valorEsperado;
    return (
      <div
        role="status"
        className="p-6 rounded-2xl bg-success/10 border border-success/30 text-center space-y-3 animate-in zoom-in-95"
      >
        <div className="w-12 h-12 rounded-full bg-success text-white flex items-center justify-center mx-auto shadow-sm">
          <CheckCircle2 size={28} />
        </div>
        <h3 className="text-base font-bold text-text">
          {automatico ? "Renovação automática ligada!" : "Pagamento aprovado!"}
        </h3>
        <p className="text-xs text-text-muted leading-relaxed">
          {automatico
            ? `Primeira cobrança, de R$ ${formatarReais(valor)}, aprovada. ${texto}`
            : `Pagamento de R$ ${formatarReais(valor)} confirmado. ${texto}`}
        </p>
      </div>
    );
  }

  if ((resultado === "automatico_agendado" || resultado === "automatico_aguardando") && renovacaoLigada) {
    const { titulo, texto } = sucessoAutomatico(renovacaoLigada);
    return (
      <div
        role="status"
        className="p-6 rounded-2xl bg-success/10 border border-success/30 text-center space-y-3 animate-in zoom-in-95"
      >
        <div className="w-12 h-12 rounded-full bg-success text-white flex items-center justify-center mx-auto shadow-sm">
          <CheckCircle2 size={28} />
        </div>
        <h3 className="text-base font-bold text-text">{titulo}</h3>
        <p className="text-xs text-text-muted leading-relaxed">{texto}</p>
        {resultado === "automatico_aguardando" ? (
          renovacao?.cobrancaRecusada ? (
            // O status traz a recusa enquanto a espera consulta: girar para
            // sempre esconderia o problema.
            <p role="alert" className="text-[11px] text-text leading-relaxed">
              O Mercado Pago não conseguiu cobrar este cartão. Ele tenta de novo nos próximos dias; se
              preferir, cancele a renovação em Configurações e pague por PIX.
            </p>
          ) : esperaSemResposta ? (
            <p className="text-[11px] text-text-muted leading-relaxed">
              A primeira cobrança pode levar até 1 hora. Você pode fechar esta janela: o acesso é liberado
              assim que ela for aprovada.
            </p>
          ) : (
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-text-muted">
              <Loader2 size={12} className="animate-spin text-primary" />
              <span>Aguardando a aprovação da primeira cobrança. Você pode fechar esta janela.</span>
            </p>
          )
        ) : (
          <p className="text-[11px] text-text-muted">Para cancelar, é só ir em Configurações.</p>
        )}
      </div>
    );
  }

  if (resultado === "automatico_incerto") {
    return (
      <div
        role="alert"
        className="p-5 rounded-2xl bg-secondary/15 border border-secondary/40 text-center space-y-2.5 animate-in zoom-in-95"
      >
        <div className="w-11 h-11 rounded-full bg-secondary/30 text-text flex items-center justify-center mx-auto">
          <Clock size={22} />
        </div>
        <h3 className="text-sm font-bold text-text">Ainda não temos a confirmação</h3>
        <p className="text-xs text-text-muted leading-relaxed">{mensagemIncerta ?? MENSAGEM_INCERTA_CONEXAO}</p>
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
