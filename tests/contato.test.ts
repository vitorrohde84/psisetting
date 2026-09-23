import { describe, it, expect } from "vitest";
import { linkWhatsAppDuvidas, MENSAGEM_DUVIDAS } from "../utils/contato";

/**
 * O botão "Ficou com dúvidas?" do site leva direto a uma conversa. Um dígito
 * a mais ou a menos e a pergunta de um futuro cliente cai no WhatsApp de um
 * desconhecido — sem ninguém do PsiSetting saber que ela existiu.
 */

describe("linkWhatsAppDuvidas", () => {
  it("abre a conversa com o PsiSetting e a mensagem pronta", () => {
    expect(linkWhatsAppDuvidas()).toBe(
      "https://wa.me/5555996547714?text=Ol%C3%A1!%20Vim%20pelo%20site%20do%20PsiSetting%20e%20tenho%20uma%20d%C3%BAvida."
    );
  });

  it("país 55 + DDD 55: exatamente dois 55, nem um a mais nem um a menos", () => {
    const numero = new URL(linkWhatsAppDuvidas()).pathname.slice(1);
    expect(numero).toBe("5555996547714");
    expect(numero).toHaveLength(13);
    expect(numero).not.toMatch(/^555555/);
  });

  it("a mensagem chega inteira do outro lado", () => {
    expect(new URL(linkWhatsAppDuvidas()).searchParams.get("text")).toBe(MENSAGEM_DUVIDAS);
  });
});
