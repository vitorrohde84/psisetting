"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import { decryptClinicalData, ehCifrado } from "@/utils/crypto";
import { useSubscription } from "@/utils/subscription-context";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  GraduationCap,
  Loader2,
  MapPin,
  MessagesSquare,
  Pencil,
  Plus,
  Presentation,
  Repeat,
  Trash2,
  Video,
} from "lucide-react";
import { Carregando } from "@/app/components/carregando";
import { BotaoWhatsApp } from "@/app/components/botao-whatsapp";
import {
  COLUNAS_SUPERVISAO_AGENDA,
  agruparPorData,
  deslocarMes,
  formatarMoeda,
  hojeLocal,
  horarioCurto,
  horarioFim,
  intervaloDoMes,
  mesDaData,
  normalizarLinha,
  resumoFinanceiroDoMes,
  rotuloMes,
  rotuloModalidade,
  rotuloPago,
  rotuloPapel,
  rotuloStatus,
  type PapelSupervisao,
  type StatusSupervisao,
  type SupervisaoAgenda,
  type TotaisDoLado,
} from "@/utils/supervisao-agenda";

export const TABELA_SUPERVISOES = "agenda_supervisoes";

/** Passadas vêm em páginas: anos de supervisão semanal não descem de uma vez. */
const PAGINA_PASSADAS = 30;
/** Teto das próximas. Uma série tem no máximo 52; 200 cobre várias séries juntas. */
const LIMITE_PROXIMAS = 200;

// ─────────────────────────────────────────────────────────────────────────────
// Banco
// ─────────────────────────────────────────────────────────────────────────────

interface OpcoesCarga {
  /** data >= de */
  de?: string;
  /** data <= ate */
  ate?: string;
  /** data < antesDe */
  antesDe?: string;
  papel?: PapelSupervisao | null;
  ordem?: "asc" | "desc";
  limite?: number;
  offset?: number;
}

/**
 * Lê supervisões num intervalo, numa consulta só. `observacoes` volta como
 * está no banco (cifrada): decifrar é escolha de quem vai mostrar o texto —
 * o calendário de Atendimentos não mostra e por isso não decifra.
 *
 * Devolve null quando a leitura falha. Quem chama mostra "não foi possível
 * carregar" em vez de uma lista vazia: zero supervisões, quando na verdade
 * elas só não vieram, faria o psicólogo achar que perdeu a agenda. Também é o
 * que acontece se o código subir antes da migração
 * 20260923140000_agenda_supervisoes.sql: os atendimentos seguem normais.
 */
export async function carregarSupervisoes(
  supabase: SupabaseClient,
  opcoes: OpcoesCarga = {}
): Promise<SupervisaoAgenda[] | null> {
  const crescente = (opcoes.ordem ?? "asc") === "asc";
  let consulta = supabase
    .from(TABELA_SUPERVISOES)
    .select(COLUNAS_SUPERVISAO_AGENDA)
    .order("data", { ascending: crescente })
    .order("horario", { ascending: true })
    // Desempate estável: sem ele, uma página pode repetir ou pular linha.
    .order("id", { ascending: true });

  if (opcoes.de) consulta = consulta.gte("data", opcoes.de);
  if (opcoes.ate) consulta = consulta.lte("data", opcoes.ate);
  if (opcoes.antesDe) consulta = consulta.lt("data", opcoes.antesDe);
  if (opcoes.papel) consulta = consulta.eq("papel", opcoes.papel);
  if (opcoes.limite) {
    const inicio = opcoes.offset ?? 0;
    consulta = consulta.range(inicio, inicio + opcoes.limite - 1);
  }

  const { data, error } = await consulta;
  if (error) {
    console.error("Erro ao carregar supervisões:", error);
    return null;
  }
  return ((data ?? []) as Record<string, unknown>[]).map(normalizarLinha);
}

/** Decifra só o que está cifrado; texto sem prefixo volta como está. */
export async function decifrarObservacoes(
  lista: SupervisaoAgenda[],
  userId: string
): Promise<SupervisaoAgenda[]> {
  return Promise.all(
    lista.map(async (s) =>
      s.observacoes && ehCifrado(s.observacoes)
        ? { ...s, observacoes: await decryptClinicalData(s.observacoes, userId) }
        : s
    )
  );
}

/** Mensagem legível para os erros que têm causa conhecida. */
export function mensagemErroSupervisao(
  error: { code?: string; message?: string } | null | undefined,
  padrao: string
): string {
  if (error?.code === "PGRST205" || error?.code === "42P01") {
    return "A agenda de supervisões ainda não foi ativada no banco de dados. Avise o suporte.";
  }
  if (error?.code === "23514") {
    return "Algum campo ficou fora do permitido (confira duração, valor e WhatsApp).";
  }
  return padrao;
}

export type AcaoSerie = "cancelar" | "excluir";
export type EscopoSerie = "so_esta" | "esta_e_proximas";

/**
 * Cancela ou exclui uma supervisão — ou ela e as seguintes da mesma série.
 *
 * "As seguintes" é pela DATA (>= a desta), não pela ordem de criação: se uma
 * ocorrência foi remarcada para mais cedo, ela sai junto só se ainda estiver
 * na frente. Ao cancelar em série, as já realizadas ficam como estão:
 * supervisão que aconteceu não "desacontece".
 *
 * `.select("id")` transforma "0 linhas afetadas" (excluída em outra aba, ou
 * barrada pela RLS) em erro visível, em vez de sucesso falso.
 */
export async function aplicarNaSupervisao(
  supabase: SupabaseClient,
  alvo: Pick<SupervisaoAgenda, "id" | "data" | "serie_id">,
  acao: AcaoSerie,
  escopo: EscopoSerie
): Promise<{ erro: string | null; afetadas: number }> {
  const serieId = escopo === "esta_e_proximas" ? alvo.serie_id : null;

  let resultado;
  if (acao === "excluir") {
    const base = supabase.from(TABELA_SUPERVISOES).delete();
    resultado = serieId
      ? await base.eq("serie_id", serieId).gte("data", alvo.data).select("id")
      : await base.eq("id", alvo.id).select("id");
  } else {
    const base = supabase.from(TABELA_SUPERVISOES).update({ status: "cancelada" });
    resultado = serieId
      ? await base.eq("serie_id", serieId).gte("data", alvo.data).eq("status", "agendada").select("id")
      : await base.eq("id", alvo.id).select("id");
  }

  if (resultado.error) {
    console.error(`Erro ao ${acao} supervisão:`, resultado.error);
    return {
      erro: mensagemErroSupervisao(
        resultado.error,
        acao === "excluir"
          ? "Não foi possível excluir a supervisão. Tente novamente."
          : "Não foi possível cancelar a supervisão. Tente novamente."
      ),
      afetadas: 0,
    };
  }

  const afetadas = resultado.data?.length ?? 0;
  if (afetadas === 0) {
    return {
      erro: "Nada foi alterado: a supervisão pode ter sido excluída em outra aba. Atualize a página.",
      afetadas,
    };
  }
  return { erro: null, afetadas };
}

// ─────────────────────────────────────────────────────────────────────────────
// Peças visuais compartilhadas com o calendário de Atendimentos
//
// Supervisão tem a cor terrosa do "S" da marca (brand-setting) e o mesmo ícone
// do bloco de supervisão do Diário de Bordo: é o mesmo assunto nas duas telas.
// O texto fica sempre na cor de leitura (text-text): o taupe sobre fundo claro
// não passa de 4,3:1 e, em letra de 10px, não se lê bem — ele entra só em
// borda e ícone.
// ─────────────────────────────────────────────────────────────────────────────

const CLASSE_STATUS: Record<StatusSupervisao, string> = {
  agendada: "bg-secondary/30 text-text",
  realizada: "bg-primary/10 text-primary",
  cancelada: "bg-danger/10 text-danger",
};

export function ChipStatusSupervisao({ status, pequeno = false }: { status: StatusSupervisao; pequeno?: boolean }) {
  return (
    <span
      className={`${pequeno ? "text-[10px] px-1.5" : "text-[11px] px-2"} font-medium py-0.5 rounded-full shrink-0 ${CLASSE_STATUS[status]}`}
    >
      {rotuloStatus(status)}
    </span>
  );
}

/** Etiqueta "Supervisão" — o que distingue o item de um atendimento na Agenda. */
export function SeloSupervisao() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-text bg-secondary/40 px-1.5 py-0.5 rounded shrink-0">
      <MessagesSquare size={11} className="text-brand-setting" aria-hidden="true" />
      Supervisão
    </span>
  );
}

function SeloPapel({ papel }: { papel: PapelSupervisao }) {
  const Icone = papel === "supervisor" ? Presentation : GraduationCap;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
        papel === "supervisor" ? "bg-primary/10 text-primary" : "bg-brand-setting/15 text-text"
      }`}
    >
      <Icone size={12} aria-hidden="true" />
      {rotuloPapel(papel)}
    </span>
  );
}

function Modalidade({ modalidade }: { modalidade: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {modalidade === "online" ? <Video size={11} aria-hidden="true" /> : <MapPin size={11} aria-hidden="true" />}
      {rotuloModalidade(modalidade)}
    </span>
  );
}

/** Linha dentro da célula do calendário. Sem nome: a célula é pequena e fica à vista. */
export function ChipSupervisaoCalendario({ supervisao }: { supervisao: SupervisaoAgenda }) {
  return (
    <div
      className="text-[10px] font-medium truncate px-1 py-0.5 rounded bg-brand-setting/15 text-text border-l-2 border-brand-setting"
      title="Supervisão"
    >
      {horarioCurto(supervisao.horario)} Supervisão
    </div>
  );
}

/** Cartão do painel do dia. O cartão inteiro abre a edição. */
export function CartaoSupervisaoDia({
  supervisao: s,
  onAbrir,
}: {
  supervisao: SupervisaoAgenda;
  onAbrir: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={`Supervisão às ${horarioCurto(s.horario)}: abrir para editar`}
      className="w-full text-left p-3 rounded-xl bg-secondary/10 border border-secondary/40 border-l-4 border-l-brand-setting
                 hover:bg-secondary/20 transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <SeloSupervisao />
        <ChipStatusSupervisao status={s.status} pequeno />
      </div>
      <p className="text-sm font-medium text-text truncate">
        <span className="sensitive-data">{s.colega_nome}</span>
      </p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1">
          <Clock size={11} aria-hidden="true" />
          {horarioCurto(s.horario)} ({s.duracao_minutos}min)
        </span>
        <Modalidade modalidade={s.modalidade} />
        <span>{rotuloPapel(s.papel)}</span>
      </p>
    </button>
  );
}

/** Linha da visão "Lista" dos Atendimentos, no mesmo desenho das linhas de agendamento. */
export function LinhaSupervisaoLista({
  supervisao: s,
  onAbrir,
}: {
  supervisao: SupervisaoAgenda;
  onAbrir: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={`Supervisão às ${horarioCurto(s.horario)}: abrir para editar`}
      // pl-4 + a borda de 4px mantêm o horário alinhado com o das linhas de atendimento (px-5).
      className="w-full flex items-center gap-4 pl-4 pr-5 py-3 text-left bg-secondary/10 border-l-4 border-l-brand-setting
                 hover:bg-secondary/20 transition-colors cursor-pointer"
    >
      <div className="shrink-0 w-14 text-center">
        <span className="text-sm font-semibold text-text">{horarioCurto(s.horario)}</span>
        <p className="text-[10px] text-text-muted">{s.duracao_minutos}min</p>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <SeloSupervisao />
          <p className="text-sm font-medium text-text truncate">
            <span className="sensitive-data">{s.colega_nome}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-text-muted">
          <Modalidade modalidade={s.modalidade} />
          <span>{rotuloPapel(s.papel)}</span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <ChipStatusSupervisao status={s.status} />
        <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
          <Pencil size={12} aria-hidden="true" /> Editar
        </span>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// "Só esta" ou "esta e as próximas"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pergunta o alcance de cancelar/excluir uma supervisão que faz parte de uma
 * série. Não é um confirm() porque são três respostas, e a errada ("esta e as
 * próximas" por engano) apagaria meses de agenda.
 *
 * z-[60]: também abre por cima do formulário de edição (z-50).
 */
export function DialogoEscopoSerie({
  acao,
  ocupado,
  onEscolher,
  onFechar,
}: {
  acao: AcaoSerie;
  ocupado: boolean;
  onEscolher: (escopo: EscopoSerie) => void;
  onFechar: () => void;
}) {
  const idTitulo = useId();
  const verbo = acao === "excluir" ? "excluir" : "cancelar";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-text/20 backdrop-blur-sm" onClick={ocupado ? undefined : onFechar} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className="relative w-full max-w-sm bg-surface rounded-2xl shadow-xl border border-border/60 p-6"
      >
        <h3 id={idTitulo} className="text-lg font-serif font-medium text-text">
          {acao === "excluir" ? "Excluir supervisão da série" : "Cancelar supervisão da série"}
        </h3>
        <p className="mt-2 text-sm text-text-muted leading-relaxed">
          Esta supervisão faz parte de uma série que se repete. O que você quer {verbo}?
        </p>
        <p className="mt-2 text-xs text-text-muted">
          {acao === "excluir"
            ? "Excluir não pode ser desfeito."
            : "As canceladas continuam na lista, marcadas como canceladas. As já realizadas não mudam."}
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            disabled={ocupado}
            onClick={() => onEscolher("so_esta")}
            className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm font-medium text-text
                       hover:border-primary/40 transition-colors cursor-pointer disabled:opacity-60"
          >
            Só esta
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => onEscolher("esta_e_proximas")}
            className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors cursor-pointer disabled:opacity-60 ${
              acao === "excluir" ? "bg-danger hover:bg-danger/90" : "bg-primary hover:bg-primary-dark"
            }`}
          >
            Esta e as próximas
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={onFechar}
            className="w-full px-4 py-2 rounded-xl text-sm font-medium text-text-muted hover:bg-background transition-colors cursor-pointer disabled:opacity-60"
          >
            {ocupado ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Aplicando…
              </span>
            ) : (
              "Voltar"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Aba "Supervisões"
// ─────────────────────────────────────────────────────────────────────────────

type Filtro = "todas" | PapelSupervisao;

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "supervisor", rotulo: "Eu supervisiono" },
  { valor: "supervisionado", rotulo: "Sou supervisionado(a)" },
];

interface Listas {
  chave: string;
  proximas: SupervisaoAgenda[];
  passadas: SupervisaoAgenda[];
  temMaisProximas: boolean;
  temMaisPassadas: boolean;
  erro: boolean;
}

interface SupervisoesAgendaProps {
  /** Muda quando o formulário (que mora na AgendaView) salva: hora de recarregar. */
  versao: number;
  onNova: () => void;
  onEditar: (s: SupervisaoAgenda) => void;
  /** Avisa a AgendaView para atualizar o calendário de Atendimentos. */
  onAlterou: () => void;
}

export function SupervisoesAgenda({ versao, onNova, onEditar, onAlterou }: SupervisoesAgendaProps) {
  const supabase = createClient();
  const { isReadOnly, openSubscriptionModal } = useSubscription();
  const hoje = useMemo(() => hojeLocal(), []);

  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [mesResumo, setMesResumo] = useState(() => mesDaData(hoje));
  // Recarga interna, depois de cancelar/excluir (o alcance em série muda várias linhas).
  const [recarga, setRecarga] = useState(0);

  const papel = filtro === "todas" ? null : filtro;

  // Cada leitura é marcada com a "chave" do que foi pedido; enquanto a chave
  // guardada não bate com a atual, a tela está carregando. Assim nenhum
  // setState roda antes da resposta chegar, e uma resposta atrasada de um
  // filtro antigo não sobrescreve a do filtro novo.
  const chaveListas = `${filtro}|${versao}|${recarga}`;
  const [listas, setListas] = useState<Listas | null>(null);
  const carregandoListas = listas?.chave !== chaveListas;

  const chaveResumo = `${mesResumo}|${versao}|${recarga}`;
  const [resumoCarregado, setResumoCarregado] = useState<{ chave: string; lista: SupervisaoAgenda[] | null } | null>(null);
  const carregandoResumo = resumoCarregado?.chave !== chaveResumo;

  const [carregandoMais, setCarregandoMais] = useState(false);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<{ alvo: SupervisaoAgenda; acao: AcaoSerie } | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const [proximas, passadas] = await Promise.all([
        carregarSupervisoes(supabase, { de: hoje, papel, ordem: "asc", limite: LIMITE_PROXIMAS + 1 }),
        carregarSupervisoes(supabase, { antesDe: hoje, papel, ordem: "desc", limite: PAGINA_PASSADAS + 1 }),
      ]);

      if (!user || !proximas || !passadas) {
        if (vivo) {
          setListas({ chave: chaveListas, proximas: [], passadas: [], temMaisProximas: false, temMaisPassadas: false, erro: true });
        }
        return;
      }

      const [proximasAbertas, passadasAbertas] = await Promise.all([
        decifrarObservacoes(proximas.slice(0, LIMITE_PROXIMAS), user.id),
        decifrarObservacoes(passadas.slice(0, PAGINA_PASSADAS), user.id),
      ]);
      if (!vivo) return;
      setListas({
        chave: chaveListas,
        proximas: proximasAbertas,
        passadas: passadasAbertas,
        temMaisProximas: proximas.length > LIMITE_PROXIMAS,
        temMaisPassadas: passadas.length > PAGINA_PASSADAS,
        erro: false,
      });
    })();
    return () => {
      vivo = false;
    };
  }, [supabase, chaveListas, hoje, papel]);

  // O resumo é do mês escolhido e dos dois papéis, independente do filtro:
  // cada cartão já é de um lado só.
  useEffect(() => {
    let vivo = true;
    const { inicio, fim } = intervaloDoMes(mesResumo);
    carregarSupervisoes(supabase, { de: inicio, ate: fim }).then((lista) => {
      if (vivo) setResumoCarregado({ chave: chaveResumo, lista });
    });
    return () => {
      vivo = false;
    };
  }, [supabase, chaveResumo, mesResumo]);

  const resumo = useMemo(
    // Só com a lista DO MÊS pedido: trocar de mês calculava o resumo novo sobre
    // a lista antiga e mostrava R$ 0,00 até a carga terminar.
    () =>
      resumoCarregado?.lista && resumoCarregado.chave === chaveResumo
        ? resumoFinanceiroDoMes(resumoCarregado.lista, mesResumo)
        : null,
    [resumoCarregado, mesResumo, chaveResumo]
  );

  // Mesmo padrão do "Novo Agendamento" em modo somente leitura: a ação abre o
  // modal de assinatura. Ler a agenda e o resumo continua liberado.
  function bloqueadoPelaAssinatura(): boolean {
    if (!isReadOnly) return false;
    openSubscriptionModal();
    return true;
  }

  /** Aplica a mudança nas três listas da tela sem recarregar (e sem perder a paginação). */
  function aplicarLocal(id: string, mudanca: Partial<SupervisaoAgenda>) {
    const trocar = (lista: SupervisaoAgenda[]) => lista.map((s) => (s.id === id ? { ...s, ...mudanca } : s));
    setListas((prev) => (prev ? { ...prev, proximas: trocar(prev.proximas), passadas: trocar(prev.passadas) } : prev));
    setResumoCarregado((prev) => (prev?.lista ? { ...prev, lista: trocar(prev.lista) } : prev));
  }

  async function atualizarCampos(
    s: SupervisaoAgenda,
    mudanca: Pick<Partial<SupervisaoAgenda>, "pago" | "status">,
    mensagemFalha: string
  ) {
    if (bloqueadoPelaAssinatura()) return;
    setOcupadoId(s.id);
    setErroAcao(null);

    const { data, error } = await supabase
      .from(TABELA_SUPERVISOES)
      .update(mudanca)
      .eq("id", s.id)
      .select("id");

    if (error || !data?.length) {
      console.error("Erro ao atualizar supervisão:", error);
      setErroAcao(mensagemErroSupervisao(error, mensagemFalha));
      setOcupadoId(null);
      return;
    }

    aplicarLocal(s.id, mudanca);
    setOcupadoId(null);
    onAlterou();
  }

  async function executar(alvo: SupervisaoAgenda, acao: AcaoSerie, escopo: EscopoSerie) {
    setOcupadoId(alvo.id);
    setErroAcao(null);
    const { erro } = await aplicarNaSupervisao(supabase, alvo, acao, escopo);
    setOcupadoId(null);
    setDialogo(null);
    if (erro) {
      setErroAcao(erro);
      return;
    }
    setRecarga((n) => n + 1);
    onAlterou();
  }

  function pedirCancelamentoOuExclusao(s: SupervisaoAgenda, acao: AcaoSerie) {
    if (bloqueadoPelaAssinatura()) return;
    if (s.serie_id) {
      setDialogo({ alvo: s, acao });
      return;
    }
    const pergunta =
      acao === "excluir"
        ? "Excluir esta supervisão? Esta ação não pode ser desfeita."
        : "Cancelar esta supervisão? Ela continua na lista, marcada como cancelada.";
    if (!confirm(pergunta)) return;
    executar(s, acao, "so_esta");
  }

  function editar(s: SupervisaoAgenda) {
    if (bloqueadoPelaAssinatura()) return;
    onEditar(s);
  }

  async function carregarAnteriores() {
    if (!listas || carregandoMais) return;
    setCarregandoMais(true);
    const chaveNoInicio = listas.chave;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const mais = await carregarSupervisoes(supabase, {
      antesDe: hoje,
      papel,
      ordem: "desc",
      limite: PAGINA_PASSADAS + 1,
      offset: listas.passadas.length,
    });
    if (!user || !mais) {
      setErroAcao("Não foi possível carregar as supervisões anteriores. Tente novamente.");
      setCarregandoMais(false);
      return;
    }
    const abertas = await decifrarObservacoes(mais.slice(0, PAGINA_PASSADAS), user.id);
    setListas((prev) => {
      if (!prev || prev.chave !== chaveNoInicio) return prev;
      const vistos = new Set(prev.passadas.map((s) => s.id));
      return {
        ...prev,
        passadas: [...prev.passadas, ...abertas.filter((s) => !vistos.has(s.id))],
        temMaisPassadas: mais.length > PAGINA_PASSADAS,
      };
    });
    setCarregandoMais(false);
  }

  const gruposProximas = useMemo(() => agruparPorData(listas?.proximas ?? [], "asc"), [listas]);
  const gruposPassadas = useMemo(() => agruparPorData(listas?.passadas ?? [], "desc"), [listas]);
  const mesAtual = mesDaData(hoje);

  function renderItem(s: SupervisaoAgenda) {
    return (
      <ItemSupervisao
        key={s.id}
        supervisao={s}
        ocupado={ocupadoId === s.id}
        onAlternarPago={() =>
          atualizarCampos(s, { pago: !s.pago }, "Não foi possível atualizar o pagamento. Tente novamente.")
        }
        onRealizada={() =>
          atualizarCampos(s, { status: "realizada" }, "Não foi possível marcar como realizada. Tente novamente.")
        }
        onEditar={() => editar(s)}
        onCancelar={() => pedirCancelamentoOuExclusao(s, "cancelar")}
        onExcluir={() => pedirCancelamentoOuExclusao(s, "excluir")}
      />
    );
  }

  function renderGrupos(grupos: { data: string; itens: SupervisaoAgenda[] }[]) {
    return grupos.map((g) => (
      <div key={g.data}>
        <div className="flex items-center justify-between px-5 py-2.5 bg-background/40 border-y border-border/20">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
            {new Date(g.data + "T12:00:00").toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              ...(g.data.slice(0, 4) !== hoje.slice(0, 4) ? { year: "numeric" } : {}),
            })}
          </span>
          {g.data === hoje && (
            <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase">
              Hoje
            </span>
          )}
        </div>
        <div className="divide-y divide-border/30">{g.itens.map(renderItem)}</div>
      </div>
    ));
  }

  return (
    <div className="space-y-6">
      {/* Resumo do mês */}
      <section aria-label="Resumo do mês">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
            Resumo de {rotuloMes(mesResumo)}
          </h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMesResumo((m) => deslocarMes(m, -1))}
              className="p-1.5 rounded-lg hover:bg-surface border border-transparent hover:border-border transition-all cursor-pointer"
              aria-label="Mês anterior"
              title="Mês anterior"
            >
              <ChevronLeft size={16} className="text-text-muted" />
            </button>
            {mesResumo !== mesAtual && (
              <button
                type="button"
                onClick={() => setMesResumo(mesAtual)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-primary bg-primary/8 hover:bg-primary/15 transition-colors cursor-pointer"
              >
                Este mês
              </button>
            )}
            <button
              type="button"
              onClick={() => setMesResumo((m) => deslocarMes(m, 1))}
              className="p-1.5 rounded-lg hover:bg-surface border border-transparent hover:border-border transition-all cursor-pointer"
              aria-label="Próximo mês"
              title="Próximo mês"
            >
              <ChevronRight size={16} className="text-text-muted" />
            </button>
          </div>
        </div>

        {!carregandoResumo && !resumo ? (
          <p className="text-sm text-danger bg-danger/5 border border-danger/15 rounded-xl p-3">
            Não foi possível calcular o resumo do mês.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CartaoResumo
              titulo="A receber"
              subtitulo="supervisões que você dá"
              totais={resumo?.aReceber ?? null}
              rotuloQuitado="já recebido"
              lado="entra"
            />
            <CartaoResumo
              titulo="A pagar"
              subtitulo="supervisões que você recebe"
              totais={resumo?.aPagar ?? null}
              rotuloQuitado="já pago"
              lado="sai"
            />
          </div>
        )}
        <p className="mt-2 text-[11px] text-text-muted">
          Valores das supervisões do mês, sem as canceladas. Ficam só aqui na Agenda — não entram no Financeiro.
        </p>
      </section>

      {/* Filtro por papel */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap bg-surface border border-border rounded-xl p-0.5" role="group" aria-label="Filtrar por papel">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              type="button"
              aria-pressed={filtro === f.valor}
              onClick={() => setFiltro(f.valor)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                filtro === f.valor ? "bg-primary text-white" : "text-text-muted hover:text-text"
              }`}
            >
              {f.rotulo}
            </button>
          ))}
        </div>
      </div>

      {erroAcao && (
        <div role="alert" className="p-3 rounded-xl bg-danger/5 border border-danger/15 text-sm text-danger">
          {erroAcao}
        </div>
      )}

      {carregandoListas ? (
        <Carregando className="py-16" />
      ) : listas?.erro ? (
        <div className="bg-surface rounded-xl border border-border/60 p-8 text-center">
          <p className="text-sm text-text-muted mb-3">Não foi possível carregar as supervisões.</p>
          <button
            type="button"
            onClick={() => setRecarga((n) => n + 1)}
            className="text-sm font-medium text-primary hover:text-primary-dark transition-colors cursor-pointer"
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        <>
          <section aria-labelledby="supervisoes-proximas" className="bg-surface rounded-xl border border-border/60 overflow-hidden">
            <h3 id="supervisoes-proximas" className="px-5 py-3 text-sm font-medium text-text">
              Próximas
            </h3>
            {gruposProximas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center border-t border-border/30">
                <MessagesSquare size={28} className="text-border mb-2" />
                <p className="text-sm text-text-muted mb-2">
                  {filtro === "todas" ? "Nenhuma supervisão marcada daqui para a frente." : "Nenhuma supervisão deste tipo daqui para a frente."}
                </p>
                <button
                  type="button"
                  onClick={onNova}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-dark font-medium transition-colors cursor-pointer"
                >
                  <Plus size={14} /> Nova supervisão
                </button>
              </div>
            ) : (
              renderGrupos(gruposProximas)
            )}
            {listas?.temMaisProximas && (
              <p className="px-5 py-3 text-xs text-text-muted border-t border-border/30">
                Mostrando as {LIMITE_PROXIMAS} próximas.
              </p>
            )}
          </section>

          <section aria-labelledby="supervisoes-passadas" className="bg-surface rounded-xl border border-border/60 overflow-hidden">
            <h3 id="supervisoes-passadas" className="px-5 py-3 text-sm font-medium text-text">
              Passadas
            </h3>
            {gruposPassadas.length === 0 ? (
              <p className="px-5 py-8 text-sm text-text-muted text-center border-t border-border/30">
                Nenhuma supervisão anterior a hoje.
              </p>
            ) : (
              renderGrupos(gruposPassadas)
            )}
            {listas?.temMaisPassadas && (
              <div className="px-5 py-3 border-t border-border/30 text-center">
                <button
                  type="button"
                  onClick={carregarAnteriores}
                  disabled={carregandoMais}
                  className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:text-primary-dark transition-colors cursor-pointer disabled:opacity-60"
                >
                  {carregandoMais && <Loader2 size={13} className="animate-spin" />}
                  Carregar anteriores
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {dialogo && (
        <DialogoEscopoSerie
          acao={dialogo.acao}
          ocupado={ocupadoId === dialogo.alvo.id}
          onEscolher={(escopo) => executar(dialogo.alvo, dialogo.acao, escopo)}
          onFechar={() => setDialogo(null)}
        />
      )}
    </div>
  );
}

function CartaoResumo({
  titulo,
  subtitulo,
  totais,
  rotuloQuitado,
  lado,
}: {
  titulo: string;
  subtitulo: string;
  totais: TotaisDoLado | null;
  rotuloQuitado: string;
  lado: "entra" | "sai";
}) {
  const Icone = lado === "entra" ? ArrowDownLeft : ArrowUpRight;
  return (
    <div className="bg-surface rounded-2xl border border-border/60 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div
          className={`p-2 rounded-lg shrink-0 ${
            lado === "entra" ? "bg-primary/10 text-primary" : "bg-brand-setting/15 text-brand-setting"
          }`}
        >
          <Icone size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">
            {titulo} <span className="font-normal text-text-muted">— {subtitulo}</span>
          </p>
          {totais ? (
            <>
              <p className="mt-1 text-2xl font-serif font-semibold text-text">
                <span className="sensitive-data">{formatarMoeda(totais.pendente)}</span>{" "}
                <span className="text-sm font-sans font-normal text-text-muted">
                  ({totais.qtdPendentes} {totais.qtdPendentes === 1 ? "pendente" : "pendentes"})
                </span>
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                <span className="sensitive-data">{formatarMoeda(totais.quitado)}</span> {rotuloQuitado} · total do mês{" "}
                <span className="sensitive-data">{formatarMoeda(totais.total)}</span>
              </p>
            </>
          ) : (
            <p className="mt-1 text-2xl font-serif font-semibold text-text-muted/50">
              <Loader2 size={18} className="animate-spin inline" aria-label="Carregando" />
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemSupervisao({
  supervisao: s,
  ocupado,
  onAlternarPago,
  onRealizada,
  onEditar,
  onCancelar,
  onExcluir,
}: {
  supervisao: SupervisaoAgenda;
  ocupado: boolean;
  onAlternarPago: () => void;
  onRealizada: () => void;
  onEditar: () => void;
  onCancelar: () => void;
  onExcluir: () => void;
}) {
  const temValor = s.valor !== null && s.valor > 0;
  const botaoIcone =
    "p-1.5 rounded-lg text-text-muted/70 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <article
      aria-busy={ocupado}
      className={`flex flex-col sm:flex-row sm:items-start gap-3 px-5 py-4 ${s.status === "cancelada" ? "opacity-70" : ""}`}
    >
      <div className="flex items-start gap-4 flex-1 min-w-0">
        <div className="shrink-0 w-14 text-center pt-0.5">
          <span className="text-sm font-semibold text-text">{horarioCurto(s.horario)}</span>
          <p className="text-[10px] text-text-muted">{s.duracao_minutos} min</p>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <SeloPapel papel={s.papel} />
            <ChipStatusSupervisao status={s.status} />
            {s.serie_id && (
              <span className="inline-flex items-center gap-1 text-[10px] text-text-muted" title="Faz parte de uma série">
                <Repeat size={11} aria-hidden="true" /> Série
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-text truncate">
            <span className="sensitive-data">{s.colega_nome}</span>
          </p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-xs text-text-muted">
            <Modalidade modalidade={s.modalidade} />
            <span>
              {horarioCurto(s.horario)}–{horarioFim(s.horario, s.duracao_minutos)}
            </span>
          </p>
          {s.observacoes && (
            <p className="mt-1.5 text-xs text-text-muted line-clamp-2 whitespace-pre-wrap sensitive-data">
              {s.observacoes}
            </p>
          )}
        </div>
      </div>

      {/* Dinheiro e ações. Nada clicável dentro de .sensitive-data: no Modo
          Privacidade ele deixa de receber clique. */}
      <div className="flex flex-wrap sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 pl-[72px] sm:pl-0">
        {temValor ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text sensitive-data">{formatarMoeda(s.valor ?? 0)}</span>
            <button
              type="button"
              onClick={onAlternarPago}
              disabled={ocupado}
              aria-pressed={s.pago}
              title={s.pago ? "Clique para voltar a pendente" : s.papel === "supervisor" ? "Marcar como recebido" : "Marcar como pago"}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                s.pago
                  ? "bg-primary/10 text-primary hover:bg-primary/15"
                  : "bg-secondary/30 text-text hover:bg-secondary/45"
              }`}
            >
              {s.pago ? <CheckCircle2 size={12} aria-hidden="true" /> : <Clock size={12} aria-hidden="true" />}
              {rotuloPago(s.papel, s.pago)}
            </button>
          </div>
        ) : s.valor === 0 ? (
          <span className="text-[11px] text-text-muted">Sem cobrança</span>
        ) : null}

        <div className="flex items-center gap-0.5">
          <BotaoWhatsApp telefone={s.colega_whatsapp} />
          {s.status === "agendada" && (
            <button
              type="button"
              onClick={onRealizada}
              disabled={ocupado}
              title="Marcar como realizada"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-text-muted
                         hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer disabled:opacity-50"
            >
              <CheckCheck size={14} aria-hidden="true" />
              Realizada
            </button>
          )}
          <button
            type="button"
            onClick={onEditar}
            disabled={ocupado}
            title="Editar supervisão"
            aria-label="Editar supervisão"
            className={`${botaoIcone} hover:text-text hover:bg-background`}
          >
            <Pencil size={14} />
          </button>
          {s.status === "agendada" && (
            <button
              type="button"
              onClick={onCancelar}
              disabled={ocupado}
              title="Cancelar supervisão"
              aria-label="Cancelar supervisão"
              className={`${botaoIcone} hover:text-danger hover:bg-danger/5`}
            >
              <Ban size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={onExcluir}
            disabled={ocupado}
            title="Excluir supervisão"
            aria-label="Excluir supervisão"
            className={`${botaoIcone} hover:text-danger hover:bg-danger/5`}
          >
            {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>
    </article>
  );
}
