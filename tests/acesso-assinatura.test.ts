import { describe, it, expect } from "vitest";
import { CARENCIA_CARTAO_DIAS, calcularAcesso } from "../utils/acesso-assinatura";

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

describe("tolerância da renovação automática no cartão", () => {
  // A cobrança do mês pode sair horas depois do fim do período, e um cartão
  // recusado é tentado de novo por até 10 dias (decisão de 23/09/2026).
  const horas = (n: number) => new Date(AGORA.getTime() + n * 60 * 60 * 1000).toISOString();

  it("são 10 dias", () => {
    expect(CARENCIA_CARTAO_DIAS).toBe(10);
  });

  // A renovação ligada antes de os dias acabarem — o caso normal de quem
  // assina e renova todo mês.
  const LIGADA_HA_60_DIAS = dias(-60);

  it("período pago acabou com a renovação ligada: acesso segue até o fim da tolerância", () => {
    const r = calcularAcesso({
      isVip: false,
      trialEndsAt: dias(-40),
      currentPeriodEnd: dias(-3),
      renovacaoAutomatica: true,
      renovacaoDesde: LIGADA_HA_60_DIAS,
      agora: AGORA,
    });
    expect(r.situacao).toBe("ativo");
    expect(r.temAcesso).toBe(true);
    expect(r.somenteLeitura).toBe(false);
    expect(r.emCarencia).toBe(true);
    expect(r.diasParaVencer).toBe(7);
    expect(r.acessoAte).toBe(dias(7));
  });

  it("último dia da tolerância ainda tem acesso", () => {
    const r = calcularAcesso({
      isVip: false,
      trialEndsAt: null,
      currentPeriodEnd: horas(-239),
      renovacaoAutomatica: true,
      renovacaoDesde: LIGADA_HA_60_DIAS,
      agora: AGORA,
    });
    expect(r.situacao).toBe("ativo");
    expect(r.emCarencia).toBe(true);
    expect(r.diasParaVencer).toBe(1);
  });

  it("no 11º dia depois do fim do período: vencido, mesmo com a renovação ligada", () => {
    for (const fim of [dias(-10), horas(-241), dias(-11)]) {
      const r = calcularAcesso({
        isVip: false,
        trialEndsAt: null,
        currentPeriodEnd: fim,
        renovacaoAutomatica: true,
        renovacaoDesde: LIGADA_HA_60_DIAS,
        agora: AGORA,
      });
      expect(r.situacao, fim).toBe("vencido");
      expect(r.somenteLeitura, fim).toBe(true);
      expect(r.emCarencia, fim).toBe(false);
    }
  });

  it("sem renovação: vencido já no dia seguinte ao fim, sem tolerância", () => {
    for (const renovacaoAutomatica of [false, undefined]) {
      const r = calcularAcesso({ isVip: false, trialEndsAt: null, currentPeriodEnd: horas(-1), renovacaoAutomatica, agora: AGORA });
      expect(r.situacao).toBe("vencido");
      expect(r.emCarencia).toBe(false);
    }
  });

  it("dentro do período pago a tolerância não entra na conta", () => {
    const r = calcularAcesso({ isVip: false, trialEndsAt: null, currentPeriodEnd: dias(5), renovacaoAutomatica: true, agora: AGORA });
    expect(r.situacao).toBe("ativo");
    expect(r.emCarencia).toBe(false);
    expect(r.diasParaVencer).toBe(5);
    expect(r.acessoAte).toBe(dias(5));
  });

  it("teste que termina depois da tolerância prevalece (não é carência)", () => {
    const r = calcularAcesso({ isVip: false, trialEndsAt: dias(20), currentPeriodEnd: dias(-2), renovacaoAutomatica: true, agora: AGORA });
    expect(r.situacao).toBe("teste");
    expect(r.emCarencia).toBe(false);
    expect(r.diasRestantesTeste).toBe(20);
    expect(r.acessoAte).toBe(dias(20));
  });

  it("teste ainda correndo: vale o teste; a tolerância conta do fim dele", () => {
    const r = calcularAcesso({
      isVip: false,
      trialEndsAt: dias(3),
      currentPeriodEnd: dias(-2),
      renovacaoAutomatica: true,
      renovacaoDesde: LIGADA_HA_60_DIAS,
      agora: AGORA,
    });
    expect(r.situacao).toBe("teste");
    expect(r.emCarencia).toBe(false);
    expect(r.acessoAte).toBe(dias(3));

    const depois = calcularAcesso({
      isVip: false,
      trialEndsAt: dias(3),
      currentPeriodEnd: dias(-2),
      renovacaoAutomatica: true,
      renovacaoDesde: LIGADA_HA_60_DIAS,
      agora: new Date(AGORA.getTime() + 5 * 86400000),
    });
    expect(depois.situacao).toBe("ativo");
    expect(depois.emCarencia).toBe(true);
    expect(depois.acessoAte).toBe(dias(13));
  });

  it("ligou o automático no teste grátis: a tolerância vale depois do fim do teste", () => {
    // A 1ª cobrança sai no fim do teste; pode levar horas ou ser recusada.
    const ligadaNoTeste = dias(-5);
    const r = calcularAcesso({
      isVip: false,
      trialEndsAt: dias(-3),
      currentPeriodEnd: null,
      renovacaoAutomatica: true,
      renovacaoDesde: ligadaNoTeste,
      agora: AGORA,
    });
    expect(r.situacao).toBe("ativo");
    expect(r.emCarencia).toBe(true);
    expect(r.acessoAte).toBe(dias(7));

    const vencido = calcularAcesso({
      isVip: false,
      trialEndsAt: dias(-11),
      currentPeriodEnd: null,
      renovacaoAutomatica: true,
      renovacaoDesde: dias(-12),
      agora: AGORA,
    });
    expect(vencido.situacao).toBe("vencido");

    const semRenovacao = calcularAcesso({ isVip: false, trialEndsAt: dias(-1), currentPeriodEnd: null, agora: AGORA });
    expect(semRenovacao.situacao).toBe("vencido");
  });

  it("ligou o automático JÁ vencido: sem tolerância — espera a primeira cobrança", () => {
    // Revisão de 23/09: antes, quem estava vencido há menos de 10 dias ganhava
    // acesso na hora ao ligar, e a tela lia isso como "cobrança aprovada".
    for (const [trialEndsAt, currentPeriodEnd] of [
      [dias(-3), null],
      [dias(-40), dias(-3)],
    ] as const) {
      const r = calcularAcesso({
        isVip: false,
        trialEndsAt,
        currentPeriodEnd,
        renovacaoAutomatica: true,
        renovacaoDesde: AGORA.toISOString(),
        agora: AGORA,
      });
      expect(r.situacao).toBe("vencido");
      expect(r.emCarencia).toBe(false);
    }
  });

  it("sem saber quando foi ligada, não há tolerância", () => {
    const r = calcularAcesso({ isVip: false, trialEndsAt: null, currentPeriodEnd: dias(-3), renovacaoAutomatica: true, agora: AGORA });
    expect(r.situacao).toBe("vencido");
  });

  it("VIP nunca está em carência", () => {
    const r = calcularAcesso({ isVip: true, trialEndsAt: null, currentPeriodEnd: dias(-3), renovacaoAutomatica: true, agora: AGORA });
    expect(r.situacao).toBe("vip");
    expect(r.emCarencia).toBe(false);
  });

  it("fora da tolerância, emCarencia é sempre false", () => {
    const casos = [
      calcularAcesso({ isVip: false, trialEndsAt: dias(5), currentPeriodEnd: null, agora: AGORA }),
      calcularAcesso({ isVip: false, trialEndsAt: null, currentPeriodEnd: dias(5), agora: AGORA }),
      calcularAcesso({ isVip: false, trialEndsAt: null, currentPeriodEnd: null, renovacaoAutomatica: true, agora: AGORA }),
    ];
    for (const r of casos) expect(r.emCarencia).toBe(false);
  });
});
