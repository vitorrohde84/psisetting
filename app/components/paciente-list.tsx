"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { decryptClinicalData } from "@/utils/crypto";
import { useSubscription } from "@/utils/subscription-context";
import { Search, UserPlus, Phone, MoreVertical, Eye, Pencil, X, Trash2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";

const PacienteFormModal = dynamic(
  () => import("./paciente-form-modal").then((m) => m.PacienteFormModal),
  { ssr: false }
);

export interface Paciente {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  data_nascimento: string | null;
  endereco: string | null;
  contato_emergencia: string | null;
  observacoes_gerais: string | null;
  ativo: boolean;
  psicologo_id: string;
  created_at: string;
}

function formatCPF(cpf: string | null) {
  if (!cpf) return "—";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhone(phone: string | null) {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export function PacienteList() {
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [filteredPacientes, setFilteredPacientes] = useState<Paciente[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPaciente, setEditingPaciente] = useState<Paciente | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingPaciente, setDeletingPaciente] = useState<Paciente | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const supabase = createClient();
  const { isReadOnly, openSubscriptionModal } = useSubscription();

  const fetchPacientes = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("pacientes")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      if (user) {
        const decrypted = await Promise.all(
          data.map(async (p) => ({
            ...p,
            nome: await decryptClinicalData(p.nome, user.id),
            cpf: await decryptClinicalData(p.cpf, user.id),
            telefone: await decryptClinicalData(p.telefone, user.id),
          }))
        );
        decrypted.sort((a, b) => a.nome.localeCompare(b.nome));
        setPacientes(decrypted);
        setFilteredPacientes(decrypted);
      } else {
        setPacientes(data);
        setFilteredPacientes(data);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPacientes();
  }, [fetchPacientes]);

  // Real-time search
  useEffect(() => {
    if (!search.trim()) {
      setFilteredPacientes(pacientes);
      return;
    }

    const query = search.toLowerCase().replace(/\D/g, "") || search.toLowerCase();
    const queryText = search.toLowerCase();

    setFilteredPacientes(
      pacientes.filter((p) => {
        const nameMatch = p.nome.toLowerCase().includes(queryText);
        const cpfMatch = p.cpf
          ? p.cpf.replace(/\D/g, "").includes(query) || p.cpf.toLowerCase().includes(queryText)
          : false;
        return nameMatch || cpfMatch;
      })
    );
  }, [search, pacientes]);

  function handleEdit(paciente: Paciente) {
    setEditingPaciente(paciente);
    setShowModal(true);
    setOpenMenuId(null);
  }

  function handleNew() {
    if (isReadOnly) {
      openSubscriptionModal();
      return;
    }
    setEditingPaciente(null);
    setShowModal(true);
  }

  function handleModalClose() {
    setShowModal(false);
    setEditingPaciente(null);
  }

  async function handleSaved() {
    setShowModal(false);
    setEditingPaciente(null);
    await fetchPacientes();
  }

  const ativos = pacientes.filter((p) => p.ativo).length;
  const inativos = pacientes.filter((p) => !p.ativo).length;

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-serif font-semibold text-text">Pacientes</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            {pacientes.length} {pacientes.length === 1 ? "paciente" : "pacientes"} cadastrados
            <span className="mx-1.5">·</span>
            <span className="text-success">{ativos} ativos</span>
            {inativos > 0 && (
              <>
                <span className="mx-1.5">·</span>
                <span className="text-text-muted">{inativos} inativos</span>
              </>
            )}
          </p>
        </div>
        <button
          onClick={handleNew}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl
                     bg-primary text-white text-sm font-medium
                     hover:bg-primary-dark active:scale-[0.98]
                     transition-all duration-200 cursor-pointer shrink-0"
        >
          <UserPlus size={18} />
          Novo Paciente
        </button>
      </div>

      {/* Search bar */}
      <div className="relative mb-5">
        <Search
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted/50"
          size={18}
        />
        <input
          type="text"
          placeholder="Buscar por nome ou CPF..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-surface border border-border
                     text-text placeholder:text-text-muted/50
                     focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40
                     transition-all text-sm"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted/50 hover:text-text-muted
                       transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* List */}
      <div className="bg-surface rounded-xl border border-border/60">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <svg className="animate-spin h-6 w-6 text-primary" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm text-text-muted">Carregando pacientes...</p>
            </div>
          </div>
        ) : filteredPacientes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6 max-w-md mx-auto space-y-4">
            {search ? (
              <>
                <Search size={32} className="text-border mb-1" />
                <p className="text-sm text-text-muted">
                  Nenhum paciente encontrado para &ldquo;{search}&rdquo;
                </p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-3xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-2xs">
                  <UserPlus size={28} />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-serif font-bold text-text">
                    Boas-vindas ao seu consultório digital!
                  </h3>
                  <p className="text-xs text-text-muted leading-relaxed">
                    Dê o primeiro passo cadastrando seu primeiro paciente. Seus registros contam com criptografia clínica individual e conformidade CFP.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleNew}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-all cursor-pointer shadow-md hover:shadow-lg"
                >
                  <UserPlus size={15} />
                  <span>Cadastrar Primeiro Paciente</span>
                </button>
                <div className="inline-flex items-center gap-1.5 text-[11px] text-text-muted/70 pt-1">
                  <ShieldCheck size={13} className="text-primary" />
                  <span>Conformidade com a Resolução CFP nº 06/2019</span>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Table header - desktop */}
            <div className="hidden sm:grid grid-cols-[1fr_140px_100px_100px_48px] gap-4 px-5 py-3 bg-background/60 border-b border-border/40 text-xs font-medium text-text-muted uppercase tracking-wider rounded-t-xl">
              <span>Nome</span>
              <span>Telefone</span>
              <span>CPF</span>
              <span>Status</span>
              <span></span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border/30">
              {filteredPacientes.map((paciente, idx) => (
                <div
                  key={paciente.id}
                  className={`group relative sm:grid sm:grid-cols-[1fr_140px_100px_100px_48px] sm:gap-4
                             flex flex-col gap-1.5
                             px-5 py-3.5 hover:bg-background/40 transition-colors
                             ${idx === filteredPacientes.length - 1 ? 'rounded-b-[11px]' : ''}`}
                >
                  {/* Nome */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/8 shrink-0">
                      <span className="text-xs font-semibold text-primary">
                        {paciente.nome
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                    </div>
                    <Link
                      href={`/pacientes/${paciente.id}`}
                      className="text-sm font-medium text-text hover:text-primary truncate transition-colors sensitive-data"
                    >
                      {paciente.nome}
                    </Link>
                  </div>

                  {/* Telefone */}
                  <div className="flex items-center gap-1.5 sm:gap-0 text-sm text-text-muted pl-11 sm:pl-0 sensitive-data">
                    <Phone size={13} className="sm:hidden text-text-muted/50" />
                    {formatPhone(paciente.telefone)}
                  </div>

                  {/* CPF - desktop only */}
                  <div className="hidden sm:flex items-center text-sm text-text-muted font-mono text-xs sensitive-data">
                    {formatCPF(paciente.cpf)}
                  </div>

                  {/* Status */}
                  <div className="flex items-center pl-11 sm:pl-0">
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

                  {/* Actions */}
                  <div className="absolute right-4 top-3 sm:static sm:flex sm:items-center sm:justify-end">
                    <button
                      onClick={() =>
                        setOpenMenuId(openMenuId === paciente.id ? null : paciente.id)
                      }
                      className="p-1.5 rounded-lg text-text-muted/50 hover:text-text-muted hover:bg-background
                                 transition-colors cursor-pointer"
                      aria-label="Ações"
                    >
                      <MoreVertical size={16} />
                    </button>

                    {/* Dropdown */}
                    {openMenuId === paciente.id && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setOpenMenuId(null)}
                        />
                        <div className="absolute right-4 sm:right-0 top-10 z-20 w-44 bg-surface rounded-xl border border-border shadow-lg py-1.5">
                          <Link
                            href={`/pacientes/${paciente.id}`}
                            onClick={() => setOpenMenuId(null)}
                            className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-text hover:bg-background transition-colors"
                          >
                            <Eye size={15} />
                            Ver detalhes
                          </Link>
                          <button
                            onClick={() => handleEdit(paciente)}
                            className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-text hover:bg-background transition-colors w-full cursor-pointer"
                          >
                            <Pencil size={15} />
                            Editar
                          </button>
                          <button
                            onClick={() => {
                              setDeletingPaciente(paciente);
                              setOpenMenuId(null);
                            }}
                            className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-danger hover:bg-danger/5 transition-colors w-full cursor-pointer"
                          >
                            <Trash2 size={15} />
                            Excluir
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <PacienteFormModal
          paciente={editingPaciente}
          onClose={handleModalClose}
          onSaved={handleSaved}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingPaciente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-text/20 backdrop-blur-sm" 
            onClick={() => !isDeleting && setDeletingPaciente(null)} 
          />
          <div className="relative w-full max-w-md bg-surface rounded-2xl shadow-xl border border-border/60 p-6">
            <h3 className="text-lg font-serif font-medium text-text mb-2">
              Excluir paciente
            </h3>
            <p className="text-sm text-text-muted mb-6">
              Tem certeza que deseja excluir <strong className="text-text sensitive-data">{deletingPaciente.nome}</strong>? Esta ação apagará todos os prontuários, laudos e agendamentos vinculados e não pode ser desfeita.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeletingPaciente(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-sm font-medium text-text-muted hover:bg-background transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  setIsDeleting(true);
                  await supabase.from("pacientes").delete().eq("id", deletingPaciente.id);
                  setDeletingPaciente(null);
                  setIsDeleting(false);
                  fetchPacientes();
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
