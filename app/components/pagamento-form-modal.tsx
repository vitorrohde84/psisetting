"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { X, Save, Loader2, Search } from "lucide-react";

interface PagamentoFormModalProps {
  pagamento: any | null; // using any to bypass complex joins if needed
  onClose: () => void;
  onSaved: () => void;
}

interface PacienteOption {
  id: string;
  nome: string;
  cpf: string;
}

export function PagamentoFormModal({ pagamento, onClose, onSaved }: PagamentoFormModalProps) {
  const isEditing = !!pagamento;
  const supabase = createClient();

  const [form, setForm] = useState({
    paciente_id: pagamento?.paciente_id || "",
    valor: pagamento?.valor || "",
    data_vencimento: pagamento?.data_vencimento || new Date().toISOString().split("T")[0],
    status: pagamento?.status || "pendente",
    forma_pagamento: pagamento?.forma_pagamento || "pix",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Patients
  const [pacientes, setPacientes] = useState<PacienteOption[]>([]);
  const [pacienteSearch, setPacienteSearch] = useState("");
  const [showPacienteDropdown, setShowPacienteDropdown] = useState(false);
  const [selectedPacienteName, setSelectedPacienteName] = useState("");

  useEffect(() => {
    async function fetchPacientes() {
      const { data } = await supabase
        .from("pacientes")
        .select("id, nome, cpf")
        .eq("ativo", true)
        .order("nome", { ascending: true });
      
      setPacientes(data || []);

      if (pagamento?.paciente_id && data) {
        const found = data.find((p) => p.id === pagamento.paciente_id);
        if (found) setSelectedPacienteName(found.nome);
      }
    }
    fetchPacientes();
  }, []);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.paciente_id) {
      setError("Selecione um paciente.");
      return;
    }
    if (!form.valor || Number(form.valor) <= 0) {
      setError("Informe um valor válido.");
      return;
    }

    setSaving(true);

    const payload = {
      paciente_id: form.paciente_id,
      valor: Number(form.valor),
      data_vencimento: form.data_vencimento,
      status: form.status,
      forma_pagamento: form.forma_pagamento,
    };

    let result;
    if (isEditing) {
      result = await supabase
        .from("pagamentos")
        .update(payload)
        .eq("id", pagamento.id);
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Sessão expirada. Faça login novamente.");
        setSaving(false);
        return;
      }
      result = await supabase
        .from("pagamentos")
        .insert({ ...payload, });
    }

    if (result.error) {
      setError("Não foi possível salvar o pagamento.");
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

      <div className="relative w-full max-w-lg overflow-hidden flex flex-col bg-surface rounded-2xl shadow-xl border border-border/60">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 shrink-0">
          <div>
            <h3 className="text-lg font-serif font-medium text-text">
              {isEditing ? "Editar Pagamento" : "Novo Pagamento"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-background transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
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

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>
                Valor (R$) <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={form.valor}
                onChange={(e) => setForm((prev) => ({ ...prev, valor: e.target.value }))}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                Vencimento / Data <span className="text-danger">*</span>
              </label>
              <input
                type="date"
                required
                value={form.data_vencimento}
                onChange={(e) => setForm((prev) => ({ ...prev, data_vencimento: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>
                Status <span className="text-danger">*</span>
              </label>
              <select
                required
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                className={inputClass}
              >
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>
                Forma de Pagamento
              </label>
              <select
                value={form.forma_pagamento}
                onChange={(e) => setForm((prev) => ({ ...prev, forma_pagamento: e.target.value }))}
                className={inputClass}
              >
                <option value="pix">PIX</option>
                <option value="transferencia">Transferência</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="cartao">Cartão</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-danger/5 border border-danger/15 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/40">
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
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
