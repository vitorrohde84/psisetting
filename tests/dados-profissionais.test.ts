import { describe, it, expect } from "vitest";
import {
  camposFaltando,
  juntarRotulos,
  itensRodape,
  texto,
} from "../utils/dados-profissionais";

/**
 * Um documento psicológico impresso sem nome, CRP e cidade não diz quem o
 * assina — e já chegou a sair com os dados de outra profissional como padrão.
 * Faltando qualquer um dos três, a impressão é barrada.
 */

const completo = {
  nome: "Maria Silva",
  nome_completo: "Maria Aparecida da Silva",
  crp: "CRP 00/00000",
  cidade: "Porto Alegre, RS",
  telefone: "(11) 91234-5678",
  endereco: "Rua A, 10 - Centro",
};

function campos(perfil: Parameters<typeof camposFaltando>[0]) {
  return camposFaltando(perfil).map((f) => f.campo);
}

describe("camposFaltando", () => {
  it("perfil completo não tem pendência", () => {
    expect(camposFaltando(completo)).toEqual([]);
  });

  it("conta nova (tudo vazio) pede nome, CRP e cidade, nessa ordem", () => {
    expect(camposFaltando({ nome: null, nome_completo: null, crp: null, cidade: null })).toEqual([
      { campo: "nome", rotulo: "nome completo" },
      { campo: "crp", rotulo: "CRP" },
      { campo: "cidade", rotulo: "cidade" },
    ]);
  });

  it("perfil que não carregou conta como tudo faltando", () => {
    expect(campos(null)).toEqual(["nome", "crp", "cidade"]);
    expect(campos(undefined)).toEqual(["nome", "crp", "cidade"]);
  });

  it("basta um dos dois nomes: a assinatura usa o completo ou cai no curto", () => {
    expect(campos({ ...completo, nome_completo: null })).toEqual([]);
    expect(campos({ ...completo, nome: null })).toEqual([]);
    expect(campos({ ...completo, nome: "", nome_completo: "" })).toEqual(["nome"]);
  });

  it("texto só com espaços conta como vazio", () => {
    expect(campos({ ...completo, nome: "  ", nome_completo: "\t", crp: "   ", cidade: " \n " })).toEqual([
      "nome",
      "crp",
      "cidade",
    ]);
  });

  it("telefone e endereço são opcionais", () => {
    expect(camposFaltando({ ...completo, telefone: null, endereco: "" })).toEqual([]);
    expect(camposFaltando({ nome: "Maria", crp: "CRP 00/00000", cidade: "Recife, PE" })).toEqual([]);
  });

  it("aponta só o que falta", () => {
    expect(campos({ ...completo, crp: null })).toEqual(["crp"]);
    expect(campos({ ...completo, cidade: undefined })).toEqual(["cidade"]);
  });
});

describe("juntarRotulos", () => {
  it("monta a frase do aviso", () => {
    expect(juntarRotulos(camposFaltando({ ...completo, crp: null }))).toBe("CRP");
    expect(juntarRotulos(camposFaltando({ ...completo, crp: null, cidade: null }))).toBe("CRP e cidade");
    expect(juntarRotulos(camposFaltando({}))).toBe("nome completo, CRP e cidade");
  });

  it("nada faltando vira texto vazio", () => {
    expect(juntarRotulos([])).toBe("");
  });
});

describe("itensRodape", () => {
  it("mostra endereço e contato quando existem", () => {
    expect(itensRodape(completo)).toEqual(["End: Rua A, 10 - Centro", "Contato: (11) 91234-5678"]);
  });

  it("mostra só o que existir", () => {
    expect(itensRodape({ endereco: null, telefone: "(11) 91234-5678" })).toEqual(["Contato: (11) 91234-5678"]);
    expect(itensRodape({ endereco: "Rua A, 10", telefone: "  " })).toEqual(["End: Rua A, 10"]);
  });

  it("sem endereço nem telefone, o rodapé some", () => {
    expect(itensRodape({})).toEqual([]);
    expect(itensRodape({ endereco: " ", telefone: "" })).toEqual([]);
  });

  it("apara espaços antes de exibir", () => {
    expect(itensRodape({ endereco: "  Rua A, 10  " })).toEqual(["End: Rua A, 10"]);
  });
});

describe("texto", () => {
  it("apara e trata ausência como vazio", () => {
    expect(texto("  Maria  ")).toBe("Maria");
    expect(texto("   ")).toBe("");
    expect(texto(null)).toBe("");
    expect(texto(undefined)).toBe("");
  });
});
