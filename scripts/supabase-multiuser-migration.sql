-- ==========================================================
-- MIGRAÇÃO: Suporte a Múltiplos Psicólogos
-- Execute no Supabase Dashboard > SQL Editor
-- Data: 2026-08-05
-- ==========================================================

-- ──────────────────────────────────────────
-- 1. ATUALIZAR TABELA profiles
-- ──────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS crp TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS calendar_token TEXT UNIQUE;

-- Atualizar perfil existente (Hellen) com o token atual do .env.local
-- para não quebrar a assinatura do calendário no iPhone
UPDATE public.profiles 
SET calendar_token = 'hellen-cal-a7f3e9b2d1c8'
WHERE calendar_token IS NULL;

-- ──────────────────────────────────────────
-- 2. TRIGGER: Criar perfil automaticamente no sign-up
-- ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email, calendar_token)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email,
    encode(gen_random_bytes(24), 'hex')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ──────────────────────────────────────────
-- 3. TABELA DE CONVITES
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  used_by UUID REFERENCES public.profiles(id),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- Psicólogos podem ver os convites que criaram
CREATE POLICY "invites_select_own" ON public.invites
FOR SELECT TO authenticated USING (created_by = auth.uid());

-- Psicólogos podem criar convites
CREATE POLICY "invites_insert_own" ON public.invites
FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- ──────────────────────────────────────────
-- 4. RLS PARA profiles (recriar para consistência)
-- ──────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY "profiles_update_own" ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- ──────────────────────────────────────────
-- 5. STORAGE: Bucket para logos dos psicólogos
-- ──────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para logos (nomes únicos para evitar conflito com laudos)
DROP POLICY IF EXISTS "logos_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "logos_select_public" ON storage.objects;
DROP POLICY IF EXISTS "logos_update_own" ON storage.objects;
DROP POLICY IF EXISTS "logos_delete_own" ON storage.objects;

CREATE POLICY "logos_insert_own" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'logos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "logos_select_public" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'logos');

CREATE POLICY "logos_update_own" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'logos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "logos_delete_own" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'logos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ──────────────────────────────────────────
-- 6. VERIFICAÇÃO DE RLS NAS TABELAS PRINCIPAIS
-- ──────────────────────────────────────────
-- As tabelas pacientes, agendamentos, prontuarios, diario_bordo, 
-- laudos, pagamentos JÁ devem ter RLS ativo com:
--   psicologo_id = auth.uid()
--
-- Para verificar, rode:
--   SELECT tablename, policyname, cmd, qual 
--   FROM pg_policies 
--   WHERE schemaname = 'public';
--
-- Se alguma tabela NÃO tiver políticas de isolamento por psicologo_id,
-- crie manualmente. Exemplo:
--
-- CREATE POLICY "isolamento_psicologo" ON public.pacientes
-- FOR ALL TO authenticated
-- USING (psicologo_id = auth.uid())
-- WITH CHECK (psicologo_id = auth.uid());
