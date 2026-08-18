-- Migration: Adicionar campos de personalização profissional no perfil
-- Permite que cada usuário defina seu gênero (para títulos como Psicóloga vs Psicólogo),
-- cidade de atendimento e endereço completo para o rodapé dos laudos.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS genero TEXT DEFAULT 'F';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cidade TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS endereco TEXT;

-- Atualizar Hellen com valores padrão se ainda não preenchidos
UPDATE public.profiles
SET 
  genero = COALESCE(genero, 'F'),
  cidade = COALESCE(cidade, 'Santa Maria - RS'),
  endereco = COALESCE(endereco, 'Santa Maria - RS'),
  telefone = COALESCE(telefone, '(55) 99654-7714'),
  crp = COALESCE(crp, 'CRP 07/45016')
WHERE nome ILIKE '%Hellen%';
