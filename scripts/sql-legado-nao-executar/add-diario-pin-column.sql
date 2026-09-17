-- ==============================================================================
-- MIGRAÇÃO: ADICIONAR COLUNA PARA PIN DO DIÁRIO DE BORDO
-- PsiSetting — Gestão Clínica para Psicólogos
-- Data: 2026-09-07
-- Execute no Supabase Dashboard > SQL Editor (Opcional, pois também usamos user_metadata)
-- ==============================================================================

ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS diario_pin_hash TEXT;

COMMENT ON COLUMN public.profiles.diario_pin_hash IS 'Hash SHA-256 salgado do PIN numérico de 6 dígitos para o Diário de Bordo';
