-- =============================================================================
-- A13 — Rate limit compartilhado
-- Auditoria: docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
--
-- PROBLEMA
--   utils/rate-limit.ts guarda as contagens num Map em memória. Na Vercel cada
--   invocação serverless tem o seu, e o Map some no cold start. O limite de "5
--   tentativas por 15 minutos" vira "5 por instância, até a próxima reciclagem"
--   — ou seja, não é um limite.
--
-- SOLUÇÃO
--   Contador no Postgres, que é o único estado compartilhado que o projeto já
--   tem. Uma ida ao banco por requisição limitada; só as rotas sensíveis passam
--   por aqui.
--
-- IDEMPOTENTE.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key        TEXT PRIMARY KEY,
  count      INTEGER     NOT NULL DEFAULT 0,
  reset_at   TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_reset_at
  ON public.rate_limit_buckets (reset_at);

-- RLS ligada e SEM policy: nega a authenticated e anon por completo.
-- Só service_role (que ignora RLS) e a função SECURITY DEFINER abaixo entram.
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- Incremento atômico: o UPSERT resolve a corrida entre requisições
-- simultâneas, que é justamente o cenário de um ataque de força bruta.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key            TEXT,
  p_max            INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_row public.rate_limit_buckets%ROWTYPE;
BEGIN
  INSERT INTO public.rate_limit_buckets AS b (key, count, reset_at, updated_at)
  VALUES (p_key, 1, v_now + make_interval(secs => p_window_seconds), v_now)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE WHEN b.reset_at < v_now THEN 1 ELSE b.count + 1 END,
        reset_at = CASE
                     WHEN b.reset_at < v_now
                     THEN v_now + make_interval(secs => p_window_seconds)
                     ELSE b.reset_at
                   END,
        updated_at = v_now
  RETURNING * INTO v_row;

  -- Limpeza oportunista: 1% das chamadas varre o que expirou há mais de 1 dia.
  -- Evita tanto a tabela crescer sem fim quanto um cron só para isto.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_buckets WHERE reset_at < v_now - INTERVAL '1 day';
  END IF;

  RETURN QUERY SELECT
    v_row.count <= p_max,
    GREATEST(p_max - v_row.count, 0),
    v_row.reset_at;
END $$;

-- A função só pode ser chamada pelo servidor, nunca pelo navegador.
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

DO $$
BEGIN
  RAISE NOTICE 'A13 aplicado: rate limit compartilhado em public.rate_limit_buckets.';
END $$;
