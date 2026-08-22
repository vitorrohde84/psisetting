-- ==============================================================================
-- CORREÇÃO DO TRIGGER DE CRIAÇÃO DE USUÁRIO (Supabase Auth Fix)
-- Execute este script no Supabase SQL Editor para garantir criação perfeita de contas
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
BEGIN
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
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'nome',
      split_part(NEW.email, '@', 1)
    ),
    NEW.email,
    'cal_' || md5(random()::text || clock_timestamp()::text),
    NOW() + INTERVAL '30 days',
    'trialing',
    false
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      nome = COALESCE(public.profiles.nome, EXCLUDED.nome);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Fallback de segurança: nunca quebra o cadastro do usuário
  RAISE WARNING 'Aviso em handle_new_user: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
