import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "../utils/supabase/middleware";

/**
 * O mesmo deploy responde por dois sites diferentes:
 *   www.psisetting.com.br — a vitrine, que o Google deve indexar
 *   app.psisetting.com.br — o sistema, que não deve aparecer em busca
 *
 * Um erro nesta separação duplica páginas no Google ou leva a landing para
 * dentro do app. Nenhum destes caminhos chama o Supabase.
 */

function requisicao(url: string) {
  return new NextRequest(url, { headers: { host: new URL(url).host } });
}

describe("roteamento por host", () => {
  it("a raiz do www mostra a landing sem mudar o endereço", async () => {
    const resposta = await updateSession(requisicao("https://www.psisetting.com.br/"));
    expect(resposta.headers.get("x-middleware-rewrite")).toMatch(/\/landing$/);
    expect(resposta.headers.get("location")).toBeNull();
  });

  it("/landing no www redireciona de forma permanente para a raiz (sem cópia da home)", async () => {
    const resposta = await updateSession(requisicao("https://www.psisetting.com.br/landing"));
    expect(resposta.status).toBe(308);
    expect(resposta.headers.get("location")).toBe("https://www.psisetting.com.br/");
  });

  it("/landing no domínio sem www também vai para a raiz do www", async () => {
    const resposta = await updateSession(requisicao("https://psisetting.com.br/landing"));
    expect(resposta.status).toBe(308);
    expect(resposta.headers.get("location")).toBe("https://www.psisetting.com.br/");
  });

  it("login no www leva ao app", async () => {
    const resposta = await updateSession(requisicao("https://www.psisetting.com.br/login"));
    expect(resposta.headers.get("location")).toBe("https://app.psisetting.com.br/login");
  });

  it("arquivos para robôs são públicos, sem passar pelo login", async () => {
    for (const arquivo of ["/robots.txt", "/sitemap.xml", "/llms.txt"]) {
      const resposta = await updateSession(requisicao(`https://www.psisetting.com.br${arquivo}`));
      expect(resposta.headers.get("location"), arquivo).toBeNull();
      expect(resposta.status, arquivo).toBe(200);
    }
  });

  it("landing dentro do app devolve para o www", async () => {
    const resposta = await updateSession(requisicao("https://app.psisetting.com.br/landing"));
    expect(resposta.headers.get("location")).toMatch(/^https:\/\/www\.psisetting\.com\.br\/?$/);
  });
});
