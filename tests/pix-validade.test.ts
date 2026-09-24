import { describe, it, expect, vi, afterEach } from "vitest";
import {
  VALIDADE_PIX_MIN,
  expiracaoPixMercadoPago,
  fimDaValidadePix,
  formatarContagemPix,
  pixDeveSerCancelado,
  segundosRestantesPix,
} from "../utils/pix-validade";
import { cancelarOutrosPixPendentes, vencerPixForaDoPrazo } from "../utils/pix-cancelamento";

/**
 * O QR do PIX vale 15 minutos (pedido de 23/09/2026). O Mercado Pago não
 * aceita menos de 30, então os 15 são garantidos pelo cancelamento: o que se
 * testa aqui é que o cancelamento acontece na hora certa, nunca antes, e que
 * quem pagou no último instante é creditado em vez de ouvir "expirou".
 */

const criado = new Date("2026-09-23T20:00:00Z");
const minutos = (n: number) => new Date(criado.getTime() + n * 60_000);

describe("validade do QR", () => {
  it("vale 15 minutos na tela", () => {
    expect(VALIDADE_PIX_MIN).toBe(15);
    expect(fimDaValidadePix(criado).toISOString()).toBe("2026-09-23T20:15:00.000Z");
    expect(segundosRestantesPix(criado, criado)).toBe(15 * 60);
    expect(segundosRestantesPix(criado, minutos(14.5))).toBe(30);
    expect(segundosRestantesPix(criado, minutos(20))).toBe(0);
  });

  it("no Mercado Pago nasce com 32 minutos (o mínimo aceito é 30), no fuso de Brasília", () => {
    expect(expiracaoPixMercadoPago(criado)).toBe("2026-09-23T17:32:00.000-03:00");
  });

  it("só cancela depois dos 15 minutos mais 1 de folga", () => {
    expect(pixDeveSerCancelado(criado, minutos(15))).toBe(false);
    expect(pixDeveSerCancelado(criado, minutos(16))).toBe(false);
    expect(pixDeveSerCancelado(criado, minutos(16.02))).toBe(true);
  });

  it("sem data de criação confiável, não cancela", () => {
    expect(pixDeveSerCancelado(null, minutos(60))).toBe(false);
    expect(pixDeveSerCancelado("não é data", minutos(60))).toBe(false);
  });

  it("formata a contagem como m:ss", () => {
    expect(formatarContagemPix(900)).toBe("15:00");
    expect(formatarContagemPix(65)).toBe("1:05");
    expect(formatarContagemPix(0)).toBe("0:00");
    expect(formatarContagemPix(-3)).toBe("0:00");
  });
});

// ── Cancelamento, com o SDK de verdade e só o fetch simulado ─────────────────

interface Chamada {
  metodo: string;
  url: string;
  corpo?: unknown;
}
const chamadas: Chamada[] = [];

function responder(json: unknown, status = 200) {
  return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
}

function simularMercadoPago(rotas: (c: Chamada) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { method?: string; body?: string }) => {
      const c: Chamada = { metodo: init.method ?? "GET", url: String(url), corpo: init.body ? JSON.parse(init.body) : undefined };
      chamadas.push(c);
      return rotas(c);
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  chamadas.length = 0;
});

const pixPendente = {
  id: 111,
  status: "pending",
  payment_method_id: "pix",
  external_reference: "u1",
  date_created: criado.toISOString(),
};

describe("vencerPixForaDoPrazo", () => {
  it("dentro do prazo não chama o Mercado Pago", async () => {
    simularMercadoPago(() => responder({}));
    const r = await vencerPixForaDoPrazo(pixPendente, minutos(10));
    expect(r.status).toBe("pending");
    expect(chamadas).toHaveLength(0);
  });

  it("fora do prazo cancela o pagamento no Mercado Pago", async () => {
    simularMercadoPago(() => responder({ ...pixPendente, status: "cancelled" }));
    const r = await vencerPixForaDoPrazo(pixPendente, minutos(17));
    expect(r.status).toBe("cancelled");
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].metodo).toBe("PUT");
    expect(chamadas[0].url).toContain("/v1/payments/111");
    expect(chamadas[0].corpo).toEqual({ status: "cancelled" });
  });

  it("pago no último instante: o cancelamento é recusado e o pagamento volta aprovado", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    simularMercadoPago((c) =>
      c.metodo === "PUT"
        ? responder({ message: "invalid status for cancel", status: 400 }, 400)
        : responder({ ...pixPendente, status: "approved" })
    );
    const r = await vencerPixForaDoPrazo(pixPendente, minutos(17));
    expect(r.status).toBe("approved");
  });

  it("não mexe em cartão em análise nem em pagamento aprovado", async () => {
    simularMercadoPago(() => responder({}));
    await vencerPixForaDoPrazo({ ...pixPendente, payment_method_id: "visa", status: "in_process" }, minutos(60));
    await vencerPixForaDoPrazo({ ...pixPendente, status: "approved" }, minutos(60));
    expect(chamadas).toHaveLength(0);
  });
});

describe("cancelarOutrosPixPendentes", () => {
  it("cancela só os PIX pendentes da mesma pessoa, menos o novo", async () => {
    simularMercadoPago((c) => {
      if (c.metodo === "GET") {
        return responder({
          results: [
            { ...pixPendente, id: 200 }, // o novo: fica
            { ...pixPendente, id: 150 }, // anterior: cancela
            { ...pixPendente, id: 140, external_reference: "outra-pessoa" }, // nunca
            { ...pixPendente, id: 130, payment_method_id: "visa" }, // cartão: nunca
            { ...pixPendente, id: 120, status: "approved" }, // pago: nunca
          ],
        });
      }
      return responder({ status: "cancelled" });
    });

    const n = await cancelarOutrosPixPendentes({ userId: "u1", exceto: "200", agora: minutos(5) });

    const cancelados = chamadas.filter((c) => c.metodo === "PUT").map((c) => c.url.split("/").pop());
    expect(n).toBe(1);
    expect(cancelados).toEqual(["150"]);
    const busca = new URL(chamadas[0].url);
    expect(busca.searchParams.get("external_reference")).toBe("u1");
    expect(busca.searchParams.get("status")).toBe("pending");
  });
});
