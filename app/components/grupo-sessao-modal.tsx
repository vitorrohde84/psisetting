"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { encryptClinicalData } from "@/utils/crypto";
import {
  X,
  Sparkles,
  Save,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  UsersRound,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export interface GrupoMembroInfo {
  id: string;
  paciente_id: string;
  paciente_nome: string;
}

interface GrupoSessaoModalProps {
  grupo: {
    id: string;
    nome: string;
    horario?: string | null;
  };
  membros: GrupoMembroInfo[];
  onClose: () => void;
  onSaved: () => void;
}

export function GrupoSessaoModal({
  grupo,
  membros,
  onClose,
  onSaved,
}: GrupoSessaoModalProps) {
  const supabase = createClient();

  const [data, setData] = useState(new Date().toISOString().split("T")[0]);
  const [horario, setHorario] = useState(grupo.horario || "19:00");
  const [tema, setTema] = useState("");
  const [resumoColetivo, setResumoColetivo] = useState("");

  // Estado dos participantes: Presença e Observações Individuais
  const [participantes, setParticipantes] = useState(
    membros.map((m) => ({
      paciente_id: m.paciente_id,
      paciente_nome: m.paciente_nome,
      presente: true,
      nota_individual: "",
      showNota: false,
    }))
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  function togglePresenca(paciente_id: string) {
    setParticipantes((prev) =>
      prev.map((p) =>
        p.paciente_id === paciente_id ? { ...p, presente: !p.presente } : p
      )
    );
  }

  function updateNotaIndividual(paciente_id: string, text: string) {
    setParticipantes((prev) =>
      prev.map((p) =>
        p.paciente_id === paciente_id ? { ...p, nota_individual: text } : p
      )
    );
  }

  function toggleShowNota(paciente_id: string) {
    setParticipantes((prev) =>
      prev.map((p) =>
        p.paciente_id === paciente_id ? { ...p, showNota: !p.showNota } : p
      )
    );
  }

  const presentesCount = participantes.filter((p) => p.presente).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!resumoColetivo.trim()) {
      setError("Por favor, preencha o resumo da dinâmica / evolução coletiva.");
      return;
    }

    if (presentesCount === 0) {
      setError("Pelo menos uma paciente deve estar marcada como presente.");
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

      // 1. Criptografar e registrar a sessão de grupo coletiva
      const encryptedResumo = await encryptClinicalData(resumoColetivo.trim(), user.id);
      const { data: sessaoData, error: sessaoError } = await supabase
        .from("grupo_sessoes")
        .insert({
          grupo_id: grupo.id,
          psicologo_id: user.id,
          data,
          horario,
          tema: tema.trim() || "Sessão de Grupo",
          resumo_coletivo: encryptedResumo,
        })
        .select("id")
        .single();

      if (sessaoError || !sessaoData) {
        console.error("Erro ao salvar sessão de grupo:", sessaoError);
        setError("Erro ao registrar a sessão de grupo. Verifique o banco de dados.");
        setSaving(false);
        return;
      }

      const grupoSessaoId = sessaoData.id;

      // 2. Gerar prontuário individual criptografado para cada paciente presente
      const presentes = participantes.filter((p) => p.presente);
      const prontuariosPayload = await Promise.all(
        presentes.map(async (p) => {
          let text = `[Sessão de Grupo: ${grupo.nome}]\n`;
          if (tema.trim()) {
            text += `Tema: ${tema.trim()}\n\n`;
          }
          text += `Dinâmica / Evolução Coletiva:\n${resumoColetivo.trim()}\n`;

          if (p.nota_individual.trim()) {
            text += `\nObservações Individuais:\n${p.nota_individual.trim()}\n`;
          }

          const encryptedConteudo = await encryptClinicalData(text, user.id);

          return {
            paciente_id: p.paciente_id,
            psicologo_id: user.id,
            data,
            conteudo: encryptedConteudo,
            grupo_sessao_id: grupoSessaoId,
          };
        })
      );

      const { error: prontuariosError } = await supabase
        .from("prontuarios")
        .insert(prontuariosPayload);

      if (prontuariosError) {
        console.error("Erro ao gerar prontuários individuais:", prontuariosError);
        setError("A sessão foi salva, mas ocorreu um erro ao replicar nos prontuários individuais.");
        setSaving(false);
        return;
      }

      setSavedCount(presentes.length);
      setTimeout(() => {
        onSaved();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error("Erro inesperado ao salvar evolução de grupo:", err);
      setError("Erro inesperado ao processar os dados da sessão.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-hover/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="text-lg font-serif font-semibold text-text">
                Evolução Coletiva de Grupo
              </h3>
              <p className="text-xs text-text-muted">
                {grupo.nome} • {presentesCount} de {membros.length} presentes
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

        {/* Feedback de sucesso */}
        {savedCount !== null ? (
          <div className="p-8 text-center space-y-3">
            <div className="inline-flex p-3 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={36} />
            </div>
            <h4 className="text-xl font-semibold text-text">Sessão Registrada com Sucesso!</h4>
            <p className="text-sm text-text-muted max-w-md mx-auto">
              A evolução foi criptografada e salva automaticamente nos prontuários individuais de{" "}
              <strong>{savedCount} pacientes</strong> presentes, com sigilo ético absoluto.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium">
                {error}
              </div>
            )}

            {/* Aviso de Sigilo Ético */}
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-primary/5 border border-primary/15 text-xs text-text-muted">
              <ShieldCheck size={18} className="text-primary shrink-0 mt-0.5" />
              <p>
                <strong>Sigilo Ético Garantido:</strong> O sistema salvará uma cópia criptografada (AES-256) no prontuário de cada participante presente. Se uma paciente solicitar seu prontuário, os nomes e dados dos demais integrantes estarão 100% protegidos.
              </p>
            </div>

            {/* Linha de Data e Horário */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-text mb-1.5">
                  Data da Sessão *
                </label>
                <input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 rounded-xl bg-surface border border-border text-text text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text mb-1.5">
                  Horário
                </label>
                <input
                  type="time"
                  value={horario}
                  onChange={(e) => setHorario(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface border border-border text-text text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
            </div>

            {/* Tema ou Pauta da Sessão */}
            <div>
              <label className="block text-xs font-medium text-text mb-1.5">
                Tema / Pauta Trabalhada
              </label>
              <input
                type="text"
                placeholder="Ex: Dinâmica da Linha da Vida, Discussão sobre limites e autoexigência..."
                value={tema}
                onChange={(e) => setTema(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-surface border border-border text-text text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-text-muted/50"
              />
            </div>

            {/* Resumo Coletivo / Ata da Sessão */}
            <div>
              <label className="block text-xs font-medium text-text mb-1.5">
                Dinâmica & Evolução Coletiva do Grupo *
              </label>
              <textarea
                rows={5}
                required
                placeholder="Descreva as intervenções realizadas, reflexões que emergiram no grupo, técnicas aplicadas e o andamento geral da sessão coletiva..."
                value={resumoColetivo}
                onChange={(e) => setResumoColetivo(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border text-text text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-text-muted/50 leading-relaxed"
              />
              <p className="mt-1 text-[11px] text-text-muted">
                Este texto formará a base da evolução clínica de todas as participantes presentes.
              </p>
            </div>

            {/* Lista de Chamada e Particularidades por Paciente */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-text uppercase tracking-wider">
                  Participantes & Notas Individuais ({presentesCount}/{membros.length})
                </label>
                <span className="text-[11px] text-text-muted">
                  Desmarque quem faltou
                </span>
              </div>

              <div className="space-y-2.5">
                {participantes.map((p) => (
                  <div
                    key={p.paciente_id}
                    className={`p-3 rounded-xl border transition-all ${
                      p.presente
                        ? "bg-surface-hover/40 border-border"
                        : "bg-surface/30 border-border/40 opacity-60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={p.presente}
                          onChange={() => togglePresenca(p.paciente_id)}
                          className="w-4 h-4 rounded-md border-border text-primary focus:ring-primary/20 cursor-pointer"
                        />
                        <span className="text-sm font-medium text-text sensitive-data">
                          {p.paciente_nome}
                        </span>
                      </label>

                      {p.presente && (
                        <button
                          type="button"
                          onClick={() => toggleShowNota(p.paciente_id)}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-dark font-medium cursor-pointer"
                        >
                          <span>
                            {p.nota_individual.trim()
                              ? "Nota Individual (Editada)"
                              : "+ Nota Individual"}
                          </span>
                          {p.showNota ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      )}
                    </div>

                    {/* Campo expansível de observação particular */}
                    {p.presente && (p.showNota || p.nota_individual.trim().length > 0) && (
                      <div className="mt-2.5 pt-2.5 border-t border-border/50">
                        <textarea
                          rows={2}
                          placeholder={`Observações exclusivas de ${p.paciente_nome} nesta sessão (ex: fala específica, comportamento observado, orientações)...`}
                          value={p.nota_individual}
                          onChange={(e) =>
                            updateNotaIndividual(p.paciente_id, e.target.value)
                          }
                          className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-text focus:outline-hidden focus:ring-1 focus:ring-primary/30 placeholder:text-text-muted/50 leading-relaxed sensitive-data"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Rodapé e Ação */}
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
                    <span>Criptografando e Salvando...</span>
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    <span>Registrar Sessão ({presentesCount} prontuários)</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
