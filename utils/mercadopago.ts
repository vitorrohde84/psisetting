import { randomUUID } from "crypto";
import { Invoice, MercadoPagoConfig, PreApproval, Payment } from "mercadopago";

const OPCOES_PADRAO = { timeout: 10000 };

// Inicializa a configuração do Mercado Pago com o token seguro
export const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || "",
  options: OPCOES_PADRAO,
});

/**
 * Clientes COMPARTILHADOS de assinatura e de fatura: só leitura (get e search),
 * pelo mesmo motivo do paymentClient abaixo — no SDK 3.4 PreApproval e Invoice
 * também gravam as requestOptions na configuração compartilhada. Criar e
 * alterar assinatura é por criarAssinaturaMP e atualizarAssinaturaMP.
 */
export const preApprovalClient = new PreApproval(mpClient);
export const invoiceClient = new Invoice(mpClient);

/**
 * Cliente COMPARTILHADO: só para leitura (get e search).
 *
 * NÃO use para criar pagamento. No SDK 3.4, `create({ requestOptions })` faz
 * `this.config.options = { ...this.config.options, ...requestOptions }` — a
 * chave de idempotência de UMA chamada fica gravada na configuração
 * compartilhada e passa a ir em todo POST seguinte do mesmo processo. O
 * Mercado Pago trata o POST seguinte como repetição e devolve o pagamento
 * anterior: o PIX de outra pessoa sairia com o QR errado, ou não sairia.
 * Criar pagamento é sempre por criarPagamento, abaixo.
 */
export const paymentClient = new Payment(mpClient);

type CorpoPagamento = Parameters<Payment["create"]>[0]["body"];

/**
 * Cria um pagamento com um cliente NOVO por chamada e chave de idempotência
 * sempre explícita.
 *
 * - Cliente novo: a chave desta chamada não vaza para nenhuma outra (ver acima).
 * - Chave explícita: sem ela o SDK gera uma aleatória, e um reenvio da mesma
 *   requisição (rede instável, clique duplo) viraria uma segunda cobrança. Quem
 *   chama passa uma chave estável quando existe (o token do cartão); senão, uma
 *   aleatória, que ao menos não é compartilhada com ninguém.
 */
export function criarPagamento(body: CorpoPagamento, chaveIdempotencia?: string) {
  const cliente = new Payment(
    new MercadoPagoConfig({
      accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || "",
      options: { ...OPCOES_PADRAO, idempotencyKey: chaveIdempotencia || randomUUID() },
    })
  );
  return cliente.create({ body });
}

/**
 * Cancela um pagamento ainda não aprovado (PIX pendente). Cliente novo pelo
 * mesmo motivo de criarPagamento: escrita nunca passa pelo compartilhado. Se o
 * pagamento já foi aprovado, o Mercado Pago recusa e isto lança erro — quem
 * chama relê o pagamento e credita. Sem chave de idempotência fixa: uma chave
 * presa ao id faria o Mercado Pago devolver a resposta guardada de uma tentativa
 * que falhou por rede, e cancelar duas vezes não cobra nada de ninguém.
 */
export function cancelarPagamento(id: string) {
  const cliente = new Payment(
    new MercadoPagoConfig({
      accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || "",
      options: { ...OPCOES_PADRAO },
    })
  );
  return cliente.cancel({ id });
}

type CorpoAssinatura = Parameters<PreApproval["create"]>[0]["body"];
type AlteracaoAssinatura = Parameters<PreApproval["update"]>[0]["body"];

function clienteDeAssinatura(opcoes: { timeout: number; maxRetries?: number }) {
  return new PreApproval(
    new MercadoPagoConfig({
      accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || "",
      options: opcoes,
    })
  );
}

/**
 * Cria a assinatura (preapproval) com cliente novo e SEM novas tentativas.
 *
 * O /preapproval não tem idempotência documentada. Com as tentativas do SDK
 * (até 3 em 5xx, erro de rede ou tempo esgotado), um pedido que o Mercado Pago
 * concluiu mas respondeu devagar seria reenviado — e viraria uma SEGUNDA
 * assinatura cobrando o mesmo cartão. Aqui uma falha ambígua sobe para quem
 * chamou, que procura a assinatura no Mercado Pago antes de qualquer nova
 * tentativa (utils/assinatura-cartao-servidor.ts). Timeout maior pelo mesmo
 * motivo: é melhor esperar do que ficar sem saber.
 */
export function criarAssinaturaMP(body: CorpoAssinatura) {
  return clienteDeAssinatura({ timeout: 25_000, maxRetries: 0 }).create({ body });
}

/**
 * Muda valor ou status (cancelar) de uma assinatura. Cliente novo: escrita
 * nunca passa pelo compartilhado. Repetir é inofensivo (mesmo valor, mesmo
 * status), então aqui as tentativas do SDK ficam ligadas.
 */
export function atualizarAssinaturaMP(id: string, body: AlteracaoAssinatura) {
  return clienteDeAssinatura({ ...OPCOES_PADRAO }).update({ id, body });
}
