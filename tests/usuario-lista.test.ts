import { describe, it, expect } from "vitest";
import type { RenovacaoTela } from "../utils/assinatura-cartao";
import {
  descreverCartao,
  dicaRenovacao,
  dicaTolerancia,
  etiquetaRenovacao,
  meioPorExtenso,
  mostrarEtiquetaDoMeio,
  nomeDaBandeira,
  proximaCobrancaDaRenovacao,
  quemCancelou,
  renovacaoViva,
  rotuloDoMeio,
  situacaoDaRenovacao,
} from "../app/admin/usuario-lista";

function renovacao(parcial: Partial<RenovacaoTela>): RenovacaoTela {
  return {
    situacao: "ativa",
    valor: 27.92,
    proximaCobranca: "2026-10-23T15:00:00Z",
    primeiraCobranca: null,
    cartaoFinal: "1234",
    cartaoBandeira: "visa",
    cobrancaRecusada: false,
    canceladaEm: null,
    canceladaPor: null,
    ...parcial,
  };
}

const AGORA = new Date("2026-09-23T12:00:00Z");

describe("renovacaoViva", () => {
  it("ativa e criando podem cobrar; cancelada e nenhuma, não", () => {
    expect(renovacaoViva(renovacao({ situacao: "ativa" }))).toBe(true);
    expect(renovacaoViva(renovacao({ situacao: "criando" }))).toBe(true);
    expect(renovacaoViva(renovacao({ situacao: "cancelada" }))).toBe(false);
    expect(renovacaoViva(null)).toBe(false);
  });
});

describe("cartão", () => {
  it("traduz a bandeira do Mercado Pago", () => {
    expect(nomeDaBandeira("master")).toBe("Mastercard");
    expect(nomeDaBandeira("debelo")).toBe("Elo débito");
    expect(nomeDaBandeira("naranja")).toBe("Naranja");
    expect(nomeDaBandeira(null)).toBeNull();
  });

  it("junta bandeira e final, ou mostra só o que se sabe", () => {
    expect(descreverCartao(renovacao({}))).toBe("Visa final 1234");
    expect(descreverCartao(renovacao({ cartaoBandeira: null }))).toBe("Cartão final 1234");
    expect(descreverCartao(renovacao({ cartaoFinal: null }))).toBe("Visa");
    expect(descreverCartao(renovacao({ cartaoFinal: null, cartaoBandeira: null }))).toBeNull();
  });
});

describe("quem cancelou", () => {
  it("diz quem cancelou; valor desconhecido não aparece", () => {
    expect(quemCancelou("usuario")).toBe("pela pessoa");
    expect(quemCancelou("admin")).toBe("pelo admin");
    expect(quemCancelou("mercadopago")).toBe("pelo Mercado Pago");
    expect(quemCancelou("sistema")).toBe("pelo sistema");
    expect(quemCancelou("outro")).toBeNull();
    expect(quemCancelou(null)).toBeNull();
  });
});

describe("etiquetaRenovacao (lista)", () => {
  it("ligada em destaque, recusada em alerta, o resto discreto", () => {
    expect(etiquetaRenovacao(renovacao({}))).toEqual({ texto: "Cartão automático", tom: "destaque" });
    expect(etiquetaRenovacao(renovacao({ cobrancaRecusada: true }))).toEqual({
      texto: "Cartão automático · recusado",
      tom: "alerta",
    });
    expect(etiquetaRenovacao(renovacao({ situacao: "criando" }))?.tom).toBe("discreto");
    expect(etiquetaRenovacao(renovacao({ situacao: "cancelada" }))).toEqual({
      texto: "Automático cancelado",
      tom: "discreto",
    });
    expect(etiquetaRenovacao(null)).toBeNull();
  });
});

describe("situacaoDaRenovacao (gaveta)", () => {
  it("cancelada diz quando e por quem, no fuso de Brasília", () => {
    const s = situacaoDaRenovacao(
      renovacao({ situacao: "cancelada", canceladaEm: "2026-09-20T02:00:00Z", canceladaPor: "admin" })
    );
    // 02h UTC do dia 20 ainda é dia 19 em Brasília.
    expect(s).toEqual({ texto: "Cancelada", detalhe: "em 19/09/2026 pelo admin", tom: "discreto" });
  });

  it("cancelada sem data nem autor não inventa detalhe", () => {
    expect(situacaoDaRenovacao(renovacao({ situacao: "cancelada" })).detalhe).toBeNull();
  });

  it("recusada é alerta", () => {
    expect(situacaoDaRenovacao(renovacao({ cobrancaRecusada: true })).tom).toBe("alerta");
  });
});

describe("proximaCobrancaDaRenovacao", () => {
  it("quem ligou no teste vê a primeira cobrança agendada", () => {
    const r = renovacao({ primeiraCobranca: "2026-09-30T12:00:00Z", proximaCobranca: "2026-09-30T12:00:00Z" });
    expect(proximaCobrancaDaRenovacao(r, AGORA)).toMatchObject({
      rotulo: "Primeira cobrança",
      data: "2026-09-30T12:00:00Z",
    });
  });

  it("depois da primeira, volta a ser a próxima", () => {
    const r = renovacao({ primeiraCobranca: "2026-09-01T12:00:00Z" });
    expect(proximaCobrancaDaRenovacao(r, AGORA)).toMatchObject({
      rotulo: "Próxima cobrança",
      data: "2026-10-23T15:00:00Z",
    });
  });

  it("criando sem data: cobra logo após confirmar", () => {
    const r = renovacao({ situacao: "criando", proximaCobranca: null });
    expect(proximaCobrancaDaRenovacao(r, AGORA)).toEqual({
      rotulo: "Próxima cobrança",
      data: null,
      semData: "Logo após confirmar",
    });
  });

  it("cancelada não tem próxima cobrança", () => {
    const r = renovacao({ situacao: "cancelada", proximaCobranca: null });
    expect(proximaCobrancaDaRenovacao(r, AGORA)).toMatchObject({ data: null, semData: "Nenhuma" });
  });
});

describe("dicaRenovacao", () => {
  it("ligada: data e valor da próxima cobrança", () => {
    expect(dicaRenovacao(renovacao({}))).toBe(
      "Renovação automática ligada · próxima cobrança em 23/10/2026 · R$ 27,92"
    );
  });

  it("leva o último pagamento quando a etiqueta do meio some", () => {
    expect(dicaRenovacao(renovacao({}), "2026-09-23T15:00:00Z")).toMatch(/Último pagamento em 23\/09\/2026\.$/);
  });

  it("recusada fala da nova tentativa", () => {
    expect(dicaRenovacao(renovacao({ cobrancaRecusada: true }))).toMatch(/recusada.*até 10 dias/);
  });
});

describe("meio do último pagamento", () => {
  it("rótulos", () => {
    expect(rotuloDoMeio("pix")).toBe("PIX");
    expect(rotuloDoMeio("cartao")).toBe("Cartão");
    expect(rotuloDoMeio("cartao_automatico")).toBe("Cartão automático");
    expect(meioPorExtenso("cartao_automatico")).toBe("no cartão, pela renovação automática");
  });

  it("não repete 'cartão automático' quando a etiqueta da renovação já está na linha", () => {
    expect(mostrarEtiquetaDoMeio({ ultimoMeio: "cartao_automatico", renovacao: renovacao({}) })).toBe(false);
    expect(mostrarEtiquetaDoMeio({ ultimoMeio: "cartao_automatico", renovacao: null })).toBe(true);
    expect(mostrarEtiquetaDoMeio({ ultimoMeio: "pix", renovacao: renovacao({}) })).toBe(true);
    expect(mostrarEtiquetaDoMeio({ ultimoMeio: null, renovacao: null })).toBe(false);
  });
});

describe("dicaTolerancia", () => {
  it("só aparece em tolerância, com a data do fim do acesso", () => {
    expect(dicaTolerancia({ emCarencia: false, acessoAte: null, renovacao: null })).toBeNull();
    expect(
      dicaTolerancia({ emCarencia: true, acessoAte: "2026-10-03T12:00:00Z", renovacao: renovacao({}) })
    ).toMatch(/ainda não foi aprovada\. O acesso segue até 03\/10\/2026/);
    expect(
      dicaTolerancia({
        emCarencia: true,
        acessoAte: "2026-10-03T12:00:00Z",
        renovacao: renovacao({ cobrancaRecusada: true }),
      })
    ).toMatch(/foi recusada/);
  });
});
