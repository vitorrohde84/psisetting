import { describe, it, expect } from "vitest";
import {
  agruparPorData,
  conflitosNasDatas,
  dataBR,
  descricaoNoFeed,
  deslocarMes,
  detectarConflitos,
  ehDataValida,
  formatarMoeda,
  gerarDatasRecorrencia,
  hojeLocal,
  horarioFim,
  intervaloDoMes,
  lerValor,
  linhasSupervisaoAgendaParaBackup,
  minutosDoHorario,
  normalizarColegaNome,
  normalizarLinha,
  normalizarWhatsApp,
  resumoFinanceiroDoMes,
  rotuloMes,
  rotuloPago,
  rotuloPapel,
  tituloNoFeed,
  validarSupervisao,
  visiveisNoCalendario,
  type Compromisso,
  type FormSupervisao,
  type SupervisaoAgenda,
} from "../utils/supervisao-agenda";

/**
 * A agenda de supervisões mexe com três coisas que doem quando erram: dinheiro
 * (o resumo diz quanto entra e quanto sai), horário (uma série com o dia
 * errado desmarca meses de supervisão) e privacidade (o feed do celular é
 * público e não pode levar o nome do colega).
 */

function supervisao(p: Partial<SupervisaoAgenda> & { id: string }): SupervisaoAgenda {
  return {
    papel: "supervisor",
    colega_nome: "Colega",
    colega_whatsapp: null,
    data: "2026-09-10",
    horario: "14:00:00",
    duracao_minutos: 60,
    modalidade: "presencial",
    status: "agendada",
    valor: null,
    pago: false,
    observacoes: null,
    serie_id: null,
    ...p,
  };
}

function compromisso(p: Partial<Compromisso> & { id: string }): Compromisso {
  return {
    tipo: "atendimento",
    data: "2026-09-10",
    horario: "14:00:00",
    duracao_minutos: 50,
    status: "agendado",
    ...p,
  };
}

const formValido: FormSupervisao = {
  colega_nome: "Dra. Ana",
  colega_whatsapp: "",
  data: "2026-09-30",
  horario: "14:00",
  duracao_minutos: 60,
  valor: "",
  repetir: false,
  vezes: 4,
};

describe("rótulos", () => {
  it("papel escrito do ponto de vista de quem usa o sistema", () => {
    expect(rotuloPapel("supervisor")).toBe("Eu supervisiono");
    expect(rotuloPapel("supervisionado")).toBe("Sou supervisionado(a)");
  });

  it("'pago' muda de sentido com o papel: quem supervisiona recebe, quem é supervisionado paga", () => {
    expect(rotuloPago("supervisor", false)).toBe("A receber");
    expect(rotuloPago("supervisor", true)).toBe("Recebido");
    expect(rotuloPago("supervisionado", false)).toBe("A pagar");
    expect(rotuloPago("supervisionado", true)).toBe("Pago");
  });
});

describe("feed do celular (público)", () => {
  it("título só com a modalidade", () => {
    expect(tituloNoFeed("online")).toBe("Supervisão (Online)");
    expect(tituloNoFeed("presencial")).toBe("Supervisão (Presencial)");
  });

  it("modalidade desconhecida não vira um 'Presencial' inventado", () => {
    expect(tituloNoFeed(null)).toBe("Supervisão");
    expect(descricaoNoFeed(undefined)).toBeNull();
  });

  it("descrição só com a modalidade", () => {
    expect(descricaoNoFeed("online")).toBe("Modalidade: Online");
  });

  it("nada que venha da linha — nome, WhatsApp, observação — entra no texto do feed", () => {
    const s = supervisao({
      id: "1",
      colega_nome: "Fulana de Tal",
      colega_whatsapp: "11912345678",
      observacoes: "caso da paciente X",
      modalidade: "online",
    });
    const texto = `${tituloNoFeed(s.modalidade)} ${descricaoNoFeed(s.modalidade)}`;
    expect(texto).not.toMatch(/Fulana|1191|paciente/);
  });
});

describe("datas e horários", () => {
  it("hojeLocal usa o dia do relógio local, não o de UTC (às 22h em Brasília ainda é hoje)", () => {
    expect(hojeLocal(new Date(2026, 8, 23, 22, 30))).toBe("2026-09-23");
  });

  it("dataBR converte e não inventa 'Invalid Date'", () => {
    expect(dataBR("2026-09-03")).toBe("03/09/2026");
    expect(dataBR("")).toBe("");
  });

  it("ehDataValida recusa dia que não existe", () => {
    expect(ehDataValida("2026-02-28")).toBe(true);
    expect(ehDataValida("2026-02-31")).toBe(false);
    expect(ehDataValida("2028-02-29")).toBe(true);
    expect(ehDataValida("30/09/2026")).toBe(false);
  });

  it("minutosDoHorario entende HH:MM e HH:MM:SS e recusa hora impossível", () => {
    expect(minutosDoHorario("14:30")).toBe(870);
    expect(minutosDoHorario("14:30:00")).toBe(870);
    expect(minutosDoHorario("24:00")).toBeNull();
    expect(minutosDoHorario("")).toBeNull();
  });

  it("horarioFim soma a duração e dá a volta na meia-noite", () => {
    expect(horarioFim("14:00:00", 60)).toBe("15:00");
    expect(horarioFim("09:30", 50)).toBe("10:20");
    expect(horarioFim("23:30", 60)).toBe("00:30");
  });

  it("intervaloDoMes conhece fevereiro bissexto e meses de 30 dias", () => {
    expect(intervaloDoMes("2026-09")).toEqual({ inicio: "2026-09-01", fim: "2026-09-30" });
    expect(intervaloDoMes("2028-02")).toEqual({ inicio: "2028-02-01", fim: "2028-02-29" });
  });

  it("deslocarMes atravessa a virada do ano nos dois sentidos", () => {
    expect(deslocarMes("2026-12", 1)).toBe("2027-01");
    expect(deslocarMes("2026-01", -1)).toBe("2025-12");
    expect(deslocarMes("2026-09", 0)).toBe("2026-09");
  });

  it("rotuloMes por extenso", () => {
    expect(rotuloMes("2026-03")).toBe("março de 2026");
  });
});

describe("gerarDatasRecorrencia", () => {
  it("N é o total: 4 vezes cria 4 datas, a primeira inclusa", () => {
    expect(gerarDatasRecorrencia("2026-09-30", "semanal", 4)).toEqual([
      "2026-09-30",
      "2026-10-07",
      "2026-10-14",
      "2026-10-21",
    ]);
  });

  it("quinzenal anda 14 dias e atravessa o ano", () => {
    expect(gerarDatasRecorrencia("2026-12-24", "quinzenal", 3)).toEqual([
      "2026-12-24",
      "2027-01-07",
      "2027-01-21",
    ]);
  });

  it("mensal parte do dia original: 31/01 → 28/02 → 31/03 (não escorrega para 03/03)", () => {
    expect(gerarDatasRecorrencia("2026-01-31", "mensal", 4)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("mensal respeita 29/02 em ano bissexto", () => {
    expect(gerarDatasRecorrencia("2028-01-29", "mensal", 2)).toEqual(["2028-01-29", "2028-02-29"]);
  });

  it("limita a 52 e a pelo menos 1", () => {
    expect(gerarDatasRecorrencia("2026-09-30", "semanal", 500)).toHaveLength(52);
    expect(gerarDatasRecorrencia("2026-09-30", "semanal", 0)).toEqual(["2026-09-30"]);
  });

  it("data inválida não gera nada (em vez de gravar datas lixo)", () => {
    expect(gerarDatasRecorrencia("2026-02-31", "semanal", 3)).toEqual([]);
    expect(gerarDatasRecorrencia("", "semanal", 3)).toEqual([]);
  });
});

describe("detectarConflitos", () => {
  const alvo = { data: "2026-09-10", horario: "14:30", duracao_minutos: 60 };

  it("acha atendimento que cruza o horário", () => {
    const r = detectarConflitos(alvo, [compromisso({ id: "a1", horario: "14:00:00", duracao_minutos: 50 })]);
    expect(r.map((c) => c.id)).toEqual(["a1"]);
  });

  it("emendar horários não é conflito (termina 14:30, começa 14:30)", () => {
    const r = detectarConflitos(alvo, [compromisso({ id: "a1", horario: "13:40:00", duracao_minutos: 50 })]);
    expect(r).toEqual([]);
  });

  it("começar exatamente quando a supervisão termina também não é conflito", () => {
    const r = detectarConflitos(alvo, [compromisso({ id: "a1", horario: "15:30:00" })]);
    expect(r).toEqual([]);
  });

  it("outro dia e compromisso cancelado não contam", () => {
    const r = detectarConflitos(alvo, [
      compromisso({ id: "outro-dia", data: "2026-09-11", horario: "14:30:00" }),
      compromisso({ id: "cancelado", status: "cancelado", horario: "14:30:00" }),
      compromisso({ id: "sup-cancelada", tipo: "supervisao", status: "cancelada", horario: "14:30:00" }),
    ]);
    expect(r).toEqual([]);
  });

  it("acha outra supervisão, mas não a própria que está sendo editada", () => {
    const lista = [
      compromisso({ id: "s1", tipo: "supervisao", horario: "15:00:00", duracao_minutos: 60, status: "agendada" }),
      compromisso({ id: "s2", tipo: "supervisao", horario: "14:30:00", duracao_minutos: 60, status: "agendada" }),
    ];
    const r = detectarConflitos({ ...alvo, id: "s2" }, lista);
    expect(r.map((c) => c.id)).toEqual(["s1"]);
  });

  it("atendimento sem duração gravada vale 50 min", () => {
    const r = detectarConflitos(
      { data: "2026-09-10", horario: "14:45", duracao_minutos: 30 },
      [compromisso({ id: "a1", horario: "14:00:00", duracao_minutos: null })]
    );
    expect(r.map((c) => c.id)).toEqual(["a1"]);
  });

  it("série: devolve só as datas com conflito", () => {
    const r = conflitosNasDatas(
      ["2026-09-10", "2026-09-17", "2026-09-24"],
      { horario: "14:00", duracao_minutos: 60 },
      [compromisso({ id: "a1", data: "2026-09-17", horario: "14:30:00" })]
    );
    expect(r).toEqual([{ data: "2026-09-17", compromissos: [expect.objectContaining({ id: "a1" })] }]);
  });
});

describe("normalização do formulário", () => {
  it("nome sem espaços sobrando e cortado em 120", () => {
    expect(normalizarColegaNome("  Dra.   Ana  ")).toBe("Dra. Ana");
    expect(normalizarColegaNome("a".repeat(300))).toHaveLength(120);
  });

  it("WhatsApp vira só dígitos; em branco ou inválido, null", () => {
    expect(normalizarWhatsApp("(11) 91234-5678")).toBe("11912345678");
    expect(normalizarWhatsApp("+55 11 91234-5678")).toBe("5511912345678");
    expect(normalizarWhatsApp("")).toBeNull();
    expect(normalizarWhatsApp("1234")).toBeNull();
  });

  it("o WhatsApp gravado sempre cabe na regra do banco (10 a 13 dígitos)", () => {
    for (const v of ["(11) 91234-5678", "011 91234-5678", "+55 11 91234-5678", "(11) 3456-7890"]) {
      expect(normalizarWhatsApp(v)).toMatch(/^[0-9]{10,13}$/);
    }
  });

  it("lerValor entende o jeito brasileiro de digitar dinheiro", () => {
    expect(lerValor("150")).toEqual({ valor: 150, erro: null });
    expect(lerValor("150,5")).toEqual({ valor: 150.5, erro: null });
    expect(lerValor("1.234,56")).toEqual({ valor: 1234.56, erro: null });
    expect(lerValor("1.200")).toEqual({ valor: 1200, erro: null });
    expect(lerValor("99.90")).toEqual({ valor: 99.9, erro: null });
    expect(lerValor("R$ 80")).toEqual({ valor: 80, erro: null });
  });

  it("lerValor: em branco é 'sem valor', zero é permitido, texto e negativo são erro", () => {
    expect(lerValor("")).toEqual({ valor: null, erro: null });
    expect(lerValor("0")).toEqual({ valor: 0, erro: null });
    expect(lerValor("abc").erro).toMatch(/inválido/);
    expect(lerValor("-50").erro).toMatch(/inválido/);
  });
});

describe("validarSupervisao", () => {
  it("formulário mínimo passa", () => {
    expect(validarSupervisao(formValido)).toBeNull();
  });

  it("exige o nome do colega", () => {
    expect(validarSupervisao({ ...formValido, colega_nome: "   " })).toMatch(/nome/);
  });

  it("WhatsApp é opcional, mas se vier tem que abrir conversa", () => {
    expect(validarSupervisao({ ...formValido, colega_whatsapp: "(11) 91234-5678" })).toBeNull();
    expect(validarSupervisao({ ...formValido, colega_whatsapp: "9123" })).toMatch(/WhatsApp/);
  });

  it("data e horário válidos", () => {
    expect(validarSupervisao({ ...formValido, data: "2026-02-31" })).toMatch(/data/);
    expect(validarSupervisao({ ...formValido, horario: "" })).toMatch(/horário/);
  });

  it("duração entre 5 e 600 minutos, inteira", () => {
    expect(validarSupervisao({ ...formValido, duracao_minutos: 4 })).toMatch(/duração/);
    expect(validarSupervisao({ ...formValido, duracao_minutos: 601 })).toMatch(/duração/);
    expect(validarSupervisao({ ...formValido, duracao_minutos: "60.5" })).toMatch(/duração/);
    expect(validarSupervisao({ ...formValido, duracao_minutos: "90" })).toBeNull();
  });

  it("valor inválido barra; em branco não", () => {
    expect(validarSupervisao({ ...formValido, valor: "cem" })).toMatch(/Valor/);
  });

  it("repetir pede de 2 a 52 no total", () => {
    expect(validarSupervisao({ ...formValido, repetir: true, vezes: 1 })).toMatch(/2 a 52/);
    expect(validarSupervisao({ ...formValido, repetir: true, vezes: 53 })).toMatch(/2 a 52/);
    expect(validarSupervisao({ ...formValido, repetir: true, vezes: 52 })).toBeNull();
    // Sem repetir, o campo de vezes nem é olhado.
    expect(validarSupervisao({ ...formValido, repetir: false, vezes: 999 })).toBeNull();
  });
});

describe("normalizarLinha", () => {
  it("NUMERIC em texto vira número (senão a soma concatenaria)", () => {
    const s = normalizarLinha({ id: "1", papel: "supervisor", valor: "150.00", pago: false, data: "2026-09-10", horario: "14:00:00" });
    expect(s.valor).toBe(150);
  });

  it("valor nulo continua nulo, não zero", () => {
    expect(normalizarLinha({ id: "1", valor: null }).valor).toBeNull();
  });
});

describe("resumoFinanceiroDoMes", () => {
  const lista = [
    supervisao({ id: "1", papel: "supervisor", valor: 150, pago: false }),
    supervisao({ id: "2", papel: "supervisor", valor: 150, pago: true }),
    supervisao({ id: "3", papel: "supervisor", valor: 200, pago: false, data: "2026-09-29" }),
    supervisao({ id: "4", papel: "supervisionado", valor: 180, pago: false }),
    supervisao({ id: "5", papel: "supervisionado", valor: 180, pago: true }),
    // Fora do resumo:
    supervisao({ id: "6", papel: "supervisor", valor: 999, status: "cancelada" }),
    supervisao({ id: "7", papel: "supervisor", valor: null }),
    supervisao({ id: "8", papel: "supervisor", valor: 0 }),
    supervisao({ id: "9", papel: "supervisor", valor: 500, data: "2026-10-01" }),
  ];

  it("separa o que entra (supervisões que você dá) do que sai (as que você recebe)", () => {
    const r = resumoFinanceiroDoMes(lista, "2026-09");
    expect(r.aReceber).toEqual({ total: 500, pendente: 350, quitado: 150, qtdPendentes: 2 });
    expect(r.aPagar).toEqual({ total: 360, pendente: 180, quitado: 180, qtdPendentes: 1 });
  });

  it("cancelada, sem valor, valor zero e outro mês ficam de fora", () => {
    const r = resumoFinanceiroDoMes(lista.slice(5), "2026-09");
    expect(r.aReceber).toEqual({ total: 0, pendente: 0, quitado: 0, qtdPendentes: 0 });
  });

  it("soma em centavos: 0,10 + 0,20 fecha 0,30", () => {
    const r = resumoFinanceiroDoMes(
      [
        supervisao({ id: "a", valor: 0.1 }),
        supervisao({ id: "b", valor: 0.2 }),
      ],
      "2026-09"
    );
    expect(r.aReceber.pendente).toBe(0.3);
  });

  it("formatarMoeda no padrão brasileiro", () => {
    expect(formatarMoeda(1234.5).replace(/\s/g, " ")).toBe("R$ 1.234,50");
  });
});

describe("listas", () => {
  it("agruparPorData: próximas em ordem crescente, horário crescente dentro do dia", () => {
    const grupos = agruparPorData([
      supervisao({ id: "c", data: "2026-09-12", horario: "09:00:00" }),
      supervisao({ id: "b", data: "2026-09-10", horario: "16:00:00" }),
      supervisao({ id: "a", data: "2026-09-10", horario: "08:00:00" }),
    ]);
    expect(grupos.map((g) => [g.data, g.itens.map((i) => i.id)])).toEqual([
      ["2026-09-10", ["a", "b"]],
      ["2026-09-12", ["c"]],
    ]);
  });

  it("agruparPorData desc: passadas da mais recente para a mais antiga", () => {
    const grupos = agruparPorData(
      [
        supervisao({ id: "velha", data: "2026-08-01" }),
        supervisao({ id: "nova", data: "2026-09-01" }),
      ],
      "desc"
    );
    expect(grupos.map((g) => g.data)).toEqual(["2026-09-01", "2026-08-01"]);
  });

  it("no calendário de Atendimentos, cancelada não aparece", () => {
    const r = visiveisNoCalendario([
      supervisao({ id: "1" }),
      supervisao({ id: "2", status: "cancelada" }),
      supervisao({ id: "3", status: "realizada" }),
    ]);
    expect(r.map((s) => s.id)).toEqual(["1", "3"]);
  });
});

describe("linhasSupervisaoAgendaParaBackup", () => {
  it("usa os rótulos da tela e as observações já decifradas", () => {
    const [linha] = linhasSupervisaoAgendaParaBackup([
      supervisao({
        id: "1",
        papel: "supervisionado",
        colega_nome: "Dra. Ana",
        valor: 180,
        pago: true,
        modalidade: "online",
        observacoes: "levar o caso da segunda",
        serie_id: "serie-1",
      }),
    ]);
    expect(linha).toMatchObject({
      data: "10/09/2026",
      horario: "14:00",
      duracao: "60 min",
      papel: "Sou supervisionado(a)",
      colega: "Dra. Ana",
      modalidade: "Online",
      status: "Agendada",
      situacaoPagamento: "Pago",
      serie: "Sim",
      observacoes: "levar o caso da segunda",
    });
    expect(linha.valor.replace(/\s/g, " ")).toBe("R$ 180,00");
  });

  it("sem valor, as colunas de dinheiro ficam vazias (não 'R$ 0,00 A receber')", () => {
    const [linha] = linhasSupervisaoAgendaParaBackup([supervisao({ id: "1" })]);
    expect(linha.valor).toBe("");
    expect(linha.situacaoPagamento).toBe("");
  });

  it("da mais recente para a mais antiga, como as outras seções do backup", () => {
    const linhas = linhasSupervisaoAgendaParaBackup([
      supervisao({ id: "1", data: "2026-08-01" }),
      supervisao({ id: "2", data: "2026-09-01" }),
    ]);
    expect(linhas.map((l) => l.data)).toEqual(["01/09/2026", "01/08/2026"]);
  });
});
