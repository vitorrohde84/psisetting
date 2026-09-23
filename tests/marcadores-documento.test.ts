import { describe, it, expect } from "vitest";
import { CFP_TEMPLATES } from "../utils/laudo-templates";
import {
  encurtarMarcador,
  marcadoresPendentes,
  resumirMarcadores,
} from "../utils/marcadores-documento";

/**
 * Documento emitido com "[Nome do Paciente]" ou "[CPF/RG]" no meio chega com
 * lacunas a quem vai lê-lo. O termo de responsabilidade lista o que sobrou —
 * sem confundir com colchete que o texto tem de propósito, como "[sic]".
 */

describe("marcadoresPendentes", () => {
  it("reconhece todos os marcadores de todos os modelos, inclusive os longos", () => {
    for (const tmpl of CFP_TEMPLATES) {
      const texto = tmpl.buildConteudo({});
      const todos = [...new Set(texto.match(/\[[^\]\n]+\]/g) ?? [])];
      expect(todos.length).toBeGreaterThan(0);
      expect(marcadoresPendentes(texto)).toEqual(todos);
    }
  });

  it("marcador que passa de 60 caracteres, vindo do modelo, também conta", () => {
    const relatorio = CFP_TEMPLATES.find((t) => t.id === "relatorio")!.buildConteudo({});
    const longos = marcadoresPendentes(relatorio).filter((m) => m.length > 62);
    expect(longos.length).toBeGreaterThan(0);
  });

  it("dados preenchidos deixam de aparecer", () => {
    const decl = CFP_TEMPLATES.find((t) => t.id === "decl-acompanhamento")!.buildConteudo({
      pacienteNome: "João Souza",
      pacienteCpf: "12345678901",
    });
    const pendentes = marcadoresPendentes(decl);
    expect(pendentes).not.toContain("[Nome do Paciente]");
    expect(pendentes).not.toContain("[CPF/RG]");
    expect(pendentes).toEqual(["[semanal / quinzenal]", "[Mês/Ano de Início]"]);
  });

  it("sem repetição, na ordem em que aparecem", () => {
    expect(marcadoresPendentes("Das [00:00] às [00:00], paciente [Nome do Paciente].")).toEqual([
      "[00:00]",
      "[Nome do Paciente]",
    ]);
  });

  it("pega marcador curto digitado pela pessoa", () => {
    expect(marcadoresPendentes("Alta prevista para [data da alta].")).toEqual(["[data da alta]"]);
  });

  it("ignora convenções de citação e referências numéricas", () => {
    const texto = 'Relatou "eu não quero ir [sic]" e depois [...] ficou em silêncio […]. Ver [1] e [12].';
    expect(marcadoresPendentes(texto)).toEqual([]);
    expect(marcadoresPendentes("[SIC] [ ] [a]")).toEqual([]);
  });

  it("ignora colchete longo que não é de modelo e colchete que atravessa linhas", () => {
    const longo = `[${"trecho citado entre colchetes pelo próprio profissional ".repeat(2)}]`;
    expect(marcadoresPendentes(longo)).toEqual([]);
    expect(marcadoresPendentes("[início\nfim]")).toEqual([]);
  });

  it("texto vazio ou ausente não tem marcador", () => {
    expect(marcadoresPendentes("")).toEqual([]);
    expect(marcadoresPendentes(null)).toEqual([]);
    expect(marcadoresPendentes(undefined)).toEqual([]);
    expect(marcadoresPendentes("Texto sem nenhum campo em aberto.")).toEqual([]);
  });
});

describe("resumirMarcadores", () => {
  const nove = Array.from({ length: 9 }, (_, i) => `[campo ${i + 1}]`);

  it("até o limite, mostra todos", () => {
    expect(resumirMarcadores(nove.slice(0, 6))).toEqual({ exibir: nove.slice(0, 6), restantes: 0 });
  });

  it("acima do limite, mostra os primeiros e conta o resto", () => {
    expect(resumirMarcadores(nove)).toEqual({ exibir: nove.slice(0, 6), restantes: 3 });
    expect(resumirMarcadores(nove, 2).restantes).toBe(7);
  });

  it("encurta os longos para exibir", () => {
    const longo = `[${"a".repeat(100)}]`;
    const { exibir } = resumirMarcadores([longo]);
    expect(exibir[0].length).toBeLessThanOrEqual(60);
    expect(exibir[0].startsWith("[")).toBe(true);
    expect(exibir[0].endsWith("…]")).toBe(true);
  });
});

describe("encurtarMarcador", () => {
  it("marcador curto fica igual", () => {
    expect(encurtarMarcador("[CPF/RG]")).toBe("[CPF/RG]");
  });

  it("marcador longo é cortado mantendo os colchetes", () => {
    const curto = encurtarMarcador("[descrever a evolução do paciente]", 20);
    expect(curto).toBe("[descrever a evolu…]");
    expect(curto.length).toBe(20);
  });
});
