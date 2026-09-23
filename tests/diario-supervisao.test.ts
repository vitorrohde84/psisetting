import { describe, it, expect, vi } from "vitest";
import { decryptClinicalData } from "../utils/crypto";
import {
  AVISO_CHAVE_INDISPONIVEL,
  agruparPorAnotacao,
  anotacaoCorrespondeAoTermo,
  comComentario,
  contemAvisoDeChave,
  dataBR,
  decifragemFalhou,
  hojeLocal,
  linhasSupervisaoParaBackup,
  normalizarSupervisor,
  ordenarComentarios,
  semComentario,
  trechoInicial,
  validarComentario,
  type AnotacaoParaBackup,
  type ComentarioSupervisao,
} from "../utils/diario-supervisao";

/**
 * O comentário de supervisão é o "outro olhar" sobre uma sessão. Se ele cair
 * na anotação errada, sumir do filtro ou do backup, o psicólogo perde
 * justamente o registro que mais custa reconstruir.
 */

function comentario(p: Partial<ComentarioSupervisao> & { id: string }): ComentarioSupervisao {
  return {
    diario_id: "d1",
    data_supervisao: "2026-09-10",
    supervisor: null,
    conteudo: "texto",
    created_at: "2026-09-10T15:00:00Z",
    ...p,
  };
}

describe("hojeLocal", () => {
  it("usa o dia do relógio local, não o de UTC (às 22h em Brasília ainda é hoje)", () => {
    // Construído com a data local: vale em qualquer fuso da máquina de teste.
    expect(hojeLocal(new Date(2026, 8, 23, 22, 30))).toBe("2026-09-23");
  });

  it("completa mês e dia com zero", () => {
    expect(hojeLocal(new Date(2026, 0, 5, 9, 0))).toBe("2026-01-05");
  });
});

describe("dataBR", () => {
  it("converte AAAA-MM-DD para DD/MM/AAAA", () => {
    expect(dataBR("2026-09-03")).toBe("03/09/2026");
  });

  it("valor fora do formato vira vazio, nunca 'Invalid Date'", () => {
    expect(dataBR("")).toBe("");
    expect(dataBR(null)).toBe("");
    expect(dataBR("03/09/2026")).toBe("");
  });
});

describe("normalizarSupervisor", () => {
  it("campo vazio ou só com espaços vira null (supervisor é opcional)", () => {
    expect(normalizarSupervisor("")).toBeNull();
    expect(normalizarSupervisor("   ")).toBeNull();
    expect(normalizarSupervisor(undefined)).toBeNull();
  });

  it("tira espaços das pontas e junta os do meio", () => {
    expect(normalizarSupervisor("  Dra.   Ana ")).toBe("Dra. Ana");
  });

  it("corta nomes longos demais", () => {
    expect(normalizarSupervisor("a".repeat(500))).toHaveLength(120);
  });
});

describe("validarComentario", () => {
  const hoje = "2026-09-23";

  it("aceita data de hoje ou passada com texto", () => {
    expect(validarComentario({ data: hoje, conteudo: "Olhar sobre a transferência" }, hoje)).toBeNull();
    expect(validarComentario({ data: "2026-08-01", conteudo: "x" }, hoje)).toBeNull();
  });

  it("exige a data", () => {
    expect(validarComentario({ data: "", conteudo: "x" }, hoje)).toMatch(/data/i);
  });

  it("recusa data que não existe no calendário", () => {
    expect(validarComentario({ data: "2026-02-31", conteudo: "x" }, hoje)).toMatch(/válida/);
  });

  it("recusa data futura (a supervisão já aconteceu)", () => {
    expect(validarComentario({ data: "2026-09-24", conteudo: "x" }, hoje)).toMatch(/futuro/);
  });

  it("recusa texto vazio ou só com espaços", () => {
    expect(validarComentario({ data: hoje, conteudo: "   \n " }, hoje)).toMatch(/comentário/);
  });
});

describe("ordenarComentarios / agruparPorAnotacao", () => {
  it("dentro da anotação, da supervisão mais antiga para a mais recente", () => {
    const lista = [
      comentario({ id: "b", data_supervisao: "2026-09-15" }),
      comentario({ id: "a", data_supervisao: "2026-09-01" }),
    ];
    expect(ordenarComentarios(lista).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("na mesma data, vale a ordem de registro", () => {
    const lista = [
      comentario({ id: "tarde", created_at: "2026-09-10T18:00:00Z" }),
      comentario({ id: "manha", created_at: "2026-09-10T09:00:00Z" }),
    ];
    expect(ordenarComentarios(lista).map((c) => c.id)).toEqual(["manha", "tarde"]);
  });

  it("não altera a lista recebida (é estado do React)", () => {
    const lista = [
      comentario({ id: "b", data_supervisao: "2026-09-15" }),
      comentario({ id: "a", data_supervisao: "2026-09-01" }),
    ];
    ordenarComentarios(lista);
    expect(lista.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("cada comentário fica na sua anotação, em ordem", () => {
    const grupos = agruparPorAnotacao([
      comentario({ id: "x2", diario_id: "d2", data_supervisao: "2026-09-12" }),
      comentario({ id: "x1", diario_id: "d1" }),
      comentario({ id: "x0", diario_id: "d2", data_supervisao: "2026-09-02" }),
    ]);
    expect(Object.keys(grupos).sort()).toEqual(["d1", "d2"]);
    expect(grupos.d1.map((c) => c.id)).toEqual(["x1"]);
    expect(grupos.d2.map((c) => c.id)).toEqual(["x0", "x2"]);
  });

  it("lista vazia não cria grupo nenhum", () => {
    expect(agruparPorAnotacao([])).toEqual({});
  });
});

describe("anotacaoCorrespondeAoTermo", () => {
  it("sem termo, toda anotação aparece", () => {
    expect(anotacaoCorrespondeAoTermo("qualquer", [], null)).toBe(true);
    expect(anotacaoCorrespondeAoTermo("qualquer", undefined, "  ")).toBe(true);
  });

  it("acha o termo no texto da anotação, sem diferenciar maiúsculas", () => {
    expect(anotacaoCorrespondeAoTermo("Relata ANSIEDADE no trabalho", [], "ansiedade")).toBe(true);
  });

  it("acha o termo só no comentário de supervisão", () => {
    const supervisao = [{ conteudo: "A supervisora apontou a relação com a mãe." }];
    expect(anotacaoCorrespondeAoTermo("Sessão sobre o trabalho", supervisao, "mãe")).toBe(true);
  });

  it("não acha quando o termo não está em lugar nenhum", () => {
    const supervisao = [{ conteudo: "Manejo do silêncio." }];
    expect(anotacaoCorrespondeAoTermo("Sessão sobre o trabalho", supervisao, "luto")).toBe(false);
  });
});

describe("trechoInicial", () => {
  it("texto curto fica inteiro, numa linha só", () => {
    expect(trechoInicial("Primeira\n\nsessão  do caso")).toBe("Primeira sessão do caso");
  });

  it("texto longo é cortado com reticências dentro do limite", () => {
    const trecho = trechoInicial("palavra ".repeat(30), 20);
    expect(trecho.length).toBeLessThanOrEqual(20);
    expect(trecho.endsWith("…")).toBe(true);
  });
});

describe("linhasSupervisaoParaBackup", () => {
  const anotacoes = new Map<string, AnotacaoParaBackup>([
    ["n-bia-antiga", { paciente: "Beatriz", data: "2026-08-01", conteudo: "Nota antiga da Beatriz" }],
    ["n-bia-nova", { paciente: "Beatriz", data: "2026-09-01", conteudo: "Nota nova da Beatriz" }],
    ["n-ana", { paciente: "Ana", data: "2026-07-10", conteudo: "Nota da Ana" }],
  ]);

  it("liga cada comentário à anotação e ao paciente, com as datas em DD/MM/AAAA", () => {
    const [linha] = linhasSupervisaoParaBackup(
      [
        comentario({
          id: "s1",
          diario_id: "n-ana",
          data_supervisao: "2026-07-15",
          supervisor: "Dra. Ana",
          conteudo: "Outro olhar",
        }),
      ],
      anotacoes
    );
    expect(linha).toMatchObject({
      paciente: "Ana",
      dataNota: "10/07/2026",
      trechoNota: "Nota da Ana",
      dataSupervisao: "15/07/2026",
      supervisor: "Dra. Ana",
      comentario: "Outro olhar",
    });
  });

  it("ordena como a tela: paciente, anotação mais recente primeiro, supervisões em ordem", () => {
    const linhas = linhasSupervisaoParaBackup(
      [
        comentario({ id: "1", diario_id: "n-bia-antiga", data_supervisao: "2026-08-05", conteudo: "bia antiga" }),
        comentario({ id: "2", diario_id: "n-bia-nova", data_supervisao: "2026-09-20", conteudo: "bia nova 2" }),
        comentario({ id: "3", diario_id: "n-ana", data_supervisao: "2026-07-11", conteudo: "ana" }),
        comentario({ id: "4", diario_id: "n-bia-nova", data_supervisao: "2026-09-03", conteudo: "bia nova 1" }),
      ],
      anotacoes
    );
    expect(linhas.map((l) => l.comentario)).toEqual(["ana", "bia nova 1", "bia nova 2", "bia antiga"]);
  });

  it("comentário sem a anotação correspondente continua no backup", () => {
    const linhas = linhasSupervisaoParaBackup(
      [comentario({ id: "orfao", diario_id: "sumiu", conteudo: "não perder" })],
      anotacoes
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0].comentario).toBe("não perder");
    expect(linhas[0].trechoNota).toMatch(/não encontrada/);
  });

  it("supervisor ausente vira célula vazia, não 'null'", () => {
    const [linha] = linhasSupervisaoParaBackup(
      [comentario({ id: "s", diario_id: "n-ana", supervisor: null })],
      anotacoes
    );
    expect(linha.supervisor).toBe("");
  });
});

describe("comComentario / semComentario (atualização sobre o estado mais recente)", () => {
  it("comentário novo entra no lugar certo da ordem", () => {
    const lista = [
      comentario({ id: "a", data_supervisao: "2026-09-01" }),
      comentario({ id: "c", data_supervisao: "2026-09-20" }),
    ];
    const nova = comComentario(lista, comentario({ id: "b", data_supervisao: "2026-09-10" }));
    expect(nova.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("comentário editado substitui o antigo, sem duplicar, e é reordenado pela nova data", () => {
    const lista = [
      comentario({ id: "a", data_supervisao: "2026-09-01", conteudo: "antes" }),
      comentario({ id: "b", data_supervisao: "2026-09-10" }),
    ];
    const nova = comComentario(lista, comentario({ id: "a", data_supervisao: "2026-09-15", conteudo: "depois" }));
    expect(nova.map((c) => c.id)).toEqual(["b", "a"]);
    expect(nova.find((c) => c.id === "a")?.conteudo).toBe("depois");
  });

  it("anotação que ainda não tinha lista ganha uma", () => {
    expect(comComentario(undefined, comentario({ id: "a" })).map((c) => c.id)).toEqual(["a"]);
    expect(semComentario(undefined, "a")).toEqual([]);
  });

  it("não altera a lista recebida (é estado do React)", () => {
    const lista = [comentario({ id: "a" }), comentario({ id: "b" })];
    comComentario(lista, comentario({ id: "c" }));
    semComentario(lista, "a");
    expect(lista.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("excluir e depois terminar um salvar sobreposto não traz o excluído de volta", () => {
    // Estado na tela quando o psicólogo clicou em salvar A e, logo depois, em excluir B.
    let estado = [comentario({ id: "a", conteudo: "antes" }), comentario({ id: "b" })];
    // O excluir termina primeiro…
    estado = semComentario(estado, "b");
    // …e o salvar, que começou quando B ainda existia, termina depois.
    estado = comComentario(estado, comentario({ id: "a", conteudo: "depois" }));
    expect(estado.map((c) => c.id)).toEqual(["a"]);
    expect(estado[0].conteudo).toBe("depois");
  });
});

describe("decifragemFalhou", () => {
  it("valor cifrado que voltou como o aviso de chave indisponível: falhou", () => {
    expect(decifragemFalhou("enc:v2:aa:bb", AVISO_CHAVE_INDISPONIVEL)).toBe(true);
  });

  it("valor cifrado que voltou ainda cifrado (formato quebrado): falhou", () => {
    expect(decifragemFalhou("enc:v2:quebrado", "enc:v2:quebrado")).toBe(true);
  });

  it("valor cifrado que abriu normalmente: não falhou", () => {
    expect(decifragemFalhou("enc:v2:aa:bb", "A supervisora apontou a transferência.")).toBe(false);
  });

  it("valor em claro no banco (registro antigo) nunca conta como falha", () => {
    expect(decifragemFalhou("Texto antigo em claro", "Texto antigo em claro")).toBe(false);
    expect(decifragemFalhou(AVISO_CHAVE_INDISPONIVEL, AVISO_CHAVE_INDISPONIVEL)).toBe(false);
  });

  it("campo vazio (supervisor opcional) não conta como falha", () => {
    expect(decifragemFalhou(null, null)).toBe(false);
    expect(decifragemFalhou(undefined, "")).toBe(false);
  });

  it("o aviso é exatamente o texto que decryptClinicalData devolve quando não abre", async () => {
    // utils/crypto.ts não exporta o aviso; se a mensagem mudar lá, este teste
    // quebra antes de o comentário ilegível voltar a ser editável.
    const silenciar = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await decryptClinicalData("enc:v1:00:00", "usuario-teste")).toBe(AVISO_CHAVE_INDISPONIVEL);
    } finally {
      silenciar.mockRestore();
    }
  });
});

describe("contemAvisoDeChave", () => {
  it("reconhece o aviso no comentário ou no nome do supervisor, mesmo com espaços em volta", () => {
    expect(contemAvisoDeChave(AVISO_CHAVE_INDISPONIVEL, "")).toBe(true);
    expect(contemAvisoDeChave("texto", `  ${AVISO_CHAVE_INDISPONIVEL}\n`)).toBe(true);
  });

  it("texto comum e campos vazios passam", () => {
    expect(contemAvisoDeChave("Manejo do silêncio.", "Dra. Ana")).toBe(false);
    expect(contemAvisoDeChave("", null, undefined)).toBe(false);
  });
});
