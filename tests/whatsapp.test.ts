import { describe, it, expect } from "vitest";
import { linkWhatsApp, numeroWhatsApp } from "../utils/whatsapp";

/**
 * Um link errado abre o WhatsApp numa conversa com um desconhecido — com um
 * psicólogo do outro lado achando que fala com o paciente. Número duvidoso
 * não vira link.
 */

describe("numeroWhatsApp", () => {
  it("celular como o cadastro grava (só dígitos) ganha o 55 do Brasil", () => {
    expect(numeroWhatsApp("11912345678")).toBe("5511912345678");
  });

  it("aceita o telefone formatado", () => {
    expect(numeroWhatsApp("(11) 91234-5678")).toBe("5511912345678");
  });

  it("aceita fixo com DDD", () => {
    expect(numeroWhatsApp("(11) 3456-7890")).toBe("551134567890");
  });

  it("não duplica o 55 quando o número já tem o código do país", () => {
    expect(numeroWhatsApp("+55 11 91234-5678")).toBe("5511912345678");
    expect(numeroWhatsApp("5511912345678")).toBe("5511912345678");
  });

  it("DDD 55 (Santa Maria, RS) não é confundido com o código do país", () => {
    expect(numeroWhatsApp("(55) 99123-4567")).toBe("5555991234567");
    expect(numeroWhatsApp("+55 55 99123-4567")).toBe("5555991234567");
  });

  it("ignora zero à esquerda digitado antes do DDD", () => {
    expect(numeroWhatsApp("011 91234-5678")).toBe("5511912345678");
  });

  it("recusa número incompleto, vazio ou ausente", () => {
    expect(numeroWhatsApp("91234-5678")).toBeNull();
    expect(numeroWhatsApp("")).toBeNull();
    expect(numeroWhatsApp(null)).toBeNull();
    expect(numeroWhatsApp(undefined)).toBeNull();
  });

  it("recusa celular sem o nono dígito e DDD inexistente", () => {
    expect(numeroWhatsApp("11812345678")).toBeNull();
    expect(numeroWhatsApp("(10) 91234-5678")).toBeNull();
  });
});

describe("linkWhatsApp", () => {
  it("sem mensagem, abre a conversa em branco", () => {
    expect(linkWhatsApp("11912345678")).toBe("https://wa.me/5511912345678");
  });

  it("com mensagem, codifica o texto", () => {
    expect(linkWhatsApp("11912345678", "Olá, tudo bem?")).toBe(
      "https://wa.me/5511912345678?text=Ol%C3%A1%2C%20tudo%20bem%3F"
    );
  });

  it("sem número válido, não há link", () => {
    expect(linkWhatsApp("123")).toBeNull();
  });
});
