import { describe, it, expect } from "vitest";
import { DESCONTO_FIXO_MAXIMO, fimDoDiaEmBrasilia, validarNovoCupom } from "../utils/cupom-admin";

const AGORA = new Date("2026-09-23T12:00:00-03:00");

describe("validarNovoCupom", () => {
  it("desconto % por 3 meses", () => {
    const r = validarNovoCupom(
      { code: " promo20 ", discount_type: "percent", discount_value: 20, duracao_meses: 3 },
      AGORA
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.code).toBe("PROMO20");
      expect(r.valor.duracao_meses).toBe(3);
      expect(r.valor.para_sempre).toBe(false);
    }
  });

  it("para sempre é explícito: duração null + para_sempre true", () => {
    const r = validarNovoCupom(
      { code: "SEMPRE10", discount_type: "fixed", discount_value: 10, para_sempre: true },
      AGORA
    );
    expect(r.ok && r.valor.duracao_meses === null && r.valor.para_sempre).toBe(true);
  });

  it("sem duração informada = 1 mensalidade (nunca 'para sempre' por omissão)", () => {
    const r = validarNovoCupom({ code: "UMA", discount_type: "percent", discount_value: 10 }, AGORA);
    expect(r.ok && r.valor.duracao_meses === 1 && !r.valor.para_sempre).toBe(true);
  });

  it("recusa percentual acima de 100 e desconto fixo maior que o preço", () => {
    expect(validarNovoCupom({ code: "X100", discount_type: "percent", discount_value: 150 }, AGORA).ok).toBe(false);
    expect(validarNovoCupom({ code: "XFIX", discount_type: "fixed", discount_value: 40 }, AGORA).ok).toBe(false);
    expect(
      validarNovoCupom({ code: "XMAX", discount_type: "fixed", discount_value: DESCONTO_FIXO_MAXIMO }, AGORA).ok
    ).toBe(true);
  });

  it("aceita centavos no desconto fixo", () => {
    const r = validarNovoCupom({ code: "CENT", discount_type: "fixed", discount_value: 4.9 }, AGORA);
    expect(r.ok && r.valor.discount_value === 4.9).toBe(true);
  });

  it("recusa código com espaço ou símbolo", () => {
    expect(validarNovoCupom({ code: "com espaço", discount_type: "vip" }, AGORA).ok).toBe(false);
    expect(validarNovoCupom({ code: "A<B>", discount_type: "vip" }, AGORA).ok).toBe(false);
  });

  it("dias de teste e VIP não têm duração de desconto", () => {
    const r = validarNovoCupom({ code: "TESTE30", discount_type: "trial_days", discount_value: 30, para_sempre: true }, AGORA);
    expect(r.ok && r.valor.trial_days === 30 && r.valor.para_sempre === false).toBe(true);
  });
});

describe("fimDoDiaEmBrasilia", () => {
  it("a validade vale até 23:59 do dia escolhido em Brasília (antes vencia às 21h do dia anterior)", () => {
    const r = fimDoDiaEmBrasilia("2026-10-31", AGORA);
    expect(r.ok && r.valor).toBe("2026-11-01T02:59:59.000Z");
  });

  it("vazio = sem validade; data passada ou inválida = erro", () => {
    expect(fimDoDiaEmBrasilia("", AGORA)).toEqual({ ok: true, valor: null });
    expect(fimDoDiaEmBrasilia("2026-09-01", AGORA).ok).toBe(false);
    expect(fimDoDiaEmBrasilia("31/10/2026", AGORA).ok).toBe(false);
  });
});
