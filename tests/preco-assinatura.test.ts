import { describe, it, expect } from "vitest";
import {
  aplicarDesconto,
  descreverDuracaoCupom,
  descreverPrecoComDesconto,
  mensalidadesRestantes,
  PRECO_BASE,
} from "../utils/preco-desconto";
import {
  calcularPrecoAssinatura,
  descontosEmUso,
  escolherMelhorDesconto,
  precoParaTela,
  valorConfere,
} from "../utils/preco-assinatura";

/**
 * Preço da assinatura com cupom. O que isto trava:
 *  - o valor mostrado e o cobrado saem da mesma conta (o PIX chegou a ignorar
 *    o cupom enquanto a tela mostrava o desconto);
 *  - o desconto de quem já usa vem da FOTO do resgate: pausar, vencer ou
 *    editar o cupom não muda nada para essas pessoas;
 *  - descontos não se somam; vale o menor preço.
 */

describe("contas do desconto", () => {
  it("20% sobre R$ 34,90 = R$ 27,92", () => {
    expect(aplicarDesconto(PRECO_BASE, "percent", 20)).toBe(27.92);
  });

  it("R$ 5,00 de desconto = R$ 29,90", () => {
    expect(aplicarDesconto(PRECO_BASE, "fixed", 5)).toBe(29.9);
  });

  it("nunca cobra menos que R$ 1,00", () => {
    expect(aplicarDesconto(PRECO_BASE, "percent", 100)).toBe(1);
    expect(aplicarDesconto(PRECO_BASE, "fixed", 999)).toBe(1);
  });

  it("mensalidades restantes: para sempre é null e nunca acaba", () => {
    expect(mensalidadesRestantes(null, 500)).toBeNull();
    expect(mensalidadesRestantes(3, 1)).toBe(2);
    expect(mensalidadesRestantes(3, 7)).toBe(0);
  });

  it("frases de preço", () => {
    expect(descreverPrecoComDesconto({ valorFinal: 27.92, restantes: null, novo: true })).toBe("R$ 27,92/mês, todo mês");
    expect(descreverPrecoComDesconto({ valorFinal: 27.92, restantes: 1, novo: true })).toBe(
      "R$ 27,92 na 1ª mensalidade, depois R$ 34,90/mês"
    );
    expect(descreverPrecoComDesconto({ valorFinal: 27.92, restantes: 3, novo: true })).toBe(
      "R$ 27,92/mês nos 3 primeiros meses, depois R$ 34,90/mês"
    );
    expect(descreverPrecoComDesconto({ valorFinal: 27.92, restantes: 2, novo: false })).toBe(
      "R$ 27,92/mês por mais 2 mensalidades, depois R$ 34,90/mês"
    );
    expect(descreverDuracaoCupom(null)).toBe("para sempre");
    expect(descreverDuracaoCupom(1)).toBe("só na 1ª mensalidade");
    expect(descreverDuracaoCupom(6)).toBe("por 6 meses");
  });
});

const resgate = (over: Record<string, unknown> = {}) => ({
  coupon_id: "c1",
  desconto_tipo: "percent",
  desconto_valor: 20,
  duracao_meses: 3,
  para_sempre: false,
  mensalidades_usadas: 1,
  encerrado_em: null,
  coupons: { code: "PROMO20" },
  ...over,
});

describe("descontos em uso (foto do resgate)", () => {
  it("resgate com mensalidades sobrando entra, com o que falta", () => {
    const [d] = descontosEmUso([resgate()]);
    expect(d.valorFinal).toBe(27.92);
    expect(d.restantes).toBe(2);
    expect(d.code).toBe("PROMO20");
  });

  it("resgate esgotado não entra", () => {
    expect(descontosEmUso([resgate({ mensalidades_usadas: 3 })])).toHaveLength(0);
  });

  it("para sempre nunca esgota", () => {
    const [d] = descontosEmUso([resgate({ para_sempre: true, duracao_meses: null, mensalidades_usadas: 40 })]);
    expect(d.restantes).toBeNull();
  });

  it("desconto encerrado pelo admin não entra", () => {
    expect(descontosEmUso([resgate({ encerrado_em: "2026-09-23T00:00:00Z" })])).toHaveLength(0);
  });

  it("resgate de VIP ou dias de teste não vira desconto de preço", () => {
    expect(descontosEmUso([resgate({ desconto_tipo: "vip" })])).toHaveLength(0);
  });

  it("não soma: vence o menor preço", () => {
    const candidatos = descontosEmUso([
      resgate({ coupon_id: "a", desconto_valor: 10, coupons: { code: "DEZ" } }),
      resgate({ coupon_id: "b", desconto_valor: 30, coupons: { code: "TRINTA" } }),
    ]);
    expect(escolherMelhorDesconto(candidatos)?.code).toBe("TRINTA");
  });
});

/** Client falso com cupons e resgates em memória. */
function fakeClient(dados: {
  resgates?: Array<Record<string, unknown>>;
  cupons?: Record<string, Record<string, unknown>>;
  resgatesErro?: boolean;
}) {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from(tabela: string): any {
      const filtros: Record<string, unknown> = {};
      const api = {
        select: () => api,
        eq: (c: string, v: unknown) => {
          filtros[c] = v;
          return api;
        },
        in: () => api,
        maybeSingle: async () => {
          if (tabela === "coupons") {
            const c = dados.cupons?.[String(filtros.code)];
            if (!c || (filtros.active === true && c.active !== true)) return { data: null, error: null };
            return { data: c, error: null };
          }
          const achado = (dados.resgates ?? []).find(
            (r) => r.coupon_id === filtros.coupon_id && r.profile_id === filtros.profile_id
          );
          return { data: achado ?? null, error: null };
        },
        then: (resolve: (v: unknown) => void) =>
          resolve(
            dados.resgatesErro
              ? { data: null, error: { message: "column desconto_tipo does not exist" } }
              : { data: dados.resgates ?? [], error: null }
          ),
      };
      return api;
    },
  };
}

describe("calcularPrecoAssinatura", () => {
  it("sem cupom nenhum = preço cheio", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = await calcularPrecoAssinatura({ adminClient: fakeClient({}) as any, userId: "u1" });
    expect(p.valor).toBe(PRECO_BASE);
    expect(p.desconto).toBeNull();
  });

  it("cupom em uso entra sozinho, sem digitar código (é o 'todo mês')", async () => {
    const p = await calcularPrecoAssinatura({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adminClient: fakeClient({ resgates: [resgate({ profile_id: "u1" })] }) as any,
      userId: "u1",
    });
    expect(p.valor).toBe(27.92);
    expect(p.desconto?.origem).toBe("cupom_em_uso");
  });

  it("digitar o código do cupom que já usa não é erro", async () => {
    const p = await calcularPrecoAssinatura({
      adminClient: fakeClient({
        resgates: [resgate({ profile_id: "u1" })],
        cupons: { PROMO20: { id: "c1", code: "PROMO20", active: false, discount_type: "percent", discount_value: 20 } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
      userId: "u1",
      codigo: "promo20",
    });
    expect(p.erroCupom).toBeUndefined();
    expect(p.valor).toBe(27.92);
  });

  it("cupom PAUSADO continua valendo para quem já usa (foto), mas não para quem digita agora", async () => {
    const cupons = { PROMO20: { id: "c1", code: "PROMO20", active: false, discount_type: "percent", discount_value: 20 } };

    const quemUsa = await calcularPrecoAssinatura({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adminClient: fakeClient({ resgates: [resgate({ profile_id: "u1" })], cupons }) as any,
      userId: "u1",
    });
    expect(quemUsa.valor).toBe(27.92);

    const novo = await calcularPrecoAssinatura({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adminClient: fakeClient({ cupons }) as any,
      userId: "u2",
      codigo: "PROMO20",
    });
    expect(novo.erroCupom).toBeTruthy();
    expect(novo.valor).toBe(PRECO_BASE);
  });

  it("código novo válido: prévia com a duração do cupom", async () => {
    const p = await calcularPrecoAssinatura({
      adminClient: fakeClient({
        cupons: {
          TRES: { id: "c9", code: "TRES", active: true, discount_type: "fixed", discount_value: 4.9, duracao_meses: 3, para_sempre: false },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
      userId: "u1",
      codigo: "TRES",
    });
    expect(p.valor).toBe(30);
    expect(p.desconto?.origem).toBe("cupom_novo");
    expect(p.desconto?.restantes).toBe(3);
  });

  it("código de VIP ou dias de teste no pagamento responde como inválido", async () => {
    const p = await calcularPrecoAssinatura({
      adminClient: fakeClient({
        cupons: { VIPX: { id: "v1", code: "VIPX", active: true, discount_type: "vip" } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
      userId: "u1",
      codigo: "VIPX",
    });
    expect(p.erroCupom).toBe("Cupom inválido ou expirado.");
  });

  it("antes da migração (colunas ausentes) cai para o preço cheio, sem quebrar", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = await calcularPrecoAssinatura({ adminClient: fakeClient({ resgatesErro: true }) as any, userId: "u1" });
    expect(p.valor).toBe(PRECO_BASE);
  });

  it("o que vai para a tela não inclui o id interno do cupom", async () => {
    const p = await calcularPrecoAssinatura({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adminClient: fakeClient({ resgates: [resgate({ profile_id: "u1" })] }) as any,
      userId: "u1",
    });
    const tela = precoParaTela(p);
    expect(JSON.stringify(tela)).not.toContain("c1");
    expect(tela.desconto?.frase).toBe("R$ 27,92/mês por mais 2 mensalidades, depois R$ 34,90/mês");
  });
});

describe("valorConfere", () => {
  it("sem valor esperado (tela antiga em cache) não bloqueia", () => {
    expect(valorConfere(undefined, 27.92)).toBe(true);
  });
  it("diferença de centavos bloqueia", () => {
    expect(valorConfere(27.92, 34.9)).toBe(false);
    expect(valorConfere("27.92", 27.92)).toBe(true);
  });
});
