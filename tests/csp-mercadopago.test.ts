import { describe, it, expect } from "vitest";
import nextConfig from "../next.config";

/**
 * O formulário de cartão do Mercado Pago baixa scripts, abre iframes e chama
 * APIs fora de sdk.mercadopago.com. Quando o CSP só liberava o sdk.*, o
 * formulário ficava girando para sempre sem erro na tela (17/09 a 23/09/2026).
 *
 * Os hosts abaixo foram os bloqueados de fato no navegador, mais os que o
 * código do SDK e do Brick chamam (secure-fields, api-static).
 */

async function lerCsp(): Promise<Map<string, string[]>> {
  const regras = await nextConfig.headers!();
  const header = regras
    .flatMap((r) => r.headers)
    .find((h) => h.key === "Content-Security-Policy");
  if (!header) throw new Error("CSP não encontrado em next.config.ts");

  const diretivas = new Map<string, string[]>();
  for (const parte of header.value.split(";")) {
    const [nome, ...valores] = parte.trim().split(/\s+/);
    if (nome) diretivas.set(nome, valores);
  }
  return diretivas;
}

/** Mesma regra do navegador para curinga de host: *.x.com cobre a.x.com, não x.com. */
function permite(fontes: string[], url: string): boolean {
  const { protocol, host } = new URL(url);
  return fontes.some((fonte) => {
    if (fonte === "'self'") return false;
    const m = /^(https?:|wss:)\/\/(.+)$/.exec(fonte);
    if (!m || m[1] !== protocol) return false;
    const padrao = m[2];
    if (padrao.startsWith("*.")) return host.endsWith(padrao.slice(1));
    return host === padrao;
  });
}

describe("CSP do formulário de cartão (Mercado Pago)", () => {
  const esperado: Array<[string, string]> = [
    ["script-src", "https://sdk.mercadopago.com/js/v2"],
    ["script-src", "https://http2.mlstatic.com/frontend-assets/op-cho-bricks/build/3.17.1/components/payment.js"],
    ["connect-src", "https://http2.mlstatic.com/frontend-assets/op-cho-bricks/build/3.17.1/i18n/pt/payment/index.json"],
    ["connect-src", "https://api.mercadopago.com/v1/payment_methods"],
    ["connect-src", "https://api-static.mercadopago.com/"],
    ["connect-src", "https://api.mercadolibre.com/tracks"],
    ["connect-src", "https://www.mercadolibre.com/jms/lgz/background/etid"],
    ["frame-src", "https://secure-fields.mercadopago.com/"],
    ["frame-src", "https://sdk.mercadopago.com/"],
    ["img-src", "https://www.mercadolibre.com/"],
    ["img-src", "https://www.mercadolivre.com/"],
    ["img-src", "https://http2.mlstatic.com/logo.svg"],
    ["style-src", "https://http2.mlstatic.com/estilo.css"],
    ["font-src", "https://http2.mlstatic.com/fonte.woff2"],
  ];

  for (const [diretiva, url] of esperado) {
    it(`${diretiva} libera ${new URL(url).host}`, async () => {
      const csp = await lerCsp();
      expect(permite(csp.get(diretiva) ?? [], url)).toBe(true);
    });
  }

  it("não abre script de origem qualquer nem 'unsafe-eval'", async () => {
    const csp = await lerCsp();
    const script = csp.get("script-src") ?? [];
    expect(script).not.toContain("'unsafe-eval'");
    expect(script).not.toContain("*");
    expect(script).not.toContain("https:");
    expect(permite(script, "https://evil.example.com/x.js")).toBe(false);
  });
});
