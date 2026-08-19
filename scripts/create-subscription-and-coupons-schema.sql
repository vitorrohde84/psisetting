-- ==============================================================================
-- MIGRAÇÃO: SISTEMA DE ASSINATURAS (MERCADO PAGO), CUPONS E PERÍODO DE TESTE
-- PsiSetting — Gestão Clínica para Psicólogos
-- ==============================================================================

-- 1. ADICIONAR COLUNAS DE ASSINATURA NA TABELA profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days');
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trialing';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mp_subscription_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mp_customer_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

-- 2. TABELA DE CUPONS DE DESCONTO / EXTENSÃO DE TESTE
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  trial_days INTEGER NOT NULL DEFAULT 30,
  max_uses INTEGER DEFAULT NULL, -- NULL = ilimitado
  uses_count INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABELA DE RESGATE DE CUPONS (Impede uso duplicado pelo mesmo psicólogo)
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(coupon_id, profile_id)
);

-- 4. HABILITAR RLS NAS TABELAS
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

-- Políticas de Cupons (Leitura para autenticados poderem validar o código)
DROP POLICY IF EXISTS "coupons_select_authenticated" ON public.coupons;
CREATE POLICY "coupons_select_authenticated" ON public.coupons
  FOR SELECT TO authenticated USING (active = true);

-- Políticas de Resgate (Psicólogo pode ver seus próprios resgates e inserir novo)
DROP POLICY IF EXISTS "coupon_redemptions_select_own" ON public.coupon_redemptions;
DROP POLICY IF EXISTS "coupon_redemptions_insert_own" ON public.coupon_redemptions;

CREATE POLICY "coupon_redemptions_select_own" ON public.coupon_redemptions
  FOR SELECT TO authenticated USING (profile_id = auth.uid());

CREATE POLICY "coupon_redemptions_insert_own" ON public.coupon_redemptions
  FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());

-- 5. ATUALIZAR TRIGGER DE CRIAÇÃO AUTOMÁTICA DE PERFIL (Para novos cadastros receberem 7 dias)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_token TEXT;
BEGIN
  new_token := encode(gen_random_bytes(24), 'hex');
  
  INSERT INTO public.profiles (
    id, 
    nome, 
    email, 
    calendar_token,
    trial_ends_at,
    subscription_status,
    is_vip
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    new_token,
    (NOW() + INTERVAL '7 days'),
    'trialing',
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(public.profiles.email, EXCLUDED.email),
    nome = COALESCE(public.profiles.nome, EXCLUDED.nome);
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. ATUALIZAR CONTAS EXISTENTES (Garantir que usuários já cadastrados tenham 7 dias ou VIP)
UPDATE public.profiles 
SET trial_ends_at = NOW() + INTERVAL '7 days',
    subscription_status = 'trialing'
WHERE trial_ends_at IS NULL;

-- Definir conta da Hellen / admin como VIP permanente
UPDATE public.profiles 
SET is_vip = true,
    subscription_status = 'vip'
WHERE email ILIKE '%psihellenlimberger%' OR email ILIKE '%hellen%';

-- 7. INSERIR CUPONS INICIAIS DE TESTE (Ex: PSI30 e BETA30 liberam 30 dias)
INSERT INTO public.coupons (code, trial_days, active)
VALUES 
  ('PSI30', 30, true),
  ('BETA30', 30, true),
  ('AMIGO30', 30, true)
ON CONFLICT (code) DO NOTHING;
