-- =============================================================================
-- A05 + A06 + A08 + A11 — Cadeia de pagamento
-- Auditoria: docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
-- IDEMPOTENTE.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Idempotência de pagamento (A06 + A08)
--
--    Sem registro do que já foi processado, tanto pix/check quanto o webhook
--    podiam ser chamados de novo com o mesmo payment_id, somando +30 dias a
--    cada repetição. A constraint UNIQUE é o mecanismo — verificar em código
--    antes de gravar reabriria a corrida.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id   TEXT        NOT NULL UNIQUE,
  user_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  origem       TEXT        NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_user ON public.payment_events (user_id);

-- RLS ligada e sem policy: nega a authenticated e anon por completo.
-- Só o servidor (service_role) escreve e lê.
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Incremento atômico de uso de cupom (A11)
--
--    O código fazia uses_count = (lido antes) + 1, com o client do usuário, e
--    sem policy de UPDATE em coupons — o update afetava 0 linhas e não
--    retornava erro. Resultado: o contador nunca saía de 0 e max_uses jamais
--    era atingido, tornando todo cupom de uso único ilimitado na prática.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_coupon_uses(p_coupon_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_novo INTEGER;
BEGIN
  UPDATE public.coupons
  SET uses_count = COALESCE(uses_count, 0) + 1
  WHERE id = p_coupon_id
  RETURNING uses_count INTO v_novo;

  IF v_novo IS NULL THEN
    RAISE EXCEPTION 'Cupom % nao encontrado.', p_coupon_id;
  END IF;

  RETURN v_novo;
END $$;

REVOKE ALL ON FUNCTION public.increment_coupon_uses(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_coupon_uses(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.increment_coupon_uses(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_coupon_uses(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Fechar o catálogo de cupons (A11)
--
--    `coupons_read_active` dava SELECT a QUALQUER autenticado sobre todo cupom
--    ativo — incluindo os de tipo 'vip', que concedem acesso vitalício. Não era
--    preciso adivinhar código nenhum: bastava listar a tabela.
--    A validação passou inteira para o servidor (utils/coupons.ts), então
--    nenhuma policy de leitura é necessária para o usuário.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coupons_read_active"           ON public.coupons;
DROP POLICY IF EXISTS "coupons_select_authenticated"  ON public.coupons;
DROP POLICY IF EXISTS "coupons_select_active"         ON public.coupons;

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
-- Sem nenhuma policy para authenticated: leitura e escrita só por service_role.

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Resgates: SELECT e INSERT apenas (A11)
--
--    `coupon_redemptions_own` era FOR ALL, e FOR ALL inclui DELETE. A tabela
--    existe justamente para impedir reuso (UNIQUE(coupon_id, profile_id)), mas
--    o usuário podia apagar o próprio resgate pelo navegador e aplicar o mesmo
--    cupom de novo, indefinidamente.
--
--    Note que o script original estava CORRETO (SELECT + INSERT) e foi o
--    "script mestre de blindagem" posterior que afrouxou para FOR ALL.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coupon_redemptions_own"            ON public.coupon_redemptions;
DROP POLICY IF EXISTS "coupon_redemptions_select_own"     ON public.coupon_redemptions;
DROP POLICY IF EXISTS "coupon_redemptions_insert_own"     ON public.coupon_redemptions;

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coupon_redemptions_select_own" ON public.coupon_redemptions
FOR SELECT TO authenticated
USING (profile_id = auth.uid());

-- Sem policy de UPDATE nem DELETE: resgate é registro histórico, não se apaga.

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Verificação
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_ruins int;
BEGIN
  SELECT count(*) INTO v_ruins
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      (tablename = 'coupons' AND 'authenticated' = ANY(roles))
      OR (tablename = 'coupon_redemptions' AND cmd IN ('ALL', 'DELETE', 'UPDATE'))
    );

  IF v_ruins > 0 THEN
    RAISE EXCEPTION 'Ainda existem % policy(ies) permissivas em coupons/coupon_redemptions.', v_ruins;
  END IF;

  RAISE NOTICE 'A05/A06/A08/A11 aplicados: idempotencia de pagamento e cupons fechados.';
END $$;
