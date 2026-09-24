import { describe, it, expect, vi, afterEach } from "vitest";
import {
  adotarAssinatura,
  cancelarAssinaturaCartao,
  criarAssinaturaCartao,
  processarFatura,
  resolverCriacaoPendente,
  sincronizarAssinatura,
  type LinhaAssinatura,
} from "../utils/assinatura-cartao-servidor";
import type { DescontoAplicado } from "../utils/preco-assinatura";

/**
 * Renovação automática no cartão — o servidor, com o SDK do Mercado Pago de
 * verdade (só o fetch simulado) e um banco falso escrito à mão.
 *
 * O que isto trava:
 *  - nunca duas assinaturas: a linha "criando" barra o segundo clique antes de
 *    o Mercado Pago ver qualquer coisa, e o POST de criação sai UMA vez só;
 *  - resposta ambígua do Mercado Pago (5xx) não vira "falhou" nem devolve o
 *    cupom: a conferência procura lá antes de qualquer nova tentativa;
 *  - recusa clara devolve o cupom reservado;
 *  - o valor sobe para o preço de agora (R$ 34,90 depois dos meses do cupom);
 *  - cada cobrança aprovada vira dias pelo mesmo caminho de todo pagamento.
 */

const USUARIO = "3f2b8a4e-9c1d-4e5f-8a7b-1c2d3e4f5a6b";
const CUPOM = "7d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6";
const AGORA = new Date("2026-09-23T15:00:00.000Z");
const dias = (n: number) => new Date(AGORA.getTime() + n * 24 * 60 * 60 * 1000).toISOString();

// ── Banco falso ─────────────────────────────────────────────────────────────

type Linha = Record<string, unknown>;
type RespostaRpc = { data?: unknown; error?: unknown };

const VIVAS = ["criando", "ativa"];

function linhaDeAssinatura(over: Partial<LinhaAssinatura> = {}): LinhaAssinatura {
  return {
    id: "a1",
    user_id: USUARIO,
    mp_preapproval_id: "2c938084pre1",
    situacao: "ativa",
    mp_status: "authorized",
    valor_atual: 27.92,
    primeira_cobranca: null,
    proxima_cobranca: "2026-10-23T15:00:00.000Z",
    payer_email: "psi@exemplo.com",
    cartao_final: "5682",
    cartao_bandeira: "visa",
    resgate_reservado_id: null,
    ultima_recusa_em: null,
    cancelada_em: null,
    cancelada_por: null,
    erro: null,
    criada_em: dias(-40),
    atualizada_em: dias(-1),
    ...over,
  };
}

/**
 * O mínimo do cliente Supabase que o servidor usa: from().insert().select().single(),
 * update().eq(), select().eq().in()/neq().maybeSingle(), order/limit e rpc().
 * assinaturas_cartao imita o índice único "uma viva por pessoa" (23505).
 */
function bancoFalso({
  assinaturas = [],
  resgates = [],
  rpc = () => ({}),
}: {
  assinaturas?: LinhaAssinatura[];
  resgates?: Linha[];
  rpc?: (nome: string, args: Record<string, unknown>) => RespostaRpc;
} = {}) {
  const tabelas: Record<string, Linha[]> = {
    assinaturas_cartao: assinaturas.map((l) => ({ ...l })),
    coupon_redemptions: resgates.map((l) => ({ profile_id: USUARIO, ...l })),
  };
  const rpcs: Array<{ nome: string; args: Record<string, unknown> }> = [];
  let proximoId = 100;

  function consulta(tabela: string) {
    let operacao: "select" | "insert" | "update" = "select";
    let dados: Linha = {};
    const filtros: Array<(l: Linha) => boolean> = [];
    let ordem: { coluna: string; asc: boolean } | null = null;
    let limite: number | null = null;

    function executar(): { data: unknown; error: unknown } {
      const linhas = (tabelas[tabela] ??= []);

      if (operacao === "insert") {
        const viva = VIVAS.includes(String(dados.situacao));
        if (
          tabela === "assinaturas_cartao" &&
          viva &&
          linhas.some((l) => l.user_id === dados.user_id && VIVAS.includes(String(l.situacao)))
        ) {
          return {
            data: null,
            error: { code: "23505", message: 'duplicate key value violates unique constraint "assinaturas_cartao_uma_viva"' },
          };
        }
        const nova: Linha = {
          ...linhaDeAssinatura(),
          mp_preapproval_id: null,
          mp_status: null,
          valor_atual: null,
          proxima_cobranca: null,
          criada_em: new Date().toISOString(),
          atualizada_em: new Date().toISOString(),
          ...dados,
          id: `a${proximoId++}`,
        };
        linhas.push(nova);
        return { data: { ...nova }, error: null };
      }

      let alvo = linhas.filter((l) => filtros.every((f) => f(l)));

      if (operacao === "update") {
        for (const l of alvo) Object.assign(l, dados);
        return { data: null, error: null };
      }

      if (ordem) {
        const { coluna, asc } = ordem;
        alvo = alvo.slice().sort((a, b) => String(a[coluna]).localeCompare(String(b[coluna])) * (asc ? 1 : -1));
      }
      if (limite !== null) alvo = alvo.slice(0, limite);
      return { data: alvo.map((l) => ({ ...l })), error: null };
    }

    function uma(obrigatoria: boolean) {
      const r = executar();
      if (r.error || !Array.isArray(r.data)) return r;
      if (r.data.length > 1) return { data: null, error: { code: "PGRST116", message: "mais de uma linha" } };
      if (r.data.length === 0 && obrigatoria) return { data: null, error: { code: "PGRST116", message: "nenhuma linha" } };
      return { data: r.data[0] ?? null, error: null };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {
      select: () => q,
      insert: (l: Linha) => {
        operacao = "insert";
        dados = l;
        return q;
      },
      update: (patch: Linha) => {
        operacao = "update";
        dados = patch;
        return q;
      },
      eq: (c: string, v: unknown) => {
        filtros.push((l) => l[c] === v);
        return q;
      },
      neq: (c: string, v: unknown) => {
        filtros.push((l) => l[c] !== v);
        return q;
      },
      in: (c: string, vs: unknown[]) => {
        filtros.push((l) => vs.includes(l[c]));
        return q;
      },
      not: (c: string, op: string, v: unknown) => {
        filtros.push((l) => (op === "is" && v === null ? l[c] !== null && l[c] !== undefined : l[c] !== v));
        return q;
      },
      order: (coluna: string, opcoes?: { ascending?: boolean }) => {
        ordem = { coluna, asc: opcoes?.ascending !== false };
        return q;
      },
      limit: (n: number) => {
        limite = n;
        return q;
      },
      single: async () => uma(true),
      maybeSingle: async () => uma(false),
      then: (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(executar()).then(ok, erro),
    };
    return q;
  }

  return {
    tabelas,
    rpcs,
    assinatura: (id: string) => tabelas.assinaturas_cartao.find((l) => l.id === id) as LinhaAssinatura | undefined,
    from: (tabela: string) => consulta(tabela),
    async rpc(nome: string, args: Record<string, unknown>) {
      rpcs.push({ nome, args });
      const r = rpc(nome, args);
      return { data: r.data ?? null, error: r.error ?? null };
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const comoAdmin = (banco: ReturnType<typeof bancoFalso>) => banco as any;

// ── Mercado Pago simulado (o SDK é o de verdade) ────────────────────────────

interface Chamada {
  metodo: string;
  url: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  corpo?: any;
}
const chamadas: Chamada[] = [];
const buscasDePix: Chamada[] = [];

function responder(json: unknown, status = 200) {
  return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
}

function simularMercadoPago(rotas: (c: Chamada) => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { method?: string; body?: string }) => {
      const c: Chamada = { metodo: init?.method ?? "GET", url: String(url), corpo: init?.body ? JSON.parse(init.body) : undefined };
      // Ligar a renovação cancela antes os PIX pendentes da pessoa (busca de
      // pagamentos). Fica numa lista à parte: nos testes ninguém tem PIX aberto,
      // e as contagens de chamadas abaixo são as da assinatura.
      if (c.metodo === "GET" && caminho(c) === "/v1/payments/search") {
        buscasDePix.push(c);
        return responder({ results: [] });
      }
      chamadas.push(c);
      return rotas(c);
    })
  );
}

const caminho = (c: Chamada) => new URL(c.url).pathname;
const doTipo = (metodo: string, trecho: string) => chamadas.filter((c) => c.metodo === metodo && caminho(c).includes(trecho));

function silenciarLogs() {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  chamadas.length = 0;
  buscasDePix.length = 0;
});

const assinaturaCriada = {
  id: "2c938084novo",
  status: "authorized",
  external_reference: USUARIO,
  next_payment_date: "2026-10-01T15:00:00.000-00:00",
  auto_recurring: { transaction_amount: 27.92, currency_id: "BRL" },
  date_created: AGORA.toISOString(),
};

const cupomNovo: DescontoAplicado = {
  origem: "cupom_novo",
  couponId: CUPOM,
  code: "PROMO20",
  tipo: "percent",
  valor: 20,
  duracaoMeses: 3,
  paraSempre: false,
  restantes: 3,
  valorFinal: 27.92,
};

function dadosDaCriacao(banco: ReturnType<typeof bancoFalso>, over: Partial<Parameters<typeof criarAssinaturaCartao>[0]> = {}) {
  return {
    admin: comoAdmin(banco),
    userId: USUARIO,
    payerEmail: "psi@exemplo.com",
    cardTokenId: "tok_abc",
    valor: 27.92,
    desconto: null,
    perfil: { current_period_end: null, trial_ends_at: dias(8) },
    backUrl: "https://app.psisetting.com.br/configuracoes",
    cartaoFinal: "5682",
    cartaoBandeira: "visa",
    agora: AGORA,
    ...over,
  };
}

// ── Criação ─────────────────────────────────────────────────────────────────

describe("criarAssinaturaCartao", () => {
  it("sucesso: grava a linha como ativa, com o id da assinatura do Mercado Pago", async () => {
    simularMercadoPago(() => responder(assinaturaCriada, 201));
    const banco = bancoFalso();

    const r = await criarAssinaturaCartao(dadosDaCriacao(banco));

    expect(r).toEqual({
      ok: true,
      primeiraCobranca: dias(8),
      proximaCobranca: "2026-10-01T15:00:00.000Z",
      valor: 27.92,
    });
    const [linha] = banco.tabelas.assinaturas_cartao;
    expect(linha).toMatchObject({
      user_id: USUARIO,
      situacao: "ativa",
      mp_preapproval_id: "2c938084novo",
      mp_status: "authorized",
      valor_atual: 27.92,
      primeira_cobranca: dias(8),
      proxima_cobranca: "2026-10-01T15:00:00.000Z",
      payer_email: "psi@exemplo.com",
      cartao_final: "5682",
      cartao_bandeira: "visa",
      erro: null,
    });
  });

  it("um POST só, com start_date e end_date quando a pessoa ainda tem dias", async () => {
    simularMercadoPago(() => responder(assinaturaCriada, 201));
    await criarAssinaturaCartao(dadosDaCriacao(bancoFalso()));

    expect(chamadas).toHaveLength(1);
    const [post] = chamadas;
    expect(post.metodo).toBe("POST");
    expect(post.url).toMatch(/^https:\/\/api\.mercadopago\.com\/preapproval\/?$/);
    expect(post.corpo).toMatchObject({
      external_reference: USUARIO,
      payer_email: "psi@exemplo.com",
      card_token_id: "tok_abc",
      status: "authorized",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: 27.92,
        currency_id: "BRL",
        start_date: dias(8),
        end_date: "2031-10-01T15:00:00.000Z",
      },
    });
  });

  it("ligar a renovação procura e cancela os PIX pendentes da pessoa (não dá para pagar os dois)", async () => {
    simularMercadoPago(() => responder(assinaturaCriada, 201));
    await criarAssinaturaCartao(dadosDaCriacao(bancoFalso()));

    expect(buscasDePix).toHaveLength(1);
    const busca = new URL(buscasDePix[0].url);
    expect(busca.searchParams.get("external_reference")).toBe(USUARIO);
    expect(busca.searchParams.get("status")).toBe("pending");
  });

  it("Mercado Pago devolve assinatura que não está 'authorized': não fica ligada, cancela lá", async () => {
    silenciarLogs();
    simularMercadoPago((c) =>
      c.metodo === "POST"
        ? responder({ ...assinaturaCriada, status: "pending" }, 201)
        : responder({ ...assinaturaCriada, status: "cancelled" })
    );
    const banco = bancoFalso();
    const r = await criarAssinaturaCartao(dadosDaCriacao(banco));

    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(banco.tabelas.assinaturas_cartao[0].situacao).toBe("falhou");
    expect(doTipo("PUT", "/preapproval/2c938084novo")).toHaveLength(1);
  });

  it("vencido: cobra já (sem start_date nem end_date) e não há primeira cobrança agendada", async () => {
    simularMercadoPago(() => responder(assinaturaCriada, 201));
    const banco = bancoFalso();
    const r = await criarAssinaturaCartao(
      dadosDaCriacao(banco, { perfil: { current_period_end: dias(-3), trial_ends_at: dias(-30) } })
    );

    expect(chamadas[0].corpo.auto_recurring).not.toHaveProperty("start_date");
    expect(chamadas[0].corpo.auto_recurring).not.toHaveProperty("end_date");
    expect(r).toMatchObject({ ok: true, primeiraCobranca: null });
    expect(banco.tabelas.assinaturas_cartao[0].primeira_cobranca).toBeNull();
  });

  it("já tem uma viva (23505 no insert): 409 jaTem, sem chamar o Mercado Pago", async () => {
    simularMercadoPago(() => responder(assinaturaCriada, 201));
    const banco = bancoFalso({ assinaturas: [linhaDeAssinatura({ situacao: "ativa" })] });

    const r = await criarAssinaturaCartao(dadosDaCriacao(banco));

    expect(r).toMatchObject({ ok: false, status: 409, jaTem: true });
    expect(chamadas).toHaveLength(0);
    expect(banco.tabelas.assinaturas_cartao).toHaveLength(1);
    expect(banco.rpcs).toHaveLength(0);
  });

  it("uma 'criando' também barra (dois cliques, duas abas)", async () => {
    simularMercadoPago(() => responder(assinaturaCriada, 201));
    const banco = bancoFalso({ assinaturas: [linhaDeAssinatura({ situacao: "criando", mp_preapproval_id: null })] });

    const r = await criarAssinaturaCartao(dadosDaCriacao(banco));

    expect(r).toMatchObject({ ok: false, status: 409, jaTem: true });
    expect(chamadas).toHaveLength(0);
  });

  it("cupom novo: reserva antes do Mercado Pago; recusa clara (400) marca 'falhou' e devolve a reserva", async () => {
    silenciarLogs();
    simularMercadoPago(() => responder({ message: "Invalid card_token_id", error: "bad_request", status: 400 }, 400));
    const banco = bancoFalso({
      rpc: (nome) => (nome === "reservar_cupom_assinatura" ? { data: { ok: true, reservado: true, resgate_id: "resgate-9" } } : {}),
    });

    const r = await criarAssinaturaCartao(dadosDaCriacao(banco, { desconto: cupomNovo }));

    expect(r).toEqual({ ok: false, status: 400, erro: "Não conseguimos ler o cartão. Confira os dados e tente de novo." });
    expect(banco.rpcs.map((c) => c.nome)).toEqual(["reservar_cupom_assinatura", "liberar_reserva_cupom"]);
    expect(banco.rpcs[0].args).toEqual({
      p_user_id: USUARIO,
      p_cupom_id: CUPOM,
      p_tipo: "percent",
      p_valor: 20,
      p_duracao: 3,
      p_para_sempre: false,
    });
    expect(banco.rpcs[1].args).toEqual({ p_user_id: USUARIO, p_resgate_id: "resgate-9" });

    const [linha] = banco.tabelas.assinaturas_cartao;
    expect(linha.situacao).toBe("falhou");
    expect(linha.resgate_reservado_id).toBe("resgate-9");
    expect(String(linha.erro)).toContain("400");
    expect(linha.mp_preapproval_id).toBeNull();
  });

  it("cupom recusado na reserva: 400 de cupom, sem chamar o Mercado Pago", async () => {
    silenciarLogs();
    simularMercadoPago(() => responder(assinaturaCriada, 201));
    const banco = bancoFalso({
      rpc: (nome) => (nome === "reservar_cupom_assinatura" ? { data: { ok: false, motivo: "esgotado" } } : {}),
    });

    const r = await criarAssinaturaCartao(dadosDaCriacao(banco, { desconto: cupomNovo }));

    expect(r).toMatchObject({ ok: false, status: 400, erroDeCupom: true });
    expect(chamadas).toHaveLength(0);
    expect(banco.tabelas.assinaturas_cartao[0].situacao).toBe("falhou");
  });

  it("cupom que a pessoa já usa não é reservado de novo", async () => {
    simularMercadoPago(() => responder(assinaturaCriada, 201));
    const banco = bancoFalso();
    await criarAssinaturaCartao(dadosDaCriacao(banco, { desconto: { ...cupomNovo, origem: "cupom_em_uso", restantes: 2 } }));
    expect(banco.rpcs).toHaveLength(0);
    expect(banco.tabelas.assinaturas_cartao[0].situacao).toBe("ativa");
  });

  it("500 do Mercado Pago: 202 incerto, a linha continua 'criando' e a reserva do cupom fica", async () => {
    silenciarLogs();
    simularMercadoPago(() => responder({ message: "internal_error", status: 500 }, 500));
    const banco = bancoFalso({
      rpc: (nome) => (nome === "reservar_cupom_assinatura" ? { data: { ok: true, reservado: true, resgate_id: "resgate-9" } } : {}),
    });

    const r = await criarAssinaturaCartao(dadosDaCriacao(banco, { desconto: cupomNovo }));

    expect(r).toMatchObject({ ok: false, status: 202, incerto: true });
    const [linha] = banco.tabelas.assinaturas_cartao;
    expect(linha.situacao).toBe("criando");
    expect(String(linha.erro)).toContain("500");
    expect(banco.rpcs.map((c) => c.nome)).not.toContain("liberar_reserva_cupom");
  });

  it("5xx e 429: o POST de criação sai UMA vez só (sem novas tentativas automáticas do SDK)", async () => {
    silenciarLogs();
    for (const status of [500, 502, 503, 504, 429]) {
      chamadas.length = 0;
      simularMercadoPago(() => responder({ message: "erro", status }, status));
      const r = await criarAssinaturaCartao(dadosDaCriacao(bancoFalso()));
      expect(r, String(status)).toMatchObject({ status: 202, incerto: true });
      expect(doTipo("POST", "/preapproval"), String(status)).toHaveLength(1);
    }
  });

  // Regressão: no SDK 3.4 erro de rede e tempo esgotado (AbortController dos
  // 25 s) chegam como MPConnectionError com status 0, não undefined. Antes o
  // caso mais ambíguo de todos virava "Mercado Pago recusou (status 0)": a
  // linha era marcada "falhou" e a pessoa ouvia "tente outro cartão" — tentar
  // de novo podia criar DUAS assinaturas no mesmo cartão.
  it("erro de rede ou tempo esgotado: 202 incerto, a linha continua 'criando'", async () => {
    silenciarLogs();
    simularMercadoPago(() => {
      throw new TypeError("fetch failed");
    });
    const banco = bancoFalso();

    const r = await criarAssinaturaCartao(dadosDaCriacao(banco));

    expect(r).toMatchObject({ ok: false, status: 202, incerto: true });
    expect(banco.tabelas.assinaturas_cartao[0].situacao).toBe("criando");
    expect(doTipo("POST", "/preapproval")).toHaveLength(1);
  });

  it("resposta sem id: 202 incerto, a linha continua 'criando'", async () => {
    silenciarLogs();
    simularMercadoPago(() => responder({ status: "authorized" }, 201));
    const banco = bancoFalso();
    const r = await criarAssinaturaCartao(dadosDaCriacao(banco));
    expect(r).toMatchObject({ ok: false, status: 202, incerto: true });
    expect(banco.tabelas.assinaturas_cartao[0].situacao).toBe("criando");
  });
});

// ── Criação sem resposta clara ──────────────────────────────────────────────

describe("resolverCriacaoPendente", () => {
  const criando = (idadeMin: number) =>
    linhaDeAssinatura({
      situacao: "criando",
      mp_preapproval_id: null,
      mp_status: null,
      valor_atual: null,
      proxima_cobranca: null,
      resgate_reservado_id: "resgate-9",
      criada_em: new Date(AGORA.getTime() - idadeMin * 60_000).toISOString(),
    });

  it("com menos de 2 minutos: nem pergunta ao Mercado Pago", async () => {
    simularMercadoPago(() => responder({ results: [] }));
    const banco = bancoFalso({ assinaturas: [criando(1)] });
    expect(await resolverCriacaoPendente(comoAdmin(banco), criando(1), AGORA)).toBe("criando");
    expect(chamadas).toHaveLength(0);
  });

  it("achou no Mercado Pago (mesma referência, criada depois da linha): vira ativa", async () => {
    silenciarLogs();
    simularMercadoPago(() =>
      responder({
        results: [
          { ...assinaturaCriada, id: "de-outra-pessoa", external_reference: "outra-pessoa" },
          { ...assinaturaCriada, id: "antiga-cancelada", status: "cancelled" },
          { ...assinaturaCriada, id: "2c938084achada", date_created: new Date(AGORA.getTime() - 9 * 60_000).toISOString() },
        ],
      })
    );
    const linha = criando(10);
    const banco = bancoFalso({ assinaturas: [linha] });

    expect(await resolverCriacaoPendente(comoAdmin(banco), linha, AGORA)).toBe("ativa");
    expect(banco.assinatura(linha.id)).toMatchObject({ situacao: "ativa", mp_preapproval_id: "2c938084achada", erro: null });
    const busca = new URL(chamadas[0].url);
    expect(busca.pathname).toBe("/preapproval/search");
    expect(busca.searchParams.get("payer_email")).toBe("psi@exemplo.com");
  });

  it("não achou depois de 1 hora: falhou e devolve a reserva do cupom", async () => {
    simularMercadoPago(() => responder({ results: [] }));
    const linha = criando(61);
    const banco = bancoFalso({ assinaturas: [linha] });

    expect(await resolverCriacaoPendente(comoAdmin(banco), linha, AGORA)).toBe("falhou");
    expect(banco.assinatura(linha.id)?.situacao).toBe("falhou");
    expect(banco.rpcs).toEqual([{ nome: "liberar_reserva_cupom", args: { p_user_id: USUARIO, p_resgate_id: "resgate-9" } }]);
  });
});

// ── Sincronização ───────────────────────────────────────────────────────────

describe("sincronizarAssinatura", () => {
  const noMercadoPago = (over: Record<string, unknown> = {}) => ({
    id: "2c938084pre1",
    status: "authorized",
    external_reference: USUARIO,
    next_payment_date: "2026-10-23T15:00:00.000Z",
    auto_recurring: { transaction_amount: 27.92, currency_id: "BRL" },
    ...over,
  });

  it("valor diferente do preço atual (meses do cupom acabaram): PUT com o valor novo", async () => {
    silenciarLogs();
    simularMercadoPago((c) => (c.metodo === "PUT" ? responder(noMercadoPago({ auto_recurring: { transaction_amount: 34.9 } })) : responder(noMercadoPago())));
    const linha = linhaDeAssinatura();
    // Sem resgate em uso: o preço de agora é o cheio.
    const banco = bancoFalso({ assinaturas: [linha], resgates: [] });

    const r = await sincronizarAssinatura(comoAdmin(banco), linha);

    const puts = doTipo("PUT", "/preapproval/2c938084pre1");
    expect(puts).toHaveLength(1);
    expect(puts[0].corpo).toEqual({ auto_recurring: { transaction_amount: 34.9, currency_id: "BRL" } });
    expect(r.valor_atual).toBe(34.9);
    expect(banco.assinatura(linha.id)).toMatchObject({ valor_atual: 34.9, situacao: "ativa", mp_status: "authorized" });
  });

  it("valor igual ao preço atual (cupom ainda em uso): não mexe no Mercado Pago", async () => {
    simularMercadoPago(() => responder(noMercadoPago()));
    const linha = linhaDeAssinatura();
    const banco = bancoFalso({
      assinaturas: [linha],
      resgates: [
        {
          coupon_id: CUPOM,
          desconto_tipo: "percent",
          desconto_valor: 20,
          duracao_meses: 3,
          para_sempre: false,
          mensalidades_usadas: 1,
          encerrado_em: null,
          coupons: { code: "PROMO20" },
        },
      ],
    });

    await sincronizarAssinatura(comoAdmin(banco), linha);

    expect(doTipo("PUT", "/preapproval")).toHaveLength(0);
    expect(banco.assinatura(linha.id)?.valor_atual).toBe(27.92);
  });

  it("copia a próxima cobrança do Mercado Pago", async () => {
    simularMercadoPago(() => responder(noMercadoPago({ next_payment_date: "2026-11-23T15:00:00.000Z", auto_recurring: { transaction_amount: 34.9 } })));
    const linha = linhaDeAssinatura();
    const banco = bancoFalso({ assinaturas: [linha] });
    await sincronizarAssinatura(comoAdmin(banco), linha);
    expect(banco.assinatura(linha.id)?.proxima_cobranca).toBe("2026-11-23T15:00:00.000Z");
  });

  it("cancelada no Mercado Pago (as duas grafias): marca 'cancelada' por 'mercadopago' e devolve a reserva", async () => {
    for (const status of ["cancelled", "canceled"]) {
      chamadas.length = 0;
      simularMercadoPago(() => responder(noMercadoPago({ status })));
      const linha = linhaDeAssinatura({ resgate_reservado_id: "resgate-9" });
      const banco = bancoFalso({ assinaturas: [linha] });

      const r = await sincronizarAssinatura(comoAdmin(banco), linha);

      expect(r.situacao, status).toBe("cancelada");
      expect(banco.assinatura(linha.id), status).toMatchObject({ situacao: "cancelada", cancelada_por: "mercadopago", mp_status: status });
      expect(banco.assinatura(linha.id)?.cancelada_em, status).toBeTruthy();
      expect(banco.rpcs.map((c) => c.nome), status).toEqual(["liberar_reserva_cupom"]);
      expect(doTipo("PUT", "/preapproval"), status).toHaveLength(0);
    }
  });

  it("já cancelada aqui: não sobrescreve quem cancelou nem quando", async () => {
    simularMercadoPago(() => responder(noMercadoPago({ status: "cancelled" })));
    const linha = linhaDeAssinatura({ situacao: "cancelada", cancelada_por: "usuario", cancelada_em: dias(-3) });
    const banco = bancoFalso({ assinaturas: [linha] });

    await sincronizarAssinatura(comoAdmin(banco), linha);

    expect(banco.assinatura(linha.id)).toMatchObject({ situacao: "cancelada", cancelada_por: "usuario", cancelada_em: dias(-3) });
    expect(banco.rpcs).toHaveLength(0);
  });

  it("sem id do Mercado Pago (ainda criando): nada a sincronizar", async () => {
    simularMercadoPago(() => responder({}));
    const linha = linhaDeAssinatura({ situacao: "criando", mp_preapproval_id: null });
    const r = await sincronizarAssinatura(comoAdmin(bancoFalso({ assinaturas: [linha] })), linha);
    expect(r).toEqual(linha);
    expect(chamadas).toHaveLength(0);
  });
});

// ── Cancelamento ────────────────────────────────────────────────────────────

describe("cancelarAssinaturaCartao", () => {
  it("PUT com status 'cancelled' e a linha fica cancelada, com quem pediu", async () => {
    simularMercadoPago(() => responder({ id: "2c938084pre1", status: "cancelled" }));
    const linha = linhaDeAssinatura({ resgate_reservado_id: "resgate-9" });
    const banco = bancoFalso({ assinaturas: [linha] });

    await cancelarAssinaturaCartao(comoAdmin(banco), linha, "usuario");

    const puts = doTipo("PUT", "/preapproval/2c938084pre1");
    expect(puts.map((c) => c.corpo)).toEqual([{ status: "cancelled" }]);
    expect(banco.assinatura(linha.id)).toMatchObject({ situacao: "cancelada", cancelada_por: "usuario", mp_status: "cancelled" });
    expect(banco.assinatura(linha.id)?.cancelada_em).toBeTruthy();
    expect(banco.rpcs).toEqual([{ nome: "liberar_reserva_cupom", args: { p_user_id: USUARIO, p_resgate_id: "resgate-9" } }]);
  });

  it("Mercado Pago recusa 'cancelled' (400): tenta 'canceled'", async () => {
    simularMercadoPago((c) =>
      c.corpo?.status === "cancelled"
        ? responder({ message: "invalid status", status: 400 }, 400)
        : responder({ id: "2c938084pre1", status: "cancelled" })
    );
    const linha = linhaDeAssinatura();
    const banco = bancoFalso({ assinaturas: [linha] });

    await cancelarAssinaturaCartao(comoAdmin(banco), linha, "admin");

    expect(doTipo("PUT", "/preapproval/2c938084pre1").map((c) => c.corpo)).toEqual([
      { status: "cancelled" },
      { status: "canceled" },
    ]);
    expect(banco.assinatura(linha.id)).toMatchObject({ situacao: "cancelada", cancelada_por: "admin" });
  });

  it("Mercado Pago recusa as duas grafias: o erro sobe e a linha continua ativa", async () => {
    simularMercadoPago(() => responder({ message: "invalid status", status: 400 }, 400));
    const linha = linhaDeAssinatura();
    const banco = bancoFalso({ assinaturas: [linha] });

    await expect(cancelarAssinaturaCartao(comoAdmin(banco), linha, "usuario")).rejects.toBeTruthy();

    expect(doTipo("PUT", "/preapproval")).toHaveLength(2);
    expect(banco.assinatura(linha.id)?.situacao).toBe("ativa");
  });

  it("PUT volta sem erro mas a assinatura segue cobrando: confere, e sem confirmação lança", async () => {
    // Revisão de 23/09: marcar "cancelada" aqui com o cartão ainda sendo
    // cobrado é o pior resultado possível.
    simularMercadoPago(() => responder({ id: "2c938084pre1", status: "authorized" }));
    const linha = linhaDeAssinatura();
    const banco = bancoFalso({ assinaturas: [linha] });

    await expect(cancelarAssinaturaCartao(comoAdmin(banco), linha, "usuario")).rejects.toThrow(/não confirmou/);

    expect(doTipo("PUT", "/preapproval")).toHaveLength(2);
    expect(doTipo("GET", "/preapproval/2c938084pre1")).toHaveLength(1);
    expect(banco.assinatura(linha.id)?.situacao).toBe("ativa");
  });

  it("PUT recusado porque já estava cancelada lá: conta como cancelada", async () => {
    simularMercadoPago((c) =>
      c.metodo === "PUT"
        ? responder({ message: "already cancelled", status: 400 }, 400)
        : responder({ id: "2c938084pre1", status: "cancelled" })
    );
    const linha = linhaDeAssinatura();
    const banco = bancoFalso({ assinaturas: [linha] });

    await cancelarAssinaturaCartao(comoAdmin(banco), linha, "usuario");

    expect(banco.assinatura(linha.id)?.situacao).toBe("cancelada");
  });

  it("cancelada depois de uma cobrança já feita: o cupom reservado NÃO é devolvido", async () => {
    // Revisão de 23/09: a cobrança pode ter saído e o aviso ainda não ter
    // chegado; devolver o cupom aí daria o mês com desconto sem contar.
    simularMercadoPago((c) => {
      const p = caminho(c);
      if (c.metodo === "PUT") return responder({ id: "2c938084pre1", status: "cancelled" });
      if (p === "/authorized_payments/search") {
        return responder({
          paging: { total: 1 },
          results: [
            { id: 9001, preapproval_id: "2c938084pre1", status: "processed", payment: { id: 555, status: "approved" }, debit_date: dias(-1) },
          ],
        });
      }
      if (p === "/v1/payments/555") {
        return responder({ id: 555, status: "approved", transaction_amount: 27.92, operation_type: "recurring_payment" });
      }
      return responder({});
    });
    const linha = linhaDeAssinatura({ resgate_reservado_id: "resgate-9" });
    const banco = bancoFalso({ assinaturas: [linha] });

    await cancelarAssinaturaCartao(comoAdmin(banco), linha, "usuario");

    const nomes = banco.rpcs.map((r) => r.nome);
    expect(nomes).toContain("processar_pagamento_aprovado");
    expect(nomes).not.toContain("liberar_reserva_cupom");
    expect(banco.assinatura(linha.id)?.situacao).toBe("cancelada");
  });

  it("já cancelada ou falhou: não chama o Mercado Pago", async () => {
    simularMercadoPago(() => responder({}));
    for (const situacao of ["cancelada", "falhou"] as const) {
      const linha = linhaDeAssinatura({ situacao });
      await cancelarAssinaturaCartao(comoAdmin(bancoFalso({ assinaturas: [linha] })), linha, "usuario");
    }
    expect(chamadas).toHaveLength(0);
  });
});

// ── Cobranças (faturas da assinatura) ───────────────────────────────────────

describe("processarFatura", () => {
  const fatura = (over: Record<string, unknown> = {}) => ({
    id: 9001,
    preapproval_id: "2c938084pre1",
    status: "processed",
    payment: { id: 555, status: "approved" },
    debit_date: "2026-10-23T15:00:00.000Z",
    ...over,
  });

  const pagamento = (over: Record<string, unknown> = {}) => ({
    id: 555,
    status: "approved",
    transaction_amount: 34.9,
    payment_type_id: "credit_card",
    payment_method_id: "visa",
    ...over,
  });

  it("aprovada: vai para processar_pagamento_aprovado como cartao_automatico", async () => {
    // Sem operation_type nem metadata no pagamento: quem diz que é da
    // assinatura é a fatura (recorrente: true).
    simularMercadoPago(() => responder(pagamento()));
    const linha = linhaDeAssinatura({ ultima_recusa_em: dias(-2) });
    const banco = bancoFalso({
      assinaturas: [linha],
      rpc: (nome) => (nome === "processar_pagamento_aprovado" ? { data: { ja_processado: false, dias: 30 } } : {}),
    });

    const r = await processarFatura(comoAdmin(banco), linha, fatura(), "webhook");

    expect(r).toBe("aprovada");
    expect(chamadas.map((c) => `${c.metodo} ${caminho(c)}`)).toEqual(["GET /v1/payments/555"]);
    expect(banco.rpcs).toHaveLength(1);
    expect(banco.rpcs[0].nome).toBe("processar_pagamento_aprovado");
    expect(banco.rpcs[0].args).toMatchObject({
      p_payment_id: "555",
      p_user_id: USUARIO,
      p_origem: "webhook",
      p_meio: "cartao_automatico",
      p_valor: 34.9,
      p_cupom_id: null,
    });
    // A recusa anterior deixou de valer.
    expect(banco.assinatura(linha.id)?.ultima_recusa_em).toBeNull();
  });

  it("aprovada com o valor do desconto: a mensalidade do cupom vai junto", async () => {
    simularMercadoPago(() => responder(pagamento({ transaction_amount: 27.92 })));
    const linha = linhaDeAssinatura();
    const banco = bancoFalso({
      assinaturas: [linha],
      resgates: [
        {
          coupon_id: CUPOM,
          desconto_tipo: "percent",
          desconto_valor: 20,
          duracao_meses: 3,
          para_sempre: false,
          mensalidades_usadas: 0,
          encerrado_em: null,
          coupons: { code: "PROMO20" },
        },
      ],
      rpc: () => ({ data: { ja_processado: false, dias: 30, cupom_contado: true } }),
    });

    await processarFatura(comoAdmin(banco), linha, fatura(), "cron");

    expect(banco.rpcs[0].args).toMatchObject({ p_origem: "cron", p_meio: "cartao_automatico", p_cupom_id: CUPOM, p_cupom_duracao: 3 });
  });

  it("recusada na fatura mais recente: marca ultima_recusa_em", async () => {
    simularMercadoPago(() => responder(pagamento({ status: "rejected" })));
    const linha = linhaDeAssinatura();
    const banco = bancoFalso({ assinaturas: [linha] });

    const r = await processarFatura(comoAdmin(banco), linha, fatura({ status: "recycling", payment: { id: 555, status: "rejected" } }), "cron", true);

    expect(r).toBe("recusada");
    expect(banco.assinatura(linha.id)?.ultima_recusa_em).toBeTruthy();
    expect(banco.rpcs).toHaveLength(0);
  });

  it("recusa antiga (contaRecusa false): não reacende o aviso", async () => {
    simularMercadoPago(() => responder(pagamento({ status: "rejected" })));
    const linha = linhaDeAssinatura();
    const banco = bancoFalso({ assinaturas: [linha] });

    const r = await processarFatura(comoAdmin(banco), linha, fatura({ payment: { id: 555, status: "rejected" } }), "cron", false);

    expect(r).toBe("recusada");
    expect(banco.assinatura(linha.id)?.ultima_recusa_em).toBeNull();
  });

  it("em nova tentativa sem pagamento ainda (recycling): recusa só quando conta", async () => {
    simularMercadoPago(() => responder({}));
    const linha = linhaDeAssinatura();
    const banco = bancoFalso({ assinaturas: [linha] });

    expect(await processarFatura(comoAdmin(banco), linha, fatura({ status: "recycling", payment: null }), "cron", false)).toBe("recusada");
    expect(banco.assinatura(linha.id)?.ultima_recusa_em).toBeNull();

    expect(await processarFatura(comoAdmin(banco), linha, fatura({ status: "recycling", payment: null }), "cron", true)).toBe("recusada");
    expect(banco.assinatura(linha.id)?.ultima_recusa_em).toBeTruthy();
    expect(chamadas).toHaveLength(0);
  });

  it("agendada, sem pagamento: pendente, sem tocar em nada", async () => {
    simularMercadoPago(() => responder({}));
    const linha = linhaDeAssinatura();
    const banco = bancoFalso({ assinaturas: [linha] });

    expect(await processarFatura(comoAdmin(banco), linha, fatura({ status: "scheduled", payment: null }), "cron")).toBe("pendente");
    expect(chamadas).toHaveLength(0);
    expect(banco.rpcs).toHaveLength(0);
  });

  it("recusa numa assinatura que não está ativa não marca nada", async () => {
    simularMercadoPago(() => responder(pagamento({ status: "rejected" })));
    const linha = linhaDeAssinatura({ situacao: "cancelada", cancelada_em: dias(-1), cancelada_por: "usuario" });
    const banco = bancoFalso({ assinaturas: [linha] });

    await processarFatura(comoAdmin(banco), linha, fatura({ payment: { id: 555, status: "rejected" } }), "cron");
    expect(banco.assinatura(linha.id)?.ultima_recusa_em).toBeNull();
  });
});

// ── Adoção: o aviso do Mercado Pago traz uma assinatura que a tabela não liga ─

describe("adotarAssinatura", () => {
  const sub = (over: Record<string, unknown> = {}) => ({
    id: "2c938084tardia",
    status: "authorized",
    external_reference: USUARIO,
    next_payment_date: dias(30),
    auto_recurring: { transaction_amount: 27.92 },
    date_created: dias(-0.01),
    ...over,
  });

  it("criação sem resposta clara ('criando'): vincula direto ao id do aviso, sem busca por e-mail", async () => {
    simularMercadoPago(() => responder({}));
    const linha = linhaDeAssinatura({ situacao: "criando", mp_preapproval_id: null, mp_status: null });
    const banco = bancoFalso({ assinaturas: [linha] });

    const r = await adotarAssinatura(comoAdmin(banco), sub());

    expect(r?.mp_preapproval_id).toBe("2c938084tardia");
    expect(banco.assinatura(linha.id)).toMatchObject({ situacao: "ativa", mp_preapproval_id: "2c938084tardia" });
    expect(chamadas).toHaveLength(0);
  });

  it("a pessoa já tem outra ativa: a do aviso é duplicata e é cancelada lá", async () => {
    silenciarLogs();
    simularMercadoPago(() => responder({ id: "2c938084tardia", status: "cancelled" }));
    const banco = bancoFalso({ assinaturas: [linhaDeAssinatura()] });

    const r = await adotarAssinatura(comoAdmin(banco), sub());

    expect(r).toBeNull();
    expect(doTipo("PUT", "/preapproval/2c938084tardia")).toHaveLength(1);
    expect(banco.assinatura("a1")?.mp_preapproval_id).toBe("2c938084pre1");
  });

  it("demos a criação como falha cedo demais: a linha volta a valer com a assinatura que existe", async () => {
    silenciarLogs();
    simularMercadoPago(() => responder({}));
    const falhou = linhaDeAssinatura({ situacao: "falhou", mp_preapproval_id: null, criada_em: dias(-0.05) });
    const banco = bancoFalso({ assinaturas: [falhou] });

    const r = await adotarAssinatura(comoAdmin(banco), sub());

    expect(r?.situacao).toBe("ativa");
    expect(banco.assinatura(falhou.id)).toMatchObject({ situacao: "ativa", mp_preapproval_id: "2c938084tardia" });
  });

  it("referência que não é conta nossa, ou assinatura já cancelada: não mexe em nada", async () => {
    simularMercadoPago(() => responder({}));
    const linha = linhaDeAssinatura({ situacao: "criando", mp_preapproval_id: null });
    const banco = bancoFalso({ assinaturas: [linha] });

    expect(await adotarAssinatura(comoAdmin(banco), sub({ external_reference: "pedido-123" }))).toBeNull();
    expect(await adotarAssinatura(comoAdmin(banco), sub({ status: "cancelled" }))).toBeNull();
    expect(banco.assinatura(linha.id)?.situacao).toBe("criando");
    expect(chamadas).toHaveLength(0);
  });
});
