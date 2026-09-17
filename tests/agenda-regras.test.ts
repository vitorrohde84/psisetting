import { describe, it, expect } from "vitest";
import { deveCriarEvolucao, valorDaCobranca } from "../utils/agenda-regras";

/**
 * Cada teste aqui corresponde a um defeito que estava ATIVO em produção,
 * sobre prontuário de paciente real, até 17/09/2026.
 */

const base = {
  dataAgendamento: "2026-09-17",
  hoje: "2026-09-17",
  jaExisteEvolucao: false,
  temObservacao: true,
};

describe("deveCriarEvolucao", () => {
  it("cria a evolução da sessão de hoje", () => {
    expect(deveCriarEvolucao(base)).toBe(true);
  });

  it("cria a evolução de uma sessão passada", () => {
    expect(deveCriarEvolucao({ ...base, dataAgendamento: "2026-09-10" })).toBe(true);
  });

  it("NÃO cria evolução de sessão futura — era o que a recorrência fabricava", () => {
    expect(deveCriarEvolucao({ ...base, dataAgendamento: "2026-09-24" })).toBe(false);
    expect(deveCriarEvolucao({ ...base, dataAgendamento: "2026-12-31" })).toBe(false);
  });

  it("NUNCA sobrescreve evolução existente — era o que apagava o texto da psicóloga", () => {
    expect(deveCriarEvolucao({ ...base, jaExisteEvolucao: true })).toBe(false);
    // Nem para sessão de hoje, nem passada: registro clínico não se sobrescreve.
    expect(
      deveCriarEvolucao({ ...base, dataAgendamento: "2026-09-01", jaExisteEvolucao: true })
    ).toBe(false);
  });

  it("não cria nada sem observação escrita", () => {
    expect(deveCriarEvolucao({ ...base, temObservacao: false })).toBe(false);
  });

  it("não quebra com data vazia", () => {
    expect(deveCriarEvolucao({ ...base, dataAgendamento: "" })).toBe(false);
  });
});

describe("valorDaCobranca", () => {
  it("em branco não gera cobrança — o sistema não inventa valor", () => {
    expect(valorDaCobranca("")).toBeNull();
    expect(valorDaCobranca("   ")).toBeNull();
    expect(valorDaCobranca(null)).toBeNull();
    expect(valorDaCobranca(undefined)).toBeNull();
  });

  it("aceita vírgula, que é como se digita em português", () => {
    expect(valorDaCobranca("150,50")).toBe(150.5);
    expect(valorDaCobranca("120,00")).toBe(120);
  });

  it("aceita ponto e número", () => {
    expect(valorDaCobranca("150.50")).toBe(150.5);
    expect(valorDaCobranca("200")).toBe(200);
    expect(valorDaCobranca(180)).toBe(180);
  });

  it("recusa zero e negativo", () => {
    expect(valorDaCobranca("0")).toBeNull();
    expect(valorDaCobranca("-50")).toBeNull();
    expect(valorDaCobranca(0)).toBeNull();
  });

  it("recusa texto que não é número", () => {
    expect(valorDaCobranca("abc")).toBeNull();
    expect(valorDaCobranca("R$ 150")).toBeNull();
  });

  it("arredonda para centavos, porque é dinheiro", () => {
    expect(valorDaCobranca("150,555")).toBe(150.56);
  });
});
