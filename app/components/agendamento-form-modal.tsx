"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { X, Save, Loader2, Search } from "lucide-react";
import type { Agendamento } from "./agenda-view";

interface AgendamentoFormModalProps {
  agendamento: Agendamento | null;
  prefillDate: string | null;
  onClose: () => void;
  onSaved: () => void;
}

interface PacienteOption {
  id: string;
  nome_completo: string;
}

interface FormData {
  paciente_id: string;
  data: string;
  horario: string;
  duracao_minutos: number;
  modalidade: string;
  status: string;
  observacoes: string;
}

export function AgendamentoFormModal({
  agendamento,
  prefillDate,
  onClose,
  onSaved,
}: AgendamentoFormModalProps) {
  const isEditing = !!agendamento;
  const supabase = createClient();

  const [form, setForm] = useState<FormData>({
    paciente_id: agendamento?.paciente_id || "",
    data: agendamento?.data || prefillDate || "",
    horario: agendamento?.horario?.slice(0, 5) || "",
    duracao_minutos: agendamento?.duracao_minutos || 50,
    modalidade: agendamento?.modalidade || "presencial",
    status: agendamento?.status || "agendado",
    observacoes: agendamento?.observacoes || "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Patient search
  const [pacientes, setPacientes] = useState<PacienteOption[]>([]);
  const [pacienteSearch, setPacienteSearch] = useState("");
  const [showPacienteDropdown, setShowPacienteDropdown] = useState(false);
  const [selectedPacienteName, setSelectedPacienteName] = useState("");

  // Fetch patients for dropdown
  useEffect(() => {
    async function fetchPacientes() {
      const { data } = await supabase
        .from("pacientes")
        .select("id, nome_completo")
        .eq("ativo", true)
        .order("nome_completo", { ascending: true });
      setPacientes(data || []);

      // If editing, find patient name
      if (agendamento?.paciente_id && data) {
        const found = data.find((p) => p.id === agendamento.paciente_id);
        if (found) setSelectedPacienteName(found.nome_completo);
      }
    }
    fetchPacientes();
  }, []);

  // Filter patients by search
  const filteredPacientes = pacienteSearch
    ? pacientes.filter((p) =>
        p.nome_completo.toLowerCase().includes(pacienteSearch.toLowerCase())
      )
    : pacientes;

  function selectPaciente(p: PacienteOption) {
    setForm((prev) => ({ ...prev, paciente_id: p.id }));
    setSelectedPacienteName(p.nome_completo);
    setPacienteSearch("");
    setShowPacienteDropdown(false);
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "number" ? parseInt(value) || 0 : value,
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
      setError("Informe a data.");
      return;
    }
    if (!form.horario) {
      setError("Informe o horário.");
      return;
    }

    setSaving(true);

    const payload = {
      paciente_id: form.paciente_id,
      data: form.data,
      horario: form.horario + ":00", // Ensure HH:MM:SS
      duracao_minutos: form.duracao_minutos,
      modalidade: form.modalidade || null,
      status: form.status,
      observacoes: form.observacoes.trim() || null,
    };

    let result;
    if (isEditing) {
      result = await supabase
        .from("agendamentos")
        .update(payload)
        .eq("id", agendamento.id);
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
        .from("agendamentos")
        .insert({ ...payload, psicologo_id: user.id });
    }

    if (result.error) {
      setError("Não foi possível salvar o agendamento. Tente novamente.");
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
      <div
        className="absolute inset-0 bg-text/20 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-xl border border-border/60">
        {/* Header */}
        <div className="sticky top-0 bg-surface flex items-center justify-between px-6 py-4 border-b border-border/40 z-10">
          <h3 className="text-lg font-serif font-medium text-text">
            {isEditing ? "Editar Agendamento" : "Novo Agendamento"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-background transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
                    setForm((prev) => ({ ...prev, paciente_id: "" }));
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
                          {p.nome_completo}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Data + Horário */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="ag-data" className={labelClass}>
                Data <span className="text-danger">*</span>
              </label>
              <input
                id="ag-data"
                name="data"
                type="date"
                required
                value={form.data}
                onChange={handleChange}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="ag-horario" className={labelClass}>
                Horário <span className="text-danger">*</span>
              </label>
              <input
                id="ag-horario"
                name="horario"
                type="time"
                required
                value={form.horario}
                onChange={handleChange}
                className={inputClass}
              />
            </div>
          </div>

          {/* Duração + Modalidade */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="ag-duracao" className={labelClass}>
                Duração (minutos)
              </label>
              <input
                id="ag-duracao"
                name="duracao_minutos"
                type="number"
                min={15}
                max={180}
                step={5}
                value={form.duracao_minutos}
                onChange={handleChange}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="ag-modalidade" className={labelClass}>
                Modalidade
              </label>
              <select
                id="ag-modalidade"
                name="modalidade"
                value={form.modalidade}
                onChange={handleChange}
                className={inputClass}
              >
                <option value="presencial">Presencial</option>
                <option value="online">Online</option>
              </select>
            </div>
          </div>

          {/* Status */}
          <div>
            <label htmlFor="ag-status" className={labelClass}>
              Status
            </label>
            <select
              id="ag-status"
              name="status"
              value={form.status}
              onChange={handleChange}
              className={inputClass}
            >
              <option value="agendado">Agendado</option>
              <option value="confirmado">Confirmado</option>
              <option value="realizado">Realizado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>

          {/* Observações */}
          <div>
            <label htmlFor="ag-obs" className={labelClass}>
              Observações
            </label>
            <textarea
              id="ag-obs"
              name="observacoes"
              rows={3}
              value={form.observacoes}
              onChange={handleChange}
              placeholder="Notas sobre este agendamento..."
              className={inputClass + " resize-none"}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-xl bg-danger/5 border border-danger/15">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/40">
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
                  {isEditing ? "Salvar alterações" : "Agendar"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
