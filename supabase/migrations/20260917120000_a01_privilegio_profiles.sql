-- =============================================================================
-- A01 + A12 — Fim da escalada de privilégio via public.profiles
-- Auditoria: docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
--
-- PROBLEMA
--   A policy "profiles_update_own" isola a LINHA (id = auth.uid()), mas as
--   colunas de privilégio (is_admin, is_vip, subscription_status, email...)
--   moram dentro dessa mesma linha. Qualquer psicólogo autenticado executava
--   update profiles set is_admin = true where id = auth.uid()
--   e passava no gate requireAdmin(), que usa rotas com service_role — ou seja,
--   ignora RLS e alcança a base clínica inteira.
--
-- ESTRATÉGIA — duas travas independentes, de propósito:
--   1. Privilégio de coluna (REVOKE/GRANT): o Postgres recusa antes da policy.
--   2. Trigger BEFORE INSERT OR UPDATE: sobrevive a um GRANT amplo acidental,
--      que é exatamente o que um replay de script antigo faria.
--   Uma trava só não basta num projeto cujo histórico mostra scripts sendo
--   reexecutados fora de ordem.
--
-- IDEMPOTENTE: pode rodar quantas vezes for preciso.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Garantir que as colunas existem antes de referenciá-las no trigger
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trialing';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days');
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mp_subscription_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mp_customer_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS calendar_token TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trava 1 — privilégio por coluna
--    Em Postgres, um GRANT de UPDATE no nível da TABELA cobre todas as colunas,
--    e um REVOKE por coluna NÃO o subtrai. Por isso revogamos a tabela inteira
--    e devolvemos apenas as colunas que o psicólogo pode de fato editar.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE UPDATE ON public.profiles FROM authenticated;
REVOKE UPDATE ON public.profiles FROM anon;
REVOKE INSERT ON public.profiles FROM anon;

DO $$
DECLARE
  -- Colunas que pertencem ao psicólogo: dados de perfil e do papel timbrado.
  v_permitidas text[] := ARRAY[
    'nome', 'nome_completo', 'telefone', 'crp',
    'cidade', 'endereco', 'genero', 'logo_url',
    'diario_pin_hash'
  ];
  v_col  text;
  v_lista text := '';
BEGIN
  FOREACH v_col IN ARRAY v_permitidas LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = v_col
    ) THEN
      v_lista := v_lista || CASE WHEN v_lista = '' THEN '' ELSE ', ' END || quote_ident(v_col);
    END IF;
  END LOOP;

  IF v_lista = '' THEN
    RAISE EXCEPTION 'Nenhuma coluna editável encontrada em public.profiles — abortando para não trancar o usuário fora do próprio perfil.';
  END IF;

  EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', v_lista);
  RAISE NOTICE 'UPDATE concedido a authenticated apenas nas colunas: %', v_lista;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trava 2 — trigger de guarda
--    Cobre INSERT também: se o trigger handle_new_user falhar (ver A19), a
--    policy profiles_insert_own permite ao usuário criar a própria linha — e
--    ele poderia nascer admin. Aqui os valores de privilégio são forçados.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.profiles_guard_privilegio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- service_role e superusuário passam: são os caminhos de servidor legítimos
  -- (webhook de pagamento, rotas admin, migrações).
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Ninguém nasce admin, VIP ou assinante por conta própria.
    NEW.is_admin            := false;
    NEW.is_vip              := false;
    NEW.subscription_status := COALESCE(NEW.subscription_status, 'trialing');
    NEW.current_period_end  := NULL;
    NEW.mp_subscription_id  := NULL;
    NEW.mp_customer_id      := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: qualquer tentativa de mexer em privilégio, cobrança ou identidade
  -- falha alto. Silenciar aqui seria repetir o erro que a auditoria apontou.
  IF NEW.is_admin            IS DISTINCT FROM OLD.is_admin
  OR NEW.is_vip              IS DISTINCT FROM OLD.is_vip
  OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
  OR NEW.trial_ends_at       IS DISTINCT FROM OLD.trial_ends_at
  OR NEW.current_period_end  IS DISTINCT FROM OLD.current_period_end
  OR NEW.mp_subscription_id  IS DISTINCT FROM OLD.mp_subscription_id
  OR NEW.mp_customer_id      IS DISTINCT FROM OLD.mp_customer_id
  OR NEW.email               IS DISTINCT FROM OLD.email
  OR NEW.calendar_token      IS DISTINCT FROM OLD.calendar_token
  OR NEW.id                  IS DISTINCT FROM OLD.id
  THEN
    RAISE EXCEPTION
      'Coluna privilegiada de profiles nao pode ser alterada pelo proprio usuario.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_guard_privilegio_trg ON public.profiles;
CREATE TRIGGER profiles_guard_privilegio_trg
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_privilegio();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. A12 — concessão de admin por igualdade, contra auth.users
--
--    O script antigo usava:
--      WHERE email ILIKE '%vitor%' OR email ILIKE '%hellen%' OR email ILIKE '%psicologa.com%'
--    que casa com vitoria@, avitor@, michellen@ e qualquer endereço contendo
--    "psicologa.com". Com cadastro aberto, bastava registrar-se com o e-mail
--    certo e esperar a próxima execução do script para virar admin.
--
--    Aqui a comparação é por igualdade e contra auth.users.email — a coluna
--    profiles.email é editável pelo usuário e não serve como fonte de verdade.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.profiles p
SET is_admin = true
FROM auth.users u
WHERE u.id = p.id
  AND lower(u.email) IN (
    'vitorrohde84@gmail.com',
    'psihellenlimberger@gmail.com',
    'hellenlimberger@gmail.com'
  );

-- Revoga admin de quem tenha sido promovido pelo ILIKE e não está na lista.
UPDATE public.profiles p
SET is_admin = false
FROM auth.users u
WHERE u.id = p.id
  AND p.is_admin = true
  AND lower(u.email) NOT IN (
    'vitorrohde84@gmail.com',
    'psihellenlimberger@gmail.com',
    'hellenlimberger@gmail.com'
  );

-- Mantém profiles.email espelhando auth.users.email (a coluna vira derivada,
-- não mais uma entrada de confiança).
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id AND p.email IS DISTINCT FROM u.email;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Verificação — rode e leia a saída antes de considerar a migração aplicada
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_admins int;
  v_tem_update_tabela boolean;
BEGIN
  SELECT count(*) INTO v_admins FROM public.profiles WHERE is_admin = true;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
  ) INTO v_tem_update_tabela;

  RAISE NOTICE '─────────────────────────────────────────────';
  RAISE NOTICE 'A01 aplicado. Admins ativos: %', v_admins;
  RAISE NOTICE 'UPDATE no nivel da tabela para authenticated: % (esperado: f)', v_tem_update_tabela;
  RAISE NOTICE '─────────────────────────────────────────────';

  IF v_tem_update_tabela THEN
    RAISE EXCEPTION 'REVOKE nao surtiu efeito: authenticated ainda tem UPDATE na tabela inteira.';
  END IF;
END $$;
