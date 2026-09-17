-- =============================================================================
-- A20 — Vínculo cross-tenant em grupo_membros
-- Auditoria: docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
--
-- PROBLEMA
--   A policy validava apenas psicologo_id = auth.uid(). Nada verificava que o
--   paciente_id e o grupo_id pertenciam ao mesmo psicólogo. Como a verificação
--   de chave estrangeira no Postgres IGNORA RLS, o INSERT com paciente_id de
--   outro psicólogo era aceito. Efeitos:
--     - oráculo de existência de UUID de paciente alheio;
--     - JOIN feito por rota service_role passa a cruzar tenants;
--     - ON DELETE CASCADE: o dono legítimo, ao excluir o paciente, altera em
--       silêncio o grupo de outra pessoa.
--
-- IDEMPOTENTE.
-- =============================================================================

DROP POLICY IF EXISTS "grupo_membros_insert_own" ON public.grupo_membros;
CREATE POLICY "grupo_membros_insert_own" ON public.grupo_membros
FOR INSERT TO authenticated
WITH CHECK (
  psicologo_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.pacientes p
    WHERE p.id = paciente_id AND p.psicologo_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.grupos g
    WHERE g.id = grupo_id AND g.psicologo_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "grupo_membros_update_own" ON public.grupo_membros;
CREATE POLICY "grupo_membros_update_own" ON public.grupo_membros
FOR UPDATE TO authenticated
USING (psicologo_id = auth.uid())
WITH CHECK (
  psicologo_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.pacientes p
    WHERE p.id = paciente_id AND p.psicologo_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.grupos g
    WHERE g.id = grupo_id AND g.psicologo_id = auth.uid()
  )
);

-- Mesmo raciocínio para a sessão de grupo referenciada pelo prontuário.
DROP POLICY IF EXISTS "prontuarios_insert_own" ON public.prontuarios;
CREATE POLICY "prontuarios_insert_own" ON public.prontuarios
FOR INSERT TO authenticated
WITH CHECK (
  psicologo_id = auth.uid()
  AND (
    paciente_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.pacientes p
      WHERE p.id = paciente_id AND p.psicologo_id = auth.uid()
    )
  )
);

-- Diagnóstico: vínculos cross-tenant que já existam hoje.
DO $$
DECLARE
  v_cruzados bigint;
BEGIN
  SELECT count(*) INTO v_cruzados
  FROM public.grupo_membros gm
  JOIN public.pacientes p ON p.id = gm.paciente_id
  WHERE p.psicologo_id IS DISTINCT FROM gm.psicologo_id;

  IF v_cruzados > 0 THEN
    RAISE WARNING 'A20: % vinculo(s) de grupo_membros apontam para paciente de OUTRO psicologo. Estes sao anteriores a esta policy — investigue antes de limpar: SELECT gm.* FROM public.grupo_membros gm JOIN public.pacientes p ON p.id = gm.paciente_id WHERE p.psicologo_id IS DISTINCT FROM gm.psicologo_id;', v_cruzados;
  ELSE
    RAISE NOTICE 'A20 aplicado. Nenhum vinculo cross-tenant preexistente.';
  END IF;
END $$;
