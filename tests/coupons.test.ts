import { describe, it, expect } from "vitest";
import { resolverDescontoDeCupom, registrarResgate } from "../utils/coupons";

/**
 * Testes da regra de cupom — A11 da auditoria de 17/09/2026.
 *
 * Cada teste aqui corresponde a um furo real que existiu em produção. Se algum
 * deles ficar vermelho, o furo voltou.
 */

const BASE = 34.9;

/** Client falso: só o suficiente para exercitar a regra, sem banco. */
function fakeClient(dados: {
  cupons?: Record<string, Record<string, unknown>>;
  resgates?: Array<{ coupon_id: string; profile_id: string }>;
  falharInsercao?: string;
}) {
  const cupons = dados.cupons ?? {};
  const resgates = dados.resgates ?? [];

  return {
    resgates,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from(tabela: string): any {
      if (tabela === "coupons") {
        const filtros: Record<string, unknown> = {};
        const api = {
          select: () => api,
          eq: (coluna: string, valor: unknown) => {
            filtros[coluna] = valor;
            return api;
          },
          maybeSingle: async () => {
            const cupom = cupons[String(filtros.code)];
            if (!cupom) return { data: null, error: null };
            if (filtros.active === true && cupom.active !== true) {
              return { data: null, error: null };
            }
            return { data: cupom, error: null };
          },
        };
        return api;
      }

      if (tabela === "coupon_redemptions") {
        const filtros: Record<string, unknown> = {};
        const api = {
          select: () => api,
          eq: (coluna: string, valor: unknown) => {
            filtros[coluna] = valor;
            return api;
          },
          maybeSingle: async () => {
            const achado = resgates.find(
              (r) =>
                r.coupon_id === filtros.coupon_id &&
                r.profile_id === filtros.profile_id
            );
            return { data: achado ?? null, error: null };
          },
          insert: async (linha: { coupon_id: string; profile_id: string }) => {
            const duplicado = resgates.some(
              (r) =>
                r.coupon_id === linha.coupon_id &&
                r.profile_id === linha.profile_id
            );
            if (duplicado) {
              return { error: { code: "23505", message: "unique violation" } };
            }
            resgates.push(linha);
            return { error: null };
          },
        };
        return api;
      }

      throw new Error(`tabela inesperada: ${tabela}`);
    },
    async rpc() {
      return { error: null };
    },
  };
}

describe("resolverDescontoDeCupom", () => {
  it("rejeita cupom inexistente", async () => {
    const r = await resolverDescontoDeCupom({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adminClient: fakeClient({}) as any,
      code: "NAOEXISTE",
      userId: "u1",
      basePrice: BASE,
    });
    expect(r.valido).toBe(false);
  });

  it("aplica desconto percentual sobre o preço do SERVIDOR, não o do cliente", async () => {
    const r = await resolverDescontoDeCupom({
      adminClient: fakeClient({
        cupons: {
          META50: {
            id: "c1",
            code: "META50",
            active: true,
            discount_type: "percent",
            discount_value: 50,
          },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
      code: "meta50",
      userId: "u1",
      basePrice: BASE,
    });

    expect(r.valido).toBe(true);
    if (r.valido) expect(r.valorFinal).toBeCloseTo(17.45, 2);
  });

  it("RECUSA cupom que atingiu max_uses — o furo era uses_count nunca subir", async () => {
    const r = await resolverDescontoDeCupom({
      adminClient: fakeClient({
        cupons: {
          ESGOTADO: {
            id: "c2",
            code: "ESGOTADO",
            active: true,
            discount_type: "percent",
            discount_value: 50,
            max_uses: 10,
            uses_count: 10,
          },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
      code: "ESGOTADO",
      userId: "u1",
      basePrice: BASE,
    });

    expect(r.valido).toBe(false);
    if (!r.valido) expect(r.motivo).toMatch(/limite/i);
  });

  it("RECUSA segundo resgate pelo mesmo usuário — o furo era poder apagar o resgate", async () => {
    const r = await resolverDescontoDeCupom({
      adminClient: fakeClient({
        cupons: {
          VIP: { id: "c3", code: "VIP", active: true, discount_type: "vip" },
        },
        resgates: [{ coupon_id: "c3", profile_id: "u1" }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
      code: "VIP",
      userId: "u1",
      basePrice: BASE,
    });

    expect(r.valido).toBe(false);
    if (!r.valido) expect(r.motivo).toMatch(/já utilizou/i);
  });

  it("recusa cupom inativo", async () => {
    const r = await resolverDescontoDeCupom({
      adminClient: fakeClient({
        cupons: {
          OFF: { id: "c4", code: "OFF", active: false, discount_type: "percent", discount_value: 90 },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
      code: "OFF",
      userId: "u1",
      basePrice: BASE,
    });
    expect(r.valido).toBe(false);
  });

  it("nunca deixa o valor final cair abaixo de R$ 1,00", async () => {
    const r = await resolverDescontoDeCupom({
      adminClient: fakeClient({
        cupons: {
          TUDO: { id: "c5", code: "TUDO", active: true, discount_type: "fixed", discount_value: 999 },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
      code: "TUDO",
      userId: "u1",
      basePrice: BASE,
    });

    expect(r.valido).toBe(true);
    if (r.valido) expect(r.valorFinal).toBeGreaterThanOrEqual(1);
  });
});

describe("registrarResgate", () => {
  it("é idempotente: o segundo resgate do mesmo cupom não passa", async () => {
    const client = fakeClient({ resgates: [] });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const primeiro = await registrarResgate({ adminClient: client as any, couponId: "c1", userId: "u1" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const segundo = await registrarResgate({ adminClient: client as any, couponId: "c1", userId: "u1" });

    expect(primeiro.registrado).toBe(true);
    expect(segundo.registrado).toBe(false);
    expect(client.resgates).toHaveLength(1);
  });
});
