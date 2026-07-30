import { createClient } from "@/utils/supabase/server";
import {
  Calendar,
  Clock,
  DollarSign,
  UserPlus,
  CalendarPlus,
  MapPin,
  Video,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";

// Format date to readable Brazilian format
function formatDate(dateStr: string) {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

// Format time HH:MM
function formatTime(timeStr: string) {
  return timeStr.slice(0, 5);
}

// Format currency
function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default async function DashboardPage() {
  const supabase = await createClient();

  // Get current date in Brasilia timezone
  const now = new Date();
  const brasiliaOffset = -3 * 60;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const brasiliaDate = new Date(utcMs + brasiliaOffset * 60000);
  const todayStr = brasiliaDate.toISOString().split("T")[0];

  // Current month boundaries
  const year = brasiliaDate.getFullYear();
  const month = brasiliaDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).toISOString().split("T")[0];
  const lastDayOfMonth = new Date(year, month + 1, 0).toISOString().split("T")[0];

  // Query 1: Próximas sessões (next 7 days, max 8)
  const sevenDaysLater = new Date(brasiliaDate);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
  const sevenDaysStr = sevenDaysLater.toISOString().split("T")[0];

  const { data: proximasSessoes } = await supabase
    .from("agendamentos")
    .select("id, data, horario, modalidade, status, pacientes(nome)")
    .gte("data", todayStr)
    .lte("data", sevenDaysStr)
    .in("status", ["confirmado", "agendado"])
    .order("data", { ascending: true })
    .order("horario", { ascending: true })
    .limit(8);

  // Query 2: Pagamentos pendentes do mês
  const { data: pagamentosPendentes } = await supabase
    .from("pagamentos")
    .select("id, valor, data_vencimento, pacientes(nome)")
    .gte("data_vencimento", firstDayOfMonth)
    .lte("data_vencimento", lastDayOfMonth)
    .eq("status", "pendente")
    .order("data_vencimento", { ascending: true });

  const totalPendente =
    pagamentosPendentes?.reduce((sum, p) => sum + (p.valor || 0), 0) || 0;
  const qtdPendentes = pagamentosPendentes?.length || 0;

  // Count today's sessions
  const sessoesHoje =
    proximasSessoes?.filter((s) => s.data === todayStr).length || 0;

  // Month name
  const monthName = brasiliaDate.toLocaleDateString("pt-BR", { month: "long" });

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h2 className="text-2xl font-serif font-semibold text-text">
          Boas-vindas
        </h2>
        <p className="mt-1 text-text-muted">
          {brasiliaDate.toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-surface rounded-xl border border-border/60 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Calendar size={14} className="text-primary" />
            <span className="text-xs text-text-muted">Hoje</span>
          </div>
          <p className="text-2xl font-semibold text-text">{sessoesHoje}</p>
          <p className="text-xs text-text-muted">
            {sessoesHoje === 1 ? "sessão" : "sessões"}
          </p>
        </div>
        <div className="bg-surface rounded-xl border border-border/60 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={14} className="text-secondary" />
            <span className="text-xs text-text-muted">Próximos 7 dias</span>
          </div>
          <p className="text-2xl font-semibold text-text">
            {proximasSessoes?.length || 0}
          </p>
          <p className="text-xs text-text-muted">agendamentos</p>
        </div>
        <div className="bg-surface rounded-xl border border-border/60 p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={14} className="text-danger" />
            <span className="text-xs text-text-muted">Pendentes</span>
          </div>
          <p className="text-2xl font-semibold text-text">{qtdPendentes}</p>
          <p className="text-xs text-text-muted">em {monthName}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border/60 p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={14} className="text-primary" />
            <span className="text-xs text-text-muted">Total pendente</span>
          </div>
          <p className="text-2xl font-semibold text-text">
            {formatCurrency(totalPendente)}
          </p>
          <p className="text-xs text-text-muted">no mês</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: Próximas sessões */}
        <div className="lg:col-span-2 bg-surface rounded-xl border border-border/60">
          <div className="flex items-center justify-between p-5 pb-3 border-b border-border/40">
            <div className="flex items-center gap-2.5">
              <Calendar size={18} className="text-primary" />
              <h3 className="text-base font-serif font-medium text-text">
                Próximas sessões
              </h3>
            </div>
            <span className="text-xs text-text-muted bg-background px-2.5 py-1 rounded-full">
              7 dias
            </span>
          </div>

          <div className="p-2">
            {!proximasSessoes || proximasSessoes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Calendar size={32} className="text-border mb-3" />
                <p className="text-sm text-text-muted">
                  Nenhuma sessão nos próximos 7 dias
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {proximasSessoes.map((sessao) => {
                  const pacienteNome =
                    (sessao.pacientes as { nome?: string })
                      ?.nome || "Paciente";
                  const isToday = sessao.data === todayStr;

                  return (
                    <div
                      key={sessao.id}
                      className={`flex items-center gap-4 px-3 py-3 rounded-lg transition-colors
                        ${isToday ? "bg-primary/[0.03]" : "hover:bg-background/60"}`}
                    >
                      {/* Date badge */}
                      <div
                        className={`shrink-0 w-12 text-center rounded-lg py-1.5
                          ${isToday ? "bg-primary/10" : "bg-background"}`}
                      >
                        <p
                          className={`text-xs font-medium ${
                            isToday ? "text-primary" : "text-text-muted"
                          }`}
                        >
                          {isToday ? "Hoje" : formatDate(sessao.data).split(",")[0]}
                        </p>
                        <p
                          className={`text-sm font-semibold ${
                            isToday ? "text-primary" : "text-text"
                          }`}
                        >
                          {new Date(sessao.data + "T00:00:00").getDate()}
                        </p>
                      </div>

                      {/* Session info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text truncate">
                          {pacienteNome}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-text-muted">
                            {formatTime(sessao.horario)}
                          </span>
                          {sessao.modalidade && (
                            <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                              {sessao.modalidade === "online" ? (
                                <Video size={11} />
                              ) : (
                                <MapPin size={11} />
                              )}
                              {sessao.modalidade === "online"
                                ? "Online"
                                : "Presencial"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Status badge */}
                      <span
                        className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full
                          ${
                            sessao.status === "confirmado"
                              ? "bg-success/10 text-success"
                              : "bg-secondary/10 text-secondary"
                          }`}
                      >
                        {sessao.status === "confirmado" ? "Confirmado" : "Agendado"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Card 2: Pagamentos pendentes */}
          <div className="bg-surface rounded-xl border border-border/60">
            <div className="flex items-center justify-between p-5 pb-3 border-b border-border/40">
              <div className="flex items-center gap-2.5">
                <DollarSign size={18} className="text-primary" />
                <h3 className="text-base font-serif font-medium text-text">
                  Pendências
                </h3>
              </div>
              <span className="text-xs text-text-muted bg-background px-2.5 py-1 rounded-full capitalize">
                {monthName}
              </span>
            </div>

            <div className="p-4">
              {qtdPendentes === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <DollarSign size={28} className="text-border mb-2" />
                  <p className="text-sm text-text-muted">
                    Nenhum pagamento pendente
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2.5 mb-4">
                    {pagamentosPendentes?.slice(0, 5).map((pag) => {
                      const pacNome =
                        (pag.pacientes as { nome?: string })
                          ?.nome || "Paciente";
                      const vencido =
                        pag.data_vencimento && pag.data_vencimento < todayStr;

                      return (
                        <div
                          key={pag.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm text-text truncate">
                              {pacNome}
                            </p>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-text-muted">
                                Venc.{" "}
                                {new Date(
                                  pag.data_vencimento + "T00:00:00"
                                ).toLocaleDateString("pt-BR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                })}
                              </span>
                              {vencido && (
                                <AlertCircle
                                  size={12}
                                  className="text-danger"
                                />
                              )}
                            </div>
                          </div>
                          <span
                            className={`text-sm font-medium shrink-0 ${
                              vencido ? "text-danger" : "text-text"
                            }`}
                          >
                            {formatCurrency(pag.valor || 0)}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Total */}
                  <div className="pt-3 border-t border-border/40 flex items-center justify-between">
                    <span className="text-xs text-text-muted font-medium">
                      Total ({qtdPendentes}{" "}
                      {qtdPendentes === 1 ? "pendência" : "pendências"})
                    </span>
                    <span className="text-sm font-semibold text-primary">
                      {formatCurrency(totalPendente)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Card 3: Ações rápidas */}
          <div className="bg-surface rounded-xl border border-border/60 p-5">
            <h3 className="text-base font-serif font-medium text-text mb-4">
              Ações rápidas
            </h3>
            <div className="space-y-2.5">
              <Link
                href="/agenda"
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl
                           bg-primary text-white text-sm font-medium
                           hover:bg-primary-dark active:scale-[0.98]
                           transition-all duration-200"
              >
                <CalendarPlus size={18} />
                Novo Agendamento
              </Link>
              <Link
                href="/pacientes"
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl
                           bg-background border border-border text-text text-sm font-medium
                           hover:border-primary/30 hover:bg-primary/[0.03]
                           active:scale-[0.98]
                           transition-all duration-200"
              >
                <UserPlus size={18} />
                Novo Paciente
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
