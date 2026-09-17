import { describe, it, expect } from "vitest";
import { ativarAssinatura } from "../utils/subscription-activation";

/**
 * Testes da ativação de assinatura — A06 e A08 da auditoria de 17/09/2026.
 *
 * O furo original: pix/check e o webhook podiam ser chamados de novo com o
 * mesmo payment_id, somando +30 dias a cada repetição. E o caminho "approved"
 * do webhook gravava status ativo SEM current_period_end, então a assinatura
 * nunca expirava.
 */

function fakeClient() {
  const eventos: Array<{ payment_id: string }> = [];
  const perfis: Record<string, Record<string, unknown>> = {
    u1: { id: "u1", current_period_end: null },
  };

  return {
    eventos,
    perfis,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from(tabela: string): any {
      if (tabela === "payment_events") {
        return {
          insert: async (linha: { payment_id: string }) => {
            if (eventos.some((e) => e.payment_id === linha.payment_id)) {
              return { error: { code: "23505", message: "unique violation" } };
            }
            eventos.push(linha);
            return { error: null };
          },
        };
      }

      if (tabela === "profiles") {
        const filtros: Record<string, unknown> = {};
        const api = {
          select: () => api,
          eq: (coluna: string, valor: unknown) => {
            filtros[coluna] = valor;
            return api;
          },
          single: async () => ({ data: perfis[String(filtros.id)] ?? null, error: null }),
          update: (patch: Record<string, unknown>) => ({
            eq: async (_coluna: string, valor: string) => {
              perfis[valor] = { ...perfis[valor], ...patch };
              return { error: null };
            },
          }),
        };
        return api;
      }

      throw new Error(`tabela inesperada: ${tabela}`);
    },
  };
}

describe("ativarAssinatura", () => {
  it("ativa e SEMPRE grava current_period_end", async () => {
    const client = fakeClient();

    const r = await ativarAssinatura({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adminClient: client as any,
      userId: "u1",
      paymentId: "pay_1",
      origem: "webhook",
    });

    expect(r.aplicado).toBe(true);
    expect(client.perfis.u1.subscription_status).toBe("active");
    // Era exatamente isto que faltava no caminho approved do webhook antigo.
    expect(client.perfis.u1.current_period_end).toBeTruthy();
  });

  it("é idempotente: replay do mesmo payment_id não estende de novo", async () => {
    const client = fakeClient();

    const primeira = await ativarAssinatura({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adminClient: client as any,
      userId: "u1",
      paymentId: "pay_1",
      origem: "pix-check",
    });
    const fimApos1 = client.perfis.u1.current_period_end;

    const segunda = await ativarAssinatura({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adminClient: client as any,
      userId: "u1",
      paymentId: "pay_1",
      origem: "pix-check",
    });

    expect(primeira.aplicado).toBe(true);
    expect(segunda.aplicado).toBe(false);
    expect(segunda.jaProcessado).toBe(true);
    expect(client.perfis.u1.current_period_end).toBe(fimApos1);
    expect(client.eventos).toHaveLength(1);
  });

  it("pagamento novo estende a partir do período vigente, sem encurtar quem pagou adiantado", async () => {
    const client = fakeClient();
    const daquiA20Dias = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    client.perfis.u1.current_period_end = daquiA20Dias.toISOString();

    await ativarAssinatura({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adminClient: client as any,
      userId: "u1",
      paymentId: "pay_2",
      origem: "process-payment",
    });

    const novoFim = new Date(String(client.perfis.u1.current_period_end));
    const diasAFrente = (novoFim.getTime() - Date.now()) / (24 * 60 * 60 * 1000);

    // 20 dias que ele já tinha + 30 comprados.
    expect(diasAFrente).toBeGreaterThan(49);
    expect(diasAFrente).toBeLessThan(51);
  });
});
