import { describe, it, expect } from "vitest";
import {
  cobrancaAutomatica,
  inicioDaCobrancaNaTela,
  situacaoRenovacao,
  sucessoAutomatico,
  textoBotaoCartao,
} from "../utils/renovacao-tela";
import { dataCurta, type PrecoTela } from "../utils/assinatura-tela";
import type { RenovacaoTela } from "../utils/assinatura-cartao";

/**
 * O que o modal diz sobre a renovação automática no cartão. O que isto trava:
 *  - desconto por tempo limitado nunca vira "R$ 27,92 todo mês";
 *  - quem tem dias pela frente (teste ou pagos) lê que não paga nada agora;
 *  - a tela de sucesso diz a data da 1ª cobrança quando ela é agendada;
 *  - quem já está no automático vê a cobrança recusada e até quando vai o acesso.
 */

// Datas montadas no fuso local da máquina: o teste vale em qualquer fuso.
const local = (ano: number, mes: number, dia: number, hora = 12) => new Date(ano, mes - 1, dia, hora);

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

function renovacao(campos: Partial<RenovacaoTela> = {}): RenovacaoTela {
  return {
    situacao: "ativa",
    valor: 27.92,
    proximaCobranca: local(2026, 10, 26).toISOString(),
    primeiraCobranca: null,
    cartaoFinal: "1234",
    cartaoBandeira: "visa",
    cobrancaRecusada: false,
    canceladaEm: null,
    canceladaPor: null,
    ...campos,
  };
}

describe("linha do Automático", () => {
  it("sem desconto: o valor cheio todo mês", () => {
    expect(cobrancaAutomatica(preco(null))).toBe(
      "Cobramos R$ 34,90 todo mês no seu cartão. Cancele quando quiser em Configurações."
    );
  });

  it("desconto para sempre: o valor com desconto todo mês", () => {
    expect(cobrancaAutomatica(preco({ paraSempre: true, restantes: null }))).toMatch(/^Cobramos R\$ 27,92 todo mês/);
  });

  it("desconto por tempo limitado: diz quando sobe para o preço cheio", () => {
    expect(cobrancaAutomatica(preco({}))).toBe(
      "Cobramos no seu cartão R$ 27,92/mês nos 3 primeiros meses, depois R$ 34,90/mês. Cancele quando quiser em Configurações."
    );
  });
});

describe("quando sai a primeira cobrança", () => {
  const agora = local(2026, 9, 23, 10);

  it("no teste: só quando o teste acabar", () => {
    const fim = local(2026, 9, 30);
    const texto = inicioDaCobrancaNaTela({ currentPeriodEnd: null, trialEndsAt: fim.toISOString(), agora });
    expect(texto).toBe(`Nada é cobrado agora: a primeira cobrança sai em ${dataCurta(fim)}, quando o seu teste grátis acabar.`);
  });

  it("com dias pagos: quando eles acabarem", () => {
    const fim = local(2026, 10, 10);
    const texto = inicioDaCobrancaNaTela({
      currentPeriodEnd: fim.toISOString(),
      trialEndsAt: local(2026, 9, 1).toISOString(),
      agora,
    });
    expect(texto).toBe(`Nada é cobrado agora: a primeira cobrança sai em ${dataCurta(fim)}, quando os seus dias já pagos acabarem.`);
  });

  it("vencido (ou menos de 1 hora de acesso): cobra em seguida", () => {
    expect(inicioDaCobrancaNaTela({ currentPeriodEnd: local(2026, 9, 1).toISOString(), trialEndsAt: null, agora })).toBe(
      "A primeira cobrança sai logo depois que você confirmar."
    );
    const quaseAcabando = new Date(agora.getTime() + 20 * 60_000).toISOString();
    expect(inicioDaCobrancaNaTela({ currentPeriodEnd: quaseAcabando, trialEndsAt: null, agora })).toMatch(/logo depois/);
  });
});

describe("botão do formulário do cartão", () => {
  it("mês a mês: paga 30 dias", () => {
    expect(textoBotaoCartao("avulso", preco(null))).toBe("Pagar R$ 34,90 · 30 dias de acesso");
  });

  it("automático: '/mês' só quando o valor se repete", () => {
    expect(textoBotaoCartao("automatico", preco(null))).toBe("Ligar renovação automática · R$ 34,90/mês");
    expect(textoBotaoCartao("automatico", preco({ paraSempre: true, restantes: null }))).toBe(
      "Ligar renovação automática · R$ 27,92/mês"
    );
    expect(textoBotaoCartao("automatico", preco({ restantes: 1 }))).toBe("Ligar renovação · 1ª cobrança R$ 27,92");
  });
});

describe("sucesso ao ligar", () => {
  it("cobrança em seguida: o acesso espera a aprovação", () => {
    const r = sucessoAutomatico({ valor: 34.9, primeiraCobranca: null });
    expect(r.titulo).toBe("Renovação automática ligada");
    expect(r.texto).toBe(
      "A primeira cobrança de R$ 34,90 sai em alguns minutos; seu acesso é liberado assim que ela for aprovada."
    );
  });

  it("cobrança agendada: diz a data e que nada muda até lá", () => {
    const quando = local(2026, 9, 30);
    expect(sucessoAutomatico({ valor: 27.92, primeiraCobranca: quando.toISOString() }).texto).toBe(
      `A primeira cobrança, de R$ 27,92, será em ${dataCurta(quando)}. Até lá seu acesso continua normalmente.`
    );
  });

  it("data ilegível não vira 'Invalid Date'", () => {
    expect(sucessoAutomatico({ valor: 27.92, primeiraCobranca: "xyz" }).texto).toMatch(/dias atuais acabarem/);
  });
});

describe("quem já está no automático", () => {
  const base = { situacao: "ativo" as const, currentPeriodEnd: local(2026, 10, 26).toISOString(), emCarencia: false };

  it("ativa: próxima cobrança, valor e cartão, sem alerta", () => {
    const s = situacaoRenovacao({ ...base, renovacao: renovacao() });
    expect(s.titulo).toBe("Renovação automática ligada");
    expect(s.detalhes).toEqual([
      { rotulo: "Próxima cobrança", valor: dataCurta(local(2026, 10, 26)) },
      { rotulo: "Valor", valor: "R$ 27,92" },
      { rotulo: "Cartão", valor: "Visa final 1234" },
    ]);
    expect(s.alerta).toBeNull();
  });

  it("sem a próxima cobrança do Mercado Pago, usa a primeira agendada", () => {
    const primeira = local(2026, 9, 30);
    const s = situacaoRenovacao({
      ...base,
      renovacao: renovacao({ proximaCobranca: null, primeiraCobranca: primeira.toISOString() }),
    });
    expect(s.detalhes[0]).toEqual({ rotulo: "Próxima cobrança", valor: dataCurta(primeira) });
  });

  it("cobrança recusada: avisa até quando vai o acesso e o caminho do PIX", () => {
    const fim = local(2026, 10, 6);
    const s = situacaoRenovacao({
      situacao: "ativo",
      currentPeriodEnd: fim.toISOString(),
      emCarencia: true,
      renovacao: renovacao({ cobrancaRecusada: true }),
    });
    expect(s.alerta?.tipo).toBe("erro");
    expect(s.alerta?.texto).toBe(
      `Não conseguimos cobrar seu cartão. O Mercado Pago tenta de novo nos próximos dias; seu acesso continua até ${dataCurta(fim)}. Para pagar por PIX, cancele a renovação em Configurações.`
    );
  });

  it("recusada e já em somente leitura: não promete acesso até uma data que passou", () => {
    const s = situacaoRenovacao({
      situacao: "vencido",
      currentPeriodEnd: local(2026, 9, 1).toISOString(),
      emCarencia: false,
      renovacao: renovacao({ cobrancaRecusada: true }),
    });
    expect(s.alerta?.texto).toMatch(/somente leitura/);
    expect(s.alerta?.texto).not.toMatch(/continua até/);
  });

  it("em carência sem recusa: a cobrança está a caminho", () => {
    const s = situacaoRenovacao({ ...base, emCarencia: true, renovacao: renovacao() });
    expect(s.alerta?.tipo).toBe("info");
  });

  it("criando: só a confirmação em andamento", () => {
    const s = situacaoRenovacao({
      ...base,
      renovacao: renovacao({ situacao: "criando", valor: null, proximaCobranca: null }),
    });
    expect(s.texto).toBe("Estamos confirmando sua renovação automática com o Mercado Pago. Isso leva alguns minutos.");
    expect(s.detalhes).toEqual([{ rotulo: "Cartão", valor: "Visa final 1234" }]);
    expect(s.alerta).toBeNull();
  });

  it("sem bandeira nem final, a linha do cartão não aparece", () => {
    const s = situacaoRenovacao({ ...base, renovacao: renovacao({ cartaoBandeira: null, cartaoFinal: null }) });
    expect(s.detalhes.map((d) => d.rotulo)).toEqual(["Próxima cobrança", "Valor"]);
  });
});
