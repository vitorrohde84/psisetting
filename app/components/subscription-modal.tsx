"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSubscription } from "@/utils/subscription-context";
import { MercadoPagoBrick } from "./mercadopago-brick";
import { MercadoPagoBadge } from "./mercadopago-badge";
import { formatarReais } from "@/utils/preco-desconto";
import {
  dataCurta,
  ehErroDeCupom,
  horaCurta,
  lerPreco,
  resumirValor,
  resumoLiberacao,
  sufixoDoValor,
  type Liberacao,
  type PrecoTela,
} from "@/utils/assinatura-tela";
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
  CalendarCheck,
  BookOpen,
  EyeOff,
  Info,
  RefreshCw,
} from "lucide-react";

export function SubscriptionModal() {
  const { isModalOpen } = useSubscription();

  // Montado só enquanto aberto: fechar desmonta e zera de uma vez o cupom
  // digitado, o PIX, o polling, os timers e as mensagens. Antes um efeito
  // limpava campo a campo e esquecia alguns (o código digitado e o erro do
  // cupom voltavam na abertura seguinte).
  if (!isModalOpen) return null;
  return <ModalAssinatura />;
}

type Mensagem = { tipo: "sucesso" | "info" | "erro"; texto: string };

interface DadosPix {
  payment_id: string | number;
  qr_code: string;
  qr_code_base64: string;
  amount: number;
  expires_at?: string;
}

const BENEFICIOS = [
  { icon: Users, title: "Pacientes Ilimitados", desc: "Sem limites ou custos por cadastro" },
  { icon: FileCheck2, title: "5 Modelos CFP", desc: "Resolução CFP nº 06/2019" },
  { icon: Lock, title: "Criptografia AES-256", desc: "Chave isolada por profissional" },
  { icon: EyeOff, title: "Modo Privacidade", desc: "Oculte nomes com 1 clique" },
  { icon: Calendar, title: "Agenda Integrada", desc: "Sincronização com Apple & Google" },
  { icon: BookOpen, title: "Diário de Bordo", desc: "Anotações e supervisão" },
];

// Polling do PIX: /api/subscription/pix/check aceita 60 consultas a cada 10
// minutos. A 3 s fixos (como era), o limite estourava em 3 minutos e quem
// demorava para abrir o app do banco não via a confirmação chegar.
const PIX_INTERVALO_INICIAL_MS = 5_000;
const PIX_INTERVALO_DEPOIS_MS = 20_000;
const PIX_FASE_INICIAL_MS = 2 * 60_000;
// Confirmação do banco pode chegar um pouco depois de o QR vencer.
const PIX_TOLERANCIA_APOS_VENCER_MS = 5 * 60_000;

const MENSAGEM_CUPOM_REMOVIDO = "Removemos o cupom e recalculamos o valor.";

// Esc no meio de um pagamento só fecha na segunda vez, dentro deste prazo.
const ESC_CONFIRMA_MS = 5_000;

const SELETOR_FOCAVEIS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  // Os campos do cartão do Mercado Pago são iframes.
  "iframe",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** O que o Tab alcança dentro do diálogo, na ordem da tela. */
function elementosFocaveis(raiz: HTMLElement): HTMLElement[] {
  return Array.from(raiz.querySelectorAll<HTMLElement>(SELETOR_FOCAVEIS)).filter(
    // Sem caixa na tela = escondido (o Brick fica em "hidden" enquanto carrega).
    (el) => el.getClientRects().length > 0
  );
}

type ResultadoPreco = { preco: PrecoTela } | { erro: string };

/** Preço de hoje, com o cupom que a pessoa já usa (sem código digitado). */
async function obterPreco(): Promise<ResultadoPreco> {
  try {
    const res = await fetch("/api/subscription/preco");
    const data = await res.json().catch(() => null);
    const lido = res.ok ? lerPreco(data) : null;
    return lido ? { preco: lido } : { erro: "Não foi possível carregar o valor agora." };
  } catch {
    return { erro: "Sem conexão para carregar o valor." };
  }
}

function ModalAssinatura() {
  const {
    closeSubscriptionModal,
    isReadOnly,
    isTrialing,
    trialDaysLeft,
    isVip,
    situacao,
    currentPeriodEnd,
    modalComCupom,
    refreshSubscription,
    aguardarConfirmacaoPagamento,
  } = useSubscription();

  // Quem já tem acesso pago e abriu o modal para pagar mais um mês.
  const renovando = situacao === "ativo" && !isVip;

  // Etapa: "overview" (benefícios, preço e cupom) ou "payment" (PIX / cartão)
  const [step, setStep] = useState<"overview" | "payment">("overview");
  const [activeTab, setActiveTab] = useState<"pix" | "cartao">("pix");

  // ── Preço: sempre o do servidor ──────────────────────────────────────
  // Começa "carregando" em vez de R$ 34,90: quem tem cupom em uso veria o
  // preço cheio piscar antes do seu.
  const [preco, setPreco] = useState<PrecoTela | null>(null);
  const [precoCarregando, setPrecoCarregando] = useState(true);
  const [precoErro, setPrecoErro] = useState<string | null>(null);
  /** O valor mudou ou o cupom caiu no momento de pagar. */
  const [avisoPreco, setAvisoPreco] = useState<string | null>(null);

  // ── Cupom ────────────────────────────────────────────────────────────
  const [cupomAberto, setCupomAberto] = useState(modalComCupom);
  const [couponInput, setCouponInput] = useState("");
  /** Só o cupom NOVO digitado agora; o que a pessoa já usa o servidor aplica sozinho. */
  const [cupomDigitado, setCupomDigitado] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponMessage, setCouponMessage] = useState<Mensagem | null>(null);

  // ── PIX ──────────────────────────────────────────────────────────────
  const [pixLoading, setPixLoading] = useState(false);
  const [pixData, setPixData] = useState<DadosPix | null>(null);
  const [pixMensagem, setPixMensagem] = useState<Mensagem | null>(null);
  const [pixExpirado, setPixExpirado] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);
  /** PIX confirmado: o título e os dias que o banco concedeu. */
  const [pixConfirmacao, setPixConfirmacao] = useState<{ titulo: string; liberacao: Liberacao } | null>(null);
  const pixApproved = pixConfirmacao !== null;

  // Cartão aprovado ou em análise: trocar de aba desmontaria o aviso e
  // convidaria a pagar de novo pelo PIX.
  const [cartaoConcluido, setCartaoConcluido] = useState(false);

  /** Aprovado com menos dias que o período: o modal espera a pessoa ler e fechar. */
  const [liberacaoParcial, setLiberacaoParcial] = useState(false);
  /** Primeiro Esc no meio de um pagamento: o aviso do que se perde ao fechar. */
  const [avisoEsc, setAvisoEsc] = useState<string | null>(null);

  const dialogoRef = useRef<HTMLDivElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const campoCupomRef = useRef<HTMLInputElement>(null);
  // Quem abriu o modal recebe o foco de volta ao fechar. Lido no primeiro
  // render: nos efeitos, o foco já pode estar dentro do diálogo.
  const [abridor] = useState(() => (typeof document !== "undefined" ? document.activeElement : null));

  // Timers presos a ESTE modal: se a pessoa fechar e reabrir antes dos 3 s do
  // "fechar depois do sucesso", o timer antigo não fecha o modal novo. Pelo
  // mesmo motivo nada é agendado depois de fechar — uma resposta que chega
  // atrasada (PIX aprovado, cartão aprovado) não fecha o modal seguinte.
  const timersRef = useRef<number[]>([]);
  const montadoRef = useRef(true);
  const agendar = useCallback((fn: () => void, ms: number) => {
    if (!montadoRef.current) return;
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  /**
   * Pagamento confirmado (por qualquer caminho). Fecha sozinho em 3 s — menos
   * quando os dias vieram proporcionais: aí a explicação precisa ser lida, e
   * quem fecha é a pessoa. O ref impede que dois caminhos confirmando o mesmo
   * pagamento (resposta direta e espera pelo status) registrem duas vezes.
   */
  const sucessoRef = useRef(false);
  const registrarSucesso = useCallback(
    (liberacao: Liberacao) => {
      if (sucessoRef.current) return;
      sucessoRef.current = true;
      if (liberacao.parcial) setLiberacaoParcial(true);
      else agendar(closeSubscriptionModal, 3000);
    },
    [agendar, closeSubscriptionModal]
  );

  // PIX gerado e não confirmado ao fechar: ele ainda pode ser pago (ou já foi,
  // e o banco não confirmou). O contexto segue consultando o status depois que
  // o modal some, e a faixa do topo se atualiza sozinha.
  const pixPendenteRef = useRef(false);
  useEffect(() => {
    // Pago no cartão (ou já confirmado) com um PIX gerado antes: não há o que
    // esperar — sem isto a faixa "Aguardando a confirmação" ficava 15 minutos.
    pixPendenteRef.current = pixData !== null && !pixApproved && !cartaoConcluido && !sucessoRef.current;
  });
  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      if (pixPendenteRef.current) void aguardarConfirmacaoPagamento();
      if (abridor instanceof HTMLElement && abridor.isConnected) abridor.focus();
    };
  }, [aguardarConfirmacaoPagamento, abridor]);

  /** Troca o preço da tela. Um PIX gerado com o valor antigo sai junto. */
  const trocarPreco = useCallback((novo: PrecoTela) => {
    setPreco(novo);
    setPrecoErro(null);
    setPixData((atual) => (atual && Math.abs(atual.amount - novo.valor) >= 0.005 ? null : atual));
  }, []);

  const receberPreco = useCallback(
    (r: ResultadoPreco) => {
      if ("preco" in r) {
        trocarPreco(r.preco);
      } else {
        setPrecoErro(r.erro);
      }
      setPrecoCarregando(false);
    },
    [trocarPreco]
  );

  function recarregarPreco() {
    // O valor antigo sai da tela já: se a recarga falhar depois de tirar o
    // cupom, o quadro e o botão continuavam mostrando o preço COM o desconto
    // que acabou de cair — e o pagamento seria recusado de novo.
    setPreco(null);
    setPrecoCarregando(true);
    setPrecoErro(null);
    void obterPreco().then(receberPreco);
  }

  /** Só o preço que vale agora: com erro na última carga, nenhum. */
  const precoAtual = precoErro ? null : preco;

  // VIP não paga: nada a buscar.
  useEffect(() => {
    if (isVip) return;
    let ativo = true;
    void obterPreco().then((r) => {
      if (ativo) receberPreco(r);
    });
    return () => {
      ativo = false;
    };
  }, [receberPreco, isVip]);

  // Polling: o PIX foi pago?
  useEffect(() => {
    if (!pixData || pixApproved) return;

    const inicio = Date.now();
    const venceEm = pixData.expires_at ? new Date(pixData.expires_at).getTime() : NaN;
    let ativo = true;
    let timer: number | undefined;

    async function conferir() {
      if (!ativo || !pixData) return;
      const agora = Date.now();
      if (Number.isFinite(venceEm) && agora > venceEm) {
        setPixExpirado(true);
        if (agora > venceEm + PIX_TOLERANCIA_APOS_VENCER_MS) return;
      }

      try {
        const res = await fetch(`/api/subscription/pix/check?payment_id=${pixData.payment_id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.approved && ativo) {
            // dias/observacao: o que o banco concedeu de fato (menos de 30
            // quando o desconto não coube na aprovação).
            const liberacao = resumoLiberacao(data.dias, data.observacao);
            setPixConfirmacao({ titulo: "Pagamento confirmado via Pix!", liberacao });
            // Pago com a aba do cartão aberta: as abas somem e o formulário
            // ficaria à mostra, convidando a pagar de novo.
            setActiveTab("pix");
            registrarSucesso(liberacao);
            await refreshSubscription();
            return;
          }
        }
      } catch (err) {
        console.error("Erro no polling de status do Pix:", err);
      }

      if (!ativo) return;
      const intervalo =
        Date.now() - inicio < PIX_FASE_INICIAL_MS ? PIX_INTERVALO_INICIAL_MS : PIX_INTERVALO_DEPOIS_MS;
      timer = window.setTimeout(conferir, intervalo);
    }

    timer = window.setTimeout(conferir, PIX_INTERVALO_INICIAL_MS);
    return () => {
      ativo = false;
      window.clearTimeout(timer);
    };
  }, [pixData, pixApproved, refreshSubscription, registrarSucesso]);

  // QR vencido: a consulta acima para 5 min depois, mas o pagamento feito no
  // limite ainda pode ser confirmado pelo webhook. A espera do contexto cobre
  // isso — e é ela que torna verdade o "o acesso é liberado assim que o banco
  // confirmar" da tela de QR vencido.
  useEffect(() => {
    if (!pixExpirado || !pixData || pixApproved) return;
    void aguardarConfirmacaoPagamento().then((confirmado) => {
      if (!confirmado || !montadoRef.current || sucessoRef.current) return;
      // Soube pelo status, não pela consulta do PIX: sem o número de dias.
      const liberacao = resumoLiberacao(undefined, null);
      setPixConfirmacao({ titulo: "Pagamento confirmado!", liberacao });
      setActiveTab("pix");
      registrarSucesso(liberacao);
    });
  }, [pixExpirado, pixData, pixApproved, aguardarConfirmacaoPagamento, registrarSucesso]);

  // Foco dentro do diálogo ao abrir e a cada troca de etapa (o botão que
  // levou à etapa nova some, e o foco cairia no fundo da página). Aberto pelo
  // botão "Cupom", vai direto para o campo do código.
  useEffect(() => {
    const dialogo = dialogoRef.current;
    if (!dialogo || dialogo.contains(document.activeElement)) return;
    const campo = modalComCupom && step === "overview" ? campoCupomRef.current : null;
    (campo ?? tituloRef.current)?.focus();
  }, [step, modalComCupom]);

  /** O cupom digitado deixou de valer no momento de pagar. */
  function descartarCupom(mensagem: string) {
    setCupomDigitado(null);
    setCouponMessage(null);
    setAvisoPreco(`${mensagem} ${MENSAGEM_CUPOM_REMOVIDO}`);
    recarregarPreco();
  }

  async function handleGeneratePix() {
    if (!precoAtual) return;
    setPixLoading(true);
    setPixMensagem(null);
    setAvisoPreco(null);
    setPixData(null);
    setPixConfirmacao(null);
    setPixExpirado(false);

    const enviouCupom = Boolean(cupomDigitado);

    try {
      const res = await fetch("/api/subscription/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coupon_code: cupomDigitado, valor_esperado: precoAtual.valor }),
      });
      const data = await res.json().catch(() => ({}));
      const erro = typeof data.error === "string" ? data.error : null;

      if (res.ok && data.is_vip) {
        setPixMensagem({ tipo: "sucesso", texto: data.message || "Sua conta tem acesso VIP permanente." });
        await refreshSubscription();
        agendar(closeSubscriptionModal, 2500);
        return;
      }

      // O valor mudou entre abrir a tela e gerar o PIX. Nada foi cobrado.
      if (res.status === 409) {
        const novo = lerPreco(data.preco);
        if (novo) {
          trocarPreco(novo);
          setAvisoPreco(erro || "O valor mudou. Confira o novo valor e gere o PIX de novo.");
          return;
        }
      }

      if (ehErroDeCupom(res.status, erro, enviouCupom)) {
        descartarCupom(erro as string);
        return;
      }

      if (!res.ok || (!data.qr_code && !data.qr_code_base64)) {
        setPixMensagem({
          tipo: "erro",
          texto: erro || "Não foi possível gerar o PIX agora. Tente de novo em instantes.",
        });
        return;
      }

      setPixData({
        payment_id: data.payment_id,
        qr_code: data.qr_code,
        qr_code_base64: data.qr_code_base64,
        // O QR mostra o que o SERVIDOR cobrou, não o que a tela calculava.
        amount: typeof data.amount === "number" ? data.amount : precoAtual.valor,
        expires_at: data.date_of_expiration,
      });
    } catch (err) {
      console.error("Erro ao gerar Pix:", err);
      setPixMensagem({ tipo: "erro", texto: "Sem conexão para gerar o PIX. Confira sua internet e tente de novo." });
    } finally {
      setPixLoading(false);
    }
  }

  function handleCopyPix() {
    if (!pixData?.qr_code) return;
    navigator.clipboard
      .writeText(pixData.qr_code)
      .then(() => {
        setCopiedPix(true);
        agendar(() => setCopiedPix(false), 3000);
      })
      .catch(() => {
        // Sem permissão de área de transferência: o campo já vem selecionável.
      });
  }

  async function handleApplyCoupon(e: React.FormEvent) {
    e.preventDefault();
    const codigo = couponInput.trim();
    if (!codigo) return;

    setCouponLoading(true);
    setCouponMessage(null);

    try {
      const res = await fetch("/api/coupons/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codigo }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setCouponMessage({ tipo: "erro", texto: data.error || "Não foi possível aplicar o cupom." });
        return;
      }

      // VIP: acesso liberado na hora, não há o que pagar.
      if (data.is_vip) {
        setCouponInput("");
        setCouponMessage({ tipo: "sucesso", texto: data.message || "Acesso VIP liberado!" });
        await refreshSubscription();
        agendar(closeSubscriptionModal, 2500);
        return;
      }

      // Dias de teste: o modal fica aberto mostrando o novo prazo — a pessoa
      // ainda pode querer assinar.
      if (typeof data.trial_days === "number") {
        const ate = dataCurta(data.trial_ends_at);
        setCouponInput("");
        setCouponMessage({
          tipo: "sucesso",
          texto: `${data.message || "Cupom aplicado!"}${ate ? ` Seu acesso de teste vai até ${ate}.` : ""}`,
        });
        await refreshSubscription();
        return;
      }

      const novo = lerPreco(data.preco);
      if (!novo) {
        setCouponMessage({ tipo: "erro", texto: "Não foi possível aplicar o cupom agora. Tente de novo." });
        return;
      }

      trocarPreco(novo);
      setAvisoPreco(null);
      setCouponInput("");
      // coupon_code vem só para cupom NOVO. Null = o código é o que a pessoa
      // já usa, ou ela já tem um desconto melhor: o preço devolvido não conta
      // com nenhum código digitado, então o anterior também sai.
      const aplicado = typeof data.coupon_code === "string" && data.coupon_code ? data.coupon_code : null;
      setCupomDigitado(aplicado);
      // Aplicado: o quadro de preço já mostra selo e frase — repetir a
      // mensagem logo abaixo seria ruído. Nos outros casos a mensagem explica
      // por que o preço não mudou.
      setCouponMessage(aplicado ? null : { tipo: "info", texto: data.message || "Este cupom não reduz o seu preço atual." });
    } catch {
      setCouponMessage({ tipo: "erro", texto: "Sem conexão para aplicar o cupom. Tente de novo." });
    } finally {
      setCouponLoading(false);
    }
  }

  function removerCupom() {
    setCupomDigitado(null);
    setCouponMessage(null);
    setAvisoPreco(null);
    recarregarPreco();
  }

  // precoErro também trava: pagar exige o valor que o servidor acabou de calcular.
  const podePagar = Boolean(precoAtual) && !precoCarregando;
  const pagamentoConcluido = pixApproved || cartaoConcluido;
  const desconto = precoAtual?.desconto ?? null;

  // Conta VIP (e a de administrador, que o status devolve como VIP) nunca vê
  // a etapa de pagamento, mesmo que o status chegue com ela já aberta.
  const etapa = isVip ? "overview" : step;

  // QR Code na tela (ou sendo gerado) ou formulário do cartão aberto: fechar
  // some com o QR ou com o que foi digitado.
  const pixEmAndamento = pixLoading || (pixData !== null && !pixExpirado);
  const cartaoNaTela = activeTab === "cartao" && precoAtual !== null && !precoCarregando;
  const pagamentoEmAndamento =
    etapa === "payment" && !pagamentoConcluido && (pixEmAndamento || cartaoNaTela);
  const perdaAoFechar = pixEmAndamento
    ? "O QR Code some da tela, mas, se você já pagou, o acesso é liberado sozinho quando o banco confirmar."
    : "O que você digitou no cartão se perde; se o pagamento já foi enviado, o acesso é liberado sozinho quando for aprovado.";

  // Teclado do diálogo, no padrão do TermoResponsabilidade (laudo-form-modal):
  // Tab circula só dentro dele; Esc fecha.
  //
  // Esc no meio de um pagamento não fecha de primeira: é a tecla que mais se
  // aperta sem querer (fechar um autocompletar, sair do campo), e fechar ali
  // some com o QR Code ou com os dados do cartão sem aviso. O primeiro Esc diz
  // o que se perde; um segundo, em até 5 s, fecha. O X continua fechando
  // direto: clicar nele é escolha. Com o foco dentro dos campos do cartão
  // (iframes do Mercado Pago), a tecla nem chega aqui.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (e.defaultPrevented) return;
        e.preventDefault();
        if (pagamentoEmAndamento && !avisoEsc) {
          setAvisoEsc(`Pressione Esc de novo para fechar. ${perdaAoFechar}`);
          agendar(() => setAvisoEsc(null), ESC_CONFIRMA_MS);
          return;
        }
        closeSubscriptionModal();
        return;
      }

      const dialogo = dialogoRef.current;
      if (e.key !== "Tab" || !dialogo) return;
      const focaveis = elementosFocaveis(dialogo);
      if (focaveis.length === 0) {
        e.preventDefault();
        return;
      }
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const ativo = document.activeElement;
      if (!ativo || !dialogo.contains(ativo)) {
        e.preventDefault();
        primeiro.focus();
      } else if (e.shiftKey && ativo === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && ativo === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [pagamentoEmAndamento, avisoEsc, perdaAoFechar, agendar, closeSubscriptionModal]);

  let chip: React.ReactNode;
  let titulo: string;
  let subtitulo: string;
  if (isVip) {
    chip = (
      <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-[11px] font-bold">
        <Sparkles size={12} />
        <span>Acesso VIP</span>
      </div>
    );
    titulo = "Você já tem acesso completo";
    subtitulo = "Sua conta tem acesso VIP permanente: não há nada a pagar.";
  } else if (renovando) {
    const ate = dataCurta(currentPeriodEnd);
    chip = (
      <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-success/15 text-success text-[11px] font-bold border border-success/25">
        <CalendarCheck size={12} />
        <span>{ate ? `Acesso ativo até ${ate}` : "Acesso ativo"}</span>
      </div>
    );
    titulo = "Renove seu acesso";
    // Sem "soma 30 dias": se o desconto do cupom não couber na aprovação, o
    // banco libera dias proporcionais, e a tela de sucesso diz quantos.
    subtitulo =
      "O novo período começa quando o atual termina — você não perde nenhum dia. Não há débito automático.";
  } else if (isReadOnly) {
    chip = (
      <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-bold border border-amber-200">
        <AlertTriangle size={12} className="text-amber-700" />
        <span>Modo Somente Leitura Ativo</span>
      </div>
    );
    titulo = "Reative seu acesso total";
    subtitulo =
      "Seus registros antigos continuam 100% seguros e guardados (CFP). Assine para cadastrar novos pacientes e documentos.";
  } else if (isTrialing) {
    chip = (
      <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-success/15 text-success text-[11px] font-bold border border-success/25">
        <Sparkles size={12} />
        <span>
          Período de Teste: {trialDaysLeft} {trialDaysLeft === 1 ? "dia restante" : "dias restantes"}
        </span>
      </div>
    );
    titulo = "Desbloqueie o PsiSetting Ilimitado";
    subtitulo =
      "Organize seus atendimentos com segurança, criptografia clínica e sem fidelidade. Assinando agora, os dias de teste que faltam não se perdem: o período pago começa depois deles.";
  } else {
    chip = (
      <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-[11px] font-bold">
        <Sparkles size={12} />
        <span>Plano Profissional Completo</span>
      </div>
    );
    titulo = "Desbloqueie o PsiSetting Ilimitado";
    subtitulo = "Organize seus atendimentos com segurança, criptografia clínica e sem fidelidade contratual.";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        ref={dialogoRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-assinatura"
        className="relative w-full max-w-md sm:max-w-lg rounded-2xl sm:rounded-3xl bg-surface border border-border/80 shadow-2xl p-5 sm:p-6 overflow-y-auto max-h-[95vh] flex flex-col justify-between"
      >
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
            ETAPA 1: BENEFÍCIOS, PREÇO REAL E CUPOM
        ═══════════════════════════════════════════════════════════════ */}
        {etapa === "overview" && (
          <div className="space-y-3.5 animate-in fade-in">
            {/* Cabeçalho Enxuto */}
            <div className="pr-8">
              {chip}
              <h2
                ref={tituloRef}
                id="titulo-assinatura"
                tabIndex={-1}
                className="text-xl sm:text-2xl font-serif font-bold text-text mt-2 focus:outline-hidden"
              >
                {titulo}
              </h2>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">{subtitulo}</p>
            </div>

            {/* Benefícios em 2 Colunas */}
            <div className="grid grid-cols-2 gap-2 py-0.5">
              {BENEFICIOS.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
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

            {isVip ? (
              couponMessage && <MensagemInline mensagem={couponMessage} />
            ) : (
              <>
                <QuadroPreco
                  preco={precoAtual}
                  carregando={precoCarregando}
                  erro={precoErro}
                  onTentarDeNovo={recarregarPreco}
                />

                {/* Cupom: logo abaixo do preço, para a pessoa ver o efeito na hora */}
                <div className="space-y-2">
                  {cupomDigitado ? (
                    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-success/10 border border-success/25 text-xs">
                      <span className="flex items-center gap-1.5 text-text font-medium min-w-0">
                        <Check size={13} className="text-success shrink-0" />
                        <span className="truncate">Cupom {cupomDigitado} aplicado</span>
                      </span>
                      <button
                        type="button"
                        onClick={removerCupom}
                        className="text-[11px] font-semibold text-danger hover:underline cursor-pointer shrink-0"
                      >
                        Remover
                      </button>
                    </div>
                  ) : cupomAberto ? (
                    <form onSubmit={handleApplyCoupon} className="flex gap-2">
                      <input
                        ref={campoCupomRef}
                        type="text"
                        placeholder="Código do cupom"
                        aria-label="Código do cupom"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        autoComplete="off"
                        className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-background border border-border/80 text-xs text-text placeholder:text-text-muted placeholder:normal-case placeholder:tracking-normal uppercase font-mono tracking-wider focus:outline-hidden focus:border-primary"
                      />
                      <button
                        type="submit"
                        // Com o preço ainda carregando, a resposta do cupom e
                        // a da carga podiam chegar fora de ordem e deixar o
                        // quadro sem o desconto que acabou de ser aplicado.
                        disabled={couponLoading || precoCarregando || !couponInput.trim()}
                        className="px-3.5 py-2 rounded-xl bg-surface border border-primary/40 text-primary text-xs font-bold hover:bg-primary/10 transition-all cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {couponLoading ? <Loader2 size={13} className="animate-spin" /> : "Aplicar"}
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCupomAberto(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline cursor-pointer"
                    >
                      <Tag size={12} />
                      <span>Tem um cupom?</span>
                    </button>
                  )}

                  {couponMessage && <MensagemInline mensagem={couponMessage} />}
                </div>

                {/* Botão de Avanço */}
                <button
                  type="button"
                  onClick={() => setStep("payment")}
                  disabled={!podePagar}
                  className="w-full py-3 px-4 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-all flex items-center justify-center gap-2 text-xs sm:text-sm shadow-md hover:shadow-lg cursor-pointer group disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {precoAtual && !precoCarregando ? (
                    <>
                      <span>
                        {renovando ? "Renovar acesso" : "Assinar Plano Ilimitado"} ({resumirValor(precoAtual)})
                      </span>
                      <ArrowRight size={15} className="shrink-0 group-hover:translate-x-1 transition-transform" />
                    </>
                  ) : (
                    <span>{renovando ? "Renovar acesso" : "Assinar Plano Ilimitado"}</span>
                  )}
                </button>
              </>
            )}

            {/* Rodapé Compacto */}
            <div className="pt-2 border-t border-border/60">
              <MercadoPagoBadge variant="compact" className="w-full justify-center text-[10px]" />
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            ETAPA 2: FORMAS DE PAGAMENTO EMBUTIDAS (PIX / CARTÃO)
        ═══════════════════════════════════════════════════════════════ */}
        {etapa === "payment" && (
          <div className="space-y-3 animate-in fade-in">
            {!pagamentoConcluido && (
              <button
                type="button"
                onClick={() => setStep("overview")}
                className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text cursor-pointer transition-colors"
              >
                <ArrowLeft size={13} />
                <span>Voltar aos benefícios</span>
              </button>
            )}

            <div className="pr-8">
              <h2
                ref={tituloRef}
                id="titulo-assinatura"
                tabIndex={-1}
                className="text-lg sm:text-xl font-serif font-bold text-text focus:outline-hidden"
              >
                Escolha a forma de pagamento
              </h2>
              {precoAtual && (
                <p className="text-xs text-text-muted">
                  30 dias de acesso ·{" "}
                  {desconto && <span className="line-through">R$ {formatarReais(precoAtual.base)}</span>}{" "}
                  <strong className="text-text">R$ {formatarReais(precoAtual.valor)}</strong>
                </p>
              )}
              {desconto && (
                <p className="mt-1 text-[11px] text-text leading-snug flex items-start gap-1">
                  <Tag size={11} className="text-primary shrink-0 mt-0.5" />
                  <span>
                    Cupom {desconto.codigo} · {desconto.descricao} — {desconto.frase}.
                  </span>
                </p>
              )}
            </div>

            {avisoEsc && (
              <div
                role="alert"
                className="p-2.5 rounded-xl bg-secondary/15 border border-secondary/40 text-[11px] text-text flex items-start gap-2"
              >
                <Info size={13} className="text-primary shrink-0 mt-0.5" />
                <span>{avisoEsc}</span>
              </div>
            )}

            {avisoPreco && (
              <div
                role="alert"
                className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2"
              >
                <AlertTriangle size={13} className="text-amber-700 shrink-0 mt-0.5" />
                <span>{avisoPreco}</span>
              </div>
            )}

            {/* SELETOR DE ABAS (PIX / CARTÃO) */}
            {!pagamentoConcluido && (
              <div className="flex rounded-xl bg-background p-1 border border-border/80 gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("pix")}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === "pix" ? "bg-primary text-white shadow-xs" : "text-text-muted hover:text-text"
                  }`}
                >
                  <QrCode size={13} />
                  <span>Pix</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("cartao")}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === "cartao" ? "bg-primary text-white shadow-xs" : "text-text-muted hover:text-text"
                  }`}
                >
                  <CreditCard size={13} />
                  <span>Cartão</span>
                </button>
              </div>
            )}

            {precoCarregando ? (
              <div role="status" className="flex items-center justify-center gap-1.5 py-6 text-xs text-text-muted">
                <Loader2 size={13} className="animate-spin text-primary" />
                <span>Atualizando o valor…</span>
              </div>
            ) : !precoAtual ? (
              // A recarga falhou (depois de o cupom cair, por exemplo): sem
              // valor confirmado não há QR nem cartão — nunca o valor antigo.
              <div role="alert" className="py-5 text-center text-xs text-text-muted space-y-1">
                <p>{precoErro || "Não foi possível carregar o valor."}</p>
                <button
                  type="button"
                  onClick={recarregarPreco}
                  className="font-bold text-primary hover:underline cursor-pointer"
                >
                  Tentar de novo
                </button>
              </div>
            ) : activeTab === "pix" ? (
              /* ───────── ABA 1: PIX ───────── */
              <div className="space-y-2.5">
                <AvisoAvulso icone={QrCode} titulo="Pagamento avulso · 30 dias de acesso">
                  Não há débito automático: no mês seguinte você renova por aqui, e avisamos antes de vencer.
                </AvisoAvulso>

                {pixConfirmacao ? (
                  <div
                    role="status"
                    className="p-5 rounded-2xl bg-success/10 border border-success/30 text-center space-y-2 animate-in zoom-in-95"
                  >
                    <div className="w-10 h-10 rounded-full bg-success text-white flex items-center justify-center mx-auto shadow-sm">
                      <CheckCircle2 size={24} />
                    </div>
                    <h3 className="text-sm font-bold text-text">{pixConfirmacao.titulo}</h3>
                    <p className="text-xs text-text-muted leading-relaxed">{pixConfirmacao.liberacao.texto}</p>
                  </div>
                ) : pixData && pixExpirado ? (
                  <div className="space-y-3 text-center py-1">
                    <p className="text-xs text-text-muted leading-relaxed">
                      Este QR Code expirou. Se você já pagou, o acesso é liberado assim que o banco confirmar;
                      se ainda não, gere um novo.
                    </p>
                    <BotaoGerarPix
                      carregando={pixLoading}
                      rotulo={`Gerar novo QR Code (R$ ${formatarReais(precoAtual.valor)})`}
                      icone={RefreshCw}
                      onClick={handleGeneratePix}
                    />
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
                        <div className="w-36 h-36 flex items-center justify-center bg-background rounded-md">
                          <QrCode size={36} className="text-text-muted" />
                        </div>
                      )}
                      <p className="text-sm font-bold text-text mt-1.5">R$ {formatarReais(pixData.amount)}</p>
                      <p className="text-[10px] font-semibold text-text-muted">Escaneie no app do seu banco</p>
                    </div>

                    {/* Copia e Cola */}
                    <div className="space-y-1">
                      <label
                        htmlFor="pix-copia-e-cola"
                        className="text-[10px] font-bold text-text-muted uppercase tracking-wider"
                      >
                        Chave Pix Copia e Cola:
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          id="pix-copia-e-cola"
                          type="text"
                          readOnly
                          value={pixData.qr_code}
                          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-background border border-border/80 text-[10px] text-text font-mono truncate select-all"
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

                    {/* O horário é o que o Mercado Pago devolveu (~32 min, com folga
                        para o relógio de lá): "30 minutos" de cor não batia. */}
                    <p className="text-[10px] text-text-muted text-center">
                      {horaCurta(pixData.expires_at)
                        ? `O QR Code vale até ${horaCurta(pixData.expires_at)}.`
                        : "O QR Code vale por cerca de 30 minutos."}
                    </p>

                    {/* Status de Aguardo em Tempo Real */}
                    <div role="status" className="flex items-center justify-center gap-1.5 text-[11px] text-text-muted py-0.5">
                      <Loader2 size={12} className="animate-spin text-primary" />
                      <span>Aguardando confirmação bancária...</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 text-center py-1">
                    <p className="text-xs text-text-muted leading-relaxed">
                      Gere o <strong className="text-text">QR Code Pix de R$ {formatarReais(precoAtual.valor)}</strong>. O
                      acesso é liberado assim que o banco confirmar. O QR Code vale por cerca de 30 minutos.
                    </p>

                    <BotaoGerarPix
                      carregando={pixLoading}
                      rotulo={`Gerar QR Code Pix (R$ ${formatarReais(precoAtual.valor)})`}
                      icone={QrCode}
                      onClick={handleGeneratePix}
                    />
                  </div>
                )}

                {pixMensagem && <MensagemInline mensagem={pixMensagem} />}
              </div>
            ) : (
              /* ───────── ABA 2: CARTÃO DE CRÉDITO (EMBUTIDO) ───────── */
              <div className="space-y-2 py-0.5">
                {/* A cobrança automática no cartão ainda não existe: prometer
                    "assinatura recorrente" aqui fazia a pessoa achar que
                    estava tudo certo e ser bloqueada 30 dias depois. */}
                <AvisoAvulso icone={CreditCard} titulo="Pagamento único no cartão · 30 dias de acesso">
                  Não há débito automático: no mês seguinte você renova por aqui (avisamos antes de vencer).
                </AvisoAvulso>

                <MercadoPagoBrick
                  // O Brick não troca de valor depois de criado: valor ou
                  // cupom novos exigem um Brick novo.
                  key={`${precoAtual.valor}|${cupomDigitado ?? ""}`}
                  valorEsperado={precoAtual.valor}
                  couponCode={cupomDigitado}
                  onSuccess={async (dias) => {
                    setCartaoConcluido(true);
                    registrarSucesso(resumoLiberacao(dias.dias, dias.observacao));
                    await refreshSubscription();
                  }}
                  // Em análise, o próprio Brick espera a aprovação (pelo
                  // contexto) e vira "aprovado" sozinho se ela chegar.
                  onEmAnalise={() => setCartaoConcluido(true)}
                  onPrecoMudou={(novo, mensagem) => {
                    trocarPreco(novo);
                    setAvisoPreco(mensagem);
                  }}
                  onCupomRecusado={descartarCupom}
                />
              </div>
            )}

            {/* Dias proporcionais: o modal não fecha sozinho antes de a
                pessoa ler o porquê. */}
            {liberacaoParcial && (
              <button
                type="button"
                onClick={closeSubscriptionModal}
                className="w-full py-2.5 px-4 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-all text-xs sm:text-sm cursor-pointer"
              >
                Entendi
              </button>
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

/** Quadro "Assinatura Única" da etapa 1, com o preço que o servidor calculou. */
function QuadroPreco({
  preco,
  carregando,
  erro,
  onTentarDeNovo,
}: {
  preco: PrecoTela | null;
  carregando: boolean;
  erro: string | null;
  onTentarDeNovo: () => void;
}) {
  const d = preco?.desconto ?? null;
  const [reais, centavos] = preco ? formatarReais(preco.valor).split(",") : ["", ""];
  const sufixo = preco ? sufixoDoValor(preco) : "";

  return (
    <div className="p-3.5 rounded-2xl bg-primary/10 border border-primary/20 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Assinatura Única · 30 dias
          </span>

          {carregando ? (
            <div role="status" className="flex items-center gap-1.5 mt-1.5 h-8 text-xs text-text-muted">
              <Loader2 size={13} className="animate-spin text-primary" />
              <span>Calculando seu valor…</span>
            </div>
          ) : !preco || erro ? (
            <div className="mt-1 text-xs text-text-muted space-y-0.5">
              <p>{erro || "Não foi possível carregar o valor agora."}</p>
              <button
                type="button"
                onClick={onTentarDeNovo}
                className="font-bold text-primary hover:underline cursor-pointer"
              >
                Tentar de novo
              </button>
            </div>
          ) : (
            <div className="flex items-baseline gap-1 mt-0.5 flex-wrap">
              {d && (
                <span className="text-xs text-text-muted line-through mr-1">R$ {formatarReais(preco.base)}</span>
              )}
              <span className="text-xs font-bold text-text">R$</span>
              <span className="text-2xl font-serif font-black text-text">{reais}</span>
              <span className="text-xs font-serif font-bold text-text">,{centavos}</span>
              {sufixo && <span className="text-[11px] text-text-muted">{sufixo}</span>}
            </div>
          )}
        </div>

        <div className="text-right text-[11px] text-text-muted space-y-0.5 shrink-0">
          <p className="flex items-center gap-1 font-medium text-text justify-end">
            <ShieldCheck size={13} className="text-primary" />
            <span>Sem fidelidade</span>
          </p>
          <p>Sem débito automático</p>
        </div>
      </div>

      {d && preco && !carregando && !erro && (
        <div className="pt-2 border-t border-primary/15 space-y-1">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/25 border border-secondary/40 text-text text-[10px] font-bold">
            <Tag size={10} className="text-primary" />
            Cupom {d.codigo} · {d.descricao}
          </span>
          <p className="text-[11px] text-text leading-snug">
            {d.origem === "cupom_em_uso" ? `Seu cupom ${d.codigo} continua valendo: ${d.frase}.` : `${d.frase}.`}
          </p>
        </div>
      )}
    </div>
  );
}

function AvisoAvulso({
  icone: Icone,
  titulo,
  children,
}: {
  icone: typeof QrCode;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 flex items-start gap-2 text-xs">
      <Icone size={14} className="text-primary shrink-0 mt-0.5" />
      <div>
        <p className="font-bold text-text text-[11px]">{titulo}</p>
        <p className="text-[10px] text-text-muted leading-tight">{children}</p>
      </div>
    </div>
  );
}

function BotaoGerarPix({
  carregando,
  rotulo,
  icone: Icone,
  onClick,
}: {
  carregando: boolean;
  rotulo: string;
  icone: typeof QrCode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={carregando}
      className="w-full py-3 px-4 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-all flex items-center justify-center gap-2 text-xs sm:text-sm shadow-md hover:shadow-lg cursor-pointer disabled:opacity-60"
    >
      {carregando ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          <span>Gerando chave Pix instantânea...</span>
        </>
      ) : (
        <>
          <Icone size={15} />
          <span>{rotulo}</span>
        </>
      )}
    </button>
  );
}

function MensagemInline({ mensagem }: { mensagem: Mensagem }) {
  const estilos = {
    sucesso: "bg-success/10 border-success/25 text-text",
    info: "bg-secondary/15 border-secondary/40 text-text",
    erro: "bg-danger/10 border-danger/25 text-text",
  } as const;
  const Icone = mensagem.tipo === "sucesso" ? CheckCircle2 : mensagem.tipo === "info" ? Info : AlertTriangle;
  const corIcone =
    mensagem.tipo === "sucesso" ? "text-success" : mensagem.tipo === "info" ? "text-primary" : "text-danger";

  return (
    <p
      role={mensagem.tipo === "erro" ? "alert" : "status"}
      className={`flex items-start gap-1.5 p-2.5 rounded-xl border text-xs leading-relaxed ${estilos[mensagem.tipo]}`}
    >
      <Icone size={13} className={`${corIcone} shrink-0 mt-0.5`} />
      <span>{mensagem.texto}</span>
    </p>
  );
}
