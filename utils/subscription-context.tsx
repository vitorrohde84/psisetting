"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { acessoAvancou, lerStatusAssinatura, type StatusAssinatura } from "@/utils/assinatura-tela";

interface SubscriptionState extends StatusAssinatura {
  loading: boolean;
  isModalOpen: boolean;
  /** O modal foi aberto por um botão "Cupom": abre com o campo de cupom à mostra. */
  modalComCupom: boolean;
  /** Há um pagamento que pode ser confirmado a qualquer momento (ver aguardarConfirmacaoPagamento). */
  aguardandoPagamento: boolean;
  openSubscriptionModal: () => void;
  openSubscriptionModalComCupom: () => void;
  closeSubscriptionModal: () => void;
  refreshSubscription: () => Promise<void>;
  /**
   * Consulta o status a cada 20 s, por até 15 min, até o pagamento virar
   * acesso. Resolve true quando virou; false quando o prazo acabou. Chamar de
   * novo durante a espera devolve a mesma promessa e renova o prazo.
   */
  aguardarConfirmacaoPagamento: () => Promise<boolean>;
}

// Antes da primeira resposta do servidor, ninguém é tratado como bloqueado:
// quem decide o acesso é o servidor, a cada gravação.
const statusInicial: StatusAssinatura & { loading: boolean } = {
  isVip: false,
  status: "trialing",
  situacao: "teste",
  isTrialing: true,
  trialDaysLeft: 7,
  trialEndsAt: null,
  isReadOnly: false,
  hasActiveSubscription: false,
  diasParaVencer: null,
  currentPeriodEnd: null,
  emCarencia: false,
  renovacao: null,
  loading: true,
};

const defaultState: SubscriptionState = {
  ...statusInicial,
  isModalOpen: false,
  modalComCupom: false,
  aguardandoPagamento: false,
  openSubscriptionModal: () => {},
  openSubscriptionModalComCupom: () => {},
  closeSubscriptionModal: () => {},
  refreshSubscription: async () => {},
  aguardarConfirmacaoPagamento: async () => false,
};

const SubscriptionContext = createContext<SubscriptionState>(defaultState);

const CACHE_MS = 60_000;
// Voltar para a aba consulta o servidor, mas não a cada alt-tab.
const FOCO_INTERVALO_MIN_MS = 30_000;
// Espera de pagamento: cartão em análise e PIX costumam confirmar em poucos
// minutos. 15 min a cada 20 s são ~45 consultas no pior caso.
const ESPERA_INTERVALO_MS = 20_000;
const ESPERA_DURACAO_MS = 15 * 60_000;

interface Espera {
  /** O status de quando a espera começou; null enquanto a primeira carga não chegou. */
  antes: StatusAssinatura | null;
  ate: number;
  timer: number | undefined;
  promessa: Promise<boolean>;
  resolver: (confirmado: boolean) => void;
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StatusAssinatura & { loading: boolean }>(statusInicial);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalComCupom, setModalComCupom] = useState(false);
  const [aguardandoPagamento, setAguardandoPagamento] = useState(false);

  // Lidos dentro de timers e ouvintes, que não podem depender de cada render.
  const estadoRef = useRef(state);
  useEffect(() => {
    estadoRef.current = state;
  });
  const ultimaConsultaRef = useRef(0);
  const esperaRef = useRef<Espera | null>(null);

  const encerrarEspera = useCallback((confirmado: boolean) => {
    const espera = esperaRef.current;
    if (!espera) return;
    esperaRef.current = null;
    window.clearTimeout(espera.timer);
    setAguardandoPagamento(false);
    espera.resolver(confirmado);
  }, []);

  const fetchStatus = useCallback(
    async (force = false) => {
      try {
        // O cache guarda a resposta crua do servidor, e a leitura passa por
        // lerStatusAssinatura: `renovacao` e `emCarencia` vêm junto, e um
        // cache de antes deles vira "sem renovação automática".
        if (!force && typeof window !== "undefined") {
          const cached = sessionStorage.getItem("cached_sub_status");
          const cachedAt = sessionStorage.getItem("cached_sub_status_at");
          if (cached && cachedAt && Date.now() - Number(cachedAt) < CACHE_MS) {
            setState({ ...lerStatusAssinatura(JSON.parse(cached)), loading: false });
            return;
          }
        }

        // Marcado ANTES da resposta: "focus" e "visibilitychange" chegam juntos
        // na volta à aba, e o segundo não pode disparar outra consulta.
        ultimaConsultaRef.current = Date.now();
        const res = await fetch("/api/subscription/status");
        if (!res.ok) {
          // Se der erro ou não estiver logado, não quebra a tela
          setState((prev) => ({ ...prev, loading: false }));
          return;
        }
        const data = await res.json();
        if (typeof window !== "undefined") {
          sessionStorage.setItem("cached_sub_status", JSON.stringify(data));
          sessionStorage.setItem("cached_sub_status_at", Date.now().toString());
        }

        const novo = lerStatusAssinatura(data);
        setState({ ...novo, loading: false });

        // Qualquer consulta fresca (a da espera, a da volta à aba, a de quem
        // acabou de pagar) pode ser a que mostra o pagamento confirmado.
        const espera = esperaRef.current;
        if (espera) {
          if (!espera.antes) espera.antes = novo;
          else if (acessoAvancou(espera.antes, novo)) encerrarEspera(true);
        }
      } catch (err) {
        console.error("Erro ao verificar assinatura:", err);
        setState((prev) => ({ ...prev, loading: false }));
      }
    },
    [encerrarEspera]
  );

  useEffect(() => {
    // Sem await, a leitura do cache chama setState na hora. Não dá para levar
    // o cache para o estado inicial: o sessionStorage só existe no navegador,
    // e o HTML do servidor sairia diferente do primeiro render (hidratação).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial vinda do sessionStorage, que só existe depois de montar
    fetchStatus();
  }, [fetchStatus]);

  // O status só era buscado quando o app abria: quem pagava o PIX no celular
  // e voltava para o computador continuava vendo "somente leitura" até
  // recarregar a página.
  useEffect(() => {
    function aoVoltarParaAba() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultimaConsultaRef.current < FOCO_INTERVALO_MIN_MS) return;
      void fetchStatus(true);
    }
    window.addEventListener("focus", aoVoltarParaAba);
    document.addEventListener("visibilitychange", aoVoltarParaAba);
    return () => {
      window.removeEventListener("focus", aoVoltarParaAba);
      document.removeEventListener("visibilitychange", aoVoltarParaAba);
    };
  }, [fetchStatus]);

  // Cartão em análise e PIX pago com o modal fechado (ou o QR vencido)
  // confirmam pelo webhook ou pela reconciliação, sem ninguém avisar a tela.
  // Sem esta espera, "seu acesso é liberado automaticamente" só era verdade
  // depois de recarregar a página.
  const aguardarConfirmacaoPagamento = useCallback((): Promise<boolean> => {
    const agora = Date.now();
    const atual = esperaRef.current;
    if (atual) {
      atual.ate = agora + ESPERA_DURACAO_MS;
      return atual.promessa;
    }

    let resolver: (confirmado: boolean) => void = () => {};
    const promessa = new Promise<boolean>((r) => {
      resolver = r;
    });
    const base = estadoRef.current;
    const espera: Espera = {
      antes: base.loading ? null : base,
      ate: agora + ESPERA_DURACAO_MS,
      timer: undefined,
      promessa,
      resolver,
    };
    esperaRef.current = espera;
    setAguardandoPagamento(true);

    async function tique() {
      if (esperaRef.current !== espera) return;
      if (Date.now() > espera.ate) {
        encerrarEspera(false);
        return;
      }
      // Aba escondida: não consulta à toa; a volta à aba consulta na hora.
      if (document.visibilityState === "visible") await fetchStatus(true);
      if (esperaRef.current !== espera) return;
      espera.timer = window.setTimeout(tique, ESPERA_INTERVALO_MS);
    }
    espera.timer = window.setTimeout(tique, ESPERA_INTERVALO_MS);
    return promessa;
  }, [fetchStatus, encerrarEspera]);

  // Saiu do painel (logout): a espera para, e quem a aguardava recebe false.
  useEffect(() => () => encerrarEspera(false), [encerrarEspera]);

  // Quem chama refreshSubscription acabou de mudar a assinatura (pagou, usou
  // cupom, ligou ou cancelou a renovação automática): o cache de 1 minuto
  // devolveria justamente o estado de antes, e a faixa de "somente leitura"
  // continuaria na tela depois do pagamento.
  const refreshSubscription = useCallback(() => fetchStatus(true), [fetchStatus]);

  const openSubscriptionModal = useCallback(() => {
    setModalComCupom(false);
    setIsModalOpen(true);
  }, []);
  const openSubscriptionModalComCupom = useCallback(() => {
    setModalComCupom(true);
    setIsModalOpen(true);
  }, []);
  const closeSubscriptionModal = useCallback(() => setIsModalOpen(false), []);

  return (
    <SubscriptionContext.Provider
      value={{
        ...state,
        isModalOpen,
        modalComCupom,
        aguardandoPagamento,
        openSubscriptionModal,
        openSubscriptionModalComCupom,
        closeSubscriptionModal,
        refreshSubscription,
        aguardarConfirmacaoPagamento,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
