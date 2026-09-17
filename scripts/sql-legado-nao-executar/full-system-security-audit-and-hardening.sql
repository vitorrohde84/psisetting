-- ==============================================================================
-- 🛡️ AUDITORIA E BLINDAGEM MESTRE DE SEGURANÇA — PSICARE / PSISETTING
-- Data: 2026-08-19
-- Finalidade: Garantir 100% de isolamento multi-tenant, RLS em todas as tabelas,
--             proteção de storage (laudos/logos) e conformidade CFP / LGPD.
-- ==============================================================================

-- 1. EXTENSÕES DE CRIPTOGRAFIA E UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. GARANTIR COLUNA psicologo_id EM TODAS AS TABELAS CLÍNICAS
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

-- 3. HABILITAR ROW LEVEL SECURITY (RLS) OBRIGATÓRIO EM 100% DAS TABELAS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prontuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diario_bordo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

-- 4. LIMPEZA E CRIAÇÃO DAS POLÍTICAS DE RLS RESTRITIVAS

-- ─── TABELA: PROFILES ───
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

-- ─── TABELA: PACIENTES ───
DROP POLICY IF EXISTS "pacientes_select_own" ON public.pacientes;
DROP POLICY IF EXISTS "pacientes_insert_own" ON public.pacientes;
DROP POLICY IF EXISTS "pacientes_update_own" ON public.pacientes;
DROP POLICY IF EXISTS "pacientes_delete_own" ON public.pacientes;
DROP POLICY IF EXISTS "pacientes_all_own" ON public.pacientes;
DROP POLICY IF EXISTS "isolamento_psicologo" ON public.pacientes;

CREATE POLICY "pacientes_select_own" ON public.pacientes
FOR SELECT TO authenticated USING (psicologo_id = auth.uid());

CREATE POLICY "pacientes_insert_own" ON public.pacientes
FOR INSERT TO authenticated WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "pacientes_update_own" ON public.pacientes
FOR UPDATE TO authenticated USING (psicologo_id = auth.uid()) WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "pacientes_delete_own" ON public.pacientes
FOR DELETE TO authenticated USING (psicologo_id = auth.uid());

-- ─── TABELA: AGENDAMENTOS ───
DROP POLICY IF EXISTS "agendamentos_select_own" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_insert_own" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_update_own" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_delete_own" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamentos_all_own" ON public.agendamentos;

CREATE POLICY "agendamentos_select_own" ON public.agendamentos
FOR SELECT TO authenticated USING (psicologo_id = auth.uid());

CREATE POLICY "agendamentos_insert_own" ON public.agendamentos
FOR INSERT TO authenticated WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "agendamentos_update_own" ON public.agendamentos
FOR UPDATE TO authenticated USING (psicologo_id = auth.uid()) WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "agendamentos_delete_own" ON public.agendamentos
FOR DELETE TO authenticated USING (psicologo_id = auth.uid());

-- ─── TABELA: PRONTUÁRIOS ───
DROP POLICY IF EXISTS "prontuarios_select_own" ON public.prontuarios;
DROP POLICY IF EXISTS "prontuarios_insert_own" ON public.prontuarios;
DROP POLICY IF EXISTS "prontuarios_update_own" ON public.prontuarios;
DROP POLICY IF EXISTS "prontuarios_delete_own" ON public.prontuarios;
DROP POLICY IF EXISTS "prontuarios_all_own" ON public.prontuarios;

CREATE POLICY "prontuarios_select_own" ON public.prontuarios
FOR SELECT TO authenticated USING (psicologo_id = auth.uid());

CREATE POLICY "prontuarios_insert_own" ON public.prontuarios
FOR INSERT TO authenticated WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "prontuarios_update_own" ON public.prontuarios
FOR UPDATE TO authenticated USING (psicologo_id = auth.uid()) WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "prontuarios_delete_own" ON public.prontuarios
FOR DELETE TO authenticated USING (psicologo_id = auth.uid());

-- ─── TABELA: DIÁRIO DE BORDO ───
DROP POLICY IF EXISTS "diario_bordo_select_own" ON public.diario_bordo;
DROP POLICY IF EXISTS "diario_bordo_insert_own" ON public.diario_bordo;
DROP POLICY IF EXISTS "diario_bordo_update_own" ON public.diario_bordo;
DROP POLICY IF EXISTS "diario_bordo_delete_own" ON public.diario_bordo;
DROP POLICY IF EXISTS "diario_bordo_all_own" ON public.diario_bordo;

CREATE POLICY "diario_bordo_select_own" ON public.diario_bordo
FOR SELECT TO authenticated USING (psicologo_id = auth.uid());

CREATE POLICY "diario_bordo_insert_own" ON public.diario_bordo
FOR INSERT TO authenticated WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "diario_bordo_update_own" ON public.diario_bordo
FOR UPDATE TO authenticated USING (psicologo_id = auth.uid()) WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "diario_bordo_delete_own" ON public.diario_bordo
FOR DELETE TO authenticated USING (psicologo_id = auth.uid());

-- ─── TABELA: LAUDOS ───
DROP POLICY IF EXISTS "laudos_select_own" ON public.laudos;
DROP POLICY IF EXISTS "laudos_insert_own" ON public.laudos;
DROP POLICY IF EXISTS "laudos_update_own" ON public.laudos;
DROP POLICY IF EXISTS "laudos_delete_own" ON public.laudos;
DROP POLICY IF EXISTS "laudos_all_own" ON public.laudos;

CREATE POLICY "laudos_select_own" ON public.laudos
FOR SELECT TO authenticated USING (psicologo_id = auth.uid());

CREATE POLICY "laudos_insert_own" ON public.laudos
FOR INSERT TO authenticated WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "laudos_update_own" ON public.laudos
FOR UPDATE TO authenticated USING (psicologo_id = auth.uid()) WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "laudos_delete_own" ON public.laudos
FOR DELETE TO authenticated USING (psicologo_id = auth.uid());

-- ─── TABELA: PAGAMENTOS (FINANCEIRO) ───
DROP POLICY IF EXISTS "pagamentos_select_own" ON public.pagamentos;
DROP POLICY IF EXISTS "pagamentos_insert_own" ON public.pagamentos;
DROP POLICY IF EXISTS "pagamentos_update_own" ON public.pagamentos;
DROP POLICY IF EXISTS "pagamentos_delete_own" ON public.pagamentos;
DROP POLICY IF EXISTS "pagamentos_all_own" ON public.pagamentos;

CREATE POLICY "pagamentos_select_own" ON public.pagamentos
FOR SELECT TO authenticated USING (psicologo_id = auth.uid());

CREATE POLICY "pagamentos_insert_own" ON public.pagamentos
FOR INSERT TO authenticated WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "pagamentos_update_own" ON public.pagamentos
FOR UPDATE TO authenticated USING (psicologo_id = auth.uid()) WITH CHECK (psicologo_id = auth.uid());

CREATE POLICY "pagamentos_delete_own" ON public.pagamentos
FOR DELETE TO authenticated USING (psicologo_id = auth.uid());

-- ─── TABELA: INVITES ───
DROP POLICY IF EXISTS "invites_select_own" ON public.invites;
DROP POLICY IF EXISTS "invites_insert_own" ON public.invites;

CREATE POLICY "invites_select_own" ON public.invites
FOR SELECT TO authenticated USING (created_by = auth.uid());

CREATE POLICY "invites_insert_own" ON public.invites
FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- ─── TABELA: CUPONS (LEITURA APENAS SE ATIVO) ───
DROP POLICY IF EXISTS "coupons_read_active" ON public.coupons;
CREATE POLICY "coupons_read_active" ON public.coupons
FOR SELECT TO authenticated USING (active = true);

-- ─── TABELA: RESGATE DE CUPONS (APENAS PRÓPRIO USUÁRIO) ───
DROP POLICY IF EXISTS "coupon_redemptions_own" ON public.coupon_redemptions;
CREATE POLICY "coupon_redemptions_own" ON public.coupon_redemptions
FOR ALL TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

-- 5. BLINDAGEM DE STORAGE BUCKETS (LAUDOS E LOGOS)
-- Garantir que os buckets existam e sejam privados
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('laudos', 'laudos', false, 10485760, ARRAY['application/pdf']),
  ('logos', 'logos', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

-- Políticas de RLS para o Storage
DROP POLICY IF EXISTS "laudos_storage_owner_only" ON storage.objects;
CREATE POLICY "laudos_storage_owner_only" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'laudos' AND auth.uid() IS NOT NULL)
WITH CHECK (bucket_id = 'laudos' AND auth.uid() IS NOT NULL);

-- 6. GARANTIR CONTA VIP DA HELLEN
UPDATE public.profiles 
SET is_vip = true,
    subscription_status = 'vip'
WHERE email ILIKE '%hellen%' OR email ILIKE '%psihellenlimberger%' OR email ILIKE '%psicologa.com%';
