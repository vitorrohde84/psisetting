"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { decryptClinicalData, encryptClinicalData, ehCifrado, TEXTO_CHAVE_INDISPONIVEL } from "@/utils/crypto";
import { GraduationCap, Loader2, Presentation, Save, ShieldCheck, TriangleAlert, X } from "lucide-react";
import {
  COLEGA_NOME_MAX,
  DURACAO_MAX,
  DURACAO_MIN,
  DURACAO_PADRAO,
  REPETICOES_MAX,
  conflitosNasDatas,
  dataBR,
  ehDataValida,
  gerarDatasRecorrencia,
  horarioCurto,
  lerValor,
  minutosDoHorario,
  normalizarColegaNome,
  normalizarWhatsApp,
  rotuloColega,
  rotuloPapel,
  validarSupervisao,
  type Compromisso,
  type ConflitoNaData,
  type FrequenciaRecorrencia,
  type ModalidadeSupervisao,
  type PapelSupervisao,
  type StatusSupervisao,
  type SupervisaoAgenda,
} from "@/utils/supervisao-agenda";
import {
  DialogoEscopoSerie,
  TABELA_SUPERVISOES,
  aplicarNaSupervisao,
  mensagemErroSupervisao,
  type EscopoSerie,
} from "./supervisoes-agenda";

interface SupervisaoAgendaFormModalProps {
  /** null = nova supervisão. */
  supervisao: SupervisaoAgenda | null;
  /** Data já escolhida (ex.: aberto a partir de um dia do calendário). */
  prefillDate?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  papel: PapelSupervisao;
  colega_nome: string;
  colega_whatsapp: string;
  data: string;
  horario: string;
  duracao_minutos: string;
  modalidade: ModalidadeSupervisao;
  status: StatusSupervisao;
  valor: string;
  pago: boolean;
  observacoes: string;
}

const DESCRICAO_PAPEL: Record<PapelSupervisao, string> = {
  supervisor: "Um(a) colega traz casos para você",
  supervisionado: "Você leva seus casos a um(a) supervisor(a)",
};

/** 150 → "150"; 150.5 → "150,5": o campo mostra o número como se digita em português. */
function valorParaCampo(valor: number | null): string {
  return valor === null ? "" : String(valor).replace(".", ",");
}

export function SupervisaoAgendaFormModal({
  supervisao,
  prefillDate,
  onClose,
  onSaved,
}: SupervisaoAgendaFormModalProps) {
  const supabase = createClient();
  const isEditing = !!supervisao;

  // Observações chegam decifradas da aba Supervisões e cifradas do
  // calendário de Atendimentos (que não decifra o que não mostra).
  const obsJaAbertas = !supervisao?.observacoes || !ehCifrado(supervisao.observacoes);
  // Decifragem que falhou chega como o texto de aviso. Nesse caso as
  // observações ficam trancadas e NÃO entram no que é salvo: cifrar o aviso por
  // cima apagaria o registro verdadeiro sem volta.
  const [obsFalhou, setObsFalhou] = useState(
    obsJaAbertas && supervisao?.observacoes === TEXTO_CHAVE_INDISPONIVEL
  );
  const [obsIniciais, setObsIniciais] = useState<string | null>(
    obsJaAbertas && !obsFalhou ? (supervisao?.observacoes ?? "") : null
  );

  const [form, setForm] = useState<FormState>({
    papel: supervisao?.papel ?? "supervisor",
    colega_nome: supervisao?.colega_nome ?? "",
    colega_whatsapp: supervisao?.colega_whatsapp ?? "",
    data: supervisao?.data ?? prefillDate ?? "",
    horario: horarioCurto(supervisao?.horario),
    duracao_minutos: String(supervisao?.duracao_minutos ?? DURACAO_PADRAO),
    modalidade: supervisao?.modalidade ?? "presencial",
    status: supervisao?.status ?? "agendada",
    valor: valorParaCampo(supervisao?.valor ?? null),
    pago: supervisao?.pago ?? false,
    observacoes: obsJaAbertas && supervisao?.observacoes !== TEXTO_CHAVE_INDISPONIVEL ? (supervisao?.observacoes ?? "") : "",
  });

  const [repetir, setRepetir] = useState(false);
  const [frequencia, setFrequencia] = useState<FrequenciaRecorrencia>("semanal");
  const [vezes, setVezes] = useState("4");

  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [perguntarEscopo, setPerguntarEscopo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [conflitos, setConflitos] = useState<{ chave: string; lista: ConflitoNaData[] } | null>(null);

  // Decifra as observações quando o formulário foi aberto pelo calendário.
  useEffect(() => {
    const cifrada = supervisao?.observacoes;
    if (obsJaAbertas || !cifrada) return;
    let vivo = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !vivo) return;
      const texto = await decryptClinicalData(cifrada, user.id);
      if (!vivo) return;
      if (texto === TEXTO_CHAVE_INDISPONIVEL) {
        setObsFalhou(true);
        return;
      }
      setObsIniciais(texto);
      setForm((prev) => ({ ...prev, observacoes: texto }));
    })();
    return () => {
      vivo = false;
    };
  }, [supabase, obsJaAbertas, supervisao]);

  const criandoSerie = !isEditing && repetir;
  const datasDaSerie = useMemo(() => {
    if (criandoSerie) return gerarDatasRecorrencia(form.data, frequencia, Number(vezes) || 1);
    return ehDataValida(form.data) ? [form.data] : [];
  }, [criandoSerie, form.data, frequencia, vezes]);

  // ── Aviso de conflito (NÃO bloqueia) ──────────────────────────────────────
  // Uma consulta por tabela para todas as datas da série, com uma pausa curta
  // para não consultar a cada tecla. Só horário e status: o aviso não precisa
  // do nome do paciente, e o que não é lido não aparece por engano.
  const duracaoNum = Number(form.duracao_minutos);
  const podeChecarConflito =
    form.status !== "cancelada" &&
    datasDaSerie.length > 0 &&
    minutosDoHorario(form.horario) !== null &&
    Number.isFinite(duracaoNum) &&
    duracaoNum > 0;
  const chaveConflito = podeChecarConflito
    ? `${datasDaSerie.join(",")}|${form.horario}|${duracaoNum}`
    : null;

  useEffect(() => {
    if (!chaveConflito) return;
    let vivo = true;
    const datas = datasDaSerie;
    const alvo = { id: supervisao?.id ?? null, horario: form.horario, duracao_minutos: duracaoNum };
    const espera = window.setTimeout(async () => {
      const [ags, sups] = await Promise.all([
        supabase.from("agendamentos").select("id, data, horario, duracao_minutos, status").in("data", datas),
        supabase.from(TABELA_SUPERVISOES).select("id, data, horario, duracao_minutos, status").in("data", datas),
      ]);
      if (!vivo) return;
      const compromissos: Compromisso[] = [
        ...((ags.data ?? []) as Omit<Compromisso, "tipo">[]).map((a) => ({ ...a, tipo: "atendimento" as const })),
        ...((sups.data ?? []) as Omit<Compromisso, "tipo">[]).map((s) => ({ ...s, tipo: "supervisao" as const })),
      ];
      setConflitos({ chave: chaveConflito, lista: conflitosNasDatas(datas, alvo, compromissos) });
    }, 400);
    return () => {
      vivo = false;
      window.clearTimeout(espera);
    };
  }, [supabase, chaveConflito, datasDaSerie, form.horario, duracaoNum, supervisao?.id]);

  // Resposta de uma combinação antiga de data/horário não vale para a atual.
  const conflitosAtuais = conflitos && conflitos.chave === chaveConflito ? conflitos.lista : [];

  function set<K extends keyof FormState>(campo: K, valor: FormState[K]) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  const valorLido = lerValor(form.valor);
  const temValor = valorLido.valor !== null && valorLido.valor > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setErro(null);

    const problema = validarSupervisao({
      colega_nome: form.colega_nome,
      colega_whatsapp: form.colega_whatsapp,
      data: form.data,
      horario: form.horario,
      duracao_minutos: form.duracao_minutos,
      valor: form.valor,
      repetir: criandoSerie,
      vezes,
    });
    if (problema) {
      setErro(problema);
      return;
    }
    if (isEditing && obsIniciais === null && !obsFalhou) {
      setErro("Aguarde as observações terminarem de carregar.");
      return;
    }

    setSalvando(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setErro("Sessão expirada. Faça login novamente.");
      setSalvando(false);
      return;
    }

    // Observações podem citar caso clínico levado à supervisão: saem do
    // navegador cifradas, com a mesma função do agendamento. Se a cifragem
    // falhar, NADA é gravado — e o banco recusaria texto claro de qualquer
    // jeito (CHECK agenda_supervisoes_observacoes_cifradas_chk).
    //
    // Na edição, observação que não mudou nem vai no pacote: não há por que
    // cifrar de novo, e uma falha ao decifrar ("[Conteúdo protegido…]") não
    // pode acabar gravada por cima do texto verdadeiro.
    const obs = form.observacoes.trim();
    const obsMudou = !obsFalhou && (!isEditing || obs !== (obsIniciais ?? "").trim());
    // encryptClinicalData devolve SEM cifrar o que já começa com o prefixo de
    // cifra (para não cifrar duas vezes). Um texto digitado ou colado assim
    // iria para o banco em claro — recusa com explicação.
    if (obsMudou && obs && ehCifrado(obs)) {
      setErro('As observações não podem começar com "enc:v". Ajuste o início do texto e salve de novo.');
      setSalvando(false);
      return;
    }
    let obsCifrada: string | null | undefined;
    if (obsMudou) {
      if (!obs) {
        obsCifrada = null;
      } else {
        try {
          obsCifrada = await encryptClinicalData(obs, user.id);
          if (!ehCifrado(obsCifrada)) throw new Error("A cifragem não devolveu um valor cifrado.");
        } catch (err) {
          console.error("Falha ao cifrar observações da supervisão:", err);
          setErro("Não foi possível proteger as observações com criptografia, então nada foi salvo. Tente novamente.");
          setSalvando(false);
          return;
        }
      }
    }

    const valor = lerValor(form.valor).valor;
    const base = {
      papel: form.papel,
      colega_nome: normalizarColegaNome(form.colega_nome),
      colega_whatsapp: normalizarWhatsApp(form.colega_whatsapp),
      horario: form.horario.length === 5 ? `${form.horario}:00` : form.horario,
      duracao_minutos: Number(form.duracao_minutos),
      modalidade: form.modalidade,
      status: form.status,
      valor,
      // Série nova nasce toda pendente (ver o aviso no formulário); sem
      // valor, "pago" não quer dizer nada.
      pago: valor !== null && valor > 0 && !criandoSerie ? form.pago : false,
      ...(obsCifrada !== undefined ? { observacoes: obsCifrada } : {}),
    };

    if (isEditing) {
      // .select().single() transforma "0 linhas" (excluída em outra aba) em erro visível.
      const { error } = await supabase
        .from(TABELA_SUPERVISOES)
        .update({ ...base, data: form.data })
        .eq("id", supervisao.id)
        .select("id")
        .single();
      if (error) {
        console.error("Erro ao salvar supervisão:", error);
        setErro(mensagemErroSupervisao(error, "Não foi possível salvar a supervisão. Tente novamente."));
        setSalvando(false);
        return;
      }
    } else {
      const datas = criandoSerie ? datasDaSerie : [form.data];
      const serieId = datas.length > 1 ? crypto.randomUUID() : null;
      const linhas = datas.map((data) => ({ ...base, data, serie_id: serieId, psicologo_id: user.id }));

      // Um insert só: a série inteira entra ou nenhuma linha entra.
      const { data, error } = await supabase.from(TABELA_SUPERVISOES).insert(linhas).select("id");
      if (error || (data?.length ?? 0) !== linhas.length) {
        console.error("Erro ao criar supervisão:", error);
        setErro(mensagemErroSupervisao(error, "Não foi possível salvar a supervisão. Tente novamente."));
        setSalvando(false);
        return;
      }
    }

    onSaved();
  }

  async function excluir(escopo: EscopoSerie) {
    if (!supervisao) return;
    setExcluindo(true);
    setErro(null);
    const { erro: falha } = await aplicarNaSupervisao(supabase, supervisao, "excluir", escopo);
    setPerguntarEscopo(false);
    if (falha) {
      setErro(falha);
      setExcluindo(false);
      return;
    }
    onSaved();
  }

  function pedirExclusao() {
    if (!supervisao) return;
    if (supervisao.serie_id) {
      setPerguntarEscopo(true);
      return;
    }
    if (!confirm("Excluir esta supervisão? Esta ação não pode ser desfeita.")) return;
    excluir("so_esta");
  }

  const inputClass =
    "w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-text text-sm " +
    "placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 " +
    "focus:border-primary/40 transition-all";
  const labelClass = "block text-sm font-medium text-text-muted mb-1.5";

  const ultimaData = datasDaSerie[datasDaSerie.length - 1];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-text/20 backdrop-blur-sm" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="supervisao-form-titulo"
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-xl border border-border/60"
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface flex items-center justify-between px-6 py-4 border-b border-border/40 z-10">
          <h3 id="supervisao-form-titulo" className="text-lg font-serif font-medium text-text">
            {isEditing ? "Editar supervisão" : "Nova supervisão"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-background transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Papel */}
          <div>
            <span className={labelClass}>Seu papel nesta supervisão</span>
            <div role="radiogroup" aria-label="Seu papel nesta supervisão" className="grid grid-cols-2 gap-2">
              {(["supervisor", "supervisionado"] as const).map((p) => {
                const ativo = form.papel === p;
                const Icone = p === "supervisor" ? Presentation : GraduationCap;
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    onClick={() => set("papel", p)}
                    className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      ativo
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-border bg-background hover:border-primary/30"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium text-text">
                      <Icone size={15} className={ativo ? "text-primary" : "text-text-muted"} aria-hidden="true" />
                      {rotuloPapel(p)}
                    </span>
                    <span className="block text-[11px] text-text-muted mt-0.5 leading-snug">{DESCRICAO_PAPEL[p]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Colega */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_190px] gap-4">
            <div>
              <label htmlFor="sup-colega" className={labelClass}>
                {rotuloColega(form.papel)} <span className="text-danger">*</span>
              </label>
              <input
                id="sup-colega"
                type="text"
                required
                maxLength={COLEGA_NOME_MAX}
                autoFocus={!isEditing}
                value={form.colega_nome}
                onChange={(e) => set("colega_nome", e.target.value)}
                placeholder="Nome do(a) colega"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="sup-whatsapp" className={labelClass}>
                WhatsApp <span className="font-normal">(opcional)</span>
              </label>
              <input
                id="sup-whatsapp"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                maxLength={20}
                value={form.colega_whatsapp}
                onChange={(e) => set("colega_whatsapp", e.target.value)}
                placeholder="(11) 91234-5678"
                className={inputClass}
              />
            </div>
          </div>

          {/* Data + Horário */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="sup-data" className={labelClass}>
                Data <span className="text-danger">*</span>
              </label>
              <input
                id="sup-data"
                type="date"
                required
                value={form.data}
                onChange={(e) => set("data", e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="sup-horario" className={labelClass}>
                Horário <span className="text-danger">*</span>
              </label>
              <input
                id="sup-horario"
                type="time"
                required
                value={form.horario}
                onChange={(e) => set("horario", e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Duração + Modalidade */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="sup-duracao" className={labelClass}>
                Duração (minutos)
              </label>
              <input
                id="sup-duracao"
                type="number"
                min={DURACAO_MIN}
                max={DURACAO_MAX}
                step={5}
                value={form.duracao_minutos}
                onChange={(e) => set("duracao_minutos", e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="sup-modalidade" className={labelClass}>
                Modalidade
              </label>
              <select
                id="sup-modalidade"
                value={form.modalidade}
                onChange={(e) => set("modalidade", e.target.value as ModalidadeSupervisao)}
                className={inputClass}
              >
                <option value="presencial">Presencial</option>
                <option value="online">Online</option>
              </select>
            </div>
          </div>

          {/* Aviso de conflito — informa, não impede */}
          {conflitosAtuais.length > 0 && (
            <div role="status" className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1.5">
              <p className="flex items-center gap-1.5 font-semibold">
                <TriangleAlert size={14} aria-hidden="true" />
                {conflitosAtuais.length === 1 && datasDaSerie.length === 1
                  ? "Este horário cruza com outro compromisso do dia."
                  : `Horário ocupado em ${conflitosAtuais.length} de ${datasDaSerie.length} datas.`}
              </p>
              <ul className="space-y-0.5 pl-5 list-disc">
                {conflitosAtuais.slice(0, 5).map((c) => (
                  <li key={c.data}>
                    {dataBR(c.data)}:{" "}
                    {c.compromissos
                      .map(
                        (x) =>
                          `${x.tipo === "atendimento" ? "atendimento" : "outra supervisão"} às ${horarioCurto(x.horario)}`
                      )
                      .join(", ")}
                  </li>
                ))}
                {conflitosAtuais.length > 5 && <li>e mais {conflitosAtuais.length - 5} data(s)</li>}
              </ul>
              <p className="text-amber-800">Você pode salvar mesmo assim.</p>
            </div>
          )}

          {/* Status */}
          <div>
            <label htmlFor="sup-status" className={labelClass}>
              Status
            </label>
            <select
              id="sup-status"
              value={form.status}
              onChange={(e) => set("status", e.target.value as StatusSupervisao)}
              className={inputClass}
            >
              <option value="agendada">Agendada</option>
              <option value="realizada">Realizada</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>

          {/* Valor + pago */}
          <div>
            <label htmlFor="sup-valor" className={labelClass}>
              Valor da supervisão <span className="font-normal">— opcional</span>
            </label>
            <input
              id="sup-valor"
              type="text"
              inputMode="decimal"
              value={form.valor}
              onChange={(e) => set("valor", e.target.value)}
              placeholder="Ex: 150"
              className={inputClass}
            />
            {temValor && !criandoSerie && (
              <label className="mt-2 flex items-center gap-2 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={form.pago}
                  onChange={(e) => set("pago", e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary/20 w-4 h-4"
                />
                <span className="text-sm text-text">{form.papel === "supervisor" ? "Já recebi" : "Já paguei"}</span>
              </label>
            )}
            <p className="mt-1.5 text-xs text-text-muted">
              {temValor && criandoSerie
                ? `O valor vale para cada uma das ${datasDaSerie.length} supervisões, todas começando como pendentes. Marque cada uma na lista quando ${form.papel === "supervisor" ? "receber" : "pagar"}.`
                : "Fica só aqui na Agenda — não entra no Financeiro."}
            </p>
          </div>

          {/* Observações */}
          <div>
            <label htmlFor="sup-obs" className={labelClass}>
              Observações
            </label>
            <textarea
              id="sup-obs"
              rows={3}
              value={form.observacoes}
              disabled={obsIniciais === null}
              onChange={(e) => set("observacoes", e.target.value)}
              placeholder={
                obsFalhou
                  ? "Não foi possível abrir as observações agora. Recarregue a página para editá-las — o resto pode ser salvo e elas não serão alteradas."
                  : obsIniciais === null
                  ? "Carregando…"
                  : "Casos a levar, combinados, material de estudo… Não aparece no calendário do celular."
              }
              className={inputClass + " resize-none font-serif text-sm leading-relaxed disabled:opacity-60"}
            />
            <span className="mt-1 text-[10px] text-text-muted flex items-center gap-1">
              <ShieldCheck size={11} className="text-success" aria-hidden="true" />
              Cifrado com AES-256 antes de sair do navegador
            </span>
          </div>

          {isEditing && supervisao.serie_id && (
            <p className="text-xs text-text-muted bg-background/60 border border-border/50 rounded-lg px-3 py-2">
              Esta supervisão faz parte de uma série. As alterações valem só para ela.
            </p>
          )}

          {/* Recorrência */}
          {!isEditing && (
            <div className="pt-1 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={repetir}
                  onChange={(e) => setRepetir(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary/20 w-4 h-4"
                />
                <span className="text-sm font-medium text-text">Repetir esta supervisão</span>
              </label>

              {repetir && (
                <div className="grid grid-cols-2 gap-4 p-4 bg-background/50 rounded-xl border border-border/50">
                  <div>
                    <label htmlFor="sup-frequencia" className={labelClass}>
                      Frequência
                    </label>
                    <select
                      id="sup-frequencia"
                      value={frequencia}
                      onChange={(e) => setFrequencia(e.target.value as FrequenciaRecorrencia)}
                      className={inputClass}
                    >
                      <option value="semanal">Semanal</option>
                      <option value="quinzenal">Quinzenal</option>
                      <option value="mensal">Mensal</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="sup-vezes" className={labelClass}>
                      Quantas no total?
                    </label>
                    <input
                      id="sup-vezes"
                      type="number"
                      min={2}
                      max={REPETICOES_MAX}
                      value={vezes}
                      onChange={(e) => setVezes(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  {datasDaSerie.length > 1 && ultimaData && (
                    <div className="col-span-2 text-xs text-text-muted bg-surface px-3 py-2.5 rounded-lg border border-border/40 text-center">
                      Serão criadas <strong>{datasDaSerie.length}</strong> supervisões, de{" "}
                      <strong>{dataBR(datasDaSerie[0])}</strong> a <strong>{dataBR(ultimaData)}</strong>.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Erro */}
          {erro && (
            <div role="alert" className="p-3 rounded-xl bg-danger/5 border border-danger/15">
              <p className="text-sm text-danger">{erro}</p>
            </div>
          )}

          {/* Ações */}
          <div className="flex items-center justify-between pt-3 border-t border-border/40">
            {isEditing ? (
              <button
                type="button"
                onClick={pedirExclusao}
                disabled={salvando || excluindo}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-danger hover:bg-danger/10 transition-colors cursor-pointer disabled:opacity-60"
              >
                {excluindo ? "Excluindo..." : "Excluir"}
              </button>
            ) : (
              <div />
            )}

            <div className="flex gap-3">
              {/* "Fechar", não "Cancelar": aqui cancelar é um status da
                  supervisão, e o botão só fecha sem salvar. */}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-text-muted hover:bg-background transition-colors cursor-pointer"
              >
                Fechar
              </button>
              <button
                type="submit"
                disabled={salvando || excluindo}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                           bg-primary text-white text-sm font-medium
                           hover:bg-primary-dark active:scale-[0.98]
                           disabled:opacity-60 disabled:cursor-not-allowed
                           transition-all duration-200 cursor-pointer"
              >
                {salvando ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Salvando…
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    {isEditing ? "Salvar alterações" : criandoSerie ? `Agendar ${datasDaSerie.length}` : "Agendar"}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {perguntarEscopo && (
        <DialogoEscopoSerie
          acao="excluir"
          ocupado={excluindo}
          onEscolher={excluir}
          onFechar={() => setPerguntarEscopo(false)}
        />
      )}
    </div>
  );
}
