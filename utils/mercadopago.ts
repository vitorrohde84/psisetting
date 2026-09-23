import { randomUUID } from "crypto";
import { MercadoPagoConfig, PreApproval, Preference, Payment } from "mercadopago";

const OPCOES_PADRAO = { timeout: 10000 };

// Inicializa a configuração do Mercado Pago com o token seguro
export const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || "",
  options: OPCOES_PADRAO,
});

export const preApprovalClient = new PreApproval(mpClient);
export const preferenceClient = new Preference(mpClient);

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
