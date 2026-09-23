import { linkWhatsApp } from "./whatsapp";

/**
 * Contato do PsiSetting para quem visita o site institucional
 * (app/components/whatsapp-duvidas.tsx).
 *
 * O número vai escrito como uma pessoa o anota, e o link sai pelo mesmo
 * linkWhatsApp dos pacientes: o DDD 55 (Santa Maria, RS) é igual ao código do
 * Brasil, e é justamente esse caso que ele já sabe não duplicar nem cortar.
 */

export const WHATSAPP_PSISETTING = "+55 55 99654-7714";

// Chega pronta na caixa de texto: a pessoa só aperta enviar, e quem responde
// já sabe de onde veio a conversa.
export const MENSAGEM_DUVIDAS = "Olá! Vim pelo site do PsiSetting e tenho uma dúvida.";

export function linkWhatsAppDuvidas(): string {
  const link = linkWhatsApp(WHATSAPP_PSISETTING, MENSAGEM_DUVIDAS);
  // O número é fixo e o teste (tests/contato.test.ts) confere o link exato;
  // chegar aqui é erro de digitação na constante, não dado do usuário.
  if (!link) throw new Error(`Número de WhatsApp do PsiSetting inválido: ${WHATSAPP_PSISETTING}`);
  return link;
}
