import { describe, it, expect } from "vitest";
import { frasesDoCarregamento, FRASE_CHAVE, FRASE_PADRAO } from "../utils/carregando-frases";

/**
 * O carregamento fala com o psicólogo enquanto ele espera. Tudo o que ele diz
 * precisa ser verdade — a mesma regra da seção 5.1 do SPEC para qualquer texto
 * sobre segurança.
 */

describe("frases do carregamento", () => {
  it("começa pelo que está carregando, quando a tela informa", () => {
    expect(frasesDoCarregamento("Carregando prontuário…", true)[0]).toBe("Carregando prontuário…");
  });

  it("sem informação da tela, começa pela frase padrão", () => {
    expect(frasesDoCarregamento()[0]).toBe(FRASE_PADRAO);
  });

  it("só fala da chave onde a tela abre dado clínico cifrado", () => {
    expect(frasesDoCarregamento("Carregando prontuário…", true)).toContain(FRASE_CHAVE);
    expect(frasesDoCarregamento("Carregando gateway seguro…")).not.toContain(FRASE_CHAVE);
    expect(frasesDoCarregamento()).not.toContain(FRASE_CHAVE);
  });

  it("não promete progresso: as frases giram sem saber quanto falta", () => {
    for (const frase of [...frasesDoCarregamento(undefined, true), ...frasesDoCarregamento()]) {
      expect(frase).not.toMatch(/quase pronto|terminando|falta pouco/i);
    }
  });
});
