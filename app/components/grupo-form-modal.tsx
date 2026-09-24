"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { decryptClinicalData } from "@/utils/crypto";
import { X, Users, Save, Loader2, Search, Check } from "lucide-react";

export interface GrupoData {
  id?: string;
  nome: string;
  descricao?: string | null;
  dia_semana?: string | null;
  horario?: string | null;
  valor_sessao?: number | null;
  ativo?: boolean;
}

interface PacienteOption {
  id: string;
  nome: string;
  selected: boolean;
}

interface GrupoFormModalProps {
  grupo?: GrupoData | null;
  onClose: () => void;
  onSaved: () => void;
}

const DIAS_SEMANA = [
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
  "Domingo",
];

export function GrupoFormModal({ grupo, onClose, onSaved }: GrupoFormModalProps) {
  const isEditing = Boolean(grupo?.id);
  const supabase = createClient();

  const [nome, setNome] = useState(grupo?.nome || "");
  const [descricao, setDescricao] = useState(grupo?.descricao || "");
  const [diaSemana, setDiaSemana] = useState(grupo?.dia_semana || "Terça-feira");
  const [horario, setHorario] = useState(grupo?.horario || "19:00");
  const [valorSessao, setValorSessao] = useState<string>(
    grupo?.valor_sessao ? String(grupo.valor_sessao) : ""
  );

  const [pacientes, setPacientes] = useState<PacienteOption[]>([]);
  const [searchPaciente, setSearchPaciente] = useState("");
  const [loadingPacientes, setLoadingPacientes] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPacientes() {
      setLoadingPacientes(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoadingPacientes(false);
        return;
      }

      // 1. Carregar todos os pacientes da psicóloga
      const { data: pacData } = await supabase
        .from("pacientes")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome", { ascending: true });

      // 2. Se for edição, carregar os membros atuais do grupo
      let currentMemberIds = new Set<string>();
      if (grupo?.id) {
        const { data: membrosData } = await supabase
          .from("grupo_membros")
          .select("paciente_id")
          .eq("grupo_id", grupo.id)
          .eq("ativo", true);

        if (membrosData) {
          currentMemberIds = new Set(membrosData.map((m) => m.paciente_id));
        }
      }

      // 3. Descriptografar os nomes dos pacientes
      if (pacData) {
        const list = await Promise.all(
          pacData.map(async (p) => ({
            id: p.id,
            nome: await decryptClinicalData(p.nome, user.id),
            selected: currentMemberIds.has(p.id),
          }))
        );
        list.sort((a, b) => a.nome.localeCompare(b.nome));
        setPacientes(list);
      }

      setLoadingPacientes(false);
    }

    loadPacientes();
    // `supabase` vem de createBrowserClient, que no navegador é sempre a mesma
    // instância: estar na lista não refaz a carga.
  }, [grupo, supabase]);

  function togglePaciente(id: string) {
    setPacientes((prev) =>
      prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p))
    );
  }

  const selectedCount = pacientes.filter((p) => p.selected).length;

  const filteredPacientes = searchPaciente
    ? pacientes.filter((p) =>
        p.nome.toLowerCase().includes(searchPaciente.toLowerCase())
      )
    : pacientes;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nome.trim()) {
      setError("Informe o nome do grupo.");
      return;
    }

    if (selectedCount === 0) {
      setError("Selecione pelo menos um paciente participante para o grupo.");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Sessão expirada. Faça login novamente.");
        setSaving(false);
        return;
      }

      const parsedValor = valorSessao ? parseFloat(valorSessao.replace(",", ".")) : 0;

      let grupoId = grupo?.id;

      if (isEditing && grupoId) {
        // Atualizar grupo existente
        const { error: updateError } = await supabase
          .from("grupos")
          .update({
            nome: nome.trim(),
            descricao: descricao.trim() || null,
            dia_semana: diaSemana,
            horario,
            valor_sessao: isNaN(parsedValor) ? 0 : parsedValor,
            updated_at: new Date().toISOString(),
          })
          .eq("id", grupoId);

        if (updateError) {
          console.error("Erro ao atualizar grupo:", updateError);
          setError("Erro ao atualizar dados do grupo.");
          setSaving(false);
          return;
        }

        // Atualizar membros: desativar ou deletar e reinserir
        await supabase.from("grupo_membros").delete().eq("grupo_id", grupoId);
      } else {
        // Criar novo grupo
        const { data: newGrupo, error: createError } = await supabase
          .from("grupos")
          .insert({
            psicologo_id: user.id,
            nome: nome.trim(),
            descricao: descricao.trim() || null,
            dia_semana: diaSemana,
            horario,
            valor_sessao: isNaN(parsedValor) ? 0 : parsedValor,
            ativo: true,
          })
          .select("id")
          .single();

        if (createError || !newGrupo) {
          console.error("Erro ao criar grupo:", createError);
          setError("Erro ao criar grupo no banco de dados.");
          setSaving(false);
          return;
        }

        grupoId = newGrupo.id;
      }

      // Inserir os membros selecionados
      const selectedMembers = pacientes.filter((p) => p.selected);
      if (selectedMembers.length > 0 && grupoId) {
        const membrosPayload = selectedMembers.map((p) => ({
          grupo_id: grupoId,
          paciente_id: p.id,
          psicologo_id: user.id,
          ativo: true,
        }));

        const { error: membrosError } = await supabase
          .from("grupo_membros")
          .insert(membrosPayload);

        if (membrosError) {
          console.error("Erro ao vincular membros:", membrosError);
        }
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      console.error("Erro inesperado:", err);
      setError("Erro ao processar criação do grupo.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-lg bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-hover/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Users size={20} />
            </div>
            <div>
              <h3 className="text-lg font-serif font-semibold text-text">
                {isEditing ? "Editar Grupo Terapêutico" : "Novo Grupo Terapêutico"}
              </h3>
              <p className="text-xs text-text-muted">
                Configure as participantes e o cronograma do grupo
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-text-muted hover:text-text hover:bg-surface-hover rounded-xl transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Nome do Grupo */}
          <div>
            <label className="block text-xs font-medium text-text mb-1.5">
              Nome do Grupo *
            </label>
            <input
              type="text"
              placeholder="Ex: Grupo Mulheres & Autoestima, Terapia Breve Ansiedade..."
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              className="w-full px-3.5 py-2 rounded-xl bg-surface border border-border text-text text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-text-muted/50"
            />
          </div>

          {/* Descrição / Objetivo */}
          <div>
            <label className="block text-xs font-medium text-text mb-1.5">
              Objetivo / Descrição (Opcional)
            </label>
            <textarea
              rows={2}
              placeholder="Breve resumo da proposta terapêutica do grupo..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-surface border border-border text-text text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-text-muted/50 leading-relaxed"
            />
          </div>

          {/* Dia da Semana e Horário */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text mb-1.5">
                Dia da Semana
              </label>
              <select
                value={diaSemana}
                onChange={(e) => setDiaSemana(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-surface border border-border text-text text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all cursor-pointer"
              >
                {DIAS_SEMANA.map((dia) => (
                  <option key={dia} value={dia}>
                    {dia}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text mb-1.5">
                Horário Habitual
              </label>
              <input
                type="time"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-surface border border-border text-text text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          </div>

          {/* Valor da Sessão por Participante */}
          <div>
            <label className="block text-xs font-medium text-text mb-1.5">
              Valor por Sessão por Paciente (R$)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-text-muted">
                R$
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Ex: 80.00"
                value={valorSessao}
                onChange={(e) => setValorSessao(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-surface border border-border text-text text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-text-muted/50"
              />
            </div>
          </div>

          {/* Seleção de Pacientes Participantes */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-text uppercase tracking-wider">
                Participantes Selecionadas ({selectedCount})
              </label>
              <span className="text-[11px] text-text-muted">
                Clique para incluir/remover
              </span>
            </div>

            {/* Campo de busca de pacientes */}
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/60"
              />
              <input
                type="text"
                placeholder="Filtrar por nome da paciente..."
                value={searchPaciente}
                onChange={(e) => setSearchPaciente(e.target.value)}
                className="w-full pl-9 pr-3.5 py-1.5 rounded-xl bg-surface-hover/50 border border-border/70 text-text text-xs focus:outline-hidden focus:ring-1 focus:ring-primary/30 transition-all placeholder:text-text-muted/50"
              />
            </div>

            {/* Lista com scroll dos pacientes */}
            <div className="max-h-48 overflow-y-auto border border-border rounded-xl p-1.5 space-y-1 bg-surface-hover/20">
              {loadingPacientes ? (
                <div className="py-6 text-center text-xs text-text-muted flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin text-primary" />
                  <span>Carregando pacientes...</span>
                </div>
              ) : filteredPacientes.length === 0 ? (
                <div className="py-6 text-center text-xs text-text-muted">
                  Nenhuma paciente encontrada.
                </div>
              ) : (
                filteredPacientes.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePaciente(p.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all cursor-pointer text-left ${
                      p.selected
                        ? "bg-primary/10 text-primary font-medium border border-primary/20"
                        : "hover:bg-surface-hover text-text"
                    }`}
                  >
                    <span className="truncate sensitive-data">{p.nome}</span>
                    {p.selected && (
                      <div className="w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center shrink-0">
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Rodapé e Ações */}
          <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm text-text-muted hover:text-text hover:bg-surface-hover transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark active:scale-[0.98] transition-all shadow-xs cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Salvando Grupo...</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>{isEditing ? "Salvar Alterações" : "Criar Grupo"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
