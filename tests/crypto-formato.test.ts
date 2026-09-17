import { describe, it, expect } from "vitest";
import { ehCifrado, ehFormatoLegado } from "../utils/crypto";

/**
 * Regressão real, encontrada em produção em 17/09/2026.
 *
 * Havia 17 pontos no app testando `.startsWith("enc:v1:")` na mão para decidir
 * se um valor precisava ser descriptografado. Quando o formato enc:v2: entrou,
 * todos eles deixaram de reconhecer o dado novo como cifrado — e a tela passou
 * a exibir "enc:v2:9f3a..." no lugar da evolução clínica.
 *
 * O bug ficou ativo em produção até alguém abrir a agenda e ver o texto
 * embaralhado. Estes testes existem para que a introdução de um enc:v3: não
 * repita a história.
 */

describe("ehCifrado", () => {
  it("reconhece o formato novo (v2) — era exatamente o que falhava", () => {
    expect(ehCifrado("enc:v2:abc123:def456")).toBe(true);
  });

  it("reconhece o formato antigo (v1)", () => {
    expect(ehCifrado("enc:v1:abc123:def456")).toBe(true);
  });

  it("não confunde texto clínico comum com dado cifrado", () => {
    expect(ehCifrado("Paciente compareceu ao atendimento")).toBe(false);
    expect(ehCifrado("Declaro, para os devidos fins")).toBe(false);
    // Registros anteriores à criptografia existem em texto puro no banco:
    // precisam continuar sendo exibidos como estão.
    expect(ehCifrado("Tainá relatou melhora no sono")).toBe(false);
  });

  it("aguenta valor vazio, nulo e não-texto sem quebrar", () => {
    expect(ehCifrado("")).toBe(false);
    expect(ehCifrado(null)).toBe(false);
    expect(ehCifrado(undefined)).toBe(false);
    expect(ehCifrado(42)).toBe(false);
    expect(ehCifrado({})).toBe(false);
  });

  it("não cai em texto que apenas começa parecido", () => {
    expect(ehCifrado("encaminhamento para psiquiatra")).toBe(false);
    expect(ehCifrado("enc:v")).toBe(false);
  });
});

describe("ehFormatoLegado", () => {
  it("aponta só o v1, que é o que a remigração precisa converter", () => {
    expect(ehFormatoLegado("enc:v1:abc:def")).toBe(true);
    expect(ehFormatoLegado("enc:v2:abc:def")).toBe(false);
    expect(ehFormatoLegado("texto puro")).toBe(false);
  });
});
