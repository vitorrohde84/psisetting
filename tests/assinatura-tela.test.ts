import { describe, it, expect } from "vitest";
import {
  acessoAvancou,
  avisoCobrancaRecusada,
  avisoDeVencimento,
  consequenciaDoCancelamento,
  dataCurta,
  descreverCartao,
  diasDeCalendario,
  ehErroDeCupom,
  fimDoAcesso,
  lerPreco,
  lerRenovacao,
  lerStatusAssinatura,
  mensagemRecusaCartao,
  prazoDeVencimento,
  renovacaoViva,
  resumirValor,
  resumoLiberacao,
  sufixoDoValor,
  type PrecoTela,
  type StatusAssinatura,
} from "../utils/assinatura-tela";
import type { RenovacaoTela } from "../utils/assinatura-cartao";

/**
 * O que as telas de assinatura dizem sobre dinheiro e prazo. O que isto trava:
 *  - o botão nunca promete "/mês" para um desconto que vale uma mensalidade só;
 *  - "vence amanhã" conta viradas de dia, não blocos de 24 h;
 *  - o cache antigo do status (sem `situacao`) não bloqueia ninguém;
 *  - só erro de CUPOM apaga o cupom digitado;
 *  - a tela de sucesso diz os dias que o banco concedeu, não "30" de cor;
 *  - a espera por um pagamento só acaba quando ele virou acesso de fato;
 *  - quem está no automático não é convidado a "renovar", e o cartão recusado
 *    avisa até quando o acesso vai;
 *  - cancelar a renovação na tolerância não promete a data da tolerância.
 */

// Datas montadas no fuso local da máquina: o teste vale em qualquer fuso.
const local = (ano: number, mes: number, dia: number, hora = 12, min = 0) =>
  new Date(ano, mes - 1, dia, hora, min);

function renovacao(r: Partial<RenovacaoTela> = {}): RenovacaoTela {
  return {
    situacao: "ativa",
    valor: 27.92,
    proximaCobranca: "2026-10-23T12:00:00.000Z",
    primeiraCobranca: null,
    cartaoFinal: "1234",
    cartaoBandeira: "visa",
    cobrancaRecusada: false,
    canceladaEm: null,
    canceladaPor: null,
    ...r,
  };
}

function preco(desconto: Partial<NonNullable<PrecoTela["desconto"]>> | null, valor = 27.92): PrecoTela {
  return {
    base: 34.9,
    valor: desconto ? valor : 34.9,
    desconto: desconto
      ? {
          codigo: "PROMO20",
          origem: "cupom_novo",
          tipo: "percent",
          valor: 20,
          paraSempre: false,
          restantes: 3,
          descricao: "20% OFF",
          frase: "R$ 27,92/mês nos 3 primeiros meses, depois R$ 34,90/mês",
          ...desconto,
        }
      : null,
  };
}

describe("valor do botão principal", () => {
  it("sem desconto: preço cheio por mês", () => {
    expect(resumirValor(preco(null))).toBe("R$ 34,90/mês");
    expect(sufixoDoValor(preco(null))).toBe("/mês");
  });

  it("desconto para sempre: por mês, sem prazo", () => {
    const p = preco({ paraSempre: true, restantes: null });
    expect(resumirValor(p)).toBe("R$ 27,92/mês");
    expect(sufixoDoValor(p)).toBe("/mês");
  });

  it("uma mensalidade só: nunca '/mês'", () => {
    const novo = preco({ restantes: 1 });
    expect(resumirValor(novo)).toBe("R$ 27,92 na 1ª mensalidade");
    expect(sufixoDoValor(novo)).toBe("");

    const emUso = preco({ restantes: 1, origem: "cupom_em_uso" });
    expect(resumirValor(emUso)).toBe("R$ 27,92 nesta mensalidade");
  });

  it("várias mensalidades: diz quantas", () => {
    expect(resumirValor(preco({ restantes: 3 }))).toBe("R$ 27,92/mês por 3 meses");
    expect(resumirValor(preco({ restantes: 2, origem: "cupom_em_uso" }))).toBe(
      "R$ 27,92/mês por mais 2 meses"
    );
  });
});

describe("lerPreco", () => {
  it("aceita o formato de precoParaTela", () => {
    const p = preco({});
    expect(lerPreco(p)).toBe(p);
    expect(lerPreco(preco(null))).not.toBeNull();
  });

  it("recusa resposta sem valor numérico (não inventa preço)", () => {
    expect(lerPreco(null)).toBeNull();
    expect(lerPreco({ error: "x" })).toBeNull();
    expect(lerPreco({ base: 34.9, valor: "27,92", desconto: null })).toBeNull();
    expect(lerPreco({ base: 34.9, valor: 27.92, desconto: { codigo: 1 } })).toBeNull();
  });
});

describe("erro de cupom no pagamento", () => {
  it("400 que fala de cupom, com cupom enviado", () => {
    expect(ehErroDeCupom(400, "Cupom inválido ou expirado.", true)).toBe(true);
    expect(ehErroDeCupom(400, "Você já utilizou este cupom.", true)).toBe(true);
  });

  it("formulário do cartão incompleto não apaga o cupom", () => {
    expect(ehErroDeCupom(400, "Meio de pagamento não informado.", true)).toBe(false);
    expect(ehErroDeCupom(400, "Dados do formulário de pagamento não fornecidos.", true)).toBe(false);
  });

  it("sem cupom enviado, ou outro status, não é erro de cupom", () => {
    expect(ehErroDeCupom(400, "Cupom inválido ou expirado.", false)).toBe(false);
    expect(ehErroDeCupom(429, "Muitas tentativas de cupom.", true)).toBe(false);
  });
});

describe("recusa do cartão", () => {
  it("explica o motivo conhecido", () => {
    expect(mensagemRecusaCartao("cc_rejected_call_for_authorize")).toMatch(/autorize/);
    expect(mensagemRecusaCartao("cc_rejected_insufficient_amount")).toMatch(/limite/);
  });

  it("motivo desconhecido cai numa mensagem genérica útil", () => {
    expect(mensagemRecusaCartao("cc_rejected_other_reason")).toBe(
      "Pagamento não aprovado. Confira os dados ou tente outro cartão ou o PIX."
    );
    expect(mensagemRecusaCartao(undefined)).toMatch(/^Pagamento não aprovado\./);
  });
});

describe("prazo de vencimento", () => {
  it("conta viradas de dia, não blocos de 24 h", () => {
    const agora = local(2026, 9, 23, 9);
    expect(diasDeCalendario(local(2026, 9, 23, 23), agora)).toBe(0);
    expect(diasDeCalendario(local(2026, 9, 24, 1), local(2026, 9, 23, 23))).toBe(1);
    expect(diasDeCalendario(local(2026, 9, 26, 8), agora)).toBe(3);
    // Já passou: nunca negativo.
    expect(diasDeCalendario(local(2026, 9, 20), agora)).toBe(0);
  });

  it("frases", () => {
    expect(prazoDeVencimento(0)).toBe("vence hoje");
    expect(prazoDeVencimento(1)).toBe("vence amanhã");
    expect(prazoDeVencimento(4)).toBe("vence em 4 dias");
  });

  it("data curta dd/mm", () => {
    expect(dataCurta(local(2026, 9, 26, 15).toISOString())).toBe("26/09");
    expect(dataCurta(null)).toBeNull();
    expect(dataCurta("não é data")).toBeNull();
  });
});

describe("aviso de vencimento", () => {
  const agora = local(2026, 9, 23, 10);
  const fim = local(2026, 9, 26, 18).toISOString();
  const base = { hasActiveSubscription: true, isVip: false, diasParaVencer: 4, currentPeriodEnd: fim, agora };

  it("aparece para quem paga e está a até 5 dias do fim", () => {
    expect(avisoDeVencimento(base)).toEqual({ dias: 3, data: "26/09" });
  });

  it("acaba hoje à noite: 'hoje', mesmo o servidor contando 1 dia", () => {
    const hojeANoite = local(2026, 9, 23, 23).toISOString();
    expect(avisoDeVencimento({ ...base, diasParaVencer: 1, currentPeriodEnd: hojeANoite })?.dias).toBe(0);
  });

  it("não aparece longe do fim, para VIP, teste ou vencido", () => {
    expect(avisoDeVencimento({ ...base, diasParaVencer: 6 })).toBeNull();
    expect(avisoDeVencimento({ ...base, isVip: true })).toBeNull();
    expect(avisoDeVencimento({ ...base, hasActiveSubscription: false })).toBeNull();
    expect(avisoDeVencimento({ ...base, diasParaVencer: null })).toBeNull();
  });

  it("sem a data, usa a conta do servidor", () => {
    expect(avisoDeVencimento({ ...base, currentPeriodEnd: null })).toEqual({ dias: 4, data: null });
  });

  it("renovação automática ligada ou em confirmação: o cartão é cobrado sozinho, sem aviso", () => {
    expect(avisoDeVencimento({ ...base, renovacao: renovacao() })).toBeNull();
    expect(avisoDeVencimento({ ...base, renovacao: renovacao({ situacao: "criando", proximaCobranca: null }) })).toBeNull();
    // Cartão recusado tem a própria faixa, que não fala em "renove".
    expect(avisoDeVencimento({ ...base, renovacao: renovacao({ cobrancaRecusada: true }) })).toBeNull();
  });

  it("renovação cancelada: a pessoa voltou ao mês a mês e o aviso volta", () => {
    const cancelada = renovacao({ situacao: "cancelada", proximaCobranca: null, canceladaEm: "2026-09-20T12:00:00.000Z" });
    expect(avisoDeVencimento({ ...base, renovacao: cancelada })).toEqual({ dias: 3, data: "26/09" });
    expect(avisoDeVencimento({ ...base, renovacao: null })).toEqual({ dias: 3, data: "26/09" });
  });
});

describe("renovação automática viva", () => {
  it("ativa e em confirmação contam; cancelada e nenhuma, não", () => {
    expect(renovacaoViva(renovacao())).toBe(true);
    expect(renovacaoViva(renovacao({ situacao: "criando" }))).toBe(true);
    expect(renovacaoViva(renovacao({ situacao: "cancelada" }))).toBe(false);
    expect(renovacaoViva(null)).toBe(false);
    expect(renovacaoViva(undefined)).toBe(false);
  });
});

describe("cartão recusado no automático", () => {
  const fim = local(2026, 10, 3, 18).toISOString();
  const base = { hasActiveSubscription: true, isVip: false, currentPeriodEnd: fim };
  const recusada = renovacao({ cobrancaRecusada: true });

  it("aparece com a data até quando o acesso continua", () => {
    expect(avisoCobrancaRecusada({ ...base, renovacao: recusada })).toEqual({ acessoAte: "03/10" });
  });

  it("sem a data do servidor, não inventa uma", () => {
    expect(avisoCobrancaRecusada({ ...base, currentPeriodEnd: null, renovacao: recusada })).toEqual({ acessoAte: null });
  });

  it("não aparece sem recusa, fora do automático, sem acesso ou para VIP", () => {
    expect(avisoCobrancaRecusada({ ...base, renovacao: renovacao() })).toBeNull();
    expect(avisoCobrancaRecusada({ ...base, renovacao: null })).toBeNull();
    expect(avisoCobrancaRecusada({ ...base, renovacao: renovacao({ situacao: "cancelada", cobrancaRecusada: true }) })).toBeNull();
    // Já em somente leitura: vale a faixa de somente leitura.
    expect(avisoCobrancaRecusada({ ...base, hasActiveSubscription: false, renovacao: recusada })).toBeNull();
    expect(avisoCobrancaRecusada({ ...base, isVip: true, renovacao: recusada })).toBeNull();
  });
});

describe("cancelar a renovação automática", () => {
  it("fim do acesso: período pago no ativo, fim do teste no teste, nada no vencido", () => {
    const datas = {
      currentPeriodEnd: local(2026, 10, 20).toISOString(),
      trialEndsAt: local(2026, 9, 30).toISOString(),
    };
    expect(fimDoAcesso({ situacao: "ativo", ...datas })).toBe("20/10");
    expect(fimDoAcesso({ situacao: "teste", ...datas })).toBe("30/09");
    expect(fimDoAcesso({ situacao: "vencido", ...datas })).toBeNull();
    expect(fimDoAcesso({ situacao: "vip", ...datas })).toBeNull();
    expect(fimDoAcesso({ situacao: "ativo", currentPeriodEnd: null, trialEndsAt: null })).toBeNull();
  });

  it("com dias pagos pela frente: o acesso continua até o fim deles", () => {
    expect(consequenciaDoCancelamento({ emCarencia: false, acessoAte: "20/10" })).toBe(
      "Seu cartão não será mais cobrado. Seu acesso continua até 20/10. Depois disso, você renova por PIX ou cartão, mês a mês. Para voltar à renovação automática, é só assinar de novo."
    );
  });

  it("na tolerância do cartão recusado: não promete a data da tolerância", () => {
    const frase = consequenciaDoCancelamento({ emCarencia: true, acessoAte: "03/10" });
    expect(frase).not.toMatch(/03\/10/);
    expect(frase).toMatch(/deixa de poder criar registros assim que cancelar/);
    expect(frase).toMatch(/é só assinar de novo\.$/);
  });

  it("sem data a prometer, não fala em 'continua até'", () => {
    expect(consequenciaDoCancelamento({ emCarencia: false, acessoAte: null })).not.toMatch(/continua até/);
  });
});

describe("cartão na tela", () => {
  it("bandeira conhecida e final", () => {
    expect(descreverCartao("visa", "1234")).toBe("Visa final 1234");
    expect(descreverCartao("master", "5678")).toBe("Mastercard final 5678");
    expect(descreverCartao(" AMEX ", "0005")).toBe("American Express final 0005");
    expect(descreverCartao("hipercard", "9876")).toBe("Hipercard final 9876");
    expect(descreverCartao("elo", null)).toBe("Elo");
  });

  it("bandeira desconhecida ou ausente vira 'Cartão'", () => {
    expect(descreverCartao("naranja", "1234")).toBe("Cartão final 1234");
    expect(descreverCartao(null, null)).toBe("Cartão");
    // Nome de propriedade de objeto não vira bandeira.
    expect(descreverCartao("constructor", "1234")).toBe("Cartão final 1234");
  });

  it("final que não são 4 dígitos não aparece", () => {
    expect(descreverCartao("visa", "12")).toBe("Visa");
    expect(descreverCartao("visa", "**** 1234")).toBe("Visa");
  });
});

describe("lerStatusAssinatura", () => {
  it("formato novo passa inteiro", () => {
    const s = lerStatusAssinatura({
      isVip: false,
      status: "active",
      situacao: "ativo",
      isTrialing: false,
      trialDaysLeft: 0,
      trialEndsAt: null,
      currentPeriodEnd: "2026-10-20T12:00:00.000Z",
      diasParaVencer: 27,
      isReadOnly: false,
      hasActiveSubscription: true,
    });
    expect(s.situacao).toBe("ativo");
    expect(s.diasParaVencer).toBe(27);
    expect(s.currentPeriodEnd).toBe("2026-10-20T12:00:00.000Z");
  });

  it("cache antigo, sem situacao: deduz dos outros campos", () => {
    expect(lerStatusAssinatura({ hasActiveSubscription: true }).situacao).toBe("ativo");
    expect(lerStatusAssinatura({ isVip: true, hasActiveSubscription: true }).situacao).toBe("vip");
    expect(lerStatusAssinatura({ isReadOnly: true }).situacao).toBe("vencido");
    expect(lerStatusAssinatura({ isTrialing: true, trialDaysLeft: 3 }).situacao).toBe("teste");
  });

  it("resposta vazia ou estranha não bloqueia ninguém", () => {
    const s = lerStatusAssinatura(null);
    expect(s.isReadOnly).toBe(false);
    expect(s.situacao).toBe("teste");
    expect(s.diasParaVencer).toBeNull();
    expect(s.currentPeriodEnd).toBeNull();
    expect(lerStatusAssinatura({ situacao: "inventada", diasParaVencer: "3" }).diasParaVencer).toBeNull();
  });

  it("renovação automática e tolerância passam inteiras", () => {
    const r = renovacao({ cobrancaRecusada: true });
    const s = lerStatusAssinatura({ situacao: "ativo", hasActiveSubscription: true, emCarencia: true, renovacao: r });
    expect(s.emCarencia).toBe(true);
    expect(s.renovacao).toEqual(r);
  });

  it("cache de antes da renovação automática: ninguém no automático nem na tolerância", () => {
    const s = lerStatusAssinatura({ situacao: "ativo", hasActiveSubscription: true });
    expect(s.renovacao).toBeNull();
    expect(s.emCarencia).toBe(false);
  });

  it("renovação estranha vira null, e campo estranho vira o valor seguro", () => {
    expect(lerRenovacao(null)).toBeNull();
    expect(lerRenovacao("ativa")).toBeNull();
    expect(lerRenovacao({ situacao: "falhou" })).toBeNull();
    expect(lerStatusAssinatura({ emCarencia: "sim" }).emCarencia).toBe(false);
    expect(lerRenovacao({ situacao: "ativa", valor: "27,92", cobrancaRecusada: "sim", cartaoFinal: 1234 })).toEqual({
      situacao: "ativa",
      valor: null,
      proximaCobranca: null,
      primeiraCobranca: null,
      cartaoFinal: null,
      cartaoBandeira: null,
      cobrancaRecusada: false,
      canceladaEm: null,
      canceladaPor: null,
    });
  });
});

describe("dias liberados na tela de sucesso", () => {
  it("período cheio: diz os 30 dias", () => {
    expect(resumoLiberacao(30, null)).toEqual({ texto: "Seus 30 dias de acesso já estão liberados.", parcial: false });
    // O arredondamento do banco pode dar 30 mesmo com o desconto recusado: nada a explicar.
    expect(resumoLiberacao(30, "cupom atingiu o limite de usos").parcial).toBe(false);
  });

  it("sem o número, não inventa um", () => {
    for (const dias of [undefined, null, 0, -3, 12.5, "30", NaN]) {
      expect(resumoLiberacao(dias, null)).toEqual({ texto: "Seu acesso foi liberado.", parcial: false });
    }
  });

  it("dias proporcionais: número real e o porquê", () => {
    expect(resumoLiberacao(15, "cupom atingiu o limite de usos")).toEqual({
      texto:
        "Foram liberados 15 dias de acesso: o cupom atingiu o limite de usos antes da confirmação do pagamento, então o valor pago virou dias pelo preço cheio.",
      parcial: true,
    });
    expect(resumoLiberacao(24, "mensalidades com desconto esgotadas").texto).toMatch(
      /^Foram liberados 24 dias de acesso: as mensalidades com desconto do seu cupom já tinham sido usadas,/
    );
    expect(resumoLiberacao(24, "cupom pausado antes da aprovacao").texto).toMatch(/cupom foi pausado/);
    expect(resumoLiberacao(24, "desconto encerrado pelo admin").texto).toMatch(/desconto do seu cupom foi encerrado/);
    expect(resumoLiberacao(24, "cupom nao encontrado").texto).toMatch(/cupom deixou de existir/);
    expect(resumoLiberacao(24, "resgate nao e de desconto").texto).toMatch(/não é de desconto na mensalidade/);
  });

  it("singular e motivo desconhecido", () => {
    const um = resumoLiberacao(1, "motivo novo do banco");
    expect(um.texto).toMatch(/^Foram liberados 1 dia de acesso: o desconto do cupom não pôde ser aplicado/);
    expect(um.parcial).toBe(true);
    // Nome de propriedade de objeto não vira motivo.
    expect(resumoLiberacao(10, "constructor").texto).toMatch(/não pôde ser aplicado/);
    expect(resumoLiberacao(10, null).texto).toMatch(/não pôde ser aplicado/);
  });
});

describe("espera de pagamento: o acesso avançou?", () => {
  const status = (s: Partial<StatusAssinatura>): StatusAssinatura => ({ ...lerStatusAssinatura(null), ...s });
  const teste = status({ situacao: "teste", isTrialing: true, trialDaysLeft: 3 });
  const vencido = status({ situacao: "vencido", isReadOnly: true });
  const vip = status({ situacao: "vip", isVip: true, hasActiveSubscription: true });
  const ativoAte = (fim: string | null) =>
    status({ situacao: "ativo", hasActiveSubscription: true, currentPeriodEnd: fim });

  it("teste ou somente leitura que passa a ter acesso", () => {
    expect(acessoAvancou(teste, ativoAte("2026-10-23T12:00:00.000Z"))).toBe(true);
    expect(acessoAvancou(vencido, ativoAte("2026-10-23T12:00:00.000Z"))).toBe(true);
    expect(acessoAvancou(vencido, vip)).toBe(true);
  });

  it("renovação: só quando o fim do acesso anda para a frente", () => {
    const antes = ativoAte("2026-10-01T12:00:00.000Z");
    expect(acessoAvancou(antes, ativoAte("2026-10-31T12:00:00.000Z"))).toBe(true);
    expect(acessoAvancou(antes, ativoAte("2026-10-01T12:00:00.000Z"))).toBe(false);
    // Sem a data de antes, continua esperando.
    expect(acessoAvancou(ativoAte(null), ativoAte("2026-10-31T12:00:00.000Z"))).toBe(false);
  });

  it("acesso pela tolerância do cartão não é pagamento aprovado", () => {
    // Revisão de 23/09: "vencido → ativo em tolerância" fazia a tela dizer
    // "primeira cobrança aprovada" sem cobrança nenhuma.
    const emTolerancia = status({
      situacao: "ativo",
      hasActiveSubscription: true,
      currentPeriodEnd: "2026-10-03T12:00:00.000Z",
      emCarencia: true,
    });
    expect(acessoAvancou(vencido, emTolerancia)).toBe(false);
    expect(acessoAvancou(ativoAte("2026-09-20T12:00:00.000Z"), emTolerancia)).toBe(false);
    // Saindo da tolerância com a cobrança aprovada: aí sim.
    expect(acessoAvancou(emTolerancia, ativoAte("2026-11-02T12:00:00.000Z"))).toBe(true);
  });

  it("nada mudou: continua esperando", () => {
    expect(acessoAvancou(teste, teste)).toBe(false);
    expect(acessoAvancou(vencido, vencido)).toBe(false);
    // VIP que continua VIP não é pagamento novo.
    expect(acessoAvancou(vip, vip)).toBe(false);
  });
});
