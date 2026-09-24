import { describe, it, expect } from "vitest";
import {
  ANOS_DE_ASSINATURA,
  corpoDaAssinatura,
  ehCobrancaDeAssinatura,
  ehValidacaoDeCartao,
  emailDoPagador,
  idAssinaturaDoPagamento,
  inicioDaCobranca,
  mensagemErroAssinatura,
  quatroUltimos,
  renovacaoParaTela,
  statusCancelado,
} from "../utils/assinatura-cartao";

/**
 * Cartão com renovação automática — as regras puras.
 *
 * O que isto trava:
 *  - quem ainda tem dias (pagos ou de teste) só é cobrado quando eles acabam;
 *  - o corpo mandado ao Mercado Pago tem start_date E end_date juntos (sem
 *    end_date o start_date é ignorado e a cobrança sai na hora);
 *  - a cobrança da assinatura é reconhecida mesmo sem a nossa metadata, e a
 *    validação do cartão nunca vira 30 dias;
 *  - o texto cru do erro do Mercado Pago nunca chega à tela.
 */

const AGORA = new Date("2026-09-23T15:00:00.000Z");
const horas = (n: number) => new Date(AGORA.getTime() + n * 60 * 60 * 1000);
const dias = (n: number) => horas(n * 24);

describe("inicioDaCobranca", () => {
  it("vencido (ou sem datas): cobra já", () => {
    expect(inicioDaCobranca({ currentPeriodEnd: dias(-2), trialEndsAt: dias(-30), agora: AGORA })).toBeNull();
    expect(inicioDaCobranca({ currentPeriodEnd: null, trialEndsAt: null, agora: AGORA })).toBeNull();
    expect(inicioDaCobranca({ currentPeriodEnd: "lixo", trialEndsAt: undefined, agora: AGORA })).toBeNull();
  });

  it("no teste grátis: a primeira cobrança sai no fim do teste", () => {
    const inicio = inicioDaCobranca({ currentPeriodEnd: null, trialEndsAt: dias(8).toISOString(), agora: AGORA });
    expect(inicio?.toISOString()).toBe(dias(8).toISOString());
  });

  it("com dias pagos e de teste: vale o que terminar depois", () => {
    expect(
      inicioDaCobranca({ currentPeriodEnd: dias(12), trialEndsAt: dias(3), agora: AGORA })?.toISOString()
    ).toBe(dias(12).toISOString());
    expect(
      inicioDaCobranca({ currentPeriodEnd: dias(3), trialEndsAt: dias(40), agora: AGORA })?.toISOString()
    ).toBe(dias(40).toISOString());
  });

  it("período pago no futuro e teste vencido: vale o pago", () => {
    expect(
      inicioDaCobranca({ currentPeriodEnd: dias(20), trialEndsAt: dias(-5), agora: AGORA })?.toISOString()
    ).toBe(dias(20).toISOString());
  });

  it("menos de 1 hora até o fim: cobra já em vez de agendar", () => {
    expect(inicioDaCobranca({ currentPeriodEnd: horas(0.98), trialEndsAt: null, agora: AGORA })).toBeNull();
    expect(inicioDaCobranca({ currentPeriodEnd: horas(1.02), trialEndsAt: null, agora: AGORA })?.toISOString()).toBe(
      horas(1.02).toISOString()
    );
  });
});

describe("corpoDaAssinatura", () => {
  const base = {
    userId: "3f2b8a4e-9c1d-4e5f-8a7b-1c2d3e4f5a6b",
    payerEmail: "psi@exemplo.com",
    cardTokenId: "tok_123",
    valor: 27.92,
    backUrl: "https://app.psisetting.com.br/configuracoes",
  };

  it("sem início (cobrar já): não manda start_date nem end_date", () => {
    const corpo = corpoDaAssinatura({ ...base, inicio: null });
    expect(corpo.auto_recurring).not.toHaveProperty("start_date");
    expect(corpo.auto_recurring).not.toHaveProperty("end_date");
  });

  it("com início: manda start_date e end_date juntos, fim 5 anos depois", () => {
    const inicio = new Date("2026-10-01T15:00:00.000Z");
    const corpo = corpoDaAssinatura({ ...base, inicio });
    expect(ANOS_DE_ASSINATURA).toBe(5);
    expect(corpo.auto_recurring.start_date).toBe("2026-10-01T15:00:00.000Z");
    expect(corpo.auto_recurring.end_date).toBe("2031-10-01T15:00:00.000Z");
  });

  it("valor arredondado em centavos, em reais, todo mês", () => {
    expect(corpoDaAssinatura({ ...base, valor: 100 / 3, inicio: null }).auto_recurring).toMatchObject({
      transaction_amount: 33.33,
      currency_id: "BRL",
      frequency: 1,
      frequency_type: "months",
    });
    expect(corpoDaAssinatura({ ...base, valor: 34.900000001, inicio: null }).auto_recurring.transaction_amount).toBe(34.9);
  });

  it("autorizada com o cartão, referência = id da conta", () => {
    const corpo = corpoDaAssinatura({ ...base, inicio: null });
    expect(corpo.status).toBe("authorized");
    expect(corpo.external_reference).toBe(base.userId);
    expect(corpo.card_token_id).toBe("tok_123");
    expect(corpo.payer_email).toBe("psi@exemplo.com");
    expect(corpo.back_url).toBe(base.backUrl);
    expect(corpo.reason).toBeTruthy();
  });
});

describe("cobrança da assinatura × pagamento avulso", () => {
  it("reconhece pela metadata.preapproval_id", () => {
    const p = { metadata: { preapproval_id: "2c9380848a1b" } };
    expect(idAssinaturaDoPagamento(p)).toBe("2c9380848a1b");
    expect(ehCobrancaDeAssinatura(p)).toBe(true);
  });

  it("reconhece pelo point_of_interaction.transaction_data.subscription_id", () => {
    const p = { point_of_interaction: { type: "SUBSCRIPTIONS", transaction_data: { subscription_id: " 2c93sub " } } };
    expect(idAssinaturaDoPagamento(p)).toBe("2c93sub");
    expect(ehCobrancaDeAssinatura(p)).toBe(true);
  });

  it("operation_type recurring_payment basta, mesmo sem o id da assinatura", () => {
    const p = { operation_type: "recurring_payment", metadata: {} };
    expect(idAssinaturaDoPagamento(p)).toBeNull();
    expect(ehCobrancaDeAssinatura(p)).toBe(true);
  });

  it("pagamento comum (PIX ou cartão mês a mês) não é cobrança de assinatura", () => {
    const p = {
      operation_type: "regular_payment",
      metadata: { cupom_id: "3f2b8a4e-9c1d-4e5f-8a7b-1c2d3e4f5a6b", cupom_tipo: "percent" },
      point_of_interaction: { type: "PIX", transaction_data: { qr_code: "000201..." } },
    };
    expect(idAssinaturaDoPagamento(p)).toBeNull();
    expect(ehCobrancaDeAssinatura(p)).toBe(false);
    expect(ehCobrancaDeAssinatura({})).toBe(false);
  });

  it("ids vazios, nulos ou que não são texto não contam", () => {
    expect(idAssinaturaDoPagamento({ metadata: { preapproval_id: "   " } })).toBeNull();
    expect(idAssinaturaDoPagamento({ metadata: { preapproval_id: 123 } })).toBeNull();
    expect(idAssinaturaDoPagamento({ metadata: null, point_of_interaction: { transaction_data: null } })).toBeNull();
    expect(idAssinaturaDoPagamento({ metadata: "texto", point_of_interaction: "texto" })).toBeNull();
  });
});

describe("validação do cartão", () => {
  it("só operation_type card_validation", () => {
    expect(ehValidacaoDeCartao({ operation_type: "card_validation" })).toBe(true);
    expect(ehValidacaoDeCartao({ operation_type: "recurring_payment" })).toBe(false);
    expect(ehValidacaoDeCartao({ operation_type: "regular_payment" })).toBe(false);
    expect(ehValidacaoDeCartao({})).toBe(false);
  });

  it("reconhece também pela descrição que o Mercado Pago põe na validação", () => {
    expect(ehValidacaoDeCartao({ description: "Recurring payment validation" })).toBe(true);
    // Um cupom com "VALIDACAO" no nome nunca pode apagar um pagamento de verdade.
    expect(ehValidacaoDeCartao({ description: "PsiSetting — 30 dias de acesso (Cupom VALIDACAO10)" })).toBe(false);
    expect(ehValidacaoDeCartao({ description: null })).toBe(false);
  });
});

describe("statusCancelado", () => {
  it("aceita as duas grafias", () => {
    expect(statusCancelado("cancelled")).toBe(true);
    expect(statusCancelado("canceled")).toBe(true);
  });

  it("qualquer outro status não é cancelamento", () => {
    for (const s of ["authorized", "paused", "pending", "", null, undefined]) {
      expect(statusCancelado(s), String(s)).toBe(false);
    }
  });
});

describe("quatroUltimos", () => {
  it("tira os 4 últimos dígitos de qualquer formato", () => {
    expect(quatroUltimos("4235647728025682")).toBe("5682");
    expect(quatroUltimos("**** 5682")).toBe("5682");
    expect(quatroUltimos(5682)).toBe("5682");
  });

  it("menos de 4 dígitos ou nada: null", () => {
    expect(quatroUltimos("123")).toBeNull();
    expect(quatroUltimos("")).toBeNull();
    expect(quatroUltimos(null)).toBeNull();
    expect(quatroUltimos(undefined)).toBeNull();
  });
});

describe("emailDoPagador", () => {
  it("vale o e-mail digitado no formulário do cartão, limpo", () => {
    expect(emailDoPagador("  Psi@Exemplo.COM ", "conta@exemplo.com")).toBe("psi@exemplo.com");
  });

  it("formulário vazio ou inválido: usa o da conta", () => {
    expect(emailDoPagador("", "Conta@Exemplo.com")).toBe("conta@exemplo.com");
    expect(emailDoPagador("sem-arroba", "conta@exemplo.com")).toBe("conta@exemplo.com");
    expect(emailDoPagador(undefined, "conta@exemplo.com")).toBe("conta@exemplo.com");
  });

  it("nenhum e-mail válido: null", () => {
    expect(emailDoPagador("x", null)).toBeNull();
    expect(emailDoPagador(null, "também inválido")).toBeNull();
  });
});

describe("renovacaoParaTela", () => {
  const linha = {
    situacao: "ativa",
    valor_atual: "27.92",
    proxima_cobranca: "2026-10-23T15:00:00.000Z",
    primeira_cobranca: null,
    cartao_final: "5682",
    cartao_bandeira: "visa",
    ultima_recusa_em: null,
    cancelada_em: null,
    cancelada_por: null,
  };

  it("ativa: mostra valor, próxima cobrança e cartão", () => {
    expect(renovacaoParaTela(linha, AGORA)).toEqual({
      situacao: "ativa",
      valor: 27.92,
      proximaCobranca: "2026-10-23T15:00:00.000Z",
      primeiraCobranca: null,
      cartaoFinal: "5682",
      cartaoBandeira: "visa",
      cobrancaRecusada: false,
      canceladaEm: null,
      canceladaPor: null,
      // A linha de teste não tem criada_em: o campo vem vazio.
      criadaEm: null,
    });
  });

  it("sem linha, ou criação que falhou: nada na tela", () => {
    expect(renovacaoParaTela(null, AGORA)).toBeNull();
    expect(renovacaoParaTela({ ...linha, situacao: "falhou" }, AGORA)).toBeNull();
    expect(renovacaoParaTela({ ...linha, situacao: "qualquer" }, AGORA)).toBeNull();
  });

  it("cancelada há até 45 dias aparece; há mais, some", () => {
    const recente = renovacaoParaTela(
      { ...linha, situacao: "cancelada", cancelada_em: dias(-10).toISOString(), cancelada_por: "usuario" },
      AGORA
    );
    expect(recente?.situacao).toBe("cancelada");
    expect(recente?.canceladaPor).toBe("usuario");
    // Cancelada não tem próxima cobrança, mesmo que a linha guarde a antiga.
    expect(recente?.proximaCobranca).toBeNull();

    expect(
      renovacaoParaTela({ ...linha, situacao: "cancelada", cancelada_em: dias(-46).toISOString() }, AGORA)
    ).toBeNull();
    // Sem data de cancelamento não há como saber a idade: não mostra.
    expect(renovacaoParaTela({ ...linha, situacao: "cancelada", cancelada_em: null }, AGORA)).toBeNull();
  });

  it("cobrança recusada só conta com a renovação ativa", () => {
    const recusa = dias(-1).toISOString();
    expect(renovacaoParaTela({ ...linha, ultima_recusa_em: recusa }, AGORA)?.cobrancaRecusada).toBe(true);
    expect(renovacaoParaTela({ ...linha, situacao: "criando", ultima_recusa_em: recusa }, AGORA)?.cobrancaRecusada).toBe(false);
    expect(
      renovacaoParaTela(
        { ...linha, situacao: "cancelada", cancelada_em: dias(-2).toISOString(), ultima_recusa_em: recusa },
        AGORA
      )?.cobrancaRecusada
    ).toBe(false);
  });

  it("criando: sem próxima cobrança; valor ilegível vira null", () => {
    const r = renovacaoParaTela({ ...linha, situacao: "criando", valor_atual: null }, AGORA);
    expect(r?.proximaCobranca).toBeNull();
    expect(r?.valor).toBeNull();
    expect(renovacaoParaTela({ ...linha, valor_atual: "abc" }, AGORA)?.valor).toBeNull();
  });
});

describe("mensagemErroAssinatura", () => {
  const MENSAGENS = [
    "Não conseguimos ler o cartão. Confira os dados e tente de novo.",
    "O Mercado Pago não aceitou o e-mail informado para a cobrança automática. Confira o e-mail no formulário ou escolha Mês a mês.",
    "Este cartão não pode ser usado para cobrança automática no Brasil. Escolha Mês a mês ou pague por PIX.",
    "O Mercado Pago não aceitou este cartão para a cobrança automática. Tente outro cartão, escolha Mês a mês ou pague por PIX.",
  ];

  it("cada tipo de erro vira uma frase para a pessoa", () => {
    expect(mensagemErroAssinatura({ message: "Invalid card_token_id", status: 400 })).toBe(MENSAGENS[0]);
    expect(mensagemErroAssinatura({ message: "Invalid payer_email", status: 400 })).toBe(MENSAGENS[1]);
    expect(mensagemErroAssinatura({ message: "Cannot operate between different countries", status: 400 })).toBe(
      MENSAGENS[2]
    );
    expect(mensagemErroAssinatura({ message: "Internal error", status: 400 })).toBe(MENSAGENS[3]);
  });

  it("lê o detalhe em causes, como o SDK 3.4 guarda", () => {
    expect(
      mensagemErroAssinatura({ message: "bad request", status: 400, causes: [{ code: 1, description: "card_token_id is required" }] })
    ).toBe(MENSAGENS[0]);
  });

  it("erro da chave de acesso não vira 'confira o cartão'", () => {
    expect(mensagemErroAssinatura({ message: "invalid access token", status: 401 })).toBe(MENSAGENS[3]);
  });

  it("nunca devolve o texto cru do Mercado Pago", () => {
    const erros: unknown[] = [
      { message: "db-host 10.0.0.7 falhou: preapproval 2c93 sem collector_id", cause: [{ code: 999, description: "detalhe interno" }] },
      { message: "card_token_id 9f8e7d6c expirado", status: 400 },
      new Error("stack interna: at RestClient.fetch (restClient.js:42)"),
      "texto solto",
      null,
      undefined,
      {},
    ];
    for (const e of erros) {
      const texto = mensagemErroAssinatura(e);
      expect(MENSAGENS, JSON.stringify(e) ?? String(e)).toContain(texto);
      expect(texto).not.toMatch(/10\.0\.0\.7|2c93|9f8e7d6c|RestClient|detalhe interno|collector/);
    }
  });
});
