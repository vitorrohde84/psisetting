import { describe, it, expect } from "vitest";
import { calcularAcesso } from "../utils/acesso-assinatura";

/**
 * Regra de acesso pelas datas.
 *
 * O furo que isto trava: o status gravado decidia o acesso. Quem pagou uma vez
 * ficava "active" para sempre, e conta cancelada, com pagamento recusado ou
 * com teste expirado pelo admin continuava com acesso total.
 */

const AGORA = new Date("2026-09-23T12:00:00-03:00");
const dias = (n: number) => new Date(AGORA.getTime() + n * 24 * 60 * 60 * 1000).toISOString();

describe("calcularAcesso", () => {
  it("VIP tem acesso mesmo sem nenhuma data", () => {
    const r = calcularAcesso({ isVip: true, trialEndsAt: null, currentPeriodEnd: null, agora: AGORA });
    expect(r.situacao).toBe("vip");
    expect(r.temAcesso).toBe(true);
  });

  it("período pago no futuro = ativo, com os dias para vencer", () => {
    const r = calcularAcesso({ isVip: false, trialEndsAt: dias(3), currentPeriodEnd: dias(3), agora: AGORA });
    expect(r.situacao).toBe("ativo");
    expect(r.diasParaVencer).toBe(3);
    expect(r.somenteLeitura).toBe(false);
  });

  it("pagou uma vez e os 30 dias acabaram = somente leitura (antes ficava ativo para sempre)", () => {
    const r = calcularAcesso({ isVip: false, trialEndsAt: dias(-1), currentPeriodEnd: dias(-1), agora: AGORA });
    expect(r.situacao).toBe("vencido");
    expect(r.somenteLeitura).toBe(true);
  });

  it("status gravado não importa: sem datas válidas, não há acesso", () => {
    // Equivale a uma conta "active" antiga que nunca teve current_period_end.
    const r = calcularAcesso({ isVip: false, trialEndsAt: null, currentPeriodEnd: null, agora: AGORA });
    expect(r.situacao).toBe("vencido");
  });

  it("teste gratuito em andamento", () => {
    const r = calcularAcesso({ isVip: false, trialEndsAt: dias(5), currentPeriodEnd: null, agora: AGORA });
    expect(r.situacao).toBe("teste");
    expect(r.diasRestantesTeste).toBe(5);
  });

  it("teste encerrado pelo admin (trial_ends_at = agora) = somente leitura", () => {
    const r = calcularAcesso({ isVip: false, trialEndsAt: AGORA.toISOString(), currentPeriodEnd: null, agora: AGORA });
    expect(r.situacao).toBe("vencido");
  });

  it("dias pagos contam mesmo com teste já vencido", () => {
    const r = calcularAcesso({ isVip: false, trialEndsAt: dias(-10), currentPeriodEnd: dias(12), agora: AGORA });
    expect(r.situacao).toBe("ativo");
  });

  it("data inválida no banco não dá acesso nem quebra", () => {
    const r = calcularAcesso({ isVip: false, trialEndsAt: "lixo", currentPeriodEnd: "também lixo", agora: AGORA });
    expect(r.situacao).toBe("vencido");
  });
});

describe("acessoAte", () => {
  it("teste por cupom que termina DEPOIS do período pago: vale a data maior", () => {
    const r = calcularAcesso({ isVip: false, trialEndsAt: dias(40), currentPeriodEnd: dias(10), agora: AGORA });
    expect(r.situacao).toBe("ativo");
    expect(r.diasParaVencer).toBe(40);
    expect(r.acessoAte).toBe(dias(40));
  });

  it("período pago maior que o teste: vale o período pago", () => {
    const r = calcularAcesso({ isVip: false, trialEndsAt: dias(2), currentPeriodEnd: dias(25), agora: AGORA });
    expect(r.acessoAte).toBe(dias(25));
  });
});
