import { describe, it, expect } from "vitest";
import { cronAutorizado } from "../utils/cron-auth";

/**
 * A rota do cron é pública no middleware (não há sessão num cron): o
 * CRON_SECRET é a única porta. Sem ele configurado, fecha para todo mundo.
 */

describe("cronAutorizado", () => {
  it("sem segredo configurado: ninguém entra", () => {
    expect(cronAutorizado("Bearer undefined", undefined)).toBe(false);
    expect(cronAutorizado("Bearer ", "")).toBe(false);
    expect(cronAutorizado(null, undefined)).toBe(false);
  });

  it("Bearer com o segredo certo entra", () => {
    expect(cronAutorizado("Bearer s3gredo-do-cron", "s3gredo-do-cron")).toBe(true);
  });

  it("segredo errado, do mesmo tamanho ou não, fica de fora", () => {
    expect(cronAutorizado("Bearer s3gredo-do-crom", "s3gredo-do-cron")).toBe(false);
    expect(cronAutorizado("Bearer s3gredo", "s3gredo-do-cron")).toBe(false);
    expect(cronAutorizado("Bearer s3gredo-do-cron-e-mais", "s3gredo-do-cron")).toBe(false);
  });

  it("sem cabeçalho, sem o prefixo ou com outra grafia: fica de fora", () => {
    expect(cronAutorizado(null, "s3gredo-do-cron")).toBe(false);
    expect(cronAutorizado("", "s3gredo-do-cron")).toBe(false);
    expect(cronAutorizado("s3gredo-do-cron", "s3gredo-do-cron")).toBe(false);
    expect(cronAutorizado("bearer s3gredo-do-cron", "s3gredo-do-cron")).toBe(false);
  });
});
