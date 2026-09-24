"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { encryptClinicalData, decryptClinicalData } from "@/utils/crypto";
import { deveCriarEvolucao, valorDaCobranca } from "@/utils/agenda-regras";
import { X, Save, Loader2, Search } from "lucide-react";
import type { Agendamento } from "./agenda-view";

/**
 * Pré-preenchimento vindo da agenda ("Replicar"). Sai direto da linha do
 * agendamento, então duração, modalidade e observações podem vir nulas — o
 * estado inicial do formulário já troca nulo pelo padrão.
 */
export type PrefillAgendamento = Partial<
  Pick<
    Agendamento,
    "paciente_id" | "data" | "horario" | "duracao_minutos" | "modalidade" | "status" | "observacoes"
  >
>;

type FrequenciaRecorrencia = "weekly" | "biweekly" | "monthly";

interface AgendamentoFormModalProps {
  agendamento: Agendamento | null;
  prefillDate: string | null;
  // A agenda passa o próprio estado, que é null quando não há o que replicar.
  prefillData?: PrefillAgendamento | null;
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
  /** Vazio = não cria cobrança. Nunca preenchido pelo sistema sem ela ver. */
  valor: string;
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
    valor: "",
  });

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<FrequenciaRecorrencia>("weekly");
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
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase
        .from("pacientes")
        .select("id, nome")
        .eq("ativo", true);
      
      let list: PacienteOption[] = [];
      if (data && user) {
        list = await Promise.all(
          data.map(async (p) => ({
            id: p.id,
            nome: await decryptClinicalData(p.nome, user.id),
          }))
        );
        list.sort((a, b) => a.nome.localeCompare(b.nome));
      }
      setPacientes(list);

      // If editing or duplicating, find patient name
      const targetId = agendamento?.paciente_id || prefillData?.paciente_id;
      if (targetId && list.length > 0) {
        const found = list.find((p) => p.id === targetId);
        if (found) setSelectedPacienteName(found.nome);
      }

      // Decrypt observacoes if editing
      if (agendamento?.observacoes && user) {
        const decryptedObs = await decryptClinicalData(agendamento.observacoes, user.id);
        setForm((prev) => ({ ...prev, observacoes: decryptedObs }));
      }
    }
    fetchPacientes();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- supabase é o mesmo cliente a cada render (createBrowserClient guarda uma instância única no navegador); a lista só precisa ser refeita quando muda o agendamento ou o pré-preenchimento.
  }, [agendamento, prefillData]);

  // Sugere o valor da sessão a partir do ÚLTIMO valor realmente cobrado deste
  // paciente. É histórico dela, não um número escolhido pelo sistema — e fica
  // visível no formulário para ser conferido ou trocado. Sem histórico, o campo
  // permanece vazio e nenhuma cobrança é criada.
  useEffect(() => {
    if (isEditing || !form.paciente_id) return;

    let cancelado = false;
    (async () => {
      const { data } = await supabase
        .from("pagamentos")
        .select("valor")
        .eq("paciente_id", form.paciente_id)
        .order("data_vencimento", { ascending: false })
        .limit(1);

      const ultimo = data?.[0]?.valor;
      if (!cancelado && ultimo != null) {
        setForm((prev) => (prev.valor ? prev : { ...prev, valor: String(ultimo) }));
      }
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.paciente_id, isEditing]);

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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Sessão expirada. Faça login novamente.");
      setSaving(false);
      return;
    }

    const encryptedObs = form.observacoes.trim()
      ? await encryptClinicalData(form.observacoes.trim(), user.id)
      : null;

    const payload = {
      paciente_id: form.paciente_id,
      data: form.data,
      horario: form.horario + ":00", // Ensure HH:MM:SS
      duracao_minutos: form.duracao_minutos,
      modalidade: form.modalidade || null,
      status: form.status,
      observacoes: encryptedObs,
    };

    let result;
    if (isEditing) {
      result = await supabase
        .from("agendamentos")
        .update(payload)
        .eq("id", agendamento.id)
        .select();
    } else {
      const payloads = [];
      if (isRecurring && recurrenceCount > 0) {
        for (let i = 0; i <= recurrenceCount; i++) {
          payloads.push({
            ...payload,
            data: addRecurrence(payload.data, recurrenceFrequency, i),
            psicologo_id: user.id,
          });
        }
      } else {
        payloads.push({ ...payload, psicologo_id: user.id });
      }

      result = await supabase
        .from("agendamentos")
        .insert(payloads)
        .select();
    }

    if (result.error) {
      setError("Não foi possível salvar o agendamento. Tente novamente.");
      console.error(result.error);
      setSaving(false);
      return;
    }

    // --- AUTO-PRONTUÁRIO ---
    //
    // Três defeitos corrigidos aqui em 17/09/2026. Todos ativos em produção,
    // sobre prontuário de paciente real:
    //
    // 1. GRAVAVA EM TEXTO PURO. Usava `form.observacoes.trim()` cru, embora
    //    `encryptedObs` já estivesse pronto três dezenas de linhas acima. Foi
    //    esta linha que produziu os 13 prontuários sem criptografia que a
    //    auditoria encontrou — e continuaria produzindo.
    //
    // 2. SOBRESCREVIA EVOLUÇÃO. O `.update()` substituía o prontuário
    //    existente. Bastava abrir o agendamento para corrigir o horário e a
    //    evolução escrita pela psicóloga era apagada, sem aviso nem histórico.
    //    Agora nunca sobrescreve: registro clínico só se edita em Prontuários.
    //
    // 3. FABRICAVA SESSÃO FUTURA. Com recorrência, `result.data` traz todas as
    //    ocorrências, e o laço criava um prontuário para cada uma — registro de
    //    sessão que ainda não aconteceu. Agora só a data de hoje ou anterior.
    if (form.observacoes.trim() && encryptedObs && result.data) {
      const hoje = new Date().toISOString().slice(0, 10);

      for (const ag of result.data) {
        const { data: existing } = await supabase
          .from("prontuarios")
          .select("id")
          .eq("agendamento_id", ag.id)
          .maybeSingle();

        // A decisão mora em utils/agenda-regras.ts, coberta por teste.
        const criar = deveCriarEvolucao({
          dataAgendamento: ag.data,
          hoje,
          jaExisteEvolucao: !!existing,
          temObservacao: !!form.observacoes.trim(),
        });

        if (!criar) continue;

        const { error: pErr } = await supabase.from("prontuarios").insert({
          paciente_id: ag.paciente_id,
          agendamento_id: ag.id,
          data: ag.data,
          psicologo_id: user.id,
          conteudo: encryptedObs,
        });

        if (pErr) {
          console.error("Falha ao criar evolução a partir da agenda:", pErr);
        }
      }
    }
    // ------------------------------------

    // --- AUTO-PAGAMENTO ---
    //
    // Antes: `valor: 150, // Valor padrão a ser ajustado no financeiro`.
    // Todo agendamento criava em silêncio uma cobrança de R$ 150 que ninguém
    // tinha combinado. No banco auditado, 18 dos 25 lançamentos eram esse 150
    // inventado — o "financeiro" era, em boa parte, ficção do próprio código,
    // e o total a receber que ele exibia não correspondia a nada.
    //
    // Agora o valor é explícito: vem do campo do formulário, pré-preenchido com
    // o último valor cobrado daquele paciente (histórico real dela, não um
    // número escolhido pelo programa). Em branco, nenhuma cobrança é criada.
    // Em branco, inválido ou zero devolve null e nenhuma cobrança é criada.
    const valorSessao = valorDaCobranca(form.valor);

    if (!isEditing && result.data && valorSessao !== null) {
      for (const ag of result.data) {
        const { error: pagErr } = await supabase.from("pagamentos").insert({
          paciente_id: ag.paciente_id,
          agendamento_id: ag.id,
          psicologo_id: user.id,
          valor: valorSessao,
          data_vencimento: ag.data,
          status: "pendente",
          forma_pagamento: "pix",
        });

        if (pagErr) {
          console.error("Falha ao criar lançamento financeiro:", pagErr);
        }
      }
    }
    // ------------------------------------

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

          {/* Valor da sessão — só aparece ao criar, não ao editar.
              Antes, o sistema criava sozinho uma cobrança de R$ 150 sem
              perguntar nada. Agora o valor é dela, visível e opcional. */}
          {!isEditing && (
            <div>
              <label htmlFor="ag-valor" className={labelClass}>
                Valor da sessão{" "}
                <span className="font-normal text-text-muted">
                  — deixe em branco para não gerar cobrança
                </span>
              </label>
              <input
                id="ag-valor"
                name="valor"
                type="text"
                inputMode="decimal"
                value={form.valor}
                onChange={handleChange}
                placeholder="Ex: 150"
                className={inputClass}
              />
              {isRecurring && form.valor.trim() && (
                <p className="mt-1.5 text-xs text-text-muted">
                  Será lançada uma cobrança para cada uma das{" "}
                  {recurrenceCount + 1} sessões.
                </p>
              )}
            </div>
          )}

          {/* Observações / Prontuário */}
          <div>
            <label htmlFor="ag-obs" className={labelClass}>
              Evolução do Prontuário (Observações)
            </label>
            <textarea
              id="ag-obs"
              name="observacoes"
              rows={4}
              value={form.observacoes}
              onChange={handleChange}
              placeholder="Descreva o andamento da sessão, evolução do paciente, intervenções. O texto será salvo automaticamente no prontuário do paciente."
              className={inputClass + " resize-none font-serif text-sm leading-relaxed"}
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
                      onChange={(e) => setRecurrenceFrequency(e.target.value as FrequenciaRecorrencia)}
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
