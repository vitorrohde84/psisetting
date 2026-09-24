import { describe, it, expect } from "vitest";
import {
  lerDescontoDaMetadata,
  meioDoPagamento,
  metadataDoDesconto,
  processarPagamentoAprovado,
} from "../utils/pagamento-aprovado";
import type { DescontoAplicado } from "../utils/preco-assinatura";

/**
 * Pagamento aprovado → dias e mensalidade de cupom.
 *
 * A foto do desconto viaja na metadata do pagamento e volta na aprovação: é
 * ela que o banco usa, não o cupom atual (que o admin pode ter pausado).
 */

const UUID = "3f2b8a4e-9c1d-4e5f-8a7b-1c2d3e4f5a6b";

const desconto = (over: Partial<DescontoAplicado> = {}): DescontoAplicado => ({
  origem: "cupom_novo",
  couponId: UUID,
  code: "PROMO20",
  tipo: "percent",
  valor: 20,
  duracaoMeses: 3,
  paraSempre: false,
  restantes: 3,
  valorFinal: 27.92,
  ...over,
});

describe("metadata do desconto", () => {
  it("ida e volta preserva a foto", () => {
    const meta = metadataDoDesconto(desconto());
    expect(lerDescontoDaMetadata(meta)).toEqual({
      cupomId: UUID,
      tipo: "percent",
      valor: 20,
      duracaoMeses: 3,
      paraSempre: false,
    });
  });

  it("para sempre vai explícito, nunca como null (o Mercado Pago pode descartar nulos)", () => {
    const meta = metadataDoDesconto(desconto({ paraSempre: true, duracaoMeses: null }));
    expect(meta?.cupom_duracao).toBe("sempre");
    expect(Object.values(meta ?? {}).every((v) => typeof v === "string")).toBe(true);
    expect(lerDescontoDaMetadata(meta)?.paraSempre).toBe(true);
  });

  it("sem desconto, sem metadata", () => {
    expect(metadataDoDesconto(null)).toBeUndefined();
    expect(lerDescontoDaMetadata(undefined)).toBeNull();
  });

  it("metadata fora do formato é ignorada, nunca vira cupom", () => {
    expect(lerDescontoDaMetadata({ cupom_id: "abc", cupom_tipo: "percent", cupom_valor: "20" })).toBeNull();
    expect(lerDescontoDaMetadata({ cupom_id: UUID, cupom_tipo: "vip", cupom_valor: "20" })).toBeNull();
    expect(lerDescontoDaMetadata({ cupom_id: UUID, cupom_tipo: "percent", cupom_valor: "150" })).toBeNull();
    expect(lerDescontoDaMetadata({ cupom_id: UUID, cupom_tipo: "fixed", cupom_valor: "5", cupom_duracao: "0" })).toBeNull();
  });
});

describe("meio do pagamento", () => {
  it("PIX e cartão", () => {
    expect(meioDoPagamento({ payment_method_id: "pix", payment_type_id: "bank_transfer" })).toBe("pix");
    expect(meioDoPagamento({ payment_method_id: "visa", payment_type_id: "credit_card" })).toBe("cartao");
    expect(meioDoPagamento({})).toBeNull();
  });
});

function fakeClient(rpc: (nome: string, args: Record<string, unknown>) => { data?: unknown; error?: unknown }) {
  const chamadas: Array<{ nome: string; args: Record<string, unknown> }> = [];
  const eventos: string[] = [];
  const perfil: Record<string, unknown> = { current_period_end: null, trial_ends_at: null };
  return {
    chamadas,
    eventos,
    perfil,
    async rpc(nome: string, args: Record<string, unknown>) {
      chamadas.push({ nome, args });
      const r = rpc(nome, args);
      return { data: r.data ?? null, error: r.error ?? null };
    },
    // Só para o caminho de reserva (ativarAssinatura).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from(tabela: string): any {
      if (tabela === "payment_events") {
        return {
          insert: async (l: { payment_id: string }) => {
            if (eventos.includes(l.payment_id)) return { error: { code: "23505" } };
            eventos.push(l.payment_id);
            return { error: null };
          },
        };
      }
      const api = {
        select: () => api,
        eq: () => api,
        single: async () => ({ data: perfil, error: null }),
        update: (patch: Record<string, unknown>) => ({
          eq: async () => {
            Object.assign(perfil, patch);
            return { error: null };
          },
        }),
      };
      return api;
    },
  };
}

describe("processarPagamentoAprovado", () => {
  const pagamento = {
    id: 123,
    status: "approved",
    transaction_amount: 27.92,
    payment_type_id: "bank_transfer",
    payment_method_id: "pix",
    metadata: metadataDoDesconto(desconto()),
  };

  it("manda tudo para a função do banco numa chamada só, com a foto do desconto", async () => {
    const client = fakeClient(() => ({ data: { ja_processado: false, dias: 30, cupom_contado: true } }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await processarPagamentoAprovado({ adminClient: client as any, userId: "u1", payment: pagamento, origem: "pix-check" });

    expect(client.chamadas).toHaveLength(1);
    expect(client.chamadas[0].nome).toBe("processar_pagamento_aprovado");
    expect(client.chamadas[0].args).toMatchObject({
      p_payment_id: "123",
      p_user_id: "u1",
      p_meio: "pix",
      p_valor: 27.92,
      p_cupom_id: UUID,
      p_cupom_tipo: "percent",
      p_cupom_duracao: 3,
      p_cupom_para_sempre: false,
    });
    expect(r.dias).toBe(30);
    expect(r.jaProcessado).toBe(false);
  });

  it("recusa pagamento que não está aprovado", async () => {
    const client = fakeClient(() => ({}));
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      processarPagamentoAprovado({ adminClient: client as any, userId: "u1", payment: { ...pagamento, status: "pending" }, origem: "webhook" })
    ).rejects.toThrow();
  });

  it("código publicado antes do SQL: quem pagou recebe os dias pelo caminho antigo", async () => {
    const client = fakeClient(() => ({
      error: { code: "PGRST202", message: "Could not find the function public.processar_pagamento_aprovado" },
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await processarPagamentoAprovado({ adminClient: client as any, userId: "u1", payment: pagamento, origem: "webhook" });

    expect(r.semMigracao).toBe(true);
    expect(client.perfil.current_period_end).toBeTruthy();
    expect(client.eventos).toEqual(["123"]);
  });

  it("outro erro do banco sobe (para o webhook responder 500 e o Mercado Pago reenviar)", async () => {
    const client = fakeClient(() => ({ error: { code: "57014", message: "canceling statement due to timeout" } }));
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      processarPagamentoAprovado({ adminClient: client as any, userId: "u1", payment: pagamento, origem: "webhook" })
    ).rejects.toBeTruthy();
  });
});

describe("função ausente × erro de dentro da função", () => {
  it("só 'função não encontrada' conta como migração não aplicada", async () => {
    const { funcaoAusente } = await import("../utils/pagamento-aprovado");
    expect(funcaoAusente({ code: "PGRST202", message: "Could not find the function public.processar_pagamento_aprovado" })).toBe(true);
    expect(funcaoAusente({ code: "42883", message: "function does not exist" })).toBe(true);
    // O RAISE da própria função cita o nome dela — e NÃO é função ausente.
    expect(funcaoAusente({ code: "P0001", message: "processar_pagamento_aprovado: perfil x nao encontrado." })).toBe(false);
  });

  it("erro de dentro da função sobe em vez de cair no caminho antigo", async () => {
    const client = fakeClient(() => ({
      error: { code: "P0001", message: "processar_pagamento_aprovado: perfil u1 nao encontrado." },
    }));
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      processarPagamentoAprovado({ adminClient: client as any, userId: "u1", payment: pagamentoBase, origem: "webhook" })
    ).rejects.toBeTruthy();
    // O caminho antigo não rodou: nada foi marcado como processado.
    expect(client.eventos).toHaveLength(0);
  });

  it("erros permanentes (webhook responde 200) e transitórios (500)", async () => {
    const { erroPermanente } = await import("../utils/pagamento-aprovado");
    expect(erroPermanente({ code: "P0001" })).toBe(true);
    expect(erroPermanente({ code: "22P02" })).toBe(true);
    expect(erroPermanente({ code: "57014" })).toBe(false);
    // 404 do Mercado Pago (id inexistente): o SDK lança com status, sem code.
    expect(erroPermanente({ status: 404, message: "not found" })).toBe(true);
    expect(erroPermanente({ status: 503 })).toBe(false);
    expect(erroPermanente(new Error("rede"))).toBe(false);
  });
});

const pagamentoBase = {
  id: 999,
  status: "approved",
  transaction_amount: 34.9,
  payment_type_id: "credit_card",
  payment_method_id: "visa",
};

// ── Cobrança da renovação automática no cartão ──────────────────────────────

/**
 * O Mercado Pago não copia a nossa metadata para as cobranças da assinatura:
 * a foto do desconto vem do resgate gravado ao assinar, e só quando o valor
 * cobrado é o valor com desconto. Valor cheio, ou mensalidades do cupom já
 * esgotadas, vai SEM foto (30 dias, sem contar mensalidade).
 */

const CUPOM_EM_USO = "7d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6";

const resgate = (over: Record<string, unknown> = {}) => ({
  coupon_id: CUPOM_EM_USO,
  desconto_tipo: "percent",
  desconto_valor: 20,
  duracao_meses: 3,
  para_sempre: false,
  mensalidades_usadas: 1,
  encerrado_em: null,
  coupons: { code: "PROMO20" },
  ...over,
});

function clienteDaRenovacao(resgates: Array<Record<string, unknown>>) {
  const chamadas: Array<{ nome: string; args: Record<string, unknown> }> = [];
  const tabelas: string[] = [];
  const recusaLimpa: Array<{ patch: Record<string, unknown>; filtros: unknown[][] }> = [];
  return {
    chamadas,
    tabelas,
    recusaLimpa,
    async rpc(nome: string, args: Record<string, unknown>) {
      chamadas.push({ nome, args });
      return { data: { ja_processado: false, dias: 30, cupom_contado: true }, error: null };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from(tabela: string): any {
      tabelas.push(tabela);
      if (tabela === "coupon_redemptions") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const consulta: any = {
          select: () => consulta,
          eq: () => consulta,
          in: () => consulta,
          then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: resgates, error: null }).then(ok),
        };
        return consulta;
      }
      // assinaturas_cartao: a cobrança aprovada apaga a recusa anterior.
      return {
        update: (patch: Record<string, unknown>) => {
          const registro = { patch, filtros: [] as unknown[][] };
          recusaLimpa.push(registro);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const filtro: any = {
            eq: (...a: unknown[]) => {
              registro.filtros.push(["eq", ...a]);
              return filtro;
            },
            not: (...a: unknown[]) => {
              registro.filtros.push(["not", ...a]);
              return filtro;
            },
            then: (ok: (r: unknown) => unknown) => Promise.resolve({ error: null }).then(ok),
          };
          return filtro;
        },
      };
    },
  };
}

const cobrancaAutomatica = {
  id: 777,
  status: "approved",
  transaction_amount: 27.92,
  payment_type_id: "credit_card",
  payment_method_id: "visa",
  operation_type: "recurring_payment",
};

describe("processarPagamentoAprovado — cobrança da renovação automática", () => {
  it("valor com desconto: usa a foto do resgate em uso e marca cartao_automatico", async () => {
    const client = clienteDaRenovacao([resgate()]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await processarPagamentoAprovado({ adminClient: client as any, userId: "u1", payment: cobrancaAutomatica, origem: "webhook" });

    expect(client.chamadas).toHaveLength(1);
    expect(client.chamadas[0].nome).toBe("processar_pagamento_aprovado");
    expect(client.chamadas[0].args).toMatchObject({
      p_payment_id: "777",
      p_user_id: "u1",
      p_origem: "webhook",
      p_meio: "cartao_automatico",
      p_valor: 27.92,
      p_cupom_id: CUPOM_EM_USO,
      p_cupom_tipo: "percent",
      p_cupom_valor: 20,
      p_cupom_duracao: 3,
      p_cupom_para_sempre: false,
    });
    expect(r.dias).toBe(30);
  });

  it("recorrente: true (veio da fatura) basta, mesmo sem operation_type no pagamento", async () => {
    const client = clienteDaRenovacao([resgate({ para_sempre: true, duracao_meses: null, mensalidades_usadas: 40 })]);
    await processarPagamentoAprovado({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adminClient: client as any,
      userId: "u1",
      payment: { id: 778, status: "approved", transaction_amount: 27.92, payment_type_id: "credit_card", payment_method_id: "visa" },
      origem: "cron",
      recorrente: true,
    });

    expect(client.chamadas[0].args).toMatchObject({
      p_origem: "cron",
      p_meio: "cartao_automatico",
      p_cupom_id: CUPOM_EM_USO,
      p_cupom_duracao: null,
      p_cupom_para_sempre: true,
    });
  });

  it("valor cheio: vai SEM foto, mesmo com cupom em uso", async () => {
    const client = clienteDaRenovacao([resgate()]);
    await processarPagamentoAprovado({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adminClient: client as any,
      userId: "u1",
      payment: { ...cobrancaAutomatica, transaction_amount: 34.9 },
      origem: "webhook",
    });

    expect(client.chamadas[0].args).toMatchObject({
      p_meio: "cartao_automatico",
      p_valor: 34.9,
      p_cupom_id: null,
      p_cupom_tipo: null,
      p_cupom_valor: null,
      p_cupom_duracao: null,
      p_cupom_para_sempre: false,
    });
  });

  it("mensalidades do cupom esgotadas: vai SEM foto, mesmo cobrando o valor com desconto", async () => {
    // A subida para R$ 34,90 atrasou: o erro é nosso, a pessoa recebe 30 dias
    // e o cupom não conta uma 4ª mensalidade.
    const client = clienteDaRenovacao([resgate({ mensalidades_usadas: 3 })]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await processarPagamentoAprovado({ adminClient: client as any, userId: "u1", payment: cobrancaAutomatica, origem: "webhook" });

    expect(client.chamadas[0].args).toMatchObject({ p_meio: "cartao_automatico", p_cupom_id: null, p_cupom_para_sempre: false });
  });

  it("resgate encerrado pelo admin também não dá foto", async () => {
    const client = clienteDaRenovacao([resgate({ encerrado_em: "2026-09-01T00:00:00Z" })]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await processarPagamentoAprovado({ adminClient: client as any, userId: "u1", payment: cobrancaAutomatica, origem: "webhook" });
    expect(client.chamadas[0].args.p_cupom_id).toBeNull();
  });

  it("a metadata do pagamento não vale na cobrança automática (a foto vem do resgate)", async () => {
    const client = clienteDaRenovacao([]);
    await processarPagamentoAprovado({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adminClient: client as any,
      userId: "u1",
      payment: { ...cobrancaAutomatica, metadata: { ...metadataDoDesconto(desconto()), preapproval_id: "2c93" } },
      origem: "webhook",
    });
    expect(client.chamadas[0].args).toMatchObject({ p_meio: "cartao_automatico", p_cupom_id: null });
  });

  it("aprovada: apaga a recusa anterior da assinatura ativa", async () => {
    const client = clienteDaRenovacao([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await processarPagamentoAprovado({ adminClient: client as any, userId: "u1", payment: cobrancaAutomatica, origem: "webhook" });

    expect(client.recusaLimpa).toHaveLength(1);
    expect(client.recusaLimpa[0].patch).toMatchObject({ ultima_recusa_em: null });
    expect(client.recusaLimpa[0].filtros).toEqual([
      ["eq", "user_id", "u1"],
      ["eq", "situacao", "ativa"],
      ["not", "ultima_recusa_em", "is", null],
    ]);
  });

  it("validação do cartão (card_validation) é ignorada sem chamar a função do banco", async () => {
    const client = clienteDaRenovacao([resgate()]);
    const r = await processarPagamentoAprovado({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adminClient: client as any,
      userId: "u1",
      payment: { ...cobrancaAutomatica, transaction_amount: 1, operation_type: "card_validation" },
      origem: "webhook",
      recorrente: true,
    });

    expect(r).toEqual({ ignorado: true, jaProcessado: false });
    expect(client.chamadas).toHaveLength(0);
    expect(client.tabelas).toHaveLength(0);
  });

  it("pagamento avulso continua lendo a metadata (sem consultar resgates nem mexer na assinatura)", async () => {
    const client = clienteDaRenovacao([resgate({ coupon_id: "00000000-0000-4000-8000-000000000000" })]);
    await processarPagamentoAprovado({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adminClient: client as any,
      userId: "u1",
      payment: { ...pagamentoBase, transaction_amount: 27.92, operation_type: "regular_payment", metadata: metadataDoDesconto(desconto()) },
      origem: "process-payment",
    });

    expect(client.chamadas[0].args).toMatchObject({ p_meio: "cartao", p_cupom_id: UUID, p_cupom_duracao: 3 });
    expect(client.tabelas).toEqual([]);
  });
});
