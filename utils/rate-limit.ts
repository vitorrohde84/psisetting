/**
 * Utilitário de Rate Limiting (Limitador de Requisições).
 * Protege rotas sensíveis contra ataques de força bruta, DoS e spam.
 *
 * A13 — docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
 *
 * A versão anterior guardava as contagens num Map em memória. Em ambiente
 * serverless (Vercel) cada invocação tem o seu Map e ele some no cold start:
 * "5 tentativas por 15 minutos" virava "5 por instância, até reciclar" — o que
 * não é um limite. O contador agora vive no Postgres, que é o único estado
 * compartilhado que o projeto já possui.
 *
 * Degradação: se o banco não responder, cai para o contador em memória em vez
 * de liberar geral. Protege menos que o Postgres, protege mais que nada — e a
 * ocorrência é registrada, nunca silenciada.
 */

import { createAdminClient } from "./supabase/admin";

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetTime: number;
  /** true quando o contador compartilhado falhou e usamos o de memória. */
  degraded?: boolean;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

function cleanExpiredRecords() {
  if (rateLimitStore.size > 500) {
    const now = Date.now();
    rateLimitStore.forEach((record, key) => {
      if (record.resetTime < now) {
        rateLimitStore.delete(key);
      }
    });
  }
}

/**
 * Contador em memória. Fallback apenas — não use diretamente em rota nova.
 */
export function checkRateLimitInMemory(
  identifier: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  cleanExpiredRecords();
  const now = Date.now();
  const record = rateLimitStore.get(identifier);

  if (!record || record.resetTime < now) {
    rateLimitStore.set(identifier, { count: 1, resetTime: now + windowMs });
    return { success: true, remaining: maxRequests - 1, resetTime: now + windowMs };
  }

  if (record.count >= maxRequests) {
    return { success: false, remaining: 0, resetTime: record.resetTime };
  }

  record.count += 1;
  return {
    success: true,
    remaining: maxRequests - record.count,
    resetTime: record.resetTime,
  };
}

/**
 * Verifica se a requisição ultrapassou o limite permitido, usando o contador
 * compartilhado no Postgres (incremento atômico, resolve corrida entre
 * requisições simultâneas — que é o cenário de um ataque de força bruta).
 *
 * @param identifier Identificador único (ex: "register:<ip>" ou "acao:<userId>")
 * @param maxRequests Limite máximo de requisições na janela
 * @param windowMs Duração da janela em milissegundos
 */
export async function checkRateLimit(
  identifier: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_key: identifier,
      p_max: maxRequests,
      p_window_seconds: Math.ceil(windowMs / 1000),
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("check_rate_limit não retornou linha.");

    return {
      success: Boolean(row.allowed),
      remaining: Number(row.remaining ?? 0),
      resetTime: new Date(row.reset_at).getTime(),
    };
  } catch (err) {
    // Falha alto no log, degrada baixo no comportamento.
    console.error(
      "[rate-limit] contador compartilhado indisponível, usando memória:",
      err
    );
    return {
      ...checkRateLimitInMemory(identifier, maxRequests, windowMs),
      degraded: true,
    };
  }
}

/**
 * Obtém o endereço IP do cliente a partir dos cabeçalhos da requisição.
 *
 * Atenção: x-forwarded-for é forjável quando a requisição não passa por um
 * proxy que o sobrescreva. Na Vercel ele é confiável. Para ações associadas a
 * uma conta, prefira usar o userId como identificador em vez do IP.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp.trim();
  }
  return "127.0.0.1";
}
