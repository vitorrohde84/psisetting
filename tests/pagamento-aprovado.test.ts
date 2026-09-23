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
