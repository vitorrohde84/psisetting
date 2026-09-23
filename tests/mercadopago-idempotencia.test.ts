import { describe, it, expect, vi, afterEach } from "vitest";
import { criarPagamento, paymentClient } from "../utils/mercadopago";

/**
 * Regressão encontrada na revisão de 23/09: no SDK 3.4, create({ requestOptions })
 * grava as opções na configuração COMPARTILHADA. A chave de idempotência do
 * cartão de uma pessoa passava a ir no PIX seguinte de outra — o Mercado Pago
 * devolvia o pagamento anterior e o PIX quebrava (ou saía com o QR de outra
 * conta). Este teste chama o SDK de verdade, só com o fetch simulado.
 */

const chavesEnviadas: string[] = [];

function simularMercadoPago() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { headers?: Record<string, string> }) => {
      const cabecalhos = init.headers ?? {};
      const chave = Object.entries(cabecalhos).find(([k]) => k.toLowerCase() === "x-idempotency-key")?.[1];
      chavesEnviadas.push(String(chave));
      return new Response(JSON.stringify({ id: chavesEnviadas.length, status: "pending" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  chavesEnviadas.length = 0;
});

const corpo = { transaction_amount: 34.9, payment_method_id: "pix", payer: { email: "a@b.com" } };

describe("criarPagamento", () => {
  it("a chave de um pagamento nunca vaza para o seguinte", async () => {
    simularMercadoPago();

    await criarPagamento(corpo, "CHAVE-DO-CARTAO-A");
    await criarPagamento(corpo); // PIX de outra pessoa, sem chave estável
    await criarPagamento(corpo); // e mais um

    expect(chavesEnviadas[0]).toBe("CHAVE-DO-CARTAO-A");
    expect(chavesEnviadas[1]).not.toBe("CHAVE-DO-CARTAO-A");
    expect(chavesEnviadas[2]).not.toBe("CHAVE-DO-CARTAO-A");
    expect(chavesEnviadas[1]).not.toBe(chavesEnviadas[2]);
  });

  it("a configuração compartilhada (usada para ler pagamentos) continua sem chave gravada", async () => {
    simularMercadoPago();
    await criarPagamento(corpo, "CHAVE-X");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opcoes = (paymentClient as any).config?.options ?? {};
    expect(opcoes.idempotencyKey).toBeUndefined();
  });
});
