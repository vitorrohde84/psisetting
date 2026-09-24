"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { decryptClinicalData } from "@/utils/crypto";
import { useSubscription } from "@/utils/subscription-context";
import {
  UsersRound,
  Plus,
  Calendar,
  Clock,
  DollarSign,
  Sparkles,
  Pencil,
  Trash2,
  MoreVertical,
  Loader2,
  Users,
  History,
  FileText,
} from "lucide-react";
import { Carregando } from "@/app/components/carregando";
import { GrupoFormModal, GrupoData } from "./grupo-form-modal";
import { GrupoSessaoModal, GrupoMembroInfo } from "./grupo-sessao-modal";

export interface GrupoWithDetails extends GrupoData {
  id: string;
  membros: GrupoMembroInfo[];
  total_sessoes: number;
}

export function GrupoList() {
  const supabase = createClient();
  const { isReadOnly, openSubscriptionModal } = useSubscription();

  const [grupos, setGrupos] = useState<GrupoWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  // Modais
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingGrupo, setEditingGrupo] = useState<GrupoData | null>(null);

  const [activeSessaoGrupo, setActiveSessaoGrupo] = useState<GrupoWithDetails | null>(null);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingGrupo, setDeletingGrupo] = useState<GrupoWithDetails | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchGrupos = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // 1. Carregar grupos
      const { data: gruposData, error: gruposError } = await supabase
        .from("grupos")
        .select("*")
        .order("created_at", { ascending: false });

      if (gruposError) {
        console.error("Erro ao carregar grupos:", gruposError);
        setLoading(false);
        return;
      }

      // 2. Carregar membros com dados do paciente
      const { data: membrosData } = await supabase
        .from("grupo_membros")
        .select("id, grupo_id, paciente_id, pacientes(id, nome)")
        .eq("ativo", true);

      // 3. Carregar contagem de sessões
      const { data: sessoesData } = await supabase
        .from("grupo_sessoes")
        .select("id, grupo_id");

      const sessoesCountMap: Record<string, number> = {};
      if (sessoesData) {
        for (const s of sessoesData) {
          sessoesCountMap[s.grupo_id] = (sessoesCountMap[s.grupo_id] || 0) + 1;
        }
      }

      // 4. Mapear e descriptografar nomes dos membros
      const membrosByGrupo: Record<string, GrupoMembroInfo[]> = {};
      if (membrosData) {
        for (const m of membrosData) {
          const pac = m.pacientes as unknown as { id: string; nome: string } | null;
          if (pac) {
            const decNome = await decryptClinicalData(pac.nome, user.id);
            if (!membrosByGrupo[m.grupo_id]) {
              membrosByGrupo[m.grupo_id] = [];
            }
            membrosByGrupo[m.grupo_id].push({
              id: m.id,
              paciente_id: pac.id,
              paciente_nome: decNome,
            });
          }
        }
      }

      const formatted: GrupoWithDetails[] = (gruposData || []).map((g) => ({
        ...g,
        membros: membrosByGrupo[g.id] || [],
        total_sessoes: sessoesCountMap[g.id] || 0,
      }));

      setGrupos(formatted);
    } catch (err) {
      console.error("Erro inesperado ao buscar grupos:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Carga inicial. fetchGrupos também serve para recarregar depois de salvar,
  // por isso liga o `loading` logo no começo; na abertura isso repete o valor
  // inicial (true) e não gera renderização extra — o resto do estado só muda
  // depois do await.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial; o único setState síncrono repete o valor inicial (loading = true), o resto vem depois do await
    fetchGrupos();
  }, [fetchGrupos]);

  function handleNovoGrupo() {
    if (isReadOnly) {
      openSubscriptionModal();
      return;
    }
    setEditingGrupo(null);
    setShowFormModal(true);
  }

  function handleEditarGrupo(g: GrupoWithDetails) {
    if (isReadOnly) {
      openSubscriptionModal();
      return;
    }
    setEditingGrupo(g);
    setShowFormModal(true);
    setOpenMenuId(null);
  }

  function handleIniciarSessao(g: GrupoWithDetails) {
    if (isReadOnly) {
      openSubscriptionModal();
      return;
    }
    setActiveSessaoGrupo(g);
  }

  async function handleDeleteConfirm() {
    if (!deletingGrupo) return;
    setIsDeleting(true);

    try {
      const { error } = await supabase
        .from("grupos")
        .delete()
        .eq("id", deletingGrupo.id);

      if (!error) {
        setGrupos((prev) => prev.filter((g) => g.id !== deletingGrupo.id));
      } else {
        console.error("Erro ao excluir grupo:", error);
      }
    } finally {
      setIsDeleting(false);
      setDeletingGrupo(null);
    }
  }

  const totalPacientesEmGrupos = grupos.reduce(
    (acc, g) => acc + g.membros.length,
    0
  );

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-text">
            Grupos Terapêuticos
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Gestão de grupos e evolução coletiva em lote com sigilo ético individual
          </p>
        </div>

        <button
          onClick={handleNovoGrupo}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark active:scale-[0.98] transition-all shadow-xs cursor-pointer shrink-0"
        >
          <Plus size={18} />
          <span>Novo Grupo</span>
        </button>
      </div>

      {/* Cards de Métricas / Estatísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-surface border border-border flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <UsersRound size={22} />
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted">Grupos Ativos</p>
            <p className="text-2xl font-bold text-text mt-0.5">{grupos.length}</p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-surface border border-border flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Users size={22} />
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted">Participantes nos Grupos</p>
            <p className="text-2xl font-bold text-text mt-0.5">
              {totalPacientesEmGrupos}
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-surface border border-border flex items-center gap-4">
          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <FileText size={22} />
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted">Sessões Coletivas Realizadas</p>
            <p className="text-2xl font-bold text-text mt-0.5">
              {grupos.reduce((acc, g) => acc + g.total_sessoes, 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Lista de Grupos */}
      {loading ? (
        <Carregando
          dadosClinicos
          mensagem="Carregando grupos terapêuticos…"
          className="py-20 bg-surface border border-border rounded-2xl"
        />
      ) : grupos.length === 0 ? (
        <div className="text-center py-16 px-4 bg-surface border border-border rounded-2xl space-y-4">
          <div className="inline-flex p-4 rounded-2xl bg-primary/10 text-primary mb-2">
            <UsersRound size={40} />
          </div>
          <h3 className="text-lg font-serif font-semibold text-text">
            Nenhum grupo terapêutico cadastrado
          </h3>
          <p className="text-sm text-text-muted max-w-md mx-auto">
            Crie seu primeiro grupo para reunir pacientes e evoluir as sessões coletivas de uma só vez, economizando tempo e mantendo cada prontuário protegido.
          </p>
          <button
            onClick={handleNovoGrupo}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-all cursor-pointer shadow-xs"
          >
            <Plus size={18} />
            <span>Criar Primeiro Grupo</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {grupos.map((g) => (
            <div
              key={g.id}
              className="bg-surface border border-border rounded-2xl p-5 hover:border-border/80 transition-all shadow-2xs flex flex-col justify-between relative group"
            >
              <div>
                {/* Linha superior do card */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-lg font-serif font-semibold text-text">
                      {g.nome}
                    </h3>
                    {g.descricao && (
                      <p className="text-xs text-text-muted mt-1 line-clamp-2 leading-relaxed">
                        {g.descricao}
                      </p>
                    )}
                  </div>

                  {/* Menu Dropdown de Opções */}
                  <div className="relative">
                    <button
                      onClick={() =>
                        setOpenMenuId(openMenuId === g.id ? null : g.id)
                      }
                      className="p-1.5 text-text-muted hover:text-text hover:bg-surface-hover rounded-lg transition-colors cursor-pointer"
                    >
                      <MoreVertical size={16} />
                    </button>

                    {openMenuId === g.id && (
                      <div className="absolute right-0 top-8 z-30 w-36 bg-surface border border-border rounded-xl shadow-lg py-1 animate-in fade-in zoom-in-95 duration-150">
                        <button
                          onClick={() => handleEditarGrupo(g)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text hover:bg-surface-hover transition-colors cursor-pointer text-left"
                        >
                          <Pencil size={14} />
                          <span>Editar Grupo</span>
                        </button>
                        <button
                          onClick={() => {
                            setDeletingGrupo(g);
                            setOpenMenuId(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer text-left"
                        >
                          <Trash2 size={14} />
                          <span>Excluir Grupo</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Badges de Cronograma e Valor */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {g.dia_semana && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-hover text-text text-xs font-medium border border-border/50">
                      <Calendar size={13} className="text-text-muted" />
                      {g.dia_semana}
                    </span>
                  )}
                  {g.horario && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-hover text-text text-xs font-medium border border-border/50">
                      <Clock size={13} className="text-text-muted" />
                      {g.horario}
                    </span>
                  )}
                  {Boolean(g.valor_sessao) && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-medium border border-emerald-500/20">
                      <DollarSign size={13} />
                      R$ {Number(g.valor_sessao).toFixed(2)} / sessão
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium border border-primary/20">
                    <History size={13} />
                    {g.total_sessoes} {g.total_sessoes === 1 ? "sessão" : "sessões"}
                  </span>
                </div>

                {/* Lista de Participantes */}
                <div className="pt-3 border-t border-border/60">
                  <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">
                    Participantes ({g.membros.length})
                  </p>
                  {g.membros.length === 0 ? (
                    <p className="text-xs text-text-muted italic">
                      Nenhuma participante vinculada a este grupo.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {g.membros.map((m) => (
                        <span
                          key={m.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-hover/80 text-text text-xs border border-border/60 sensitive-data"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          {m.paciente_nome}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Botão de Destaque: Nova Sessão em Lote */}
              <div className="mt-5 pt-3 border-t border-border/60 flex items-center justify-between gap-3">
                <button
                  onClick={() => handleEditarGrupo(g)}
                  className="text-xs text-text-muted hover:text-text font-medium cursor-pointer"
                >
                  Gerenciar Membros
                </button>

                <button
                  onClick={() => handleIniciarSessao(g)}
                  disabled={g.membros.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-dark active:scale-[0.98] transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles size={14} />
                  <span>Evoluir Sessão do Grupo</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Criação / Edição de Grupo */}
      {showFormModal && (
        <GrupoFormModal
          grupo={editingGrupo}
          onClose={() => setShowFormModal(false)}
          onSaved={() => {
            setShowFormModal(false);
            fetchGrupos();
          }}
        />
      )}

      {/* Modal de Evolução Coletiva em Lote */}
      {activeSessaoGrupo && (
        <GrupoSessaoModal
          grupo={activeSessaoGrupo}
          membros={activeSessaoGrupo.membros}
          onClose={() => setActiveSessaoGrupo(null)}
          onSaved={() => {
            setActiveSessaoGrupo(null);
            fetchGrupos();
          }}
        />
      )}

      {/* Modal de Confirmação de Exclusão */}
      {deletingGrupo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-serif font-semibold text-text">
              Excluir Grupo Terapêutico
            </h3>
            <p className="text-sm text-text-muted leading-relaxed">
              Tem certeza que deseja excluir o grupo{" "}
              <strong className="text-text">{deletingGrupo.nome}</strong>?
            </p>
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              <strong>Aviso:</strong> Os prontuários e evoluções individuais que já foram gerados e salvos para as pacientes continuarão preservados em seus respectivos históricos.
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingGrupo(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-sm text-text-muted hover:text-text hover:bg-surface-hover transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    <span>Confirmar Exclusão</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
