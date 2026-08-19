import { MercadoPagoConfig, PreApproval, Preference, Payment } from "mercadopago";

// Inicializa a configuração do Mercado Pago com o token seguro
export const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || "",
  options: { timeout: 10000 },
});

export const preApprovalClient = new PreApproval(mpClient);
export const preferenceClient = new Preference(mpClient);
export const paymentClient = new Payment(mpClient);
