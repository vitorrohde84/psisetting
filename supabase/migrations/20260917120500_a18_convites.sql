-- =============================================================================
-- A18 — Convites: expiração e consumo atômico
-- Auditoria: docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
--
-- PROBLEMA
--   a) A tabela não tinha expires_at: convite emitido é credencial eterna.
--   b) O consumo era check-then-write sem transação: duas requisições
--      simultâneas com o mesmo código validavam as duas e criavam duas contas.
--
-- reserved_at é a trava de corrida: o UPDATE condicional em app/api/auth/
-- register só deixa uma requisição passar, porque o Postgres serializa o
-- UPDATE da mesma linha.
--
-- IDEMPOTENTE.
-- =============================================================================

ALTER TABLE public.invites ADD COLUMN IF NOT EXISTS expires_at  TIMESTAMPTZ;
ALTER TABLE public.invites ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ;

-- Convites antigos e ainda abertos ganham prazo em vez de valerem para sempre.
UPDATE public.invites
SET expires_at = COALESCE(created_at, now()) + INTERVAL '14 days'
WHERE used_by IS NULL AND expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invites_code_aberto
  ON public.invites (code) WHERE used_by IS NULL;

DO $$
DECLARE
  v_abertos int;
  v_vencidos int;
BEGIN
  SELECT count(*) INTO v_abertos  FROM public.invites WHERE used_by IS NULL;
  SELECT count(*) INTO v_vencidos FROM public.invites
    WHERE used_by IS NULL AND expires_at < now();

  RAISE NOTICE 'A18 aplicado. Convites em aberto: % (dos quais % ja vencidos).',
    v_abertos, v_vencidos;
END $$;
