"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { X, Save, Loader2, Search, ShieldCheck } from "lucide-react";
import { encryptClinicalData, decryptClinicalData } from "@/utils/crypto";

interface Prontuario {
  id: string;
  data: string;
  conteudo: string;
  paciente_id: string;
  agendamento_id: string | null;
}

interface PacienteOption {
  id: string;
  nome: string;
}

interface AgendamentoOption {
  id: string;
  data: string;
  horario: string;
}

interface ProntuarioFormModalProps {
  prontuario: Prontuario | null;
  prefillData?: { paciente_id?: string; data?: string; agendamento_id?: string };
  onClose: () => void;
  onSaved: () => void;
}

export function ProntuarioFormModal({
  prontuario,
  prefillData,
  onClose,
  onSaved,
}: ProntuarioFormModalProps) {
  const isEditing = !!prontuario;
  const supabase = createClient();

  const [form, setForm] = useState({
    paciente_id: prontuario?.paciente_id || prefillData?.paciente_id || "",
    agendamento_id: prontuario?.agendamento_id || prefillData?.agendamento_id || "",
    data: prontuario?.data || prefillData?.data || new Date().toISOString().split("T")[0],
    conteudo: prontuario?.conteudo || "",
  });

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Patients
  const [pacientes, setPacientes] = useState<PacienteOption[]>([]);
  const [pacienteSearch, setPacienteSearch] = useState("");
  const [showPacienteDropdown, setShowPacienteDropdown] = useState(false);
  const [selectedPacienteName, setSelectedPacienteName] = useState("");

  // Agendamentos
  const [agendamentos, setAgendamentos] = useState<AgendamentoOption[]>([]);
  const [loadingAgendamentos, setLoadingAgendamentos] = useState(false);

  useEffect(() => {
    async function initModal() {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: pacData } = await supabase
        .from("pacientes")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome", { ascending: true });
      
      let list: PacienteOption[] = [];
      if (pacData && user) {
        list = await Promise.all(
          pacData.map(async (p) => ({
            id: p.id,
            nome: await decryptClinicalData(p.nome, user.id),
          }))
        );
        list.sort((a, b) => a.nome.localeCompare(b.nome));
      }
      setPacientes(list);

      const targetId = prontuario?.paciente_id || prefillData?.paciente_id;
      if (targetId && list.length > 0) {
        const found = list.find((p) => p.id === targetId);
        if (found) setSelectedPacienteName(found.nome);
      }

      // Se for edição, descriptografa o conteúdo
      if (prontuario?.conteudo && user) {
        const dec = await decryptClinicalData(prontuario.conteudo, user.id);
        setForm((prev) => ({ ...prev, conteudo: dec }));
      }
    }
    initModal();
    // `supabase` vem de createBrowserClient, que no navegador é sempre a mesma
    // instância: estar na lista não refaz a carga.
  }, [prontuario, prefillData, supabase]);

  useEffect(() => {
    async function fetchAgendamentos() {
      if (!form.paciente_id) {
        setAgendamentos([]);
        return;
      }
      setLoadingAgendamentos(true);
      const { data } = await supabase
        .from("agendamentos")
        .select("id, data, horario")
        .eq("paciente_id", form.paciente_id)
        .order("data", { ascending: false })
        .limit(20);
      
      setAgendamentos(data || []);
      setLoadingAgendamentos(false);
    }
    fetchAgendamentos();
  }, [form.paciente_id, supabase]);

  const filteredPacientes = pacienteSearch
    ? pacientes.filter((p) =>
        p.nome.toLowerCase().includes(pacienteSearch.toLowerCase())
      )
    : pacientes;

  function selectPaciente(p: PacienteOption) {
    setForm((prev) => ({ ...prev, paciente_id: p.id, agendamento_id: "" }));
    setSelectedPacienteName(p.nome);
    setPacienteSearch("");
    setShowPacienteDropdown(false);
  }

  function handleAgendamentoChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    const ag = agendamentos.find((a) => a.id === val);
    setForm((prev) => ({
      ...prev,
      agendamento_id: val,
      data: ag ? ag.data : prev.data,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.paciente_id) {
      setError("Selecione um paciente.");
      return;
    }
    if (!form.data) {
      setError("Informe a data da sessão.");
      return;
    }
    if (!form.conteudo.trim()) {
      setError("O conteúdo do prontuário não pode estar vazio.");
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Sessão expirada. Faça login novamente.");
      setSaving(false);
      return;
    }

    // Criptografa o conteúdo clínico do prontuário antes de salvar
    const encryptedConteudo = await encryptClinicalData(form.conteudo.trim(), user.id);

    const payload = {
      paciente_id: form.paciente_id,
      agendamento_id: form.agendamento_id || null,
      data: form.data,
      conteudo: encryptedConteudo,
    };

    let result;
    if (isEditing) {
      result = await supabase
        .from("prontuarios")
        .update(payload)
        .eq("id", prontuario.id);
    } else {
      result = await supabase
        .from("prontuarios")
        .insert({ ...payload, psicologo_id: user.id });
    }

    if (result.error) {
      setError("Não foi possível salvar o prontuário. Tente novamente.");
      console.error(result.error);
      setSaving(false);
      return;
    }

    onSaved();
  }

  async function handleDelete() {
    if (!prontuario) return;
    if (!confirm("Tem certeza que deseja excluir esta evolução de prontuário?")) return;
    
    setDeleting(true);
    setError(null);

    const { error } = await supabase
      .from("prontuarios")
      .delete()
      .eq("id", prontuario.id);

    if (error) {
      console.error("Erro ao excluir prontuário:", error);
      setError("Não foi possível excluir o prontuário.");
      setDeleting(false);
      return;
    }

    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <h3 className="font-serif font-semibold text-lg text-text">
              {isEditing ? "Editar Evolução de Prontuário" : "Nova Evolução Clínica"}
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20 flex items-center gap-0.5">
              <ShieldCheck size={10} /> Criptografado
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text p-1 rounded-lg hover:bg-background transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger text-sm">
              {error}
            </div>
          )}

          {/* Paciente Selector */}
          <div className="relative">
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
              Paciente *
            </label>
            {selectedPacienteName ? (
              <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-background">
                <span className="text-sm font-medium text-text">
                  {selectedPacienteName}
                </span>
                {!isEditing && !prefillData && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPacienteName("");
                      setForm((prev) => ({ ...prev, paciente_id: "", agendamento_id: "" }));
                    }}
                    className="text-xs text-primary hover:underline cursor-pointer"
                  >
                    Trocar
                  </button>
                )}
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/50"
                    size={16}
                  />
                  <input
                    type="text"
                    placeholder="Buscar paciente..."
                    value={pacienteSearch}
                    onChange={(e) => {
                      setPacienteSearch(e.target.value);
                      setShowPacienteDropdown(true);
                    }}
                    onFocus={() => setShowPacienteDropdown(true)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-background border border-border text-text text-sm focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>

                {showPacienteDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-surface border border-border rounded-xl shadow-lg z-20">
                    {filteredPacientes.length === 0 ? (
                      <div className="p-3 text-xs text-text-muted text-center">
                        Nenhum paciente encontrado.
                      </div>
                    ) : (
                      filteredPacientes.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => selectPaciente(p)}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-primary/5 text-text hover:text-primary transition-colors cursor-pointer"
                        >
                          {p.nome}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Data */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                Data do Atendimento *
              </label>
              <input
                type="date"
                required
                value={form.data}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, data: e.target.value }))
                }
                className="w-full p-2.5 rounded-xl bg-background border border-border text-text text-sm focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            {/* Agendamento Link (Optional) */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                Vincular Agendamento
              </label>
              <select
                value={form.agendamento_id}
                onChange={handleAgendamentoChange}
                disabled={!form.paciente_id || loadingAgendamentos}
                className="w-full p-2.5 rounded-xl bg-background border border-border text-text text-sm focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-50"
              >
                <option value="">Nenhum (avulso)</option>
                {agendamentos.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {new Date(ag.data + "T00:00:00").toLocaleDateString("pt-BR")} às {ag.horario.slice(0, 5)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Conteúdo */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5 flex items-center justify-between">
              <span>Evolução Clínica e Intervenções *</span>
              <span className="text-[10px] text-text-muted font-normal lowercase">Cifrado com AES-256</span>
            </label>
            <textarea
              required
              rows={8}
              placeholder="Descreva a evolução clínica, técnicas utilizadas, resposta do paciente às intervenções e planejamento terapêutico..."
              value={form.conteudo}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, conteudo: e.target.value }))
              }
              className="w-full p-3.5 rounded-xl bg-background border border-border text-text text-sm focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all resize-none leading-relaxed font-serif"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            {isEditing ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="text-xs text-danger hover:underline disabled:opacity-50 cursor-pointer"
              >
                {deleting ? "Excluindo..." : "Excluir evolução"}
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving || deleting}
                className="px-4 py-2 rounded-xl text-sm font-medium text-text-muted hover:bg-background transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || deleting}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-dark active:scale-[0.98] transition-all disabled:opacity-60 cursor-pointer shadow-xs"
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Salvando Seguro…</span>
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    <span>Salvar Evolução</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
