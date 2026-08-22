-- ==============================================================================
-- MIGRAÇÃO: PAINEL ADMINISTRATIVO, CENTRAL DE FEEDBACKS E COMUNICADOS GLOBAIS
-- PsiSetting — Gestão Clínica para Psicólogos
-- ==============================================================================

-- 1. ADICIONAR COLUNA is_admin NA TABELA profiles E COLUNAS DE DESCONTO EM coupons
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'trial_days'; -- 'trial_days', 'percent', 'fixed', 'vip'
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS discount_value NUMERIC DEFAULT 30;

-- 2. TABELA DE FEEDBACKS & SUGESTÕES DE USUÁRIOS
CREATE TABLE IF NOT EXISTS public.user_feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name TEXT,
  user_email TEXT,
  category TEXT NOT NULL DEFAULT 'sugestao', -- 'sugestao', 'problema', 'duvida', 'elogio'
  rating INTEGER, -- 1 a 5 estrelas (opcional)
  subject TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'in_review', 'planned', 'resolved', 'archived'
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABELA DE COMUNICADOS GLOBAIS (ADMIN BROADCAST)
CREATE TABLE IF NOT EXISTS public.system_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info', -- 'info', 'success', 'warning', 'tip'
  active BOOLEAN NOT NULL DEFAULT true,
  link_url TEXT,
  link_label TEXT,
  target_audience TEXT NOT NULL DEFAULT 'all', -- 'all', 'trialing', 'active', 'expired'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.user_feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_announcements ENABLE ROW LEVEL SECURITY;

-- Políticas para user_feedbacks:
-- Usuários podem inserir seus próprios feedbacks
DROP POLICY IF EXISTS "feedbacks_insert_authenticated" ON public.user_feedbacks;
CREATE POLICY "feedbacks_insert_authenticated" ON public.user_feedbacks
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Usuários podem ver seus próprios feedbacks enviados
DROP POLICY IF EXISTS "feedbacks_select_own" ON public.user_feedbacks;
CREATE POLICY "feedbacks_select_own" ON public.user_feedbacks
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Políticas para system_announcements:
-- Qualquer usuário autenticado pode ler avisos ativos
DROP POLICY IF EXISTS "announcements_select_active" ON public.system_announcements;
CREATE POLICY "announcements_select_active" ON public.system_announcements
  FOR SELECT TO authenticated USING (active = true);

-- 5. ATUALIZAR CONTAS ADMIN (Hellen e Vitor)
UPDATE public.profiles
SET is_admin = true,
    is_vip = true
WHERE email ILIKE '%hellen%' 
   OR email ILIKE '%psihellenlimberger%' 
   OR email ILIKE '%vitor%'
   OR email ILIKE '%psicologa.com%';
