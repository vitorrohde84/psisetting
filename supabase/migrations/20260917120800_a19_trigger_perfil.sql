-- =============================================================================
-- A19 + A11(search_path) — Trigger de criação de perfil, versão única
-- Auditoria: docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
--
-- PROBLEMA 1 — quatro versões concorrentes de handle_new_user espalhadas pelos
--   scripts antigos, três delas SEM `SET search_path` fixado. SECURITY DEFINER
--   sem search_path é o padrão clássico de sequestro por objeto plantado num
--   schema anterior no caminho de busca (o linter do Supabase sinaliza como
--   function_search_path_mutable). Reexecutar o script errado removia a
--   proteção que outro aplicou.
--
-- PROBLEMA 2 — `EXCEPTION WHEN OTHERS THEN RAISE WARNING; RETURN NEW;`
--   estava comentado como "fallback de segurança: nunca quebra o cadastro",
--   mas o efeito era o oposto: a conta nascia em auth.users SEM linha em
--   public.profiles. Esse usuário autentica mas não consegue criar grupo nem
--   convite (ambos têm FK para profiles), nunca recebe trial_ends_at, e
--   qualquer abuso no cadastro fica mascarado — nenhum erro chega a lugar
--   nenhum, só um WARNING no log do Postgres que ninguém lê.
--
-- Esta é a ÚNICA versão válida daqui em diante.
-- IDEMPOTENTE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, nome, trial_ends_at, subscription_status, is_vip, is_admin, calendar_token
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    now() + INTERVAL '7 days',
    'trialing',
    false,
    false,  -- ninguém nasce admin; a concessão é explícita e por e-mail de auth.users
    -- O token nasce aqui porque calendar_token deixou de ser gravável pelo
    -- próprio usuário (A01). Sem isto, toda conta criada depois daquela
    -- migração ficaria sem link de calendário, e a tela não explicaria por quê.
    encode(gen_random_bytes(32), 'hex')
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        nome  = COALESCE(public.profiles.nome, EXCLUDED.nome);

  RETURN NEW;

-- Só a exceção ESPERADA é tratada: corrida entre dois caminhos de criação.
-- Qualquer outra falha sobe, porque conta sem perfil é um estado quebrado que
-- precisa aparecer na hora, não semanas depois pelo suporte.
EXCEPTION
  WHEN unique_violation THEN
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- Diagnóstico: contas órfãs criadas enquanto o EXCEPTION engolia as falhas
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_orfas int;
BEGIN
  SELECT count(*) INTO v_orfas
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE p.id IS NULL;

  IF v_orfas > 0 THEN
    RAISE WARNING 'A19: % conta(s) em auth.users SEM perfil em public.profiles. Sao anteriores a esta correcao. Para criar os perfis faltantes: INSERT INTO public.profiles (id, email, nome, trial_ends_at, subscription_status) SELECT u.id, u.email, split_part(u.email, ''@'', 1), now() + INTERVAL ''7 days'', ''trialing'' FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id WHERE p.id IS NULL;', v_orfas;
  ELSE
    RAISE NOTICE 'A19 aplicado. Nenhuma conta orfa.';
  END IF;
END $$;
