"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

interface SubscriptionState {
  isVip: boolean;
  status: string;
  isTrialing: boolean;
  trialDaysLeft: number;
  trialEndsAt: string | null;
  isReadOnly: boolean;
  hasActiveSubscription: boolean;
  loading: boolean;
  isModalOpen: boolean;
  openSubscriptionModal: () => void;
  closeSubscriptionModal: () => void;
  refreshSubscription: () => Promise<void>;
}

const defaultState: SubscriptionState = {
  isVip: false,
  status: "trialing",
  isTrialing: true,
  trialDaysLeft: 7,
  trialEndsAt: null,
  isReadOnly: false,
  hasActiveSubscription: false,
  loading: true,
  isModalOpen: false,
  openSubscriptionModal: () => {},
  closeSubscriptionModal: () => {},
  refreshSubscription: async () => {},
};

const SubscriptionContext = createContext<SubscriptionState>(defaultState);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<SubscriptionState, "openSubscriptionModal" | "closeSubscriptionModal" | "refreshSubscription" | "isModalOpen">>({
    isVip: false,
    status: "trialing",
    isTrialing: true,
    trialDaysLeft: 7,
    trialEndsAt: null,
    isReadOnly: false,
    hasActiveSubscription: false,
    loading: true,
  });

  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/subscription/status");
      if (!res.ok) {
        // Se der erro ou não estiver logado, não quebra a tela
        setState((prev) => ({ ...prev, loading: false }));
        return;
      }
      const data = await res.json();
      setState({
        isVip: Boolean(data.isVip),
        status: data.status || "trialing",
        isTrialing: Boolean(data.isTrialing),
        trialDaysLeft: typeof data.trialDaysLeft === "number" ? data.trialDaysLeft : 0,
        trialEndsAt: data.trialEndsAt || null,
        isReadOnly: Boolean(data.isReadOnly),
        hasActiveSubscription: Boolean(data.hasActiveSubscription),
        loading: false,
      });
    } catch (err) {
      console.error("Erro ao verificar assinatura:", err);
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const openSubscriptionModal = useCallback(() => setIsModalOpen(true), []);
  const closeSubscriptionModal = useCallback(() => setIsModalOpen(false), []);

  return (
    <SubscriptionContext.Provider
      value={{
        ...state,
        isModalOpen,
        openSubscriptionModal,
        closeSubscriptionModal,
        refreshSubscription: fetchStatus,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
