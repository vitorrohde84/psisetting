import { timingSafeEqual } from "crypto";

/**
 * A Vercel chama os crons com "Authorization: Bearer <CRON_SECRET>" quando a
 * variável existe no projeto. Sem a variável, fecha: a rota é pública no
 * middleware (não há sessão num cron), então o segredo é a única porta.
 */
export function cronAutorizado(header: string | null, segredo: string | undefined): boolean {
  if (!segredo) return false;
  const esperado = Buffer.from(`Bearer ${segredo}`, "utf8");
  const recebido = Buffer.from(header ?? "", "utf8");
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}
