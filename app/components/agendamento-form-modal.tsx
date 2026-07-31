"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { X, Save, Loader2, Search } from "lucide-react";
import type { Agendamento } from "./agenda-view";

interface AgendamentoFormModalProps {
  agendamento: Agendamento | null;
  prefillDate: string | null;
  prefillData?: Partial<FormData>;
  onClose: () => void;
  onSaved: () => void;
}

interface PacienteOption {
  id: string;
  nome: string;
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
  prefillData,
  onClose,
  onSaved,
}: AgendamentoFormModalProps) {
  const isEditing = !!agendamento;
  const supabase = createClient();

  const [form, setForm] = useState<FormData>({
    paciente_id: agendamento?.paciente_id || prefillData?.paciente_id || "",
    data: agendamento?.data || prefillDate || prefillData?.data || "",
    horario: agendamento?.horario?.slice(0, 5) || prefillData?.horario?.slice(0, 5) || "",
    duracao_minutos: agendamento?.duracao_minutos || prefillData?.duracao_minutos || 50,
    modalidade: agendamento?.modalidade || prefillData?.modalidade || "presencial",
    status: agendamento?.status || prefillData?.status || "agendado",
    observacoes: agendamento?.observacoes || prefillData?.observacoes || "",
  });

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<"weekly" | "biweekly" | "monthly">("weekly");
  const [recurrenceCount, setRecurrenceCount] = useState<number>(4);

  function addRecurrence(dateStr: string, frequency: string, count: number): string {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (frequency === "weekly") date.setDate(date.getDate() + 7 * count);
    else if (frequency === "biweekly") date.setDate(date.getDate() + 14 * count);
    else if (frequency === "monthly") date.setMonth(date.getMonth() + 1 * count);
    
    const yy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }

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
        .select("id, nome")
        .eq("ativo", true)
        .order("nome", { ascending: true });
      setPacientes(data || []);

      // If editing or duplicating, find patient name
      const targetId = agendamento?.paciente_id || prefillData?.paciente_id;
      if (targetId && data) {
        const found = data.find((p) => p.id === targetId);
        if (found) setSelectedPacienteName(found.nome);
      }
    }
    fetchPacientes();
  }, []);

  // Filter patients by search
  const filteredPacientes = pacienteSearch
    ? pacientes.filter((p) =>
        p.nome.toLowerCase().includes(pacienteSearch.toLowerCase())
      )
    : pacientes;

  function selectPaciente(p: PacienteOption) {
    setForm((prev) => ({ ...prev, paciente_id: p.id }));
    setSelectedPacienteName(p.nome);
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

  async function handleDelete() {
    if (!agendamento) return;
    if (!confirm("Tem certeza que deseja excluir este agendamento?")) return;
    
    setDeleting(true);
    setError(null);

    const { error } = await supabase
      .from("agendamentos")
      .delete()
      .eq("id", agendamento.id);

    if (error) {
      console.error("Erro ao excluir agendamento:", error);
      setError("Não foi possível excluir o agendamento.");
      setDeleting(false);
      return;
    }

    onSaved();
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

      let payloads = [];
      if (isRecurring && recurrenceCount > 0) {
        for (let i = 0; i <= recurrenceCount; i++) {
          payloads.push({
            ...payload,
            data: addRecurrence(payload.data, recurrenceFrequency, i),
            psicologo_id: user.id
          });
        }
      } else {
        payloads.push({ ...payload, psicologo_id: user.id });
      }

      result = await supabase
        .from("agendamentos")
        .insert(payloads);
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
                          {p.nome}
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

          {/* Recorrência */}
          {!isEditing && (
            <div className="pt-3 space-y-4">
              <label className="flex items-center gap-2 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary/20 w-4 h-4"
                />
                <span className="text-sm font-medium text-text">Repetir este agendamento</span>
              </label>

              {isRecurring && (
                <div className="grid grid-cols-2 gap-4 p-4 bg-background/50 rounded-xl border border-border/50">
                  <div>
                    <label className={labelClass}>Frequência</label>
                    <select
                      value={recurrenceFrequency}
                      onChange={(e) => setRecurrenceFrequency(e.target.value as any)}
                      className={inputClass}
                    >
                      <option value="weekly">Semanal</option>
                      <option value="biweekly">Quinzenal</option>
                      <option value="monthly">Mensal</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Quantas vezes?</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={recurrenceCount}
                      onChange={(e) => setRecurrenceCount(parseInt(e.target.value) || 1)}
                      className={inputClass}
                    />
                  </div>
                  {form.data && (
                    <div className="col-span-2 text-xs text-text-muted mt-1 bg-surface px-3 py-2.5 rounded-lg border border-border/40 text-center">
                      Serão criados <strong>{recurrenceCount + 1}</strong> agendamentos no total, terminando em{" "}
                      <strong>
                        {addRecurrence(form.data, recurrenceFrequency, recurrenceCount).split("-").reverse().join("/")}
                      </strong>.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-border/40">
            {isEditing ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving || deleting}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-danger hover:bg-danger/10 transition-colors cursor-pointer"
              >
                {deleting ? "Excluindo..." : "Excluir"}
              </button>
            ) : (
              <div />
            )}
            
            <div className="flex gap-3">
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
                disabled={saving || deleting}
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
          </div>
        </form>
      </div>
    </div>
  );
}
