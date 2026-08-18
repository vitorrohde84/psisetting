"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { decryptClinicalData } from "@/utils/crypto";
import {
  ArrowLeft,
  Pencil,
  Phone,
  Mail,
  MapPin,
  Calendar,
  UserCheck,
  UserX,
  Clock,
  Video,
  FileText,
  BookOpen,
  FileCheck,
  DollarSign,
  AlertCircle,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { PacienteFormModal } from "@/app/components/paciente-form-modal";
import type { Paciente } from "@/app/components/paciente-list";

interface PacienteDetailClientProps {
  pacienteId: string;
}

type TabKey =
  | "agendamentos"
  | "prontuarios"
  | "diario"
  | "laudos"
  | "financeiro";

const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "agendamentos", label: "Agendamentos", icon: Calendar },
  { key: "prontuarios", label: "Prontuários", icon: FileText },
  { key: "diario", label: "Diário de Bordo", icon: BookOpen },
  { key: "laudos", label: "Laudos", icon: FileCheck },
  { key: "financeiro", label: "Financeiro", icon: DollarSign },
];

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("pt-BR");
}

function formatTime(timeStr: string) {
  return timeStr.slice(0, 5);
}

function formatCPF(cpf: string | null) {
  if (!cpf) return "—";
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatPhone(phone: string | null) {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function calcAge(dateStr: string | null) {
  if (!dateStr) return null;
  const birth = new Date(dateStr + "T00:00:00");
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function PacienteDetailClient({ pacienteId }: PacienteDetailClientProps) {
  const router = useRouter();
  const supabase = createClient();

  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("agendamentos");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Tab data
  const [agendamentos, setAgendamentos] = useState<any[]>([]);
  const [prontuarios, setProntuarios] = useState<any[]>([]);
  const [diario, setDiario] = useState<any[]>([]);
  const [laudos, setLaudos] = useState<any[]>([]);
  const [pagamentos, setPagamentos] = useState<any[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  const fetchPaciente = useCallback(async () => {
    const { data, error } = await supabase
      .from("pacientes")
      .select("*")
      .eq("id", pacienteId)
      .single();

    if (error || !data) {
      router.push("/pacientes");
      return;
    }
    setPaciente(data);
    setLoading(false);
  }, [pacienteId]);

  useEffect(() => {
    fetchPaciente();
  }, [fetchPaciente]);

  // Fetch tab data
  const fetchTabData = useCallback(
    async (tab: TabKey) => {
      setTabLoading(true);

      switch (tab) {
        case "agendamentos": {
          const { data } = await supabase
            .from("agendamentos")
            .select("id, data, horario, modalidade, status, observacoes")
            .eq("paciente_id", pacienteId)
            .order("data", { ascending: false })
            .order("horario", { ascending: false })
            .limit(50);
          setAgendamentos(data || []);
          break;
        }
        case "prontuarios": {
          const { data: { user } } = await supabase.auth.getUser();
          const { data } = await supabase
            .from("prontuarios")
            .select("id, data, conteudo, created_at")
            .eq("paciente_id", pacienteId)
            .order("data", { ascending: false })
            .limit(50);
          if (data && user) {
            const decrypted = await Promise.all(
              data.map(async (p) => ({
                ...p,
                conteudo: await decryptClinicalData(p.conteudo, user.id),
              }))
            );
            setProntuarios(decrypted);
          } else {
            setProntuarios(data || []);
          }
          break;
        }
        case "diario": {
          // Only fetch metadata, not the sensitive content (per SPEC.md)
          const { data } = await supabase
            .from("diario_bordo")
            .select("id, data, created_at")
            .eq("paciente_id", pacienteId)
            .order("data", { ascending: false })
            .limit(50);
          setDiario(data || []);
          break;
        }
        case "laudos": {
          const { data } = await supabase
            .from("laudos")
            .select("id, titulo, tipo_documento, data_emissao, created_at")
            .eq("paciente_id", pacienteId)
            .order("data_emissao", { ascending: false })
            .limit(50);
          setLaudos(data || []);
          break;
        }
        case "financeiro": {
          const { data } = await supabase
            .from("pagamentos")
            .select("id, valor, data_vencimento, status, forma_pagamento, created_at")
            .eq("paciente_id", pacienteId)
            .order("data_vencimento", { ascending: false })
            .limit(50);
          setPagamentos(data || []);
          break;
        }
      }

      setTabLoading(false);
    },
    [pacienteId]
  );

  useEffect(() => {
    if (!loading) {
      fetchTabData(activeTab);
    }
  }, [activeTab, loading, fetchTabData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <svg className="animate-spin h-6 w-6 text-primary" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!paciente) return null;

  const age = calcAge(paciente.data_nascimento);

  return (
    <>
      {/* Back link */}
      <Link
        href="/pacientes"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text mb-5 transition-colors"
      >
        <ArrowLeft size={16} />
        Voltar para pacientes
      </Link>

      {/* Header card */}
      <div className="bg-surface rounded-xl border border-border/60 p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 shrink-0">
              <span className="text-lg font-serif font-bold text-primary">
                {paciente.nome
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-serif font-semibold text-text sensitive-data">
                  {paciente.nome}
                </h2>
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    paciente.ativo
                      ? "bg-success/10 text-success"
                      : "bg-text-muted/10 text-text-muted"
                  }`}
                >
                  {paciente.ativo ? "Ativo" : "Inativo"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm text-text-muted">
                {paciente.cpf && (
                  <span className="sensitive-data">CPF: {formatCPF(paciente.cpf)}</span>
                )}
                {paciente.data_nascimento && (
                  <span>
                    {formatDate(paciente.data_nascimento)}
                    {age !== null && ` (${age} anos)`}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowDeleteModal(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl
                         bg-danger/10 border border-transparent text-sm font-medium text-danger
                         hover:bg-danger/20 active:scale-[0.98] transition-all duration-200 cursor-pointer"
            >
              <Trash2 size={15} />
              <span className="hidden sm:inline">Excluir</span>
            </button>
            <button
              onClick={() => setShowEditModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl
                         bg-background border border-border text-sm font-medium text-text
                         hover:border-primary/30 hover:bg-primary/[0.03]
                         active:scale-[0.98] transition-all duration-200 cursor-pointer"
            >
              <Pencil size={15} />
              Editar
            </button>
          </div>
        </div>

        {/* Contact info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5 pt-5 border-t border-border/40">
          {paciente.telefone && (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Phone size={14} className="shrink-0 text-text-muted/60" />
              <span className="sensitive-data">{formatPhone(paciente.telefone)}</span>
            </div>
          )}
          {paciente.email && (
            <div className="flex items-center gap-2 text-sm text-text-muted min-w-0">
              <Mail size={14} className="shrink-0 text-text-muted/60" />
              <span className="truncate sensitive-data">{paciente.email}</span>
            </div>
          )}
          {paciente.endereco && (
            <div className="flex items-center gap-2 text-sm text-text-muted min-w-0 sm:col-span-2">
              <MapPin size={14} className="shrink-0 text-text-muted/60" />
              <span className="truncate sensitive-data">{paciente.endereco}</span>
            </div>
          )}
          {paciente.contato_emergencia && (
            <div className="flex items-center gap-2 text-sm text-text-muted min-w-0 sm:col-span-2">
              <AlertCircle size={14} className="shrink-0 text-text-muted/60" />
              <span className="truncate sensitive-data">Emergência: {paciente.contato_emergencia}</span>
            </div>
          )}
        </div>

        {/* Observações */}
        {paciente.observacoes_gerais && (
          <div className="mt-4 pt-4 border-t border-border/40">
            <p className="text-xs font-medium text-text-muted mb-1">Observações</p>
            <p className="text-sm text-text whitespace-pre-wrap">
              {paciente.observacoes_gerais}
            </p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-surface rounded-xl border border-border/60 overflow-hidden">
        {/* Tab bar */}
        <div className="flex overflow-x-auto border-b border-border/40 bg-background/40">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap
                           border-b-2 transition-all cursor-pointer shrink-0
                           ${
                             active
                               ? "border-primary text-primary"
                               : "border-transparent text-text-muted hover:text-text hover:border-border"
                           }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="p-4 min-h-[200px]">
          {tabLoading ? (
            <div className="flex items-center justify-center py-12">
              <svg
                className="animate-spin h-5 w-5 text-primary"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : (
            <>
              {/* Agendamentos tab */}
              {activeTab === "agendamentos" && (
                <TabAgendamentos items={agendamentos} />
              )}

              {/* Prontuários tab */}
              {activeTab === "prontuarios" && (
                <TabProntuarios items={prontuarios} />
              )}

              {/* Diário de Bordo tab */}
              {activeTab === "diario" && <TabDiario items={diario} />}

              {/* Laudos tab */}
              {activeTab === "laudos" && <TabLaudos items={laudos} />}

              {/* Financeiro tab */}
              {activeTab === "financeiro" && (
                <TabFinanceiro items={pagamentos} />
              )}
            </>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {showEditModal && (
        <PacienteFormModal
          paciente={paciente}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            setShowEditModal(false);
            fetchPaciente();
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-text/20 backdrop-blur-sm" 
            onClick={() => !isDeleting && setShowDeleteModal(false)} 
          />
          <div className="relative w-full max-w-md bg-surface rounded-2xl shadow-xl border border-border/60 p-6">
            <h3 className="text-lg font-serif font-medium text-text mb-2">
              Excluir paciente
            </h3>
            <p className="text-sm text-text-muted mb-6">
              Tem certeza que deseja excluir <strong className="text-text">{paciente.nome}</strong>? Esta ação apagará todos os prontuários, laudos e agendamentos vinculados e não pode ser desfeita.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-sm font-medium text-text-muted hover:bg-background transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  setIsDeleting(true);
                  await supabase.from("pacientes").delete().eq("id", paciente.id);
                  router.push("/pacientes");
                }}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-danger text-white text-sm font-medium hover:bg-danger/90 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? "Excluindo..." : "Sim, excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ───────── Tab Components ───────── */

function EmptyTab({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon size={28} className="text-border mb-2" />
      <p className="text-sm text-text-muted">{message}</p>
    </div>
  );
}

function TabAgendamentos({ items }: { items: any[] }) {
  if (items.length === 0)
    return <EmptyTab icon={Calendar} message="Nenhum agendamento encontrado" />;

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="divide-y divide-border/30">
      {items.map((ag) => {
        const isPast = ag.data < todayStr;
        return (
          <div key={ag.id} className="flex items-center gap-4 py-3 px-1">
            <div className={`w-10 text-center rounded-lg py-1 ${isPast ? "bg-background" : "bg-primary/8"}`}>
              <p className={`text-xs font-medium ${isPast ? "text-text-muted" : "text-primary"}`}>
                {new Date(ag.data + "T00:00:00").toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                })}
              </p>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-text">{formatTime(ag.horario)}</span>
                {ag.modalidade && (
                  <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                    {ag.modalidade === "online" ? <Video size={11} /> : <MapPin size={11} />}
                    {ag.modalidade === "online" ? "Online" : "Presencial"}
                  </span>
                )}
              </div>
              {ag.observacoes && (
                <p className="text-xs text-text-muted mt-0.5 truncate">{ag.observacoes}</p>
              )}
            </div>
            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                ag.status === "confirmado"
                  ? "bg-success/10 text-success"
                  : ag.status === "cancelado"
                  ? "bg-danger/10 text-danger"
                  : ag.status === "realizado"
                  ? "bg-secondary/10 text-secondary"
                  : "bg-background text-text-muted"
              }`}
            >
              {ag.status?.charAt(0).toUpperCase() + ag.status?.slice(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TabProntuarios({ items }: { items: any[] }) {
  if (items.length === 0)
    return <EmptyTab icon={FileText} message="Nenhum prontuário registrado" />;

  return (
    <div className="divide-y divide-border/30">
      {items.map((pron) => (
        <div key={pron.id} className="py-3 px-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text">
              Sessão de {formatDate(pron.data)}
            </span>
            <span className="text-xs text-text-muted">
              {formatDate(pron.created_at?.split("T")[0])}
            </span>
          </div>
          {pron.conteudo && (
            <p className="text-sm text-text-muted mt-1 line-clamp-2">{pron.conteudo}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function TabDiario({ items }: { items: any[] }) {
  if (items.length === 0)
    return <EmptyTab icon={BookOpen} message="Nenhuma entrada no diário" />;

  return (
    <>
      {/* SPEC.md: confidentiality warning */}
      <div className="flex items-center gap-2 p-3 mb-3 rounded-xl bg-primary/5 border border-primary/15">
        <ShieldAlert size={16} className="text-primary shrink-0" />
        <p className="text-xs text-primary font-medium">
          Conteúdo confidencial — uso exclusivo do profissional
        </p>
      </div>

      <div className="divide-y divide-border/30">
        {items.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between py-3 px-1">
            <span className="text-sm text-text">
              Sessão de {formatDate(entry.data)}
            </span>
            <span className="text-xs text-text-muted">
              {formatDate(entry.created_at?.split("T")[0])}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function TabLaudos({ items }: { items: any[] }) {
  if (items.length === 0)
    return <EmptyTab icon={FileCheck} message="Nenhum laudo registrado" />;

  return (
    <div className="divide-y divide-border/30">
      {items.map((laudo) => (
        <div key={laudo.id} className="py-3 px-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text">
              {laudo.titulo || "Laudo sem título"}
            </span>
            <span className="text-xs text-text-muted">
              {formatDate(laudo.data_emissao)}
            </span>
          </div>
          {laudo.tipo_documento && (
            <span className="text-xs text-text-muted">{laudo.tipo_documento}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function TabFinanceiro({ items }: { items: any[] }) {
  if (items.length === 0)
    return <EmptyTab icon={DollarSign} message="Nenhum pagamento registrado" />;

  const todayStr = new Date().toISOString().split("T")[0];
  const total = items.reduce((sum, p) => sum + (p.valor || 0), 0);
  const totalPago = items
    .filter((p) => p.status === "pago")
    .reduce((sum, p) => sum + (p.valor || 0), 0);
  const totalPendente = items
    .filter((p) => p.status === "pendente")
    .reduce((sum, p) => sum + (p.valor || 0), 0);

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-background rounded-lg p-3 text-center">
          <p className="text-xs text-text-muted mb-0.5">Total</p>
          <p className="text-sm font-semibold text-text sensitive-data">{formatCurrency(total)}</p>
        </div>
        <div className="bg-background rounded-lg p-3 text-center">
          <p className="text-xs text-text-muted mb-0.5">Recebido</p>
          <p className="text-sm font-semibold text-success sensitive-data">{formatCurrency(totalPago)}</p>
        </div>
        <div className="bg-background rounded-lg p-3 text-center">
          <p className="text-xs text-text-muted mb-0.5">Pendente</p>
          <p className="text-sm font-semibold text-danger sensitive-data">{formatCurrency(totalPendente)}</p>
        </div>
      </div>

      <div className="divide-y divide-border/30">
        {items.map((pag) => {
          const vencido = pag.status === "pendente" && pag.data_vencimento < todayStr;
          return (
            <div key={pag.id} className="flex items-center justify-between py-3 px-1">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text">
                    {formatDate(pag.data_vencimento)}
                  </span>
                  {vencido && <AlertCircle size={13} className="text-danger" />}
                </div>
                {pag.forma_pagamento && (
                  <span className="text-xs text-text-muted capitalize">
                    {pag.forma_pagamento}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-text sensitive-data">
                  {formatCurrency(pag.valor || 0)}
                </span>
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    pag.status === "pago"
                      ? "bg-success/10 text-success"
                      : pag.status === "pendente"
                      ? vencido
                        ? "bg-danger/10 text-danger"
                        : "bg-primary/10 text-primary"
                      : "bg-text-muted/10 text-text-muted"
                  }`}
                >
                  {pag.status === "pago"
                    ? "Pago"
                    : pag.status === "pendente"
                    ? vencido
                      ? "Vencido"
                      : "Pendente"
                    : pag.status?.charAt(0).toUpperCase() + pag.status?.slice(1)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
