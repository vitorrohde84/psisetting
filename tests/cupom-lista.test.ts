import { describe, it, expect } from "vitest";
import {
  descreverBeneficio,
  descreverUsoDoCupom,
  formatarData,
  situacaoDoResgate,
  type CupomAdmin,
  type ResgateCupom,
} from "../app/admin/cupom-lista";

function cupom(parcial: Partial<CupomAdmin>): CupomAdmin {
  return {
    id: "c1",
    code: "PROMO20",
    discount_type: "percent",
    discount_value: 20,
    trial_days: 30,
    duracao_meses: 1,
    para_sempre: false,
    max_uses: null,
    uses_count: 0,
    expires_at: null,
    active: true,
    ...parcial,
  };
}

function resgate(parcial: Partial<ResgateCupom>): ResgateCupom {
  return {
    resgateId: "r1",
    nome: "Ana",
    email: "ana@exemplo.com",
    desde: "2026-09-01T12:00:00Z",
    usadas: 0,
    duracaoMeses: 3,
    paraSempre: false,
    restantes: 3,
    encerrado: false,
    emUso: true,
    ...parcial,
  };
}

describe("descreverBeneficio", () => {
  it("desconto % por alguns meses mostra duração e preço por mês", () => {
    expect(descreverBeneficio(cupom({ duracao_meses: 3 }))).toBe("20% OFF por 3 meses (R$ 27,92/mês)");
  });

  it("desconto de uma mensalidade só não diz /mês", () => {
    expect(descreverBeneficio(cupom({ duracao_meses: 1 }))).toBe("20% OFF só na 1ª mensalidade (R$ 27,92)");
  });

  it("para sempre", () => {
    expect(descreverBeneficio(cupom({ para_sempre: true, duracao_meses: null }))).toBe(
      "20% OFF para sempre (R$ 27,92/mês)"
    );
  });

  it("desconto fixo com centavos (antes aparecia 'R$ 5,5,00')", () => {
    expect(
      descreverBeneficio(cupom({ discount_type: "fixed", discount_value: 5.5, duracao_meses: 2 }))
    ).toBe("R$ 5,50 OFF por 2 meses (R$ 29,40/mês)");
  });

  it("cupom de antes da migração (sem as colunas) vale 1 mês", () => {
    const c = cupom({});
    delete c.duracao_meses;
    delete c.para_sempre;
    expect(descreverBeneficio(c)).toBe("20% OFF só na 1ª mensalidade (R$ 27,92)");
  });

  it("dias de teste e VIP", () => {
    expect(descreverBeneficio(cupom({ discount_type: "trial_days", discount_value: 15, trial_days: 15 }))).toBe(
      "+15 dias grátis de teste"
    );
    expect(descreverBeneficio(cupom({ discount_type: "vip", discount_value: 0 }))).toBe(
      "Acesso VIP Vitalício (100% Grátis)"
    );
  });
});

describe("descreverUsoDoCupom", () => {
  it("desconto: em uso, total, limite e validade", () => {
    expect(
      descreverUsoDoCupom(
        cupom({ emUso: 2, totalResgates: 5, max_uses: 10, expires_at: "2026-10-31T23:59:59-03:00" })
      )
    ).toBe("2 em uso agora · 5 resgates no total · limite de 10 · vale até 31/10/2026");
  });

  it("singular e sem limite", () => {
    expect(descreverUsoDoCupom(cupom({ emUso: 1, totalResgates: 1 }))).toBe("1 em uso agora · 1 resgate no total");
  });

  it("dias de teste não têm 'em uso'", () => {
    expect(descreverUsoDoCupom(cupom({ discount_type: "trial_days", totalResgates: 3 }))).toBe(
      "3 resgates no total"
    );
  });
});

describe("situacaoDoResgate", () => {
  it("em uso com meses contados", () => {
    expect(situacaoDoResgate(resgate({ usadas: 2, restantes: 1 }), true)).toEqual({
      situacao: "em_uso",
      texto: "2 de 3 mensalidades usadas",
    });
    expect(situacaoDoResgate(resgate({ usadas: 0, duracaoMeses: 1, restantes: 1 }), true).texto).toBe(
      "0 de 1 mensalidade usada"
    );
  });

  it("para sempre", () => {
    expect(
      situacaoDoResgate(resgate({ paraSempre: true, duracaoMeses: null, restantes: null }), true)
    ).toEqual({ situacao: "em_uso", texto: "para sempre" });
  });

  it("concluído", () => {
    expect(situacaoDoResgate(resgate({ usadas: 3, restantes: 0, emUso: false }), true).situacao).toBe("concluido");
  });

  it("encerrado no meio do caminho", () => {
    expect(
      situacaoDoResgate(resgate({ usadas: 1, restantes: 2, encerrado: true, emUso: false }), true).situacao
    ).toBe("encerrado");
  });

  it("para sempre encerrado", () => {
    expect(
      situacaoDoResgate(
        resgate({ paraSempre: true, duracaoMeses: null, restantes: null, encerrado: true, emUso: false }),
        true
      ).situacao
    ).toBe("encerrado");
  });

  it("quem já tinha concluído continua 'concluído' depois de encerrar para todos", () => {
    expect(
      situacaoDoResgate(resgate({ usadas: 3, restantes: 0, encerrado: true, emUso: false }), true).situacao
    ).toBe("concluido");
  });

  it("cupom de dias de teste ou VIP: resgatado", () => {
    expect(situacaoDoResgate(resgate({ restantes: 0, emUso: false }), false).texto).toBe("resgatado");
  });
});

describe("formatarData", () => {
  it("usa o fuso de Brasília: 01h UTC ainda é o dia anterior", () => {
    expect(formatarData("2026-11-01T01:00:00Z")).toBe("31/10/2026");
  });

  it("vazio ou inválido vira travessão", () => {
    expect(formatarData(null)).toBe("—");
    expect(formatarData("não é data")).toBe("—");
  });
});
