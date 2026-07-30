"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { Plus, Loader2, ArrowUpRight, ArrowDownRight, Wallet, CheckCircle2, Circle } from "lucide-react";
import { PagamentoFormModal } from "./pagamento-form-modal";

interface Pagamento {
  id: string;
  paciente_id: string;
  valor: number;
  data_vencimento: string;
  status: "pendente" | "pago" | "cancelado";
  forma_pagamento: string;
  receita_saude: boolean;
  created_at: string;
  pacientes?: any;
}

export function FinanceiroView() {
  const supabase = createClient();
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [loading, setLoading] = useState(true);

  // Dashboard Stats
  const [totalRecebido, setTotalRecebido] = useState(0);
  const [totalPendente, setTotalPendente] = useState(0);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingPagamento, setEditingPagamento] = useState<Pagamento | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchPagamentos = useCallback(async () => {
    setLoading(true);

    const { data } = await supabase
      .from("pagamentos")
      .select("id, valor, data_vencimento, status, forma_pagamento, receita_saude, created_at, paciente_id, pacientes(nome, cpf)")
      .order("data_vencimento", { ascending: false });

    if (data) {
      setPagamentos(data);
      
      // Calculate dashboard metrics for the current month
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();

      let recebido = 0;
      let pendente = 0;

      data.forEach(p => {
        const pDate = new Date(p.data_vencimento + "T12:00:00");
        if (pDate.getMonth() === currentMonth && pDate.getFullYear() === currentYear) {
          if (p.status === "pago") recebido += p.valor;
          if (p.status === "pendente") pendente += p.valor;
        }
      });

      setTotalRecebido(recebido);
      setTotalPendente(pendente);
    }
    
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPagamentos();
  }, [fetchPagamentos]);

  function formatMoney(value: number) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  }

  function getPacienteInfo(p: Pagamento) {
    const pac = p.pacientes;
    if (!pac) return { nome: "Desconhecido", cpf: "" };
    if (Array.isArray(pac)) return pac[0] || {};
    return pac || {};
  }

  async function handleToggleReceitaSaude(id: string, currentValue: boolean) {
    setTogglingId(id);
    const newValue = !currentValue;
    
    const { error } = await supabase
      .from("pagamentos")
      .update({ receita_saude: newValue })
      .eq("id", id);
      
    if (error) {
      console.error(error);
      alert("Erro ao atualizar status da Receita Saúde.");
    } else {
      setPagamentos(prev => prev.map(p => p.id === id ? { ...p, receita_saude: newValue } : p));
    }
    setTogglingId(null);
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-serif font-semibold text-text">Gestão Financeira</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            Acompanhamento de pagamentos e emissão de recibos para Imposto de Renda
          </p>
        </div>
        <button
          onClick={() => {
            setEditingPagamento(null);
            setShowModal(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                     bg-primary text-white text-sm font-medium
                     hover:bg-primary-dark active:scale-[0.98]
                     transition-all duration-200 cursor-pointer shrink-0"
        >
          <Plus size={18} />
          Novo Pagamento
        </button>
      </div>

      {/* Dashboard Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
        <div className="bg-surface rounded-2xl border border-border/60 p-5 shadow-sm">
          <div className="flex items-center gap-3 text-text-muted mb-2">
            <div className="p-2 rounded-lg bg-success/10 text-success">
              <ArrowUpRight size={20} />
            </div>
            <span className="text-sm font-medium">Recebido no Mês</span>
          </div>
          <p className="text-2xl font-serif font-semibold text-text">{formatMoney(totalRecebido)}</p>
        </div>
        <div className="bg-surface rounded-2xl border border-border/60 p-5 shadow-sm">
          <div className="flex items-center gap-3 text-text-muted mb-2">
            <div className="p-2 rounded-lg bg-warning/10 text-warning">
              <ArrowDownRight size={20} />
            </div>
            <span className="text-sm font-medium">Pendente no Mês</span>
          </div>
          <p className="text-2xl font-serif font-semibold text-text">{formatMoney(totalPendente)}</p>
        </div>
      </div>

      {/* Lista de Pagamentos */}
      <div className="bg-surface rounded-xl border border-border/60 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64">
            <Loader2 size={28} className="animate-spin text-primary mb-3" />
          </div>
        ) : pagamentos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center px-4">
            <Wallet size={36} className="text-border mb-3" />
            <h3 className="text-base font-medium text-text mb-1">Nenhum pagamento registrado</h3>
            <p className="text-sm text-text-muted">Comece cadastrando os pagamentos das suas sessões.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-background/50 border-b border-border/40 text-text-muted">
                <tr>
                  <th className="px-5 py-4 font-medium">Paciente</th>
                  <th className="px-5 py-4 font-medium">Valor</th>
                  <th className="px-5 py-4 font-medium">Vencimento</th>
                  <th className="px-5 py-4 font-medium">Status</th>
                  <th className="px-5 py-4 font-medium">Forma</th>
                  <th className="px-5 py-4 font-medium text-center">Receita Saúde</th>
                  <th className="px-5 py-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {pagamentos.map((p) => {
                  const pacInfo = getPacienteInfo(p);
                  const vencimento = new Date(p.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR");
                  
                  return (
                    <tr key={p.id} className="hover:bg-background/20 transition-colors">
                      <td className="px-5 py-4 font-medium text-text">
                        {pacInfo.nome || "Desconhecido"}
                      </td>
                      <td className="px-5 py-4 font-semibold text-text">
                        {formatMoney(p.valor)}
                      </td>
                      <td className="px-5 py-4 text-text-muted">
                        {vencimento}
                      </td>
                      <td className="px-5 py-4">
                        {p.status === "pago" && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded bg-success/10 text-success">
                            <CheckCircle2 size={12} /> Pago
                          </span>
                        )}
                        {p.status === "pendente" && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded bg-warning/10 text-warning-dark">
                            <Circle size={12} /> Pendente
                          </span>
                        )}
                        {p.status === "cancelado" && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded bg-danger/10 text-danger">
                            <Circle size={12} /> Cancelado
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-text-muted capitalize">
                        {p.forma_pagamento}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <label className="inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!p.receita_saude}
                            disabled={togglingId === p.id}
                            onChange={() => handleToggleReceitaSaude(p.id, !!p.receita_saude)}
                            className="rounded border-border text-primary focus:ring-primary/20 w-4 h-4 disabled:opacity-50"
                          />
                        </label>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditingPagamento(p);
                              setShowModal(true);
                            }}
                            className="text-text-muted hover:text-primary transition-colors text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-background"
                          >
                            Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <PagamentoFormModal
          pagamento={editingPagamento}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            fetchPagamentos();
          }}
        />
      )}

    </>
  );
}
