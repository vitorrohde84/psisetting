-- ==============================================================================
-- PSISETTING: ÍNDICES DE ALTA VELOCIDADE & ESCALABILIDADE DO BANCO DE DADOS
-- Otimização para centenas ou milhares de psicólogos conectados simultaneamente.
-- ==============================================================================

-- 1. ÍNDICES NA TABELA DE PACIENTES
CREATE INDEX IF NOT EXISTS idx_pacientes_psicologo_id ON public.pacientes(psicologo_id);
CREATE INDEX IF NOT EXISTS idx_pacientes_created_at ON public.pacientes(created_at DESC);

-- 2. ÍNDICES NA TABELA DE PRONTUÁRIOS (Evoluções Clínicas)
CREATE INDEX IF NOT EXISTS idx_prontuarios_paciente_id ON public.prontuarios(paciente_id);
CREATE INDEX IF NOT EXISTS idx_prontuarios_psicologo_id ON public.prontuarios(psicologo_id);
CREATE INDEX IF NOT EXISTS idx_prontuarios_data ON public.prontuarios(data DESC);

-- 3. ÍNDICES NA TABELA DE AGENDAMENTOS (Agenda Integrada)
CREATE INDEX IF NOT EXISTS idx_agendamentos_psicologo_data ON public.agendamentos(psicologo_id, data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON public.agendamentos(status);

-- 4. ÍNDICES NA TABELA DE LAUDOS E DOCUMENTOS CFP
CREATE INDEX IF NOT EXISTS idx_laudos_psicologo_id ON public.laudos(psicologo_id);
CREATE INDEX IF NOT EXISTS idx_laudos_paciente_id ON public.laudos(paciente_id);

-- 5. ÍNDICES NA TABELA DE PAGAMENTOS (Financeiro e Recibos)
CREATE INDEX IF NOT EXISTS idx_pagamentos_psicologo_id ON public.pagamentos(psicologo_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_paciente_id ON public.pagamentos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON public.pagamentos(status);

-- 6. ÍNDICES NA TABELA DE DIÁRIO DE BORDO
CREATE INDEX IF NOT EXISTS idx_diario_psicologo_data ON public.diario_bordo(psicologo_id, data DESC);

-- 7. ÍNDICES NA TABELA DE PROFILES (Buscas Rápidas de Assinatura e Autenticação)
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status ON public.profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON public.profiles(is_admin);

-- 8. ÍNDICES NA TABELA DE CUPONS & RESGATES
CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON public.coupons(active);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_profile ON public.coupon_redemptions(profile_id);

-- 9. ÍNDICES NA TABELA DE FEEDBACKS & COMUNICADOS
CREATE INDEX IF NOT EXISTS idx_feedbacks_user ON public.user_feedbacks(user_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON public.user_feedbacks(status);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON public.system_announcements(active);
