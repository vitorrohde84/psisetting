-- ==============================================================================
-- MIGRAÇÃO: MÓDULO DE GRUPOS TERAPÊUTICOS E EVOLUÇÃO COLETIVA EM LOTE
-- PsiSetting — Gestão Clínica para Psicólogos
-- Data: 2026-09-07
-- Execute no Supabase Dashboard > SQL Editor
-- ==============================================================================

-- 1. TABELA PRINCIPAL DE GRUPOS
CREATE TABLE IF NOT EXISTS public.grupos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  psicologo_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  dia_semana TEXT, -- ex: 'Terça-feira', 'Quinta-feira'
  horario TEXT,    -- ex: '19:00'
  valor_sessao NUMERIC(10,2) DEFAULT 0, -- valor cobrado por paciente por sessão
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. TABELA DE MEMBROS DO GRUPO (N:N entre Grupos e Pacientes)
CREATE TABLE IF NOT EXISTS public.grupo_membros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id UUID NOT NULL REFERENCES public.grupos(id) ON DELETE CASCADE,
  paciente_id UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  psicologo_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT grupo_membros_unique_paciente UNIQUE (grupo_id, paciente_id)
);

-- 3. TABELA DE SESSÕES / ENCONTROS DE GRUPO (Registro Coletivo)
CREATE TABLE IF NOT EXISTS public.grupo_sessoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id UUID NOT NULL REFERENCES public.grupos(id) ON DELETE CASCADE,
  psicologo_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  horario TEXT,
  tema TEXT,
  resumo_coletivo TEXT, -- criptografado ou texto cifrado AES-256
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. VINCULAÇÃO NA TABELA DE PRONTUÁRIOS INDIVIDUAIS
-- Adiciona a coluna grupo_sessao_id para identificar quando a evolução veio de um grupo
ALTER TABLE public.prontuarios 
  ADD COLUMN IF NOT EXISTS grupo_sessao_id UUID REFERENCES public.grupo_sessoes(id) ON DELETE SET NULL;

-- 5. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_grupos_psicologo ON public.grupos(psicologo_id);
CREATE INDEX IF NOT EXISTS idx_grupo_membros_grupo ON public.grupo_membros(grupo_id);
CREATE INDEX IF NOT EXISTS idx_grupo_membros_paciente ON public.grupo_membros(paciente_id);
CREATE INDEX IF NOT EXISTS idx_grupo_sessoes_grupo ON public.grupo_sessoes(grupo_id);
CREATE INDEX IF NOT EXISTS idx_prontuarios_grupo_sessao ON public.prontuarios(grupo_sessao_id);

-- 6. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupo_membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupo_sessoes ENABLE ROW LEVEL SECURITY;

-- 7. POLÍTICAS DE ISOLAMENTO POR PSICÓLOGO (MULTI-TENANT)

-- Políticas para grupos
DROP POLICY IF EXISTS "grupos_select_own" ON public.grupos;
CREATE POLICY "grupos_select_own" ON public.grupos
  FOR SELECT TO authenticated USING (psicologo_id = auth.uid());

DROP POLICY IF EXISTS "grupos_insert_own" ON public.grupos;
CREATE POLICY "grupos_insert_own" ON public.grupos
  FOR INSERT TO authenticated WITH CHECK (psicologo_id = auth.uid());

DROP POLICY IF EXISTS "grupos_update_own" ON public.grupos;
CREATE POLICY "grupos_update_own" ON public.grupos
  FOR UPDATE TO authenticated USING (psicologo_id = auth.uid()) WITH CHECK (psicologo_id = auth.uid());

DROP POLICY IF EXISTS "grupos_delete_own" ON public.grupos;
CREATE POLICY "grupos_delete_own" ON public.grupos
  FOR DELETE TO authenticated USING (psicologo_id = auth.uid());

-- Políticas para grupo_membros
DROP POLICY IF EXISTS "grupo_membros_select_own" ON public.grupo_membros;
CREATE POLICY "grupo_membros_select_own" ON public.grupo_membros
  FOR SELECT TO authenticated USING (psicologo_id = auth.uid());

DROP POLICY IF EXISTS "grupo_membros_insert_own" ON public.grupo_membros;
CREATE POLICY "grupo_membros_insert_own" ON public.grupo_membros
  FOR INSERT TO authenticated WITH CHECK (psicologo_id = auth.uid());

DROP POLICY IF EXISTS "grupo_membros_update_own" ON public.grupo_membros;
CREATE POLICY "grupo_membros_update_own" ON public.grupo_membros
  FOR UPDATE TO authenticated USING (psicologo_id = auth.uid()) WITH CHECK (psicologo_id = auth.uid());

DROP POLICY IF EXISTS "grupo_membros_delete_own" ON public.grupo_membros;
CREATE POLICY "grupo_membros_delete_own" ON public.grupo_membros
  FOR DELETE TO authenticated USING (psicologo_id = auth.uid());

-- Políticas para grupo_sessoes
DROP POLICY IF EXISTS "grupo_sessoes_select_own" ON public.grupo_sessoes;
CREATE POLICY "grupo_sessoes_select_own" ON public.grupo_sessoes
  FOR SELECT TO authenticated USING (psicologo_id = auth.uid());

DROP POLICY IF EXISTS "grupo_sessoes_insert_own" ON public.grupo_sessoes;
CREATE POLICY "grupo_sessoes_insert_own" ON public.grupo_sessoes
  FOR INSERT TO authenticated WITH CHECK (psicologo_id = auth.uid());

DROP POLICY IF EXISTS "grupo_sessoes_update_own" ON public.grupo_sessoes;
CREATE POLICY "grupo_sessoes_update_own" ON public.grupo_sessoes
  FOR UPDATE TO authenticated USING (psicologo_id = auth.uid()) WITH CHECK (psicologo_id = auth.uid());

DROP POLICY IF EXISTS "grupo_sessoes_delete_own" ON public.grupo_sessoes;
CREATE POLICY "grupo_sessoes_delete_own" ON public.grupo_sessoes
  FOR DELETE TO authenticated USING (psicologo_id = auth.uid());
