-- ==============================================================================
-- BLINDAGEM DE SEGURANÇA E ISOLAMENTO MULTI-TENANT (PSYCHOCARE)
-- Data: 2026-08-18
-- Execute este script no Supabase SQL Editor para garantir isolamento de 100%
-- ==============================================================================

-- 1. EXTENSÕES NECESSÁRIAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. GARANTIR QUE A COLUNA psicologo_id EXISTA EM TODAS AS TABELAS
ALTER TABLE public.pacientes 
  ADD COLUMN IF NOT EXISTS psicologo_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE public.agendamentos 
  ADD COLUMN IF NOT EXISTS psicologo_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE public.prontuarios 
  ADD COLUMN IF NOT EXISTS psicologo_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE public.diario_bordo 
  ADD COLUMN IF NOT EXISTS psicologo_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE public.laudos 
  ADD COLUMN IF NOT EXISTS psicologo_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

ALTER TABLE public.pagamentos 
  ADD COLUMN IF NOT EXISTS psicologo_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

-- 3. PREENCHER (BACKFILL) psicologo_id EM REGISTROS ANTIGOS A PARTIR DA TABELA PACIENTES
UPDATE public.prontuarios pr
SET psicologo_id = pa.psicologo_id
FROM public.pacientes pa
WHERE pr.paciente_id = pa.id AND pr.psicologo_id IS NULL;

UPDATE public.diario_bordo db
SET psicologo_id = pa.psicologo_id
FROM public.pacientes pa
WHERE db.paciente_id = pa.id AND db.psicologo_id IS NULL;

UPDATE public.laudos la
SET psicologo_id = pa.psicologo_id
FROM public.pacientes pa
WHERE la.paciente_id = pa.id AND la.psicologo_id IS NULL;

UPDATE public.pagamentos pg
SET psicologo_id = pa.psicologo_id
FROM public.pacientes pa
WHERE pg.paciente_id = pa.id AND pg.psicologo_id IS NULL;

-- 4. HABILITAR ROW LEVEL SECURITY (RLS) EM TODAS AS TABELAS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prontuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diario_bordo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- 5. POLÍTICAS RLS PARA CADA TABELA

-- ─── PROFILES ───
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY "profiles_update_own" ON public.profiles
FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_insert_own" ON public.profiles
FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- ─── PACIENTES ───
DROP POLICY IF EXISTS "pacientes_all_own" ON public.pacientes;
DROP POLICY IF EXISTS "pacientes_select_own" ON public.pacientes;
DROP POLICY IF EXISTS "pacientes_insert_own" ON public.pacientes;
DROP POLICY IF EXISTS "pacientes_update_own" ON public.pacientes;
DROP POLICY IF EXISTS "pacientes_delete_own" ON public.pacientes;
DROP POLICY IF EXISTS "isolamento_psicologo" ON public.pacientes;

CREATE POLICY "pacientes_select_own" ON public.pacientes
FOR SELECT TO authenticated USING (psicologo_id = auth.uid());

CREATE POLICY "pacientes_insert_own" ON public.pacientes
FOR INSERT TO authenticated WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "pacientes_update_own" ON public.pacientes
FOR UPDATE TO authenticated USING (psicologo_id = auth.uid()) WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "pacientes_delete_own" ON public.pacientes
FOR DELETE TO authenticated USING (psicologo_id = auth.uid());

-- ─── AGENDAMENTOS ───
DROP POLICY IF EXISTS "agendamentos_all_own" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_select_own" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_insert_own" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_update_own" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_delete_own" ON public.agendamentos;

CREATE POLICY "agendamentos_select_own" ON public.agendamentos
FOR SELECT TO authenticated USING (psicologo_id = auth.uid());

CREATE POLICY "agendamentos_insert_own" ON public.agendamentos
FOR INSERT TO authenticated WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "agendamentos_update_own" ON public.agendamentos
FOR UPDATE TO authenticated USING (psicologo_id = auth.uid()) WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "agendamentos_delete_own" ON public.agendamentos
FOR DELETE TO authenticated USING (psicologo_id = auth.uid());

-- ─── PRONTUARIOS ───
DROP POLICY IF EXISTS "prontuarios_all_own" ON public.prontuarios;
DROP POLICY IF EXISTS "prontuarios_select_own" ON public.prontuarios;
DROP POLICY IF EXISTS "prontuarios_insert_own" ON public.prontuarios;
DROP POLICY IF EXISTS "prontuarios_update_own" ON public.prontuarios;
DROP POLICY IF EXISTS "prontuarios_delete_own" ON public.prontuarios;

CREATE POLICY "prontuarios_select_own" ON public.prontuarios
FOR SELECT TO authenticated USING (psicologo_id = auth.uid());

CREATE POLICY "prontuarios_insert_own" ON public.prontuarios
FOR INSERT TO authenticated WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "prontuarios_update_own" ON public.prontuarios
FOR UPDATE TO authenticated USING (psicologo_id = auth.uid()) WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "prontuarios_delete_own" ON public.prontuarios
FOR DELETE TO authenticated USING (psicologo_id = auth.uid());

-- ─── DIÁRIO DE BORDO ───
DROP POLICY IF EXISTS "diario_all_own" ON public.diario_bordo;
DROP POLICY IF EXISTS "diario_select_own" ON public.diario_bordo;
DROP POLICY IF EXISTS "diario_insert_own" ON public.diario_bordo;
DROP POLICY IF EXISTS "diario_update_own" ON public.diario_bordo;
DROP POLICY IF EXISTS "diario_delete_own" ON public.diario_bordo;

CREATE POLICY "diario_select_own" ON public.diario_bordo
FOR SELECT TO authenticated USING (psicologo_id = auth.uid());

CREATE POLICY "diario_insert_own" ON public.diario_bordo
FOR INSERT TO authenticated WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "diario_update_own" ON public.diario_bordo
FOR UPDATE TO authenticated USING (psicologo_id = auth.uid()) WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "diario_delete_own" ON public.diario_bordo
FOR DELETE TO authenticated USING (psicologo_id = auth.uid());

-- ─── LAUDOS ───
DROP POLICY IF EXISTS "laudos_all_own" ON public.laudos;
DROP POLICY IF EXISTS "laudos_select_own" ON public.laudos;
DROP POLICY IF EXISTS "laudos_insert_own" ON public.laudos;
DROP POLICY IF EXISTS "laudos_update_own" ON public.laudos;
DROP POLICY IF EXISTS "laudos_delete_own" ON public.laudos;

CREATE POLICY "laudos_select_own" ON public.laudos
FOR SELECT TO authenticated USING (psicologo_id = auth.uid());

CREATE POLICY "laudos_insert_own" ON public.laudos
FOR INSERT TO authenticated WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "laudos_update_own" ON public.laudos
FOR UPDATE TO authenticated USING (psicologo_id = auth.uid()) WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "laudos_delete_own" ON public.laudos
FOR DELETE TO authenticated USING (psicologo_id = auth.uid());

-- ─── PAGAMENTOS ───
DROP POLICY IF EXISTS "pagamentos_all_own" ON public.pagamentos;
DROP POLICY IF EXISTS "pagamentos_select_own" ON public.pagamentos;
DROP POLICY IF EXISTS "pagamentos_insert_own" ON public.pagamentos;
DROP POLICY IF EXISTS "pagamentos_update_own" ON public.pagamentos;
DROP POLICY IF EXISTS "pagamentos_delete_own" ON public.pagamentos;

CREATE POLICY "pagamentos_select_own" ON public.pagamentos
FOR SELECT TO authenticated USING (psicologo_id = auth.uid());

CREATE POLICY "pagamentos_insert_own" ON public.pagamentos
FOR INSERT TO authenticated WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "pagamentos_update_own" ON public.pagamentos
FOR UPDATE TO authenticated USING (psicologo_id = auth.uid()) WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "pagamentos_delete_own" ON public.pagamentos
FOR DELETE TO authenticated USING (psicologo_id = auth.uid());

-- ─── STORAGE: BUCKETS E POLÍTICAS ───
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('laudos', 'laudos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Políticas de Storage para 'laudos' (Totalmente Privado)
DROP POLICY IF EXISTS "laudos_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "laudos_select_own" ON storage.objects;
DROP POLICY IF EXISTS "laudos_delete_own" ON storage.objects;

CREATE POLICY "laudos_insert_own" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'laudos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "laudos_select_own" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'laudos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "laudos_delete_own" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'laudos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 6. TRIGGER ON_AUTH_USER_CREATED OTIMIZADO PARA GOOGLE OAUTH E EMAIL
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email, calendar_token)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'nome',
      split_part(NEW.email, '@', 1)
    ),
    NEW.email,
    encode(gen_random_bytes(24), 'hex')
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      nome = COALESCE(public.profiles.nome, EXCLUDED.nome);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
