"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { X, Save, Loader2, Search } from "lucide-react";

interface Prontuario {
  id: string;
  paciente_id: string;
  agendamento_id: string | null;
  data: string;
  conteudo: string;
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
  prefillData?: {
    paciente_id: string;
    data: string;
    agendamento_id?: string;
  };
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
  const [error, setError] = useState<string | null>(null);

  // Patients
  const [pacientes, setPacientes] = useState<PacienteOption[]>([]);
  const [pacienteSearch, setPacienteSearch] = useState("");
  const [showPacienteDropdown, setShowPacienteDropdown] = useState(false);
  const [selectedPacienteName, setSelectedPacienteName] = useState("");

  // Agendamentos
  const [agendamentos, setAgendamentos] = useState<AgendamentoOption[]>([]);
  const [loadingAgendamentos, setLoadingAgendamentos] = useState(false);

  // Fetch initial patients
  useEffect(() => {
    async function fetchPacientes() {
      const { data } = await supabase
        .from("pacientes")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome", { ascending: true });
      
      setPacientes(data || []);

      const pIdToFind = prontuario?.paciente_id || prefillData?.paciente_id;
      if (pIdToFind && data) {
        const found = data.find((p) => p.id === pIdToFind);
        if (found) setSelectedPacienteName(found.nome);
      }
    }
    fetchPacientes();
  }, []);

  // Fetch agendamentos when patient changes
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
  }, [form.paciente_id]);

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

    const payload = {
      paciente_id: form.paciente_id,
      agendamento_id: form.agendamento_id || null,
      data: form.data,
      conteudo: form.conteudo.trim(),
    };

    let result;
    if (isEditing) {
      result = await supabase
        .from("prontuarios")
        .update(payload)
        .eq("id", prontuario.id);
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Sessão expirada. Faça login novamente.");
        setSaving(false);
        return;
      }

      result = await supabase
        .from("prontuarios")
        .insert({ ...payload, });
    }

    if (result.error) {
      setError("Não foi possível salvar o prontuário. Tente novamente.");
      console.error(result.error);
      setSaving(false);
      return;
    }

    onSaved();
  }

  const inputClass =
    "w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-text text-sm " +
    "placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 " +
    "focus:border-primary/40 transition-all";
  const labelClass = "block text-sm font-medium text-text-muted mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-text/20 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col bg-surface rounded-2xl shadow-xl border border-border/60">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 shrink-0">
          <div>
            <h3 className="text-lg font-serif font-medium text-text">
              {isEditing ? "Editar Prontuário" : "Novo Prontuário"}
            </h3>
            <p className="text-xs text-text-muted mt-0.5">Evolução clínica do paciente</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-background transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Paciente */}
            <div className="relative">
              <label className={labelClass}>
                Paciente <span className="text-danger">*</span>
              </label>
              {selectedPacienteName && !showPacienteDropdown ? (
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-background border border-border">
                  <span className="text-sm text-text">{selectedPacienteName}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPacienteName("");
                      setForm((prev) => ({ ...prev, paciente_id: "", agendamento_id: "" }));
                      setShowPacienteDropdown(true);
                    }}
                    className="text-text-muted hover:text-text transition-colors cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/50" size={16} />
                    <input
                      type="text"
                      placeholder="Buscar paciente..."
                      autoFocus={!isEditing}
                      value={pacienteSearch}
                      onChange={(e) => {
                        setPacienteSearch(e.target.value);
                        setShowPacienteDropdown(true);
                      }}
                      onFocus={() => setShowPacienteDropdown(true)}
                      className={inputClass + " pl-9"}
                    />
                  </div>
                  {showPacienteDropdown && (
                    <div className="absolute z-20 w-full mt-1 max-h-48 overflow-y-auto bg-surface rounded-xl border border-border shadow-lg">
                      {filteredPacientes.length === 0 ? (
                        <p className="px-3.5 py-3 text-sm text-text-muted">Nenhum paciente encontrado</p>
                      ) : (
                        filteredPacientes.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => selectPaciente(p)}
                            className="w-full text-left px-3.5 py-2.5 text-sm text-text hover:bg-background transition-colors cursor-pointer"
                          >
                            {p.nome}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Agendamento vinculado */}
            <div>
              <label className={labelClass}>Vincular a Agendamento (Opcional)</label>
              <select
                disabled={!form.paciente_id || loadingAgendamentos}
                value={form.agendamento_id}
                onChange={handleAgendamentoChange}
                className={inputClass}
              >
                <option value="">-- Sem vínculo específico --</option>
                {agendamentos.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {new Date(ag.data + "T12:00:00").toLocaleDateString("pt-BR")} às {ag.horario.slice(0, 5)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Data da Sessão <span className="text-danger">*</span>
            </label>
            <input
              type="date"
              required
              value={form.data}
              onChange={(e) => setForm((prev) => ({ ...prev, data: e.target.value }))}
              className={inputClass + " md:max-w-[200px]"}
            />
          </div>

          <div>
            <label className={labelClass}>
              Evolução Clínica / Resumo <span className="text-danger">*</span>
            </label>
            <textarea
              required
              rows={12}
              value={form.conteudo}
              onChange={(e) => setForm((prev) => ({ ...prev, conteudo: e.target.value }))}
              placeholder="Descreva o andamento da sessão, evolução do paciente, intervenções..."
              className={inputClass + " font-serif text-base leading-relaxed resize-none"}
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-danger/5 border border-danger/15">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-text-muted
                         hover:bg-background transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                         bg-primary text-white text-sm font-medium
                         hover:bg-primary-dark active:scale-[0.98]
                         disabled:opacity-60 disabled:cursor-not-allowed
                         transition-all duration-200 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Salvando…
                </>
              ) : (
                <>
                  <Save size={16} />
                  {isEditing ? "Salvar alterações" : "Registrar prontuário"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
