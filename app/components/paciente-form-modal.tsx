"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { X, Save, Loader2 } from "lucide-react";
import type { Paciente } from "./paciente-list";

interface PacienteFormModalProps {
  paciente: Paciente | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormData {
  nome_completo: string;
  cpf: string;
  data_nascimento: string;
  telefone: string;
  email: string;
  endereco: string;
  contato_emergencia: string;
  observacoes_gerais: string;
  ativo: boolean;
}

function maskCPF(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

export function PacienteFormModal({
  paciente,
  onClose,
  onSaved,
}: PacienteFormModalProps) {
  const isEditing = !!paciente;
  const supabase = createClient();

  const [form, setForm] = useState<FormData>({
    nome_completo: paciente?.nome_completo || "",
    cpf: paciente?.cpf || "",
    data_nascimento: paciente?.data_nascimento || "",
    telefone: paciente?.telefone || "",
    email: paciente?.email || "",
    endereco: paciente?.endereco || "",
    contato_emergencia: paciente?.contato_emergencia || "",
    observacoes_gerais: paciente?.observacoes_gerais || "",
    ativo: paciente?.ativo ?? true,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value, type } = e.target;

    if (name === "cpf") {
      setForm((prev) => ({ ...prev, cpf: maskCPF(value) }));
      return;
    }
    if (name === "telefone") {
      setForm((prev) => ({ ...prev, telefone: maskPhone(value) }));
      return;
    }
    if (type === "checkbox") {
      setForm((prev) => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked,
      }));
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.nome_completo.trim()) {
      setError("O nome é obrigatório.");
      return;
    }

    setSaving(true);

    // Clean CPF and phone for storage (digits only)
    const payload = {
      nome_completo: form.nome_completo.trim(),
      cpf: form.cpf.replace(/\D/g, "") || null,
      data_nascimento: form.data_nascimento || null,
      telefone: form.telefone.replace(/\D/g, "") || null,
      email: form.email.trim() || null,
      endereco: form.endereco.trim() || null,
      contato_emergencia: form.contato_emergencia.trim() || null,
      observacoes_gerais: form.observacoes_gerais.trim() || null,
      ativo: form.ativo,
    };

    let result;
    if (isEditing) {
      result = await supabase
        .from("pacientes")
        .update(payload)
        .eq("id", paciente.id);
    } else {
      // Get the current user's id for psicologo_id
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Sessão expirada. Faça login novamente.");
        setSaving(false);
        return;
      }

      result = await supabase
        .from("pacientes")
        .insert({ ...payload, psicologo_id: user.id });
    }

    if (result.error) {
      console.error("Supabase Save Error:", result.error);
      if (result.error.message.includes("unique") || result.error.message.includes("duplicate")) {
        setError("Já existe um paciente com este CPF.");
      } else {
        setError(`Erro: ${result.error.message}`);
      }
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
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-text/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-xl border border-border/60">
        {/* Header */}
        <div className="sticky top-0 bg-surface flex items-center justify-between px-6 py-4 border-b border-border/40 z-10">
          <h3 className="text-lg font-serif font-medium text-text">
            {isEditing ? "Editar Paciente" : "Novo Paciente"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-background transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Nome */}
          <div>
            <label htmlFor="nome_completo" className={labelClass}>
              Nome completo <span className="text-danger">*</span>
            </label>
            <input
              id="nome_completo"
              name="nome_completo"
              type="text"
              required
              autoFocus
              value={form.nome_completo}
              onChange={handleChange}
              placeholder="Nome completo do paciente"
              className={inputClass}
            />
          </div>

          {/* CPF + Data Nascimento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cpf" className={labelClass}>
                CPF
              </label>
              <input
                id="cpf"
                name="cpf"
                type="text"
                value={form.cpf}
                onChange={handleChange}
                placeholder="000.000.000-00"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="data_nascimento" className={labelClass}>
                Data de nascimento
              </label>
              <input
                id="data_nascimento"
                name="data_nascimento"
                type="date"
                value={form.data_nascimento}
                onChange={handleChange}
                className={inputClass}
              />
            </div>
          </div>

          {/* Telefone + Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="telefone" className={labelClass}>
                Telefone
              </label>
              <input
                id="telefone"
                name="telefone"
                type="text"
                value={form.telefone}
                onChange={handleChange}
                placeholder="(00) 00000-0000"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="email" className={labelClass}>
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="paciente@email.com"
                className={inputClass}
              />
            </div>
          </div>

          {/* Endereço */}
          <div>
            <label htmlFor="endereco" className={labelClass}>
              Endereço
            </label>
            <input
              id="endereco"
              name="endereco"
              type="text"
              value={form.endereco}
              onChange={handleChange}
              placeholder="Rua, número, bairro, cidade"
              className={inputClass}
            />
          </div>

          {/* Contato de emergência */}
          <div>
            <label htmlFor="contato_emergencia" className={labelClass}>
              Contato de emergência
            </label>
            <input
              id="contato_emergencia"
              name="contato_emergencia"
              type="text"
              value={form.contato_emergencia}
              onChange={handleChange}
              placeholder="Nome e telefone do contato"
              className={inputClass}
            />
          </div>

          {/* Observações */}
          <div>
            <label htmlFor="observacoes_gerais" className={labelClass}>
              Observações gerais
            </label>
            <textarea
              id="observacoes_gerais"
              name="observacoes_gerais"
              rows={3}
              value={form.observacoes_gerais}
              onChange={handleChange}
              placeholder="Informações adicionais relevantes..."
              className={inputClass + " resize-none"}
            />
          </div>

          {/* Status ativo */}
          <div className="flex items-center gap-3 pt-1">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                name="ativo"
                checked={form.ativo}
                onChange={handleChange}
                className="sr-only peer"
              />
              <div
                className="w-9 h-5 bg-border rounded-full peer
                           peer-checked:bg-success
                           after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                           after:bg-white after:rounded-full after:h-4 after:w-4
                           after:transition-all peer-checked:after:translate-x-4
                           transition-colors"
              />
            </label>
            <span className="text-sm text-text">
              Paciente {form.ativo ? "ativo" : "inativo"}
            </span>
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
                  {isEditing ? "Salvar alterações" : "Cadastrar paciente"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
