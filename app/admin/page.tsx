"use client";

import { useState, useEffect } from "react";
import { AdminSidebar, AdminTabType } from "./components/admin-sidebar";
import { UserDetailDrawer } from "./components/user-detail-drawer";
import { CouponModal } from "./components/coupon-modal";
import { AnnouncementModal } from "./components/announcement-modal";
import { FeedbackInboxView } from "./components/feedback-inbox-view";
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
  Download,
  Calendar,
  FileText,
  FileCheck,
  Heart,
  ChevronRight,
  Sparkles,
  Phone,
  Crown,
} from "lucide-react";

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<AdminTabType>("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Estados de Dados
  const [metrics, setMetrics] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);

  // Estados de Modais & Gavetas
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);

  // Filtros de Usuários
  const [userSearch, setUserSearch] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState("all");

  // Notificações Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }

  // Carregar Dados
  async function loadAllData() {
    try {
      setRefreshing(true);
      const [mRes, uRes, cRes, fRes, aRes] = await Promise.all([
        fetch("/api/admin/metrics"),
        fetch(`/api/admin/users?search=${encodeURIComponent(userSearch)}&status=${userStatusFilter}`),
        fetch("/api/admin/coupons"),
        fetch("/api/admin/feedbacks"),
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
  }, [userStatusFilter]);

  // Ações de Usuário (Estender Trial / VIP)
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
        if (data.deleted) {
          setSelectedUser(null);
        } else if (selectedUser && selectedUser.id === userId) {
          setSelectedUser((prev: any) => ({
            ...prev,
            ...data.updates,
          }));
        }
      } else {
        alert(data.error || "Erro ao executar ação.");
      }
    } catch (err) {
      alert("Falha de conexão.");
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

  const atRiskUsers = users.filter((u) => u.isAtRisk);

  return (
    <div className="flex min-h-screen bg-background text-text">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[200] bg-surface text-text text-xs px-4 py-3 rounded-2xl shadow-2xl border border-border flex items-center gap-2.5 animate-in slide-in-from-bottom-5">
          <CheckCircle2 size={16} className="text-primary shrink-0" />
          <span className="font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* ───────── 1. SIDEBAR ADMINISTRATIVA LATERAL ───────── */}
      <AdminSidebar
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        counts={{
          users: users.length,
          coupons: coupons.length,
          atRisk: atRiskUsers.length,
          announcements: announcements.length,
          feedbacks: feedbacks.filter((f) => f.status === "pending").length,
        }}
      />

      {/* ───────── 2. ÁREA DE CONTEÚDO PRINCIPAL ───────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Spacer mobile */}
        <div className="lg:hidden h-14 shrink-0" />

        {/* Top bar suave com atualização */}
        <header className="px-6 sm:px-8 py-5 border-b border-border/60 flex items-center justify-between gap-4 bg-surface/50">
          <div>
            <h1 className="font-serif font-bold text-lg sm:text-xl text-text">
              {activeTab === "overview" && "Visão Geral & Inteligência SaaS"}
              {activeTab === "users" && "Gestão de Psicólogos & Clientes"}
              {activeTab === "coupons" && "Gerenciador de Cupons & Campanhas"}
              {activeTab === "churn" && "Radar de Retenção & Apoio Ativo"}
              {activeTab === "announcements" && "Comunicados & Mural de Avisos"}
              {activeTab === "feedbacks" && "Central de Feedbacks & Sugestões"}
            </h1>
            <p className="text-xs text-text-muted">
              {activeTab === "overview" && "Métricas em tempo real de faturamento, crescimento e engajamento clínico."}
              {activeTab === "users" && "Consulte contas cadastradas, gerencie acessos e ofereça suporte."}
              {activeTab === "coupons" && "Crie cupons promocionais com limites de uso e dias de teste."}
              {activeTab === "churn" && "Oportunidades de contato acolhedor no WhatsApp para multiplicar conversões."}
              {activeTab === "announcements" && "Avisos em destaque exibidos no topo do sistema para todos os usuários."}
              {activeTab === "feedbacks" && "Mensagens, relatos de bugs e sugestões enviadas pelos profissionais."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadAllData}
              disabled={refreshing}
              className="p-2 rounded-xl bg-surface border border-border text-text-muted hover:text-text hover:bg-background transition-all cursor-pointer shadow-2xs disabled:opacity-50"
              title="Atualizar dados em tempo real"
            >
              <RefreshCw size={15} className={refreshing ? "animate-spin text-primary" : ""} />
            </button>

            {activeTab === "coupons" && (
              <button
                type="button"
                onClick={() => setCouponModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-all shadow-xs cursor-pointer"
              >
                <Plus size={14} />
                <span>Novo Cupom</span>
              </button>
            )}

            {activeTab === "announcements" && (
              <button
                type="button"
                onClick={() => setAnnouncementModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-all shadow-xs cursor-pointer"
              >
                <Plus size={14} />
                <span>Novo Comunicado</span>
              </button>
            )}

            {activeTab === "users" && (
              <button
                type="button"
                onClick={handleExportUsersCSV}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface border border-border text-text hover:bg-background text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                title="Exportar Lista em CSV"
              >
                <Download size={14} />
                <span className="hidden sm:inline">Exportar CSV</span>
              </button>
            )}
          </div>
        </header>

        {/* Conteúdo da Aba Ativa */}
        <main className="flex-1 px-6 sm:px-8 py-6 max-w-7xl w-full mx-auto space-y-6">
          {/* ─────── TAB 1: VISÃO GERAL & MÉTRICAS ─────── */}
          {activeTab === "overview" && (
            <div className="space-y-6 animate-fadeIn">
              {/* 4 Cards de Topo Suaves */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-surface rounded-2xl p-5 border border-border/80 shadow-xs space-y-1.5">
                  <div className="flex items-center justify-between text-primary">
                    <span className="text-xs font-semibold">MRR (Receita Mensal)</span>
                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                      <DollarSign size={16} />
                    </div>
                  </div>
                  <p className="text-3xl font-serif font-bold text-text tracking-tight">
                    R$ {metrics?.finance?.mrr ? metrics.finance.mrr.toFixed(2).replace(".", ",") : "0,00"}
                  </p>
                  <p className="text-xs text-text-muted">
                    <strong>{metrics?.finance?.activeSubscribers || 0}</strong> assinantes ativos (R$ 34,90/mês)
                  </p>
                </div>

                <div className="bg-surface rounded-2xl p-5 border border-border/80 shadow-xs space-y-1.5">
                  <div className="flex items-center justify-between text-primary">
                    <span className="text-xs font-semibold">Base de Psicólogos</span>
                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                      <Users size={16} />
                    </div>
                  </div>
                  <p className="text-3xl font-serif font-bold text-text tracking-tight">
                    {metrics?.users?.total || 0}
                  </p>
                  <p className="text-xs text-text-muted">
                    +{metrics?.users?.newLast7Days || 0} novos nos últimos 7 dias
                  </p>
                </div>

                <div className="bg-surface rounded-2xl p-5 border border-border/80 shadow-xs space-y-1.5">
                  <div className="flex items-center justify-between text-primary">
                    <span className="text-xs font-semibold">Em Testes (7 Dias)</span>
                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                      <Clock size={16} />
                    </div>
                  </div>
                  <p className="text-3xl font-serif font-bold text-text tracking-tight">
                    {metrics?.users?.activeTrials || 0}
                  </p>
                  <p className="text-xs text-text-muted">
                    Taxa de Conversão: <strong>{metrics?.users?.conversionRate || 0}%</strong>
                  </p>
                </div>

                <div
                  onClick={() => setActiveTab("churn")}
                  className="bg-surface rounded-2xl p-5 border border-border/80 shadow-xs space-y-1.5 cursor-pointer hover:border-amber-500/40 transition-all group"
                >
                  <div className="flex items-center justify-between text-amber-800">
                    <span className="text-xs font-semibold">Radar de Retenção</span>
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-700 group-hover:scale-105 transition-transform">
                      <AlertTriangle size={16} />
                    </div>
                  </div>
                  <p className="text-3xl font-serif font-bold text-amber-900 tracking-tight">
                    {atRiskUsers.length}
                  </p>
                  <p className="text-xs text-text-muted group-hover:text-amber-800 transition-colors">
                    Psicólogos para apoiar no WhatsApp →
                  </p>
                </div>
              </div>

              {/* Grid 2 Colunas: Status das Contas & Engajamento Clínico */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Distribuição da Base */}
                <div className="bg-surface rounded-2xl border border-border/80 p-6 space-y-4 shadow-xs">
                  <h3 className="font-serif font-bold text-text text-sm flex items-center gap-2 border-b border-border/40 pb-3">
                    <ShieldCheck size={16} className="text-primary" />
                    Distribuição da Base de Usuários
                  </h3>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/70">
                      <div className="flex items-center gap-2.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <span className="font-semibold text-text">Assinantes Pagantes</span>
                      </div>
                      <span className="font-bold text-text font-serif text-sm">
                        {metrics?.finance?.activeSubscribers || 0}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/70">
                      <div className="flex items-center gap-2.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                        <span className="font-semibold text-text">Em Período de Testes (Trial)</span>
                      </div>
                      <span className="font-bold text-text font-serif text-sm">
                        {metrics?.users?.activeTrials || 0}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/70">
                      <div className="flex items-center gap-2.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                        <span className="font-semibold text-text">Acesso VIP / Cortesia</span>
                      </div>
                      <span className="font-bold text-text font-serif text-sm">
                        {metrics?.users?.vips || 0}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/70">
                      <div className="flex items-center gap-2.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                        <span className="font-semibold text-text">Testes Expirados (Modo Leitura)</span>
                      </div>
                      <span className="font-bold text-text font-serif text-sm">
                        {metrics?.users?.expiredTrials || 0}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Engajamento Clínico */}
                <div className="bg-surface rounded-2xl border border-border/80 p-6 space-y-4 shadow-xs">
                  <h3 className="font-serif font-bold text-text text-sm flex items-center gap-2 border-b border-border/40 pb-3">
                    <TrendingUp size={16} className="text-primary" />
                    Engajamento Clínico Global
                  </h3>

                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="p-4 rounded-xl bg-background border border-border/80 space-y-1">
                      <Users size={18} className="mx-auto text-primary" />
                      <p className="text-2xl font-serif font-bold text-text">
                        {metrics?.engagement?.totalPacientes || 0}
                      </p>
                      <p className="text-xs text-text-muted">Pacientes Gerenciados</p>
                    </div>

                    <div className="p-4 rounded-xl bg-background border border-border/80 space-y-1">
                      <FileText size={18} className="mx-auto text-primary" />
                      <p className="text-2xl font-serif font-bold text-text">
                        {metrics?.engagement?.totalProntuarios || 0}
                      </p>
                      <p className="text-xs text-text-muted">Evoluções Clínicas</p>
                    </div>

                    <div className="p-4 rounded-xl bg-background border border-border/80 space-y-1">
                      <FileCheck size={18} className="mx-auto text-primary" />
                      <p className="text-2xl font-serif font-bold text-text">
                        {metrics?.engagement?.totalLaudos || 0}
                      </p>
                      <p className="text-xs text-text-muted">Documentos CFP</p>
                    </div>

                    <div className="p-4 rounded-xl bg-background border border-border/80 space-y-1">
                      <Calendar size={18} className="mx-auto text-primary" />
                      <p className="text-2xl font-serif font-bold text-text">
                        {metrics?.engagement?.totalAgendamentos || 0}
                      </p>
                      <p className="text-xs text-text-muted">Sessões Agendadas</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─────── TAB 2: GESTÃO DE PSICÓLOGOS (CARDS & DRAWER) ─────── */}
          {activeTab === "users" && (
            <div className="bg-surface rounded-2xl border border-border/80 p-6 space-y-5 shadow-xs animate-fadeIn">
              {/* Barra de Busca e Filtros */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-border/40 pb-4">
                <div className="relative flex-1 max-w-md">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Buscar por nome, email, telefone ou CRP..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-background border border-border text-xs text-text focus:border-primary outline-hidden"
                  />
                </div>

                <select
                  value={userStatusFilter}
                  onChange={(e) => setUserStatusFilter(e.target.value)}
                  className="px-3.5 py-2 rounded-xl bg-background border border-border text-xs font-semibold text-text outline-hidden"
                >
                  <option value="all">Todos os Status ({users.length})</option>
                  <option value="active">🟢 Assinantes Ativos</option>
                  <option value="trialing">🟡 Em Teste (Trial)</option>
                  <option value="expired">🔴 Testes Expirados</option>
                  <option value="vip">🟣 Acesso VIP</option>
                  <option value="risk">⚠️ Em Risco</option>
                </select>
              </div>

              {/* Lista Arejada de Usuários */}
              <div className="divide-y divide-border/40">
                {users.length === 0 ? (
                  <p className="py-12 text-center text-xs text-text-muted">
                    Nenhum psicólogo encontrado com esses filtros.
                  </p>
                ) : (
                  users.map((u) => {
                    const initials = (u.nome || "P")
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();

                    const statusBadges: Record<string, { label: string; bg: string }> = {
                      active: { label: "Assinante Ativo", bg: "bg-emerald-50 text-emerald-900 border-emerald-200" },
                      trialing: { label: `Trial (${u.trialDaysLeft}d)`, bg: "bg-blue-50 text-blue-900 border-blue-200" },
                      expired: { label: "Expirado (Leitura)", bg: "bg-amber-50 text-amber-900 border-amber-200" },
                      vip: { label: "Acesso VIP", bg: "bg-purple-50 text-purple-900 border-purple-200" },
                      past_due: { label: "Atrasado", bg: "bg-rose-50 text-rose-900 border-rose-200" },
                    };

                    const currentBadge = statusBadges[u.calculatedStatus] || statusBadges.trialing;

                    return (
                      <div
                        key={u.id}
                        onClick={() => setSelectedUser(u)}
                        className="py-3.5 px-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-background/50 rounded-xl transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0 group-hover:scale-105 transition-transform">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-xs text-text group-hover:text-primary transition-colors truncate">
                              {u.nome || "Sem Nome"}
                            </p>
                            <p className="text-[11px] text-text-muted truncate">{u.email}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right hidden sm:block text-xs">
                            <p className="font-semibold text-text">{u.totalPatients || 0} pacientes</p>
                            <p className="text-[10px] text-text-muted">
                              {u.created_at ? new Date(u.created_at).toLocaleDateString("pt-BR") : ""}
                            </p>
                          </div>

                          {u.is_admin || u.email === "vitorrohde84@gmail.com" ? (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-primary/20 bg-primary/10 text-primary">
                              Administrador
                            </span>
                          ) : (
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${currentBadge.bg}`}>
                              {currentBadge.label}
                            </span>
                          )}

                          <ChevronRight size={14} className="text-text-muted group-hover:translate-x-1 transition-transform" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ─────── TAB 3: GERENCIADOR DE CUPONS ─────── */}
          {activeTab === "coupons" && (
            <div className="bg-surface rounded-2xl border border-border/80 p-6 space-y-4 shadow-xs animate-fadeIn">
              <div className="border-b border-border/40 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="font-serif font-bold text-text text-sm">Cupons Promocionais Cadastrados</h3>
                  <p className="text-xs text-text-muted">Códigos de benefício para parcerias, eventos ou extensões de teste.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCouponModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-all cursor-pointer shadow-2xs"
                >
                  <Plus size={13} />
                  <span>Novo Cupom</span>
                </button>
              </div>

              <div className="divide-y divide-border/40">
                {coupons.length === 0 ? (
                  <p className="py-12 text-center text-xs text-text-muted">Nenhum cupom cadastrado ainda.</p>
                ) : (
                  coupons.map((c) => {
                    let benefitText = `+${c.trial_days || c.discount_value || 30} dias grátis de teste`;
                    if (c.discount_type === "percent") {
                      const finalPrice = Math.max(1, 34.9 - (34.9 * Number(c.discount_value)) / 100).toFixed(2).replace(".", ",");
                      benefitText = `${c.discount_value}% OFF (R$ ${finalPrice}/mês)`;
                    } else if (c.discount_type === "fixed") {
                      const finalPrice = Math.max(1, 34.9 - Number(c.discount_value)).toFixed(2).replace(".", ",");
                      benefitText = `R$ ${Number(c.discount_value).toFixed(2).replace(".", ",")} OFF (R$ ${finalPrice}/mês)`;
                    } else if (c.discount_type === "vip") {
                      benefitText = "Acesso VIP Vitalício (100% Grátis)";
                    }

                    return (
                      <div key={c.id} className="py-3.5 px-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-xs bg-primary/10 text-primary px-3 py-1 rounded-xl border border-primary/20">
                            {c.code}
                          </span>
                          <div>
                            <p className="font-semibold text-xs text-text">{benefitText}</p>
                            <p className="text-[11px] text-text-muted">
                              {c.uses_count || 0} resgatados {c.max_uses ? `de ${c.max_uses} disponíveis` : "(Ilimitado)"}
                            </p>
                          </div>
                        </div>

                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.active ? "bg-emerald-50 text-emerald-900 border border-emerald-200" : "bg-stone-100 text-stone-700"}`}>
                          {c.active ? "Ativo" : "Inativo"}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleToggleCoupon(c.id, c.active)}
                          className="px-2.5 py-1 rounded-lg bg-background hover:bg-surface border border-border text-xs font-semibold text-text transition-colors cursor-pointer"
                        >
                          {c.active ? "Pausar" : "Ativar"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteCoupon(c.id, c.code)}
                          className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Excluir Cupom"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                  })
                )}
              </div>
            </div>
          )}

          {/* ─────── TAB 4: RADAR DE RETENÇÃO (CHURN) ─────── */}
          {activeTab === "churn" && (
            <div className="bg-surface rounded-2xl border border-border/80 p-6 space-y-5 shadow-xs animate-fadeIn">
              <div className="border-b border-border/40 pb-3">
                <h3 className="font-serif font-bold text-text text-sm flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-600" />
                  Radar de Retenção & Prevenção de Churn ({atRiskUsers.length} psicólogos em risco)
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Psicólogos em período de teste que precisam de apoio no onboarding ou cujo teste vence em menos de 48h.
                </p>
              </div>

              {atRiskUsers.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <CheckCircle2 size={32} className="mx-auto text-primary" />
                  <h4 className="font-serif font-bold text-text text-base">Tudo fluindo perfeitamente!</h4>
                  <p className="text-xs text-text-muted max-w-sm mx-auto">
                    Nenhum psicólogo em teste está em risco de abandono no momento.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {atRiskUsers.map((u) => {
                    const rawPhone = (u.telefone || "").replace(/\D/g, "");
                    const msg = `Olá Dr(a). ${u.nome || ""}, tudo bem? Sou da equipe do PsiSetting! Vi que você começou seus testes no sistema e gostaria de saber se precisa de algum apoio para importar seus pacientes ou emitir seus laudos. Estou à disposição!`;
                    const whatsappLink = rawPhone ? `https://wa.me/55${rawPhone}?text=${encodeURIComponent(msg)}` : null;

                    return (
                      <div key={u.id} className="p-4 rounded-2xl bg-background/50 border border-amber-500/30 space-y-3 shadow-2xs">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-bold text-xs text-text">{u.nome || "Sem Nome"}</p>
                            <p className="text-[11px] text-text-muted truncate max-w-[180px]">{u.email}</p>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 shrink-0">
                            {u.trialDaysLeft}d restantes
                          </span>
                        </div>

                        <div className="text-xs text-text-muted space-y-0.5 border-t border-border/40 pt-2">
                          <p>Pacientes: <strong className="text-text">{u.totalPatients || 0}</strong></p>
                          <p>Contato: <strong>{u.telefone || "Não informado"}</strong></p>
                        </div>

                        <div className="pt-1 flex items-center gap-2">
                          {whatsappLink ? (
                            <a
                              href={whatsappLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-2xs"
                            >
                              <MessageCircle size={13} />
                              <span>Apoiar no WhatsApp</span>
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSelectedUser(u)}
                              className="flex-1 py-2 px-3 rounded-xl bg-surface border border-border text-text text-xs font-semibold hover:bg-background transition-colors"
                            >
                              Ver Detalhes
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleUserAction(u.id, "extend_trial", 7)}
                            className="px-3 py-2 rounded-xl bg-surface border border-border text-text hover:bg-background text-xs font-semibold transition-colors cursor-pointer"
                            title="Conceder +7 dias de testes grátis"
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

          {/* ─────── TAB 5: COMUNICADOS GLOBAIS ─────── */}
          {activeTab === "announcements" && (
            <div className="bg-surface rounded-2xl border border-border/80 p-6 space-y-4 shadow-xs animate-fadeIn">
              <div className="border-b border-border/40 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="font-serif font-bold text-text text-sm">Mural de Avisos & Comunicados</h3>
                  <p className="text-xs text-text-muted">Mensagens exibidas na barra superior de todos os usuários.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAnnouncementModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-all cursor-pointer shadow-2xs"
                >
                  <Plus size={13} />
                  <span>Novo Comunicado</span>
                </button>
              </div>

              <div className="divide-y divide-border/40">
                {announcements.length === 0 ? (
                  <p className="py-12 text-center text-xs text-text-muted">Nenhum comunicado criado ainda.</p>
                ) : (
                  announcements.map((a) => (
                    <div key={a.id} className="py-3.5 px-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${a.active ? "bg-emerald-50 text-emerald-900 border border-emerald-200" : "bg-stone-100 text-stone-700"}`}>
                            {a.active ? "No Ar (Ativo)" : "Oculto"}
                          </span>
                          <p className="font-bold text-xs text-text">{a.title}</p>
                        </div>
                        <p className="text-xs text-text-muted">{a.message}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleAnnouncement(a.id, a.active)}
                          className="px-3 py-1.5 rounded-xl bg-background border border-border text-xs font-semibold text-text hover:bg-surface transition-colors cursor-pointer"
                        >
                          {a.active ? "Ocultar" : "Ativar no Topo"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAnnouncement(a.id)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Remover Comunicado"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ─────── TAB 6: CENTRAL DE FEEDBACKS ─────── */}
          {activeTab === "feedbacks" && (
            <FeedbackInboxView
              feedbacks={feedbacks}
              onUpdateStatus={handleUpdateFeedback}
            />
          )}
        </main>
      </div>

      {/* ───────── MODAIS & GAVETAS ───────── */}
      <UserDetailDrawer
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
        onAction={handleUserAction}
      />

      <CouponModal
        isOpen={couponModalOpen}
        onClose={() => setCouponModalOpen(false)}
        onSuccess={() => {
          showToast("Cupom criado com sucesso!");
          loadAllData();
        }}
      />

      <AnnouncementModal
        isOpen={announcementModalOpen}
        onClose={() => setAnnouncementModalOpen(false)}
        onSuccess={() => {
          showToast("Comunicado publicado com sucesso!");
          loadAllData();
        }}
      />
    </div>
  );
}
