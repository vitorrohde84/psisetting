/**
 * Utilitário de Rate Limiting (Limitador de Requisições) em Memória.
 * Protege rotas sensíveis contra ataques de força bruta, DoS e spam.
 */

interface RateLimitRecord {
  count: number;
  resetTime: number;
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
 * Verifica se a requisição ultrapassou o limite permitido.
 * @param identifier Identificador único (ex: IP + rota ou userId + ação)
 * @param maxRequests Limite máximo de requisições na janela
 * @param windowMs Duração da janela em milissegundos
 */
export function checkRateLimit(
  identifier: string,
  maxRequests: number,
  windowMs: number
): { success: boolean; remaining: number; resetTime: number } {
  cleanExpiredRecords();
  const now = Date.now();
  const record = rateLimitStore.get(identifier);

  if (!record || record.resetTime < now) {
    // Nova janela
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      success: true,
      remaining: maxRequests - 1,
      resetTime: now + windowMs,
    };
  }

  if (record.count >= maxRequests) {
    // Limite estourado
    return {
      success: false,
      remaining: 0,
      resetTime: record.resetTime,
    };
  }

  record.count += 1;
  return {
    success: true,
    remaining: maxRequests - record.count,
    resetTime: record.resetTime,
  };
}

/**
 * Obtém o endereço IP do cliente a partir dos cabeçalhos da requisição
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
