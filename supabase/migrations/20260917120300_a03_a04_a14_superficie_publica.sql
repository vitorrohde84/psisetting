-- =============================================================================
-- A03 + A04 + A14 — Superfície pública: token de calendário e Storage
-- Auditoria: docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
-- IDEMPOTENTE.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- A03 — Revogar o token de calendário que está no repositório
--
--   supabase-multiuser-migration.sql:19 gravou o literal
--   'hellen-cal-a7f3e9b2d1c8' em todo perfil sem token. Quem lê o repositório
--   acessa aquele feed sem autenticação nenhuma. Segredo em código versionado
--   não se "remove depois": o histórico do git é permanente, então o único
--   desfecho é rotacionar.
--
--   Também rotaciona qualquer token curto demais (< 32 caracteres), que só
--   pode ter vindo daquele mesmo período.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_rotacionados int;
BEGIN
  UPDATE public.profiles
  SET calendar_token = encode(gen_random_bytes(32), 'hex')
  WHERE calendar_token IS NULL
     OR calendar_token = 'hellen-cal-a7f3e9b2d1c8'
     OR length(calendar_token) < 32;

  GET DIAGNOSTICS v_rotacionados = ROW_COUNT;
  RAISE NOTICE 'A03: % token(s) de calendario rotacionado(s).', v_rotacionados;

  IF v_rotacionados > 0 THEN
    RAISE NOTICE 'ATENCAO: quem usava esses links precisa reassinar o calendario em Configuracoes. O link antigo deixou de funcionar — que e o objetivo.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- A04 — IDOR de laudos no Storage
--
--   full-system-security-audit-and-hardening.sql:207 criava:
--       USING (bucket_id = 'laudos' AND auth.uid() IS NOT NULL)
--   que significa apenas "estou logado" — qualquer psicólogo lia, sobrescrevia
--   e apagava o PDF de laudo de qualquer outro. Políticas de RLS são
--   PERMISSIVAS e combinam por OR, então a policy correta por pasta que existia
--   em outro script não anulava esta: bastava uma passar.
--
--   O bucket continua privado; o acesso é por URL assinada de 10 minutos.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "laudos_storage_owner_only" ON storage.objects;   -- a permissiva
DROP POLICY IF EXISTS "laudos_insert_own"         ON storage.objects;
DROP POLICY IF EXISTS "laudos_select_own"         ON storage.objects;
DROP POLICY IF EXISTS "laudos_update_own"         ON storage.objects;
DROP POLICY IF EXISTS "laudos_delete_own"         ON storage.objects;
DROP POLICY IF EXISTS "laudos_storage_isolate_user" ON storage.objects;

UPDATE storage.buckets SET public = false WHERE id = 'laudos';

CREATE POLICY "laudos_storage_isolate_user" ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'laudos'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'laudos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ─────────────────────────────────────────────────────────────────────────────
-- A14 — Enumeração no bucket de logos
--
--   supabase-multiuser-migration.sql:100 criava um SELECT `TO public` sobre
--   TODOS os objetos do bucket, sem escopo de pasta — o único ponto do sistema
--   com leitura concedida a `anon`. Isso permite LISTAR o bucket e, com isso,
--   enumerar os UUIDs de todos os psicólogos cadastrados.
--
--   DECISÃO, com o trade-off na mesa: o bucket `logos` permanece público para
--   SERVIR objeto por URL direta. Torná-lo privado exigiria trocar as três
--   montagens de URL pública por URL assinada, incluindo o cabeçalho impresso
--   dos laudos — e um erro ali some com o timbre de documento oficial do CFP,
--   silenciosamente. O ganho não paga esse risco agora.
--
--   Removendo a policy, a ENUMERAÇÃO morre (listar passa a ser negado) e a
--   exibição continua funcionando, porque bucket público serve
--   /object/public/... sem consultar RLS.
--
--   RISCO RESIDUAL ACEITO: quem já souber o UUID de um psicólogo e o nome do
--   arquivo ainda busca aquele logo. É material de marca, não dado clínico.
--   Fechar isso de vez = bucket privado + URL assinada, registrado como dívida.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "logos_select_public" ON storage.objects;

DROP POLICY IF EXISTS "logos_insert_own" ON storage.objects;
CREATE POLICY "logos_insert_own" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "logos_update_own" ON storage.objects;
CREATE POLICY "logos_update_own" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "logos_delete_own" ON storage.objects;
CREATE POLICY "logos_delete_own" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificação
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_permissiva int;
  v_publica    int;
BEGIN
  SELECT count(*) INTO v_permissiva
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'laudos_storage_owner_only';

  SELECT count(*) INTO v_publica
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'logos_select_public';

  IF v_permissiva > 0 OR v_publica > 0 THEN
    RAISE EXCEPTION 'Policies inseguras ainda presentes (laudos_storage_owner_only=%, logos_select_public=%).', v_permissiva, v_publica;
  END IF;

  RAISE NOTICE 'A04 + A14 aplicados: laudos isolado por pasta, enumeracao de logos fechada.';
END $$;
