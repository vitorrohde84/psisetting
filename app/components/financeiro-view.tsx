"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { decryptClinicalData , ehCifrado } from "@/utils/crypto";
import { useSubscription } from "@/utils/subscription-context";
import { Plus, Loader2, ArrowUpRight, ArrowDownRight, Wallet, CheckCircle2, Circle, TrendingUp, CalendarDays } from "lucide-react";
import { Carregando } from "@/app/components/carregando";
import dynamic from "next/dynamic";

const PagamentoFormModal = dynamic(
  () => import("./pagamento-form-modal").then((m) => m.PagamentoFormModal),
  { ssr: false }
);

interface Pagamento {
  id: string;
  paciente_id: string;
  agendamento_id?: string | null;
  valor: number;
  data_vencimento: string;
  status: "pendente" | "pago" | "cancelado";
  forma_pagamento: string;
  receita_saude: boolean;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pacientes?: any;
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export function FinanceiroView() {
  const supabase = createClient();
  const { isReadOnly, openSubscriptionModal } = useSubscription();
  const [todosPagamentos, setTodosPagamentos] = useState<Pagamento[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [mesSelecionado, setMesSelecionado] = useState(new Date().getMonth());
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingPagamento, setEditingPagamento] = useState<Pagamento | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchPagamentos = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    // Busca os pagamentos do ano selecionado para compor métricas e gráficos anuais
    const startOfYear = `${anoSelecionado}-01-01`;
    const endOfYear = `${anoSelecionado}-12-31`;

    const { data } = await supabase
      .from("pagamentos")
      .select("id, valor, data_vencimento, status, forma_pagamento, receita_saude, created_at, paciente_id, agendamento_id, pacientes(nome, cpf)")
      .gte("data_vencimento", startOfYear)
      .lte("data_vencimento", endOfYear)
      .order("data_vencimento", { ascending: false });

    if (data && user) {
      const decryptedPagamentos = await Promise.all(
        data.map(async (p) => {
          let pacNome = (p.pacientes as any)?.nome || "Paciente";
          let pacCpf = (p.pacientes as any)?.cpf || "";

          if (pacNome && ehCifrado(pacNome)) {
            pacNome = await decryptClinicalData(pacNome, user.id);
          }
          if (pacCpf && ehCifrado(pacCpf)) {
            pacCpf = await decryptClinicalData(pacCpf, user.id);
          }

          return {
            ...p,
            pacientes: {
              ...(p.pacientes as any),
              nome: pacNome,
              cpf: pacCpf,
            },
          };
        })
      );
      setTodosPagamentos(decryptedPagamentos);
    } else if (data) {
      setTodosPagamentos(data);
    }
    setLoading(false);
  }, [anoSelecionado]);

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
      setTodosPagamentos(prev => prev.map(p => p.id === id ? { ...p, receita_saude: newValue } : p));
    }
    setTogglingId(null);
  }

  // --- DERIVED DATA ---
  
  // Pagamentos filtrados pelo mês/ano atual
  const pagamentosDoMes = useMemo(() => {
    return todosPagamentos.filter(p => {
      const pDate = new Date(p.data_vencimento + "T12:00:00");
      return pDate.getMonth() === mesSelecionado && pDate.getFullYear() === anoSelecionado;
    });
  }, [todosPagamentos, mesSelecionado, anoSelecionado]);

  // Métricas do Mês
  const metricas = useMemo(() => {
    let recebido = 0;
    let pendente = 0;
    pagamentosDoMes.forEach(p => {
      if (p.status === "pago") recebido += p.valor;
      if (p.status === "pendente") pendente += p.valor;
    });
    return { recebido, pendente, previsao: recebido + pendente };
  }, [pagamentosDoMes]);

  // Dados para o Gráfico (Últimos 6 meses de receitas)
  const chartData = useMemo(() => {
    const data = [];
    const hoje = new Date(anoSelecionado, mesSelecionado, 1);
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const mes = d.getMonth();
      const ano = d.getFullYear();
      
      let totalRecebido = 0;
      todosPagamentos.forEach(p => {
        const pDate = new Date(p.data_vencimento + "T12:00:00");
        if (pDate.getMonth() === mes && pDate.getFullYear() === ano && p.status === "pago") {
          totalRecebido += p.valor;
        }
      });
      
      data.push({
        label: `${MESES[mes].substring(0,3)}/${ano.toString().substring(2)}`,
        valor: totalRecebido
      });
    }
    return data;
  }, [todosPagamentos, mesSelecionado, anoSelecionado]);

  const maxChartValue = Math.max(...chartData.map(d => d.valor), 100); // 100 as minimum scale

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<number>();
    anos.add(new Date().getFullYear());
    todosPagamentos.forEach(p => {
      const pDate = new Date(p.data_vencimento + "T12:00:00");
      anos.add(pDate.getFullYear());
    });
    return Array.from(anos).sort((a, b) => b - a);
  }, [todosPagamentos]);

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-serif font-semibold text-text">Gestão Financeira</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            Acompanhe o faturamento do seu consultório
          </p>
        </div>
        <button
          onClick={() => {
            if (isReadOnly) {
              openSubscriptionModal();
              return;
            }
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

      {/* Controladores de Filtro */}
      <div className="bg-surface rounded-xl border border-border/60 p-4 mb-6 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2 text-text-muted">
          <CalendarDays size={18} />
          <span className="text-sm font-medium">Período:</span>
        </div>
        
        <select 
          value={mesSelecionado}
          onChange={(e) => setMesSelecionado(Number(e.target.value))}
          className="px-4 py-2 rounded-lg bg-background border border-border text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
        >
          {MESES.map((mes, index) => (
            <option key={index} value={index}>{mes}</option>
          ))}
        </select>
        
        <select 
          value={anoSelecionado}
          onChange={(e) => setAnoSelecionado(Number(e.target.value))}
          className="px-4 py-2 rounded-lg bg-background border border-border text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
        >
          {anosDisponiveis.map(ano => (
            <option key={ano} value={ano}>{ano}</option>
          ))}
        </select>

        {loading && <Loader2 size={16} className="animate-spin text-text-muted ml-auto" />}
      </div>

      {/* Dashboard Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
        <div className="bg-surface rounded-2xl border border-border/60 p-5 shadow-sm relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-success/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-text-muted mb-2 relative z-10">
            <div className="p-2 rounded-lg bg-success/10 text-success">
              <ArrowUpRight size={20} />
            </div>
            <span className="text-sm font-medium">Total Recebido</span>
          </div>
          <p className="text-3xl font-serif font-semibold text-text relative z-10"><span className="sensitive-data">{formatMoney(metricas.recebido)}</span></p>
        </div>

        <div className="bg-surface rounded-2xl border border-border/60 p-5 shadow-sm relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-danger/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-text-muted mb-2 relative z-10">
            <div className="p-2 rounded-lg bg-warning/10 text-warning-dark">
              <ArrowDownRight size={20} />
            </div>
            <span className="text-sm font-medium">A Receber (Pendente)</span>
          </div>
          <p className="text-3xl font-serif font-semibold text-text relative z-10"><span className="sensitive-data">{formatMoney(metricas.pendente)}</span></p>
        </div>

        <div className="bg-surface rounded-2xl border border-border/60 p-5 shadow-sm relative overflow-hidden sm:col-span-2 lg:col-span-1">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-text-muted mb-2 relative z-10">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <TrendingUp size={20} />
            </div>
            <span className="text-sm font-medium">Previsão do Mês</span>
          </div>
          <p className="text-3xl font-serif font-semibold text-text relative z-10"><span className="sensitive-data">{formatMoney(metricas.previsao)}</span></p>
        </div>
      </div>

      {/* Gráfico Visual */}
      <div className="bg-surface rounded-2xl border border-border/60 p-6 mb-8 shadow-sm">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-6">Receitas dos últimos 6 meses</h3>
        <div className="h-48 flex items-end gap-2 sm:gap-6 pt-4">
          {chartData.map((d, i) => {
            const heightPercent = Math.max((d.valor / maxChartValue) * 100, 2); // Minimum 2% to show the bar
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end group">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity mb-2 text-xs font-medium text-text bg-background px-2 py-1 rounded shadow-sm border border-border">
                  <span className="sensitive-data">{formatMoney(d.valor)}</span>
                </div>
                <div 
                  className="w-full max-w-[40px] bg-primary/20 group-hover:bg-primary transition-colors rounded-t-md relative"
                  style={{ height: `${heightPercent}%` }}
                >
                  <div className="absolute bottom-0 left-0 right-0 h-full bg-gradient-to-t from-primary/40 to-primary opacity-60 rounded-t-md" />
                </div>
                <span className="text-[10px] sm:text-xs text-text-muted mt-3">{d.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lista de Pagamentos do Mês */}
      <div className="bg-surface rounded-xl border border-border/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-border/40">
          <h3 className="font-medium text-text">Lançamentos de {MESES[mesSelecionado]}</h3>
        </div>
        
        {loading ? (
          <Carregando dadosClinicos className="h-48" />
        ) : pagamentosDoMes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center px-4">
            <Wallet size={36} className="text-border mb-3" />
            <h3 className="text-base font-medium text-text mb-1">Nenhum lançamento no período</h3>
            <p className="text-sm text-text-muted">Não há registros financeiros para este mês.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-background/50 border-b border-border/40 text-text-muted">
                <tr>
                  <th className="px-5 py-4 font-medium">Paciente / Origem</th>
                  <th className="px-5 py-4 font-medium">Valor</th>
                  <th className="px-5 py-4 font-medium">Vencimento</th>
                  <th className="px-5 py-4 font-medium">Status</th>
                  <th className="px-5 py-4 font-medium">Forma</th>
                  <th className="px-5 py-4 font-medium text-center">Recibo / I.R.</th>
                  <th className="px-5 py-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {pagamentosDoMes.map((p) => {
                  const pacInfo = getPacienteInfo(p);
                  const vencimento = new Date(p.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR");
                  
                  return (
                    <tr key={p.id} className="hover:bg-background/20 transition-colors">
                      <td className="px-5 py-4 font-medium text-text">
                        <div className="flex flex-col">
                          <span className="sensitive-data">{pacInfo.nome || "Desconhecido"}</span>
                          {p.agendamento_id && (
                            <span className="text-[10px] text-primary bg-primary/10 w-fit px-1.5 py-0.5 rounded mt-1">
                              Vinculado à Sessão
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 font-semibold text-text sensitive-data">
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
