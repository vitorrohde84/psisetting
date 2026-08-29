-- ==============================================================================
-- 🔒 ATUALIZAÇÃO DE SEGURANÇA: BLINDAGEM DE STORAGE CONTRA IDOR
-- Finalidade: Garantir que o bucket 'laudos' valide a pasta do psicólogo logado.
-- ==============================================================================

-- 1. Garantir que o bucket 'laudos' é privado (não público)
UPDATE storage.buckets
SET public = false
WHERE id = 'laudos';

-- 2. Remover política antiga que apenas checava auth.uid() IS NOT NULL
DROP POLICY IF EXISTS "laudos_storage_owner_only" ON storage.objects;
DROP POLICY IF EXISTS "laudos_storage_isolate_user" ON storage.objects;

-- 3. Criar política restritiva que exige que a primeira pasta seja o auth.uid() do usuário logado
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
