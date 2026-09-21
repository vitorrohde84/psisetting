/**
 * Número e link do WhatsApp a partir do telefone como o sistema guarda.
 *
 * O cadastro de paciente grava só os dígitos, sem o código do país (a máscara
 * é brasileira). O telefone do perfil do psicólogo pode vir formatado ou já
 * com +55. Tudo vira o formato do wa.me: 55 + DDD + número.
 *
 * Número incompleto ou inválido devolve null: quem chama não mostra o botão,
 * em vez de montar um link que abre o WhatsApp num número errado.
 */

// Não existe DDD começando nem terminando em 0 (01, 10, 20…).
const DDD_VALIDO = /^[1-9][1-9]/;

function numeroNacional(digitos: string): string | null {
  // Celular: DDD + 9 + 8 dígitos.
  if (digitos.length === 11 && DDD_VALIDO.test(digitos) && digitos[2] === "9") return digitos;
  // Fixo: DDD + 8 dígitos — existe WhatsApp Business em número fixo.
  if (digitos.length === 10 && DDD_VALIDO.test(digitos)) return digitos;
  return null;
}

export function numeroWhatsApp(telefone: string | null | undefined): string | null {
  const digitos = (telefone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  // Mais de 11 dígitos começando com 55 é o código do país já incluído.
  // Com até 11, um 55 inicial é o DDD de Santa Maria (RS) e fica.
  const semPais = digitos.length > 11 && digitos.startsWith("55") ? digitos.slice(2) : digitos;
  const nacional = numeroNacional(semPais);
  return nacional ? `55${nacional}` : null;
}

export function linkWhatsApp(telefone: string | null | undefined, mensagem?: string): string | null {
  const numero = numeroWhatsApp(telefone);
  if (!numero) return null;
  return mensagem
    ? `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`
    : `https://wa.me/${numero}`;
}
