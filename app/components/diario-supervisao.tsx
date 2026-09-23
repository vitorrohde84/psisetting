"use client";

import { useId, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import { useSubscription } from "@/utils/subscription-context";
import {
  MessagesSquare,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Save,
  Calendar,
  ShieldCheck,
  Lock,
} from "lucide-react";
import { decryptClinicalData, encryptClinicalData, ehCifrado } from "@/utils/crypto";
import {
  COLUNAS_SUPERVISAO,
  SUPERVISOR_MAX,
  agruparPorAnotacao,
  contemAvisoDeChave,
  dataBR,
  decifragemFalhou,
  hojeLocal,
  normalizarSupervisor,
  validarComentario,
  type ComentarioSupervisao,
} from "@/utils/diario-supervisao";

/**
 * Carrega, numa consulta só, os comentários de supervisão de um lote de
 * anotações (a página do diário que acabou de chegar) — nunca uma consulta por
 * anotação.
 *
 * Devolve null quando a leitura falha. Quem chama esconde os blocos de
 * supervisão em vez de mostrar "Supervisão (0)": zero comentários, quando na
 * verdade eles só não carregaram, faria o psicólogo achar que perdeu registro.
 * Também é o que acontece se o código subir antes da migração
 * 20260923130000_diario_supervisao.sql: o diário continua funcionando.
 */
export async function carregarSupervisoesDasAnotacoes(
  supabase: SupabaseClient,
  diarioIds: string[],
  userId: string
): Promise<Record<string, ComentarioSupervisao[]> | null> {
  if (diarioIds.length === 0) return {};

  const { data, error } = await supabase
    .from("diario_supervisoes")
    .select(COLUNAS_SUPERVISAO)
    .in("diario_id", diarioIds);

  if (error) {
    console.error("Erro ao carregar comentários de supervisão:", error);
    return null;
  }

  // Comentário que não abriu (chave indisponível) chega com o texto de aviso no
  // lugar do conteúdo. Fica marcado como ilegível para a tela não oferecer
  // "Editar": salvar gravaria o aviso por cima do comentário verdadeiro.
  const decifrados = await Promise.all(
    ((data ?? []) as ComentarioSupervisao[]).map(async (c) => {
      const conteudo = await decryptClinicalData(c.conteudo, userId);
      const supervisor = c.supervisor ? await decryptClinicalData(c.supervisor, userId) : null;
      return {
        ...c,
        conteudo,
        supervisor,
        ilegivel: decifragemFalhou(c.conteudo, conteudo) || decifragemFalhou(c.supervisor, supervisor),
      };
    })
  );

  // Anotação sem comentário também entra, com lista vazia: no "carregar
  // anteriores" o lote novo é mesclado sobre o que já estava na tela.
  const grupos = agruparPorAnotacao(decifrados);
  return Object.fromEntries(diarioIds.map((id) => [id, grupos[id] ?? []]));
}

/**
 * Salvar e excluir avisam o pai só do que mudou — nunca a lista inteira. O pai
 * aplica sobre o estado mais recente (setState(prev => …), com comComentario e
 * semComentario): uma lista montada a partir da prop capturada no clique fazia
 * um comentário excluído reaparecer quando um salvar terminava depois.
 */
interface DiarioSupervisaoProps {
  diarioId: string;
  comentarios: ComentarioSupervisao[];
  /** Comentário novo ou editado, já decifrado. */
  onUpsert: (diarioId: string, comentario: ComentarioSupervisao) => void;
  /** Comentário excluído no banco. */
  onRemove: (diarioId: string, comentarioId: string) => void;
}

/**
 * Bloco "Supervisão" de uma anotação do Diário de Bordo.
 *
 * Fica logo abaixo do texto da anotação, com a cor secundária (terrosa) e
 * ícone próprio, para a anotação original e o olhar da supervisão serem lidos
 * juntos sem se confundirem. Sem comentários, vira só um botão discreto — um
 * bloco colorido vazio em cada anotação seria ruído na linha do tempo.
 */
export function DiarioSupervisao({ diarioId, comentarios, onUpsert, onRemove }: DiarioSupervisaoProps) {
  const supabase = createClient();
  const { isReadOnly, openSubscriptionModal } = useSubscription();
  const idBase = useId();

  // null: formulário fechado. { id: null }: comentário novo. { id }: editando.
  const [edicao, setEdicao] = useState<{ id: string | null } | null>(null);
  const [form, setForm] = useState({ data: "", supervisor: "", conteudo: "" });
  const [salvando, setSalvando] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Mesmo padrão do "Adicionar Anotação" em modo somente leitura: a ação abre
  // o modal de assinatura. Ler os comentários continua liberado.
  function bloqueadoPelaAssinatura(): boolean {
    if (!isReadOnly) return false;
    openSubscriptionModal();
    return true;
  }

  function abrirNovo() {
    if (bloqueadoPelaAssinatura()) return;
    setForm({ data: hojeLocal(), supervisor: "", conteudo: "" });
    setErro(null);
    setEdicao({ id: null });
  }

  function abrirEdicao(c: ComentarioSupervisao) {
    // O botão nem aparece para ilegíveis; a guarda cobre qualquer outro caminho.
    if (c.ilegivel) return;
    if (bloqueadoPelaAssinatura()) return;
    setForm({ data: c.data_supervisao, supervisor: c.supervisor ?? "", conteudo: c.conteudo });
    setErro(null);
    setEdicao({ id: c.id });
  }

  function fechar() {
    setEdicao(null);
    setErro(null);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!edicao || salvando) return;

    // O aviso de chave indisponível nunca é gravado: cifrado, ele substituiria
    // no banco o comentário verdadeiro, sem volta.
    const original = edicao.id ? comentarios.find((c) => c.id === edicao.id) : undefined;
    if (original?.ilegivel || contemAvisoDeChave(form.conteudo, form.supervisor)) {
      setErro(
        "Não foi possível abrir este comentário — recarregue a página. Nada foi salvo, para não apagar o texto original."
      );
      return;
    }

    const problema = validarComentario(form);
    if (problema) {
      setErro(problema);
      return;
    }

    setSalvando(true);
    setErro(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setErro("Sessão expirada. Faça login novamente.");
      setSalvando(false);
      return;
    }

    const conteudo = form.conteudo.trim();
    const supervisor = normalizarSupervisor(form.supervisor);

    // encryptClinicalData devolve SEM cifrar o que já começa com o prefixo de
    // cifra (para não cifrar duas vezes). Texto digitado ou colado assim iria
    // ao banco em claro — recusa com explicação.
    if (ehCifrado(conteudo) || (supervisor && ehCifrado(supervisor))) {
      setErro('O comentário e o nome do supervisor não podem começar com "enc:v". Ajuste o início do texto e salve de novo.');
      setSalvando(false);
      return;
    }

    // Texto e nome do supervisor são dado clínico: saem do navegador cifrados,
    // com a mesma função do diário. Se a cifragem falhar, NADA é gravado — o
    // comentário jamais vai ao banco em claro.
    let conteudoCifrado: string;
    let supervisorCifrado: string | null;
    try {
      conteudoCifrado = await encryptClinicalData(conteudo, user.id);
      supervisorCifrado = supervisor ? await encryptClinicalData(supervisor, user.id) : null;
      if (!ehCifrado(conteudoCifrado) || (supervisorCifrado !== null && !ehCifrado(supervisorCifrado))) {
        throw new Error("A cifragem não devolveu um valor cifrado.");
      }
    } catch (err) {
      console.error("Falha ao cifrar comentário de supervisão:", err);
      setErro("Não foi possível proteger o comentário com criptografia, então nada foi salvo. Tente novamente.");
      setSalvando(false);
      return;
    }

    const payload = {
      data_supervisao: form.data,
      supervisor: supervisorCifrado,
      conteudo: conteudoCifrado,
    };

    // .single() também transforma "0 linhas afetadas" (comentário excluído em
    // outra aba, ou barrado pela RLS) em erro visível, em vez de sucesso falso.
    const resultado = edicao.id
      ? await supabase
          .from("diario_supervisoes")
          .update(payload)
          .eq("id", edicao.id)
          .select(COLUNAS_SUPERVISAO)
          .single()
      : await supabase
          .from("diario_supervisoes")
          .insert({ ...payload, diario_id: diarioId, psicologo_id: user.id })
          .select(COLUNAS_SUPERVISAO)
          .single();

    if (resultado.error || !resultado.data) {
      console.error("Erro ao salvar comentário de supervisão:", resultado.error);
      setErro("Não foi possível salvar o comentário. Tente novamente.");
      setSalvando(false);
      return;
    }

    // O banco devolve o texto cifrado; a tela fica com o claro que acabou de
    // ser digitado, sem decifrar de novo.
    const salvo: ComentarioSupervisao = {
      ...(resultado.data as ComentarioSupervisao),
      conteudo,
      supervisor,
    };
    onUpsert(diarioId, salvo);
    setSalvando(false);
    setEdicao(null);
  }

  async function excluir(c: ComentarioSupervisao) {
    if (bloqueadoPelaAssinatura()) return;
    // Excluir continua liberado para o ilegível (pode ser um registro já
    // estragado), mas quem exclui precisa saber que não está vendo o texto.
    const pergunta = c.ilegivel
      ? "Este comentário não pôde ser aberto agora, então você não está vendo o texto dele. Recarregar a página costuma resolver. Excluir mesmo assim? Esta ação não pode ser desfeita."
      : "Excluir este comentário de supervisão? Esta ação não pode ser desfeita.";
    if (!confirm(pergunta)) return;

    setExcluindoId(c.id);
    setErro(null);

    const { error } = await supabase.from("diario_supervisoes").delete().eq("id", c.id);

    if (error) {
      console.error("Erro ao excluir comentário de supervisão:", error);
      setErro("Não foi possível excluir o comentário. Tente novamente.");
      setExcluindoId(null);
      return;
    }

    if (edicao?.id === c.id) setEdicao(null);
    onRemove(diarioId, c.id);
    setExcluindoId(null);
  }

  const total = comentarios.length;

  // Sem comentários e sem formulário aberto: só o convite para registrar.
  if (total === 0 && !edicao) {
    return (
      <div className="pt-1">
        <button
          type="button"
          onClick={abrirNovo}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-secondary/70
                     text-xs font-medium text-text-muted hover:text-text hover:bg-secondary/10 hover:border-secondary
                     transition-colors cursor-pointer"
        >
          <MessagesSquare size={14} className="text-brand-setting" />
          Adicionar comentário de supervisão
        </button>
      </div>
    );
  }

  const alertaErro = erro && (
    <div role="alert" className="p-2.5 bg-danger/10 border border-danger/20 rounded-lg text-danger text-xs">
      {erro}
    </div>
  );

  const formulario = edicao && (
    <form
      onSubmit={salvar}
      className="rounded-lg bg-surface border border-secondary/50 p-4 space-y-3"
    >
      {alertaErro}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor={`${idBase}-data`}
            className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1"
          >
            Data da supervisão *
          </label>
          <input
            id={`${idBase}-data`}
            type="date"
            required
            max={hojeLocal()}
            value={form.data}
            onChange={(e) => setForm((prev) => ({ ...prev, data: e.target.value }))}
            className="w-full p-2 rounded-lg bg-background border border-border text-text text-sm focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30 transition-all"
          />
        </div>
        <div>
          <label
            htmlFor={`${idBase}-supervisor`}
            className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1"
          >
            Supervisor(a)
          </label>
          <input
            id={`${idBase}-supervisor`}
            type="text"
            maxLength={SUPERVISOR_MAX}
            placeholder="Opcional — ex.: Dra. Ana"
            value={form.supervisor}
            onChange={(e) => setForm((prev) => ({ ...prev, supervisor: e.target.value }))}
            className="w-full p-2 rounded-lg bg-background border border-border text-text text-sm placeholder:text-text-muted/60 focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30 transition-all"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor={`${idBase}-conteudo`}
          className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1"
        >
          Comentário da supervisão *
        </label>
        <textarea
          id={`${idBase}-conteudo`}
          required
          rows={4}
          autoFocus
          placeholder="O que a supervisão trouxe sobre esta sessão: outro olhar sobre o caso, hipóteses, sugestões de manejo…"
          value={form.conteudo}
          onChange={(e) => setForm((prev) => ({ ...prev, conteudo: e.target.value }))}
          className="w-full p-3 rounded-lg bg-background border border-border text-text text-sm placeholder:text-text-muted/60 focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30 transition-all resize-y leading-relaxed font-serif"
        />
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
        <span className="text-[10px] text-text-muted flex items-center gap-1">
          <ShieldCheck size={11} className="text-success" />
          Cifrado com AES-256 antes de sair do navegador
        </span>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={fechar}
            disabled={salvando}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:bg-background transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary-dark active:scale-[0.98] transition-all disabled:opacity-60 cursor-pointer shadow-xs"
          >
            {salvando ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Criptografando…</span>
              </>
            ) : (
              <>
                <Save size={13} />
                <span>Salvar comentário</span>
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );

  return (
    <section
      aria-label="Comentários de supervisão"
      className="rounded-xl border border-secondary/40 border-l-4 border-l-secondary bg-secondary/10 p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text">
          <span className="w-6 h-6 rounded-lg bg-secondary/25 text-brand-setting flex items-center justify-center shrink-0">
            <MessagesSquare size={13} />
          </span>
          {total > 0 ? `Supervisão (${total})` : "Supervisão"}
        </h5>

        {!edicao && (
          <button
            type="button"
            onClick={abrirNovo}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-text-muted hover:text-text hover:bg-secondary/20 transition-colors cursor-pointer"
          >
            <Plus size={13} className="text-brand-setting" />
            Adicionar comentário de supervisão
          </button>
        )}
      </div>

      {/* Erro de exclusão (com o formulário aberto, o erro aparece dentro dele). */}
      {!edicao && alertaErro}

      {comentarios.map((c) =>
        edicao?.id === c.id ? (
          <div key={c.id}>{formulario}</div>
        ) : (
          <article
            key={c.id}
            className="rounded-lg bg-surface border border-secondary/30 p-3.5"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-text-muted">
                <Calendar size={12} className="text-brand-setting shrink-0" />
                <span>Supervisão em {dataBR(c.data_supervisao) || "data não informada"}</span>
                {/* Ilegível: o "nome" seria o texto de aviso da decifragem. */}
                {c.supervisor && !c.ilegivel && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-text sensitive-data">{c.supervisor}</span>
                  </>
                )}
              </p>

              <div className="flex items-center gap-0.5 shrink-0">
                {/* Sem "Editar" para ilegível: o formulário abriria com o texto
                    de aviso, e salvar o gravaria por cima do comentário real. */}
                {!c.ilegivel && (
                  <button
                    type="button"
                    onClick={() => abrirEdicao(c)}
                    disabled={excluindoId === c.id}
                    className="p-1.5 rounded-lg text-text-muted/60 hover:text-text hover:bg-secondary/15 transition-colors cursor-pointer disabled:opacity-50"
                    title="Editar comentário de supervisão"
                    aria-label="Editar comentário de supervisão"
                  >
                    <Pencil size={13} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => excluir(c)}
                  disabled={excluindoId === c.id}
                  className="p-1.5 rounded-lg text-text-muted/60 hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer disabled:opacity-50"
                  title="Excluir comentário de supervisão"
                  aria-label="Excluir comentário de supervisão"
                >
                  {excluindoId === c.id ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Trash2 size={13} />
                  )}
                </button>
              </div>
            </div>

            {c.ilegivel ? (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-text-muted italic">
                <Lock size={12} className="text-brand-setting shrink-0 mt-0.5" />
                <span>
                  Não foi possível abrir este comentário agora — recarregue a página. Ele continua
                  guardado; só não pode ser editado enquanto não abrir.
                </span>
              </p>
            ) : (
              <p className="mt-2 font-serif text-sm text-text leading-relaxed whitespace-pre-wrap sensitive-data">
                {c.conteudo}
              </p>
            )}
          </article>
        )
      )}

      {edicao?.id === null && formulario}
    </section>
  );
}
