-- =============================================================================
-- A10 — Integridade de tenant nas tabelas clínicas
-- Auditoria: docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
--
-- PROBLEMA
--   psicologo_id foi adicionado como NULLABLE com DEFAULT auth.uid(). Três
--   consequências:
--     a) linha com psicologo_id NULL some para todo tenant via RLS (NULL =
--        auth.uid() é NULL), mas continua visível a TODA query service_role —
--        e o app tem 8+ rotas service_role. É registro clínico órfão.
--     b) DEFAULT auth.uid() em ADD COLUMN é avaliado UMA vez, no ALTER. Rodado
--        no SQL Editor (sem JWT) grava NULL; rodado por sessão autenticada,
--        carimba o UUID de quem rodou em todas as linhas legadas.
--     c) o backfill existe em security-hardening.sql e NÃO existe no
--        full-system-...sql; e agendamentos nunca teve backfill em script algum.
--
-- ESTA MIGRAÇÃO PODE FALHAR DE PROPÓSITO.
--   Se sobrarem órfãos, ela aborta e mostra a contagem por tabela. Isso é
--   intencional: transformar órfão em NOT NULL no chute significaria atribuir
--   prontuário de alguém a outra pessoa. Limpe e rode de novo.
--   Ela é um arquivo separado justamente para que essa falha NÃO desfaça a
--   migração de privilégio (20260917120000).
--
-- IDEMPOTENTE.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Backfill a partir do paciente dono (inclui agendamentos, que faltava)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.prontuarios t SET psicologo_id = p.psicologo_id
  FROM public.pacientes p WHERE t.paciente_id = p.id AND t.psicologo_id IS NULL;

UPDATE public.diario_bordo t SET psicologo_id = p.psicologo_id
  FROM public.pacientes p WHERE t.paciente_id = p.id AND t.psicologo_id IS NULL;

UPDATE public.laudos t SET psicologo_id = p.psicologo_id
  FROM public.pacientes p WHERE t.paciente_id = p.id AND t.psicologo_id IS NULL;

UPDATE public.pagamentos t SET psicologo_id = p.psicologo_id
  FROM public.pacientes p WHERE t.paciente_id = p.id AND t.psicologo_id IS NULL;

UPDATE public.agendamentos t SET psicologo_id = p.psicologo_id
  FROM public.pacientes p WHERE t.paciente_id = p.id AND t.psicologo_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Conferir órfãos e só então travar com NOT NULL
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tabela   text;
  v_tabelas  text[] := ARRAY[
    'pacientes', 'agendamentos', 'prontuarios',
    'diario_bordo', 'laudos', 'pagamentos'
  ];
  v_orfas    bigint;
  v_total    bigint := 0;
  v_relatorio text := '';
BEGIN
  -- 2a. Contagem de órfãos por tabela
  FOREACH v_tabela IN ARRAY v_tabelas LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE psicologo_id IS NULL', v_tabela)
      INTO v_orfas;
    v_total := v_total + v_orfas;
    IF v_orfas > 0 THEN
      v_relatorio := v_relatorio || format('  %s: %s linha(s) sem dono%s', v_tabela, v_orfas, chr(10));
    END IF;
  END LOOP;

  IF v_total > 0 THEN
    RAISE EXCEPTION E'A10 abortado: % registro(s) clinico(s) sem psicologo_id.\n%\nInvestigue antes de prosseguir — atribuir dono no chute e violar o sigilo do paciente.\nConsulta: SELECT * FROM public.<tabela> WHERE psicologo_id IS NULL;',
      v_total, v_relatorio;
  END IF;

  -- 2b. Sem órfãos: aplicar NOT NULL e remover o DEFAULT enganoso
  FOREACH v_tabela IN ARRAY v_tabelas LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN psicologo_id SET NOT NULL', v_tabela);
    -- O DEFAULT auth.uid() dá falsa sensação de segurança: só vale no INSERT
    -- direto e é avaliado no momento errado em ADD COLUMN. O dono passa a vir
    -- do WITH CHECK da policy, que é o lugar certo.
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN psicologo_id SET DEFAULT auth.uid()', v_tabela);
  END LOOP;

  RAISE NOTICE 'A10 aplicado: psicologo_id agora e NOT NULL nas 6 tabelas clinicas.';
END $$;
