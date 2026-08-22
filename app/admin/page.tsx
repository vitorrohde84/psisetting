"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PsiSettingBrand } from "@/app/components/psi-setting-brand";
import {
  DollarSign,
  Users,
  TrendingUp,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Lightbulb,
  Tag,
  Radio,
  Search,
  Plus,
  RefreshCw,
  MessageCircle,
  ExternalLink,
  CheckCircle2,
  Trash2,
  Send,
  Loader2,
  Star,
  ArrowUpRight,
  Filter,
  Download,
  Calendar,
  FileText,
  FileCheck,
  Heart,
  ChevronRight,
  Check,
  Sparkles,
  ArrowLeft,
  Crown,
  BellRing,
} from "lucide-react";

type TabType = "metrics" | "users" | "coupons" | "churn" | "announcements" | "feedbacks";

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<TabType>("metrics");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Estados de Dados
  const [metrics, setMetrics] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);

  // Filtros de Usuários
  const [userSearch, setUserSearch] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState("all");

  // Filtros de Feedbacks
  const [feedbackCategoryFilter, setFeedbackCategoryFilter] = useState("all");
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState("all");

  // Formulário de Novo Cupom
  const [newCouponCode, setNewCouponCode] = useState("");
  const [newCouponDays, setNewCouponDays] = useState(30);
  const [newCouponMaxUses, setNewCouponMaxUses] = useState("");
  const [newCouponExpiresAt, setNewCouponExpiresAt] = useState("");
  const [couponSubmitting, setCouponSubmitting] = useState(false);

  // Formulário de Novo Comunicado
  const [newAnnTitle, setNewAnnTitle] = useState("");
  const [newAnnMessage, setNewAnnMessage] = useState("");
  const [newAnnType, setNewAnnType] = useState<"info" | "success" | "warning" | "tip">("info");
  const [newAnnLinkUrl, setNewAnnLinkUrl] = useState("");
  const [newAnnLinkLabel, setNewAnnLinkLabel] = useState("");
  const [annSubmitting, setAnnSubmitting] = useState(false);

  // Mensagens de Alerta/Ação
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }

  // Carregar todos os dados
  async function loadAllData() {
    try {
      setRefreshing(true);
      const [mRes, uRes, cRes, fRes, aRes] = await Promise.all([
        fetch("/api/admin/metrics"),
        fetch(`/api/admin/users?search=${encodeURIComponent(userSearch)}&status=${userStatusFilter}`),
        fetch("/api/admin/coupons"),
        fetch(`/api/admin/feedbacks?category=${feedbackCategoryFilter}&status=${feedbackStatusFilter}`),
        fetch("/api/admin/announcements"),
      ]);

      if (mRes.ok) setMetrics(await mRes.json());
      if (uRes.ok) {
        const uData = await uRes.json();
        setUsers(uData.users || []);
      }
      if (cRes.ok) {
        const cData = await cRes.json();
        setCoupons(cData.coupons || []);
      }
      if (fRes.ok) {
        const fData = await fRes.json();
        setFeedbacks(fData.feedbacks || []);
      }
      if (aRes.ok) {
        const aData = await aRes.json();
        setAnnouncements(aData.announcements || []);
      }
    } catch (err) {
      console.error("Erro ao carregar dados do admin:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadAllData();
  }, [userStatusFilter, feedbackCategoryFilter, feedbackStatusFilter]);

  // Ações de Usuário
  async function handleUserAction(userId: string, action: string, days?: number) {
    try {
      const res = await fetch("/api/admin/users/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, days }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Ação executada com sucesso!");
        loadAllData();
      } else {
        alert(data.error || "Erro ao executar ação.");
      }
    } catch (err) {
      alert("Falha de conexão.");
    }
  }

  // Criar Cupom
  async function handleCreateCoupon(e: React.FormEvent) {
    e.preventDefault();
    if (!newCouponCode.trim()) return;

    setCouponSubmitting(true);
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCouponCode.trim(),
          trial_days: newCouponDays,
          max_uses: newCouponMaxUses ? Number(newCouponMaxUses) : null,
          expires_at: newCouponExpiresAt || null,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast(`Cupom ${newCouponCode.toUpperCase()} criado com sucesso!`);
        setNewCouponCode("");
        setNewCouponMaxUses("");
        setNewCouponExpiresAt("");
        loadAllData();
      } else {
        alert(data.error || "Erro ao criar cupom.");
      }
    } catch (err) {
      alert("Falha ao criar cupom.");
    } finally {
      setCouponSubmitting(false);
    }
  }

  // Alternar Status do Cupom
  async function handleToggleCoupon(id: string, currentActive: boolean) {
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active: !currentActive }),
      });

      if (res.ok) {
        showToast(currentActive ? "Cupom desativado." : "Cupom ativado com sucesso!");
        loadAllData();
      }
    } catch (err) {
      alert("Erro ao alterar status do cupom.");
    }
  }

  // Deletar Cupom
  async function handleDeleteCoupon(id: string, code: string) {
    if (!confirm(`Deseja realmente excluir o cupom '${code}'?`)) return;

    try {
      const res = await fetch(`/api/admin/coupons?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Cupom excluído.");
        loadAllData();
      }
    } catch (err) {
      alert("Erro ao excluir cupom.");
    }
  }

  // Criar Comunicado Global
  async function handleCreateAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    if (!newAnnTitle.trim() || !newAnnMessage.trim()) return;

    setAnnSubmitting(true);
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newAnnTitle.trim(),
          message: newAnnMessage.trim(),
          type: newAnnType,
          link_url: newAnnLinkUrl.trim() || null,
          link_label: newAnnLinkLabel.trim() || null,
          active: true,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast("Comunicado publicado com sucesso!");
        setNewAnnTitle("");
        setNewAnnMessage("");
        setNewAnnLinkUrl("");
        setNewAnnLinkLabel("");
        loadAllData();
      } else {
        alert(data.error || "Erro ao publicar comunicado.");
      }
    } catch (err) {
      alert("Falha ao salvar comunicado.");
    } finally {
      setAnnSubmitting(false);
    }
  }

  // Alternar Status do Comunicado
  async function handleToggleAnnouncement(id: string, currentActive: boolean) {
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active: !currentActive }),
      });

      if (res.ok) {
        showToast(currentActive ? "Comunicado ocultado." : "Comunicado ativado no topo do sistema!");
        loadAllData();
      }
    } catch (err) {
      alert("Erro ao alterar comunicado.");
    }
  }

  // Deletar Comunicado
  async function handleDeleteAnnouncement(id: string) {
    if (!confirm("Deseja realmente remover este comunicado?")) return;

    try {
      const res = await fetch(`/api/admin/announcements?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Comunicado removido.");
        loadAllData();
      }
    } catch (err) {
      alert("Erro ao remover comunicado.");
    }
  }

  // Atualizar Status do Feedback
  async function handleUpdateFeedback(id: string, status: string, admin_notes?: string) {
    try {
      const res = await fetch("/api/admin/feedbacks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, admin_notes }),
      });

      if (res.ok) {
        showToast("Feedback atualizado!");
        loadAllData();
      }
    } catch (err) {
      alert("Erro ao atualizar feedback.");
    }
  }

  // Exportar E-mails em CSV
  function handleExportUsersCSV() {
    if (!users || users.length === 0) return;

    const headers = ["Nome", "Email", "Telefone", "CRP", "Status", "Dias Restantes", "Pacientes", "Data Cadastro"];
    const rows = users.map((u) => [
      `"${u.nome || ""}"`,
      `"${u.email || ""}"`,
      `"${u.telefone || ""}"`,
      `"${u.crp || ""}"`,
      `"${u.calculatedStatus}"`,
      `"${u.trialDaysLeft}"`,
      `"${u.totalPatients}"`,
      `"${u.created_at ? new Date(u.created_at).toLocaleDateString("pt-BR") : ""}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `psisetting_usuarios_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Usuários em Risco para o Radar de Retenção
  const atRiskUsers = users.filter((u) => u.isAtRisk);

  return (
    <div className="min-h-screen pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[200] bg-stone-900 text-white text-xs px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-bottom-5">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ───────── TOP BAR ADMIN ───────── */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-border/80 px-4 sm:px-6 lg:px-8 py-3.5 shadow-2xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="flex items-center gap-2.5">
              <PsiSettingBrand size="sm" showIcon={true} showSubtitle={false} />
            </Link>
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider bg-stone-900 text-amber-400 px-2 py-0.5 rounded-md shadow-xs">
              <Crown size={11} />
              SaaS Admin Central
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={loadAllData}
              disabled={refreshing}
              className="p-2 rounded-xl bg-background border border-border text-text-muted hover:text-text hover:bg-surface transition-all cursor-pointer disabled:opacity-50"
              title="Atualizar Dados em Tempo Real"
            >
              <RefreshCw size={15} className={refreshing ? "animate-spin text-primary" : ""} />
            </button>

            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-all cursor-pointer shadow-2xs"
            >
              <ArrowLeft size={13} />
              <span>Voltar ao Consultório</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ───────── CONTAINER PRINCIPAL ───────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* ───────── 1. TOP KPI CARDS (RESUMO EXECUTIVO) ───────── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Card 1: MRR */}
          <div className="bg-surface rounded-2xl p-4 border border-border/80 shadow-xs space-y-1 relative overflow-hidden">
            <div className="flex items-center justify-between text-emerald-800">
              <span className="text-xs font-semibold">MRR (Receita Mensal)</span>
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-700">
                <DollarSign size={16} />
              </div>
            </div>
            <p className="text-2xl font-serif font-black text-text tracking-tight">
              R$ {metrics?.finance?.mrr ? metrics.finance.mrr.toFixed(2).replace(".", ",") : "0,00"}
            </p>
            <p className="text-[11px] text-text-muted">
              <strong>{metrics?.finance?.activeSubscribers || 0}</strong> assinantes ativos (R$ 34,90)
            </p>
          </div>

          {/* Card 2: Total de Psicólogos */}
          <div className="bg-surface rounded-2xl p-4 border border-border/80 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-primary">
              <span className="text-xs font-semibold">Base de Psicólogos</span>
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Users size={16} />
              </div>
            </div>
            <p className="text-2xl font-serif font-black text-text tracking-tight">
              {metrics?.users?.total || 0}
            </p>
            <p className="text-[11px] text-text-muted">
              +{metrics?.users?.newLast7Days || 0} nos últimos 7 dias
            </p>
          </div>

          {/* Card 3: Trials em Andamento */}
          <div className="bg-surface rounded-2xl p-4 border border-border/80 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-blue-800">
              <span className="text-xs font-semibold">Trials Ativos (7 Dias)</span>
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-700">
                <Clock size={16} />
              </div>
            </div>
            <p className="text-2xl font-serif font-black text-text tracking-tight">
              {metrics?.users?.activeTrials || 0}
            </p>
            <p className="text-[11px] text-text-muted">
              Taxa de Conversão: <strong>{metrics?.users?.conversionRate || 0}%</strong>
            </p>
          </div>

          {/* Card 4: Radar de Churn / Risco */}
          <div
            onClick={() => setActiveTab("churn")}
            className="bg-surface rounded-2xl p-4 border border-border/80 shadow-xs space-y-1 cursor-pointer hover:border-amber-500/50 transition-all group"
          >
            <div className="flex items-center justify-between text-amber-800">
              <span className="text-xs font-semibold">Em Risco de Churn</span>
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-700 group-hover:scale-110 transition-transform">
                <AlertTriangle size={16} />
              </div>
            </div>
            <p className="text-2xl font-serif font-black text-amber-900 tracking-tight">
              {atRiskUsers.length}
            </p>
            <p className="text-[11px] text-text-muted group-hover:text-amber-800 transition-colors">
              Clique para apoiar no WhatsApp →
            </p>
          </div>

          {/* Card 5: Feedbacks Pendentes */}
          <div
            onClick={() => setActiveTab("feedbacks")}
            className="bg-surface rounded-2xl p-4 border border-border/80 shadow-xs space-y-1 cursor-pointer hover:border-primary/50 transition-all group"
          >
            <div className="flex items-center justify-between text-primary">
              <span className="text-xs font-semibold">Feedbacks & Ideias</span>
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                <Lightbulb size={16} />
              </div>
            </div>
            <p className="text-2xl font-serif font-black text-text tracking-tight">
              {metrics?.operations?.pendingFeedbacks || 0}
            </p>
            <p className="text-[11px] text-text-muted group-hover:text-primary transition-colors">
              Ver sugestões recebidas →
            </p>
          </div>
        </section>

        {/* ───────── 2. ABAS DE NAVEGAÇÃO ───────── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-border/60 scrollbar-none">
          {[
            { id: "metrics", label: "Inteligência & Métricas", icon: TrendingUp },
            { id: "users", label: "Gestão de Psicólogos", icon: Users, count: users.length },
            { id: "coupons", label: "Gerenciador de Cupons", icon: Tag, count: coupons.length },
            { id: "churn", label: "Radar de Retenção", icon: AlertTriangle, count: atRiskUsers.length, badgeColor: "bg-amber-500/20 text-amber-900 font-bold" },
            { id: "announcements", label: "Comunicados Globais", icon: Radio, count: announcements.length },
            { id: "feedbacks", label: "Central de Feedbacks", icon: Lightbulb, count: feedbacks.length },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? "bg-stone-900 text-white shadow-xs"
                    : "text-text-muted hover:text-text hover:bg-surface"
                }`}
              >
                <Icon size={14} className={isSelected ? "text-amber-400" : ""} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : tab.badgeColor || "bg-border text-text-muted"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ───────── 3. CONTEÚDO DAS ABAS ───────── */}

        {/* ─────── ABA 1: INTELIGÊNCIA & MÉTRICAS (SAAS OVERVIEW) ─────── */}
        {activeTab === "metrics" && (
          <div className="space-y-6 animate-fadeIn">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Funil de Assinaturas & Status de Usuários */}
              <div className="bg-surface rounded-2xl border border-border/80 p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                  <h3 className="font-serif font-bold text-text text-sm flex items-center gap-2">
                    <ShieldCheck size={16} className="text-primary" />
                    Distribuição da Base de Usuários
                  </h3>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-200/80">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                      <span className="text-xs font-semibold text-emerald-950">Assinantes Ativos (Pagantes)</span>
                    </div>
                    <span className="text-xs font-bold text-emerald-900 font-serif text-sm">
                      {metrics?.finance?.activeSubscribers || 0}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50 border border-blue-200/80">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                      <span className="text-xs font-semibold text-blue-950">Em Período de Testes (7 Dias)</span>
                    </div>
                    <span className="text-xs font-bold text-blue-900 font-serif text-sm">
                      {metrics?.users?.activeTrials || 0}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-purple-50 border border-purple-200/80">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                      <span className="text-xs font-semibold text-purple-950">Acesso VIP / Cortesia</span>
                    </div>
                    <span className="text-xs font-bold text-purple-900 font-serif text-sm">
                      {metrics?.users?.vips || 0}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-200/80">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-600" />
                      <span className="text-xs font-semibold text-amber-950">Testes Expirados (Modo Leitura)</span>
                    </div>
                    <span className="text-xs font-bold text-amber-900 font-serif text-sm">
                      {metrics?.users?.expiredTrials || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Engajamento Clínico Global */}
              <div className="bg-surface rounded-2xl border border-border/80 p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                  <h3 className="font-serif font-bold text-text text-sm flex items-center gap-2">
                    <TrendingUp size={16} className="text-primary" />
                    Engajamento Clínico Global
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-background border border-border/80 text-center space-y-1">
                    <Users size={18} className="mx-auto text-primary" />
                    <p className="text-xl font-serif font-bold text-text">
                      {metrics?.engagement?.totalPacientes || 0}
                    </p>
                    <p className="text-[11px] text-text-muted">Pacientes no Sistema</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-background border border-border/80 text-center space-y-1">
                    <FileText size={18} className="mx-auto text-primary" />
                    <p className="text-xl font-serif font-bold text-text">
                      {metrics?.engagement?.totalProntuarios || 0}
                    </p>
                    <p className="text-[11px] text-text-muted">Evoluções Clínicas</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-background border border-border/80 text-center space-y-1">
                    <FileCheck size={18} className="mx-auto text-primary" />
                    <p className="text-xl font-serif font-bold text-text">
                      {metrics?.engagement?.totalLaudos || 0}
                    </p>
                    <p className="text-[11px] text-text-muted">Documentos CFP</p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-background border border-border/80 text-center space-y-1">
                    <Calendar size={18} className="mx-auto text-primary" />
                    <p className="text-xl font-serif font-bold text-text">
                      {metrics?.engagement?.totalAgendamentos || 0}
                    </p>
                    <p className="text-[11px] text-text-muted">Sessões Agendadas</p>
                  </div>
                </div>
              </div>

              {/* Insights e Ações Recomendadas */}
              <div className="bg-surface rounded-2xl border border-border/80 p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                  <h3 className="font-serif font-bold text-text text-sm flex items-center gap-2">
                    <Sparkles size={16} className="text-amber-600" />
                    Direcionamento Estratégico
                  </h3>
                </div>

                <div className="space-y-3 text-xs text-text-muted leading-relaxed">
                  <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-2.5">
                    <CheckCircle2 size={16} className="text-primary shrink-0 mt-0.5" />
                    <p>
                      <strong>Previsibilidade:</strong> Seu ARR projetado anual é de{" "}
                      <strong className="text-text">
                        R$ {metrics?.finance?.arr ? metrics.finance.arr.toFixed(2).replace(".", ",") : "0,00"}
                      </strong>.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5">
                    <AlertTriangle size={16} className="text-amber-700 shrink-0 mt-0.5" />
                    <p>
                      Você tem <strong className="text-amber-950">{atRiskUsers.length} psicólogos</strong> em risco de não converter. Use a aba <strong>Radar de Retenção</strong> para apoiá-los.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 flex items-start gap-2.5">
                    <Tag size={16} className="text-purple-700 shrink-0 mt-0.5" />
                    <p>
                      Crie cupons promocionais para eventos ou parcerias de CRP na aba <strong>Gerenciador de Cupons</strong>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─────── ABA 2: GESTÃO DE PSICÓLOGOS (CRM) ─────── */}
        {activeTab === "users" && (
          <div className="bg-surface rounded-2xl border border-border/80 p-5 space-y-4 shadow-xs animate-fadeIn">
            {/* Header com Busca, Filtros e Exportação */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-border/40 pb-4">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative w-full">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Buscar por nome, email, telefone ou CRP..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-background border border-border text-xs text-text focus:border-primary focus:ring-1 focus:ring-primary outline-hidden"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={userStatusFilter}
                  onChange={(e) => setUserStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-background border border-border text-xs font-semibold text-text outline-hidden"
                >
                  <option value="all">Todos os Status ({users.length})</option>
                  <option value="active">🟢 Assinantes Ativos</option>
                  <option value="trialing">🟡 Em Teste (Trial)</option>
                  <option value="expired">🔴 Testes Expirados</option>
                  <option value="vip">🟣 Acesso VIP</option>
                  <option value="risk">⚠️ Em Risco</option>
                </select>

                <button
                  type="button"
                  onClick={handleExportUsersCSV}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-background border border-border text-text hover:bg-surface text-xs font-semibold transition-colors cursor-pointer"
                  title="Exportar Lista em CSV"
                >
                  <Download size={14} />
                  <span className="hidden sm:inline">Exportar CSV</span>
                </button>
              </div>
            </div>

            {/* Tabela de Usuários */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-text-muted uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Psicólogo(a)</th>
                    <th className="py-2.5 px-3">Contato</th>
                    <th className="py-2.5 px-3">Status da Conta</th>
                    <th className="py-2.5 px-3">Uso Clínico</th>
                    <th className="py-2.5 px-3">Cadastro</th>
                    <th className="py-2.5 px-3 text-right">Ações Rápidas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-text-muted">
                        Nenhum psicólogo encontrado com esses filtros.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const statusBadges: Record<string, { label: string; bg: string; text: string }> = {
                        active: { label: "Ativo (Assinante)", bg: "bg-emerald-100", text: "text-emerald-900" },
                        trialing: { label: `Trial (${u.trialDaysLeft}d restantes)`, bg: "bg-blue-100", text: "text-blue-900" },
                        expired: { label: "Expirado (Leitura)", bg: "bg-amber-100", text: "text-amber-900" },
                        vip: { label: "Acesso VIP", bg: "bg-purple-100", text: "text-purple-900" },
                        past_due: { label: "Atrasado", bg: "bg-rose-100", text: "text-rose-900" },
                      };

                      const currentBadge = statusBadges[u.calculatedStatus] || statusBadges.trialing;
                      const rawPhone = (u.telefone || "").replace(/\D/g, "");
                      const whatsappLink = rawPhone
                        ? `https://wa.me/55${rawPhone}?text=${encodeURIComponent(
                            `Olá Dr(a). ${u.nome || ""}, tudo bem? Sou da equipe do PsiSetting!`
                          )}`
                        : null;

                      return (
                        <tr key={u.id} className="hover:bg-background/60 transition-colors">
                          <td className="py-3 px-3">
                            <p className="font-bold text-text">{u.nome || "Sem Nome"}</p>
                            <p className="text-[11px] text-text-muted truncate max-w-[180px]">{u.email}</p>
                            {u.crp && <p className="text-[10px] text-primary font-medium">CRP: {u.crp}</p>}
                          </td>

                          <td className="py-3 px-3">
                            {u.telefone ? (
                              <div className="flex items-center gap-1.5">
                                <span>{u.telefone}</span>
                                {whatsappLink && (
                                  <a
                                    href={whatsappLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors"
                                    title="Abrir WhatsApp"
                                  >
                                    <MessageCircle size={13} />
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span className="text-text-muted">Não informado</span>
                            )}
                          </td>

                          <td className="py-3 px-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${currentBadge.bg} ${currentBadge.text}`}>
                              {currentBadge.label}
                            </span>
                            {u.isAtRisk && (
                              <span className="block text-[9px] text-amber-700 font-semibold mt-0.5">
                                ⚠️ Risco de abandono
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3">
                            <p className="font-medium text-text">
                              <strong>{u.totalPatients}</strong> pacientes
                            </p>
                          </td>

                          <td className="py-3 px-3 text-[11px] text-text-muted">
                            {u.created_at ? new Date(u.created_at).toLocaleDateString("pt-BR") : "—"}
                          </td>

                          <td className="py-3 px-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              {/* Estender Trial */}
                              <button
                                type="button"
                                onClick={() => handleUserAction(u.id, "extend_trial", 7)}
                                className="px-2 py-1 rounded-lg bg-background hover:bg-surface border border-border text-[11px] font-semibold text-text transition-colors cursor-pointer"
                                title="Conceder mais 7 dias de testes grátis"
                              >
                                +7d
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUserAction(u.id, "extend_trial", 30)}
                                className="px-2 py-1 rounded-lg bg-background hover:bg-surface border border-border text-[11px] font-semibold text-text transition-colors cursor-pointer"
                                title="Conceder mais 30 dias de testes grátis"
                              >
                                +30d
                              </button>

                              {/* Tornar/Remover VIP */}
                              {u.is_vip ? (
                                <button
                                  type="button"
                                  onClick={() => handleUserAction(u.id, "revoke_vip")}
                                  className="px-2 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-900 text-[11px] font-semibold transition-colors cursor-pointer"
                                  title="Remover status VIP"
                                >
                                  Tirar VIP
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleUserAction(u.id, "grant_vip")}
                                  className="px-2 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-900 text-[11px] font-bold transition-colors cursor-pointer"
                                  title="Dar Acesso VIP Vitalício"
                                >
                                  VIP 👑
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─────── ABA 3: GERENCIADOR DE CUPONS ─────── */}
        {activeTab === "coupons" && (
          <div className="space-y-6 animate-fadeIn">
            {/* Formulário de Criação de Cupom */}
            <div className="bg-surface rounded-2xl border border-border/80 p-5 shadow-xs space-y-4">
              <div className="border-b border-border/40 pb-3 flex items-center justify-between">
                <h3 className="font-serif font-bold text-text text-sm flex items-center gap-2">
                  <Plus size={16} className="text-primary" />
                  Criar Novo Cupom Promocional
                </h3>
              </div>

              <form onSubmit={handleCreateCoupon} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 items-end">
                <div>
                  <label className="block text-xs font-semibold text-text mb-1">
                    Código do Cupom *
                  </label>
                  <input
                    type="text"
                    value={newCouponCode}
                    onChange={(e) => setNewCouponCode(e.target.value.toUpperCase())}
                    placeholder="Ex: HELLEN30"
                    required
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold text-text uppercase outline-hidden focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text mb-1">
                    Dias Grátis Concedidos *
                  </label>
                  <input
                    type="number"
                    value={newCouponDays}
                    onChange={(e) => setNewCouponDays(Number(e.target.value))}
                    min={1}
                    max={365}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-text outline-hidden focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text mb-1">
                    Limite Máximo de Usos
                  </label>
                  <input
                    type="number"
                    value={newCouponMaxUses}
                    onChange={(e) => setNewCouponMaxUses(e.target.value)}
                    placeholder="Vazio = Ilimitado"
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-text outline-hidden focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text mb-1">
                    Data de Validade
                  </label>
                  <input
                    type="date"
                    value={newCouponExpiresAt}
                    onChange={(e) => setNewCouponExpiresAt(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-text outline-hidden focus:border-primary"
                  />
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={couponSubmitting || !newCouponCode.trim()}
                    className="w-full py-2.5 px-4 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {couponSubmitting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        <Plus size={14} />
                        <span>Criar Cupom</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Tabela de Cupons Existentes */}
            <div className="bg-surface rounded-2xl border border-border/80 p-5 shadow-xs space-y-4">
              <div className="border-b border-border/40 pb-3 flex items-center justify-between">
                <h3 className="font-serif font-bold text-text text-sm flex items-center gap-2">
                  <Tag size={16} className="text-primary" />
                  Cupons Cadastrados ({coupons.length})
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border/60 text-text-muted uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">Código</th>
                      <th className="py-2.5 px-3">Benefício</th>
                      <th className="py-2.5 px-3">Usos / Limite</th>
                      <th className="py-2.5 px-3">Validade</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {coupons.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-text-muted">
                          Nenhum cupom cadastrado ainda.
                        </td>
                      </tr>
                    ) : (
                      coupons.map((c) => (
                        <tr key={c.id} className="hover:bg-background/60 transition-colors">
                          <td className="py-3 px-3">
                            <span className="font-mono font-bold text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-lg border border-primary/20">
                              {c.code}
                            </span>
                          </td>

                          <td className="py-3 px-3 font-semibold text-text">
                            +{c.trial_days} dias grátis
                          </td>

                          <td className="py-3 px-3">
                            <span className="font-bold text-text">{c.uses_count || 0}</span>
                            <span className="text-text-muted"> / {c.max_uses ? `${c.max_uses} usos` : "Ilimitado"}</span>
                          </td>

                          <td className="py-3 px-3 text-text-muted">
                            {c.expires_at ? new Date(c.expires_at).toLocaleDateString("pt-BR") : "Sem expiração"}
                          </td>

                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                c.active ? "bg-emerald-100 text-emerald-900" : "bg-stone-200 text-stone-700"
                              }`}
                            >
                              {c.active ? "Ativo" : "Inativo"}
                            </span>
                          </td>

                          <td className="py-3 px-3 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleToggleCoupon(c.id, c.active)}
                                className="px-2.5 py-1 rounded-lg bg-background hover:bg-surface border border-border text-[11px] font-semibold text-text transition-colors cursor-pointer"
                              >
                                {c.active ? "Desativar" : "Ativar"}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteCoupon(c.id, c.code)}
                                className="p-1 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Excluir Cupom"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ─────── ABA 4: RADAR DE RETENÇÃO (PREVENÇÃO DE CHURN) ─────── */}
        {activeTab === "churn" && (
          <div className="bg-surface rounded-2xl border border-border/80 p-5 shadow-xs space-y-4 animate-fadeIn">
            <div className="border-b border-border/40 pb-3 flex items-center justify-between">
              <div>
                <h3 className="font-serif font-bold text-text text-sm flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-600" />
                  Radar de Retenção & Conversão ({atRiskUsers.length} psicólogos em risco)
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Psicólogos em período de teste com prazo acabando ou que ainda não começaram a usar o sistema.
                </p>
              </div>
            </div>

            {atRiskUsers.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <CheckCircle2 size={32} className="mx-auto text-emerald-600" />
                <h4 className="font-serif font-bold text-text text-base">Tudo sob controle!</h4>
                <p className="text-xs text-text-muted max-w-sm mx-auto">
                  Nenhum psicólogo em teste está em risco de abandono no momento.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {atRiskUsers.map((u) => {
                  const rawPhone = (u.telefone || "").replace(/\D/g, "");
                  const msg = `Olá Dr(a). ${u.nome || ""}, tudo bem? Vi que você criou sua conta no PsiSetting! Precisa de alguma ajuda para cadastrar seus primeiros pacientes ou configurar seus laudos? Estou à disposição!`;
                  const whatsappLink = rawPhone ? `https://wa.me/55${rawPhone}?text=${encodeURIComponent(msg)}` : null;

                  return (
                    <div key={u.id} className="p-4 rounded-xl bg-background border border-amber-500/30 space-y-3 relative shadow-2xs">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-text text-xs">{u.nome || "Sem Nome"}</p>
                          <p className="text-[11px] text-text-muted truncate max-w-[200px]">{u.email}</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 shrink-0">
                          {u.trialDaysLeft}d restantes
                        </span>
                      </div>

                      <div className="text-[11px] text-text-muted space-y-1 border-t border-border/40 pt-2">
                        <p>
                          Pacientes cadastrados: <strong className="text-text">{u.totalPatients}</strong>
                        </p>
                        <p>
                          Telefone: <strong>{u.telefone || "Não cadastrado"}</strong>
                        </p>
                      </div>

                      <div className="pt-1 flex items-center gap-2">
                        {whatsappLink ? (
                          <a
                            href={whatsappLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-1.5 shadow-2xs"
                          >
                            <MessageCircle size={14} />
                            <span>Chamar no WhatsApp</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-text-muted italic flex-1 text-center">
                            Sem WhatsApp cadastrado
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleUserAction(u.id, "extend_trial", 7)}
                          className="px-3 py-2 rounded-xl bg-surface border border-border text-text hover:bg-background text-xs font-semibold transition-colors cursor-pointer"
                          title="Dar +7 dias grátis para incentivar"
                        >
                          +7d
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─────── ABA 5: COMUNICADOS GLOBAIS (BROADCAST) ─────── */}
        {activeTab === "announcements" && (
          <div className="space-y-6 animate-fadeIn">
            {/* Formulário de Novo Comunicado */}
            <div className="bg-surface rounded-2xl border border-border/80 p-5 shadow-xs space-y-4">
              <div className="border-b border-border/40 pb-3 flex items-center justify-between">
                <h3 className="font-serif font-bold text-text text-sm flex items-center gap-2">
                  <Radio size={16} className="text-primary" />
                  Publicar Novo Comunicado no Topo do App
                </h3>
              </div>

              <form onSubmit={handleCreateAnnouncement} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-text mb-1">
                      Título do Comunicado *
                    </label>
                    <input
                      type="text"
                      value={newAnnTitle}
                      onChange={(e) => setNewAnnTitle(e.target.value)}
                      placeholder="Ex: ✨ Nova Atualização de Laudos CFP"
                      required
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-text outline-hidden focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text mb-1">
                      Tipo / Cor do Banner
                    </label>
                    <select
                      value={newAnnType}
                      onChange={(e: any) => setNewAnnType(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-semibold text-text outline-hidden focus:border-primary"
                    >
                      <option value="info">🔵 Informação Geral (Azul)</option>
                      <option value="success">🟢 Novidade / Recurso (Verde)</option>
                      <option value="warning">🟡 Alerta / Manutenção (Âmbar)</option>
                      <option value="tip">🌾 Dica do Setting (Sálvia)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text mb-1">
                    Mensagem Completa *
                  </label>
                  <textarea
                    value={newAnnMessage}
                    onChange={(e) => setNewAnnMessage(e.target.value)}
                    placeholder="Escreva a mensagem curta que aparecerá na barra superior de todos os usuários..."
                    rows={2}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-text outline-hidden focus:border-primary resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-text mb-1">
                      Link Opcional de Destino
                    </label>
                    <input
                      type="text"
                      value={newAnnLinkUrl}
                      onChange={(e) => setNewAnnLinkUrl(e.target.value)}
                      placeholder="Ex: https://psisetting.com.br/novidades"
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-text outline-hidden focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text mb-1">
                      Texto do Botão do Link
                    </label>
                    <input
                      type="text"
                      value={newAnnLinkLabel}
                      onChange={(e) => setNewAnnLinkLabel(e.target.value)}
                      placeholder="Ex: Saiba Mais"
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-text outline-hidden focus:border-primary"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={annSubmitting || !newAnnTitle.trim() || !newAnnMessage.trim()}
                    className="py-2.5 px-5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-all flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {annSubmitting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        <Radio size={14} />
                        <span>Publicar Comunicado</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Lista de Comunicados */}
            <div className="bg-surface rounded-2xl border border-border/80 p-5 shadow-xs space-y-4">
              <div className="border-b border-border/40 pb-3 flex items-center justify-between">
                <h3 className="font-serif font-bold text-text text-sm flex items-center gap-2">
                  <BellRing size={16} className="text-primary" />
                  Histórico de Comunicados ({announcements.length})
                </h3>
              </div>

              <div className="space-y-3">
                {announcements.length === 0 ? (
                  <p className="py-8 text-center text-xs text-text-muted">
                    Nenhum comunicado criado ainda.
                  </p>
                ) : (
                  announcements.map((a) => (
                    <div key={a.id} className="p-4 rounded-xl bg-background border border-border/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${a.active ? "bg-emerald-100 text-emerald-900" : "bg-stone-200 text-stone-700"}`}>
                            {a.active ? "No Ar (Ativo)" : "Oculto (Inativo)"}
                          </span>
                          <span className="font-bold text-xs text-text">{a.title}</span>
                        </div>
                        <p className="text-xs text-text-muted leading-relaxed">{a.message}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleAnnouncement(a.id, a.active)}
                          className="px-3 py-1.5 rounded-xl bg-surface border border-border text-xs font-semibold text-text hover:bg-background transition-colors cursor-pointer"
                        >
                          {a.active ? "Desativar" : "Ativar no Topo"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAnnouncement(a.id)}
                          className="p-1.5 rounded-xl text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Remover Comunicado"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─────── ABA 6: CENTRAL DE FEEDBACKS ─────── */}
        {activeTab === "feedbacks" && (
          <div className="bg-surface rounded-2xl border border-border/80 p-5 shadow-xs space-y-4 animate-fadeIn">
            {/* Header com Filtros */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-border/40 pb-4">
              <div>
                <h3 className="font-serif font-bold text-text text-sm flex items-center gap-2">
                  <Lightbulb size={16} className="text-primary" />
                  Caixa de Entrada de Sugestões & Feedbacks ({feedbacks.length})
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Mensagens e avaliações enviadas diretamente pelos psicólogos.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={feedbackCategoryFilter}
                  onChange={(e) => setFeedbackCategoryFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-background border border-border text-xs font-semibold text-text outline-hidden"
                >
                  <option value="all">Todas Categorias</option>
                  <option value="sugestao">💡 Sugestões</option>
                  <option value="problema">🐛 Problemas</option>
                  <option value="duvida">💬 Dúvidas</option>
                  <option value="elogio">❤️ Elogios</option>
                </select>

                <select
                  value={feedbackStatusFilter}
                  onChange={(e) => setFeedbackStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-background border border-border text-xs font-semibold text-text outline-hidden"
                >
                  <option value="all">Todos os Status</option>
                  <option value="pending">🟡 Pendente</option>
                  <option value="in_review">🔵 Em Análise</option>
                  <option value="planned">🟣 Planejado</option>
                  <option value="resolved">🟢 Concluído</option>
                </select>
              </div>
            </div>

            {/* Lista de Feedbacks */}
            <div className="space-y-3.5">
              {feedbacks.length === 0 ? (
                <div className="py-12 text-center text-xs text-text-muted space-y-2">
                  <Heart size={28} className="mx-auto text-primary/40" />
                  <p>Nenhum feedback recebido com esses filtros.</p>
                </div>
              ) : (
                feedbacks.map((f) => {
                  const categoryLabels: Record<string, { label: string; bg: string; text: string }> = {
                    sugestao: { label: "Sugestão", bg: "bg-amber-100", text: "text-amber-900" },
                    problema: { label: "Bug / Problema", bg: "bg-rose-100", text: "text-rose-900" },
                    duvida: { label: "Dúvida", bg: "bg-blue-100", text: "text-blue-900" },
                    elogio: { label: "Elogio", bg: "bg-emerald-100", text: "text-emerald-900" },
                  };

                  const cat = categoryLabels[f.category] || categoryLabels.sugestao;

                  return (
                    <div key={f.id} className="p-4 rounded-2xl bg-background border border-border/80 space-y-3 shadow-2xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${cat.bg} ${cat.text}`}>
                            {cat.label}
                          </span>
                          <span className="font-bold text-xs text-text">{f.user_name || "Psicólogo(a)"}</span>
                          <span className="text-[11px] text-text-muted">({f.user_email})</span>
                        </div>

                        <div className="flex items-center gap-2">
                          {f.rating && (
                            <div className="flex items-center text-amber-400">
                              {Array.from({ length: f.rating }).map((_, i) => (
                                <Star key={i} size={12} className="fill-amber-400" />
                              ))}
                            </div>
                          )}
                          <span className="text-[11px] text-text-muted">
                            {f.created_at ? new Date(f.created_at).toLocaleDateString("pt-BR") : ""}
                          </span>
                        </div>
                      </div>

                      {f.subject && (
                        <p className="text-xs font-bold text-text">{f.subject}</p>
                      )}

                      <p className="text-xs text-text leading-relaxed whitespace-pre-wrap bg-surface p-3 rounded-xl border border-border/60">
                        {f.message}
                      </p>

                      {/* Ações de Triagem */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/40">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-text-muted font-medium">Status:</span>
                          <select
                            value={f.status}
                            onChange={(e) => handleUpdateFeedback(f.id, e.target.value)}
                            className="px-2.5 py-1 rounded-lg bg-surface border border-border text-xs font-semibold text-text outline-hidden"
                          >
                            <option value="pending">🟡 Pendente</option>
                            <option value="in_review">🔵 Em Análise</option>
                            <option value="planned">🟣 Planejado / Na Fila</option>
                            <option value="resolved">🟢 Concluído / Implementado</option>
                            <option value="archived">⚪ Arquivar</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-2">
                          <a
                            href={`mailto:${f.user_email}?subject=${encodeURIComponent(`PsiSetting - Resposta ao seu feedback`)}`}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-surface border border-border text-[11px] font-semibold text-text hover:bg-background transition-colors"
                          >
                            <Send size={12} />
                            <span>Responder por E-mail</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
