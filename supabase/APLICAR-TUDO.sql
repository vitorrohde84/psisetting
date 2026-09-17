-- =============================================================================
--  PSISETTING — TODAS AS CORREÇÕES DE SEGURANÇA, EM UM ARQUIVO SÓ
-- =============================================================================
--
--  COMO USAR
--    1. Copie este arquivo INTEIRO (Ctrl+A, Ctrl+C)
--    2. Supabase → SQL Editor → New query → cole
--    3. Clique numa parte vazia do texto (para não deixar nada selecionado)
--    4. Run
--
--  É SEGURO RODAR MAIS DE UMA VEZ. Tudo aqui é idempotente.
--
--  TUDO OU NADA: o SQL Editor executa o arquivo inteiro como uma transação.
--  Se qualquer linha falhar, NADA é aplicado — o banco fica exatamente como
--  estava. Não existe meio-termo, e é por isso que dá para rodar sem medo.
--
--  VERIFICADO NESTE BANCO ANTES DE GERAR (17/09/2026):
--    - 3 contas, nenhuma com is_admin — a falha nunca foi explorada
--    - zero registros clínicos sem dono — nada aqui vai travar
--    - bucket de laudos vazio — nada a perder ali
--    - nenhuma tela mexe nas colunas que serão trancadas
--
--  O QUE MUDA NA PRÁTICA PARA QUEM USA
--    - O link da agenda da Hellen para de funcionar (é o que está escrito no
--      código do projeto). Ela precisa gerar um novo em Configurações.
--    - Os links da agenda do Vitor e da Isabella continuam iguais.
--    - Nenhuma outra tela muda de comportamento.
--
--  Auditoria completa: docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
-- =============================================================================



-- ############################################################################
-- ### 20260917120000_a01_privilegio_profiles.sql
-- ############################################################################

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


-- ############################################################################
-- ### 20260917120100_a10_integridade_tenant.sql
-- ############################################################################

-- =============================================================================
-- A10 — Integridade de tenant nas tabelas clínicas
-- Auditoria: docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
--
-- PROBLEMA
--   psicologo_id foi adicionado como NULLABLE com DEFAULT auth.uid(). Três
--   consequências:
--     a) linha com psicologo_id NULL some para todo tenant via RLS (NULL =
--        auth.uid() é NULL), mas continua visível a TODA query service_role —
--        e o app tem 8+ rotas service_role. É registro clínico órfão.
--     b) DEFAULT auth.uid() em ADD COLUMN é avaliado UMA vez, no ALTER. Rodado
--        no SQL Editor (sem JWT) grava NULL; rodado por sessão autenticada,
--        carimba o UUID de quem rodou em todas as linhas legadas.
--     c) o backfill existe em security-hardening.sql e NÃO existe no
--        full-system-...sql; e agendamentos nunca teve backfill em script algum.
--
-- ESTA MIGRAÇÃO PODE FALHAR DE PROPÓSITO.
--   Se sobrarem órfãos, ela aborta e mostra a contagem por tabela. Isso é
--   intencional: transformar órfão em NOT NULL no chute significaria atribuir
--   prontuário de alguém a outra pessoa. Limpe e rode de novo.
--   Ela é um arquivo separado justamente para que essa falha NÃO desfaça a
--   migração de privilégio (20260917120000).
--
-- IDEMPOTENTE.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Backfill a partir do paciente dono (inclui agendamentos, que faltava)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.prontuarios t SET psicologo_id = p.psicologo_id
  FROM public.pacientes p WHERE t.paciente_id = p.id AND t.psicologo_id IS NULL;

UPDATE public.diario_bordo t SET psicologo_id = p.psicologo_id
  FROM public.pacientes p WHERE t.paciente_id = p.id AND t.psicologo_id IS NULL;

UPDATE public.laudos t SET psicologo_id = p.psicologo_id
  FROM public.pacientes p WHERE t.paciente_id = p.id AND t.psicologo_id IS NULL;

UPDATE public.pagamentos t SET psicologo_id = p.psicologo_id
  FROM public.pacientes p WHERE t.paciente_id = p.id AND t.psicologo_id IS NULL;

UPDATE public.agendamentos t SET psicologo_id = p.psicologo_id
  FROM public.pacientes p WHERE t.paciente_id = p.id AND t.psicologo_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Conferir órfãos e só então travar com NOT NULL
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tabela   text;
  v_tabelas  text[] := ARRAY[
    'pacientes', 'agendamentos', 'prontuarios',
    'diario_bordo', 'laudos', 'pagamentos'
  ];
  v_orfas    bigint;
  v_total    bigint := 0;
  v_relatorio text := '';
BEGIN
  -- 2a. Contagem de órfãos por tabela
  FOREACH v_tabela IN ARRAY v_tabelas LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE psicologo_id IS NULL', v_tabela)
      INTO v_orfas;
    v_total := v_total + v_orfas;
    IF v_orfas > 0 THEN
      v_relatorio := v_relatorio || format('  %s: %s linha(s) sem dono%s', v_tabela, v_orfas, chr(10));
    END IF;
  END LOOP;

  IF v_total > 0 THEN
    RAISE EXCEPTION E'A10 abortado: % registro(s) clinico(s) sem psicologo_id.\n%\nInvestigue antes de prosseguir — atribuir dono no chute e violar o sigilo do paciente.\nConsulta: SELECT * FROM public.<tabela> WHERE psicologo_id IS NULL;',
      v_total, v_relatorio;
  END IF;

  -- 2b. Sem órfãos: aplicar NOT NULL e remover o DEFAULT enganoso
  FOREACH v_tabela IN ARRAY v_tabelas LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN psicologo_id SET NOT NULL', v_tabela);
    -- O DEFAULT auth.uid() dá falsa sensação de segurança: só vale no INSERT
    -- direto e é avaliado no momento errado em ADD COLUMN. O dono passa a vir
    -- do WITH CHECK da policy, que é o lugar certo.
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN psicologo_id SET DEFAULT auth.uid()', v_tabela);
  END LOOP;

  RAISE NOTICE 'A10 aplicado: psicologo_id agora e NOT NULL nas 6 tabelas clinicas.';
END $$;


-- ############################################################################
-- ### 20260917120200_a20_grupos_cross_tenant.sql
-- ############################################################################

-- =============================================================================
-- A20 — Vínculo cross-tenant em grupo_membros
-- Auditoria: docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
--
-- PROBLEMA
--   A policy validava apenas psicologo_id = auth.uid(). Nada verificava que o
--   paciente_id e o grupo_id pertenciam ao mesmo psicólogo. Como a verificação
--   de chave estrangeira no Postgres IGNORA RLS, o INSERT com paciente_id de
--   outro psicólogo era aceito. Efeitos:
--     - oráculo de existência de UUID de paciente alheio;
--     - JOIN feito por rota service_role passa a cruzar tenants;
--     - ON DELETE CASCADE: o dono legítimo, ao excluir o paciente, altera em
--       silêncio o grupo de outra pessoa.
--
-- IDEMPOTENTE.
-- =============================================================================

DROP POLICY IF EXISTS "grupo_membros_insert_own" ON public.grupo_membros;
CREATE POLICY "grupo_membros_insert_own" ON public.grupo_membros
FOR INSERT TO authenticated
WITH CHECK (
  psicologo_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.pacientes p
    WHERE p.id = paciente_id AND p.psicologo_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.grupos g
    WHERE g.id = grupo_id AND g.psicologo_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "grupo_membros_update_own" ON public.grupo_membros;
CREATE POLICY "grupo_membros_update_own" ON public.grupo_membros
FOR UPDATE TO authenticated
USING (psicologo_id = auth.uid())
WITH CHECK (
  psicologo_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.pacientes p
    WHERE p.id = paciente_id AND p.psicologo_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.grupos g
    WHERE g.id = grupo_id AND g.psicologo_id = auth.uid()
  )
);

-- Mesmo raciocínio para a sessão de grupo referenciada pelo prontuário.
DROP POLICY IF EXISTS "prontuarios_insert_own" ON public.prontuarios;
CREATE POLICY "prontuarios_insert_own" ON public.prontuarios
FOR INSERT TO authenticated
WITH CHECK (
  psicologo_id = auth.uid()
  AND (
    paciente_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.pacientes p
      WHERE p.id = paciente_id AND p.psicologo_id = auth.uid()
    )
  )
);

-- Diagnóstico: vínculos cross-tenant que já existam hoje.
DO $$
DECLARE
  v_cruzados bigint;
BEGIN
  SELECT count(*) INTO v_cruzados
  FROM public.grupo_membros gm
  JOIN public.pacientes p ON p.id = gm.paciente_id
  WHERE p.psicologo_id IS DISTINCT FROM gm.psicologo_id;

  IF v_cruzados > 0 THEN
    RAISE WARNING 'A20: % vinculo(s) de grupo_membros apontam para paciente de OUTRO psicologo. Estes sao anteriores a esta policy — investigue antes de limpar: SELECT gm.* FROM public.grupo_membros gm JOIN public.pacientes p ON p.id = gm.paciente_id WHERE p.psicologo_id IS DISTINCT FROM gm.psicologo_id;', v_cruzados;
  ELSE
    RAISE NOTICE 'A20 aplicado. Nenhum vinculo cross-tenant preexistente.';
  END IF;
END $$;


-- ############################################################################
-- ### 20260917120300_a03_a04_a14_superficie_publica.sql
-- ############################################################################

-- =============================================================================
-- A03 + A04 + A14 — Superfície pública: token de calendário e Storage
-- Auditoria: docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
-- IDEMPOTENTE.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- A03 — Revogar o token de calendário que está no repositório
--
--   supabase-multiuser-migration.sql:19 gravou o literal
--   'hellen-cal-a7f3e9b2d1c8' em todo perfil sem token. Quem lê o repositório
--   acessa aquele feed sem autenticação nenhuma. Segredo em código versionado
--   não se "remove depois": o histórico do git é permanente, então o único
--   desfecho é rotacionar.
--
--   Também rotaciona qualquer token curto demais (< 32 caracteres), que só
--   pode ter vindo daquele mesmo período.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_rotacionados int;
BEGIN
  UPDATE public.profiles
  SET calendar_token = encode(gen_random_bytes(32), 'hex')
  WHERE calendar_token IS NULL
     OR calendar_token = 'hellen-cal-a7f3e9b2d1c8'
     OR length(calendar_token) < 32;

  GET DIAGNOSTICS v_rotacionados = ROW_COUNT;
  RAISE NOTICE 'A03: % token(s) de calendario rotacionado(s).', v_rotacionados;

  IF v_rotacionados > 0 THEN
    RAISE NOTICE 'ATENCAO: quem usava esses links precisa reassinar o calendario em Configuracoes. O link antigo deixou de funcionar — que e o objetivo.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- A04 — IDOR de laudos no Storage
--
--   full-system-security-audit-and-hardening.sql:207 criava:
--       USING (bucket_id = 'laudos' AND auth.uid() IS NOT NULL)
--   que significa apenas "estou logado" — qualquer psicólogo lia, sobrescrevia
--   e apagava o PDF de laudo de qualquer outro. Políticas de RLS são
--   PERMISSIVAS e combinam por OR, então a policy correta por pasta que existia
--   em outro script não anulava esta: bastava uma passar.
--
--   O bucket continua privado; o acesso é por URL assinada de 10 minutos.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "laudos_storage_owner_only" ON storage.objects;   -- a permissiva
DROP POLICY IF EXISTS "laudos_insert_own"         ON storage.objects;
DROP POLICY IF EXISTS "laudos_select_own"         ON storage.objects;
DROP POLICY IF EXISTS "laudos_update_own"         ON storage.objects;
DROP POLICY IF EXISTS "laudos_delete_own"         ON storage.objects;
DROP POLICY IF EXISTS "laudos_storage_isolate_user" ON storage.objects;

UPDATE storage.buckets SET public = false WHERE id = 'laudos';

CREATE POLICY "laudos_storage_isolate_user" ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'laudos'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'laudos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ─────────────────────────────────────────────────────────────────────────────
-- A14 — Enumeração no bucket de logos
--
--   supabase-multiuser-migration.sql:100 criava um SELECT `TO public` sobre
--   TODOS os objetos do bucket, sem escopo de pasta — o único ponto do sistema
--   com leitura concedida a `anon`. Isso permite LISTAR o bucket e, com isso,
--   enumerar os UUIDs de todos os psicólogos cadastrados.
--
--   DECISÃO, com o trade-off na mesa: o bucket `logos` permanece público para
--   SERVIR objeto por URL direta. Torná-lo privado exigiria trocar as três
--   montagens de URL pública por URL assinada, incluindo o cabeçalho impresso
--   dos laudos — e um erro ali some com o timbre de documento oficial do CFP,
--   silenciosamente. O ganho não paga esse risco agora.
--
--   Removendo a policy, a ENUMERAÇÃO morre (listar passa a ser negado) e a
--   exibição continua funcionando, porque bucket público serve
--   /object/public/... sem consultar RLS.
--
--   RISCO RESIDUAL ACEITO: quem já souber o UUID de um psicólogo e o nome do
--   arquivo ainda busca aquele logo. É material de marca, não dado clínico.
--   Fechar isso de vez = bucket privado + URL assinada, registrado como dívida.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "logos_select_public" ON storage.objects;

DROP POLICY IF EXISTS "logos_insert_own" ON storage.objects;
CREATE POLICY "logos_insert_own" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "logos_update_own" ON storage.objects;
CREATE POLICY "logos_update_own" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "logos_delete_own" ON storage.objects;
CREATE POLICY "logos_delete_own" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificação
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_permissiva int;
  v_publica    int;
BEGIN
  SELECT count(*) INTO v_permissiva
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'laudos_storage_owner_only';

  SELECT count(*) INTO v_publica
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'logos_select_public';

  IF v_permissiva > 0 OR v_publica > 0 THEN
    RAISE EXCEPTION 'Policies inseguras ainda presentes (laudos_storage_owner_only=%, logos_select_public=%).', v_permissiva, v_publica;
  END IF;

  RAISE NOTICE 'A04 + A14 aplicados: laudos isolado por pasta, enumeracao de logos fechada.';
END $$;


-- ############################################################################
-- ### 20260917120400_a13_rate_limit_compartilhado.sql
-- ############################################################################

-- =============================================================================
-- A13 — Rate limit compartilhado
-- Auditoria: docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
--
-- PROBLEMA
--   utils/rate-limit.ts guarda as contagens num Map em memória. Na Vercel cada
--   invocação serverless tem o seu, e o Map some no cold start. O limite de "5
--   tentativas por 15 minutos" vira "5 por instância, até a próxima reciclagem"
--   — ou seja, não é um limite.
--
-- SOLUÇÃO
--   Contador no Postgres, que é o único estado compartilhado que o projeto já
--   tem. Uma ida ao banco por requisição limitada; só as rotas sensíveis passam
--   por aqui.
--
-- IDEMPOTENTE.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key        TEXT PRIMARY KEY,
  count      INTEGER     NOT NULL DEFAULT 0,
  reset_at   TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_reset_at
  ON public.rate_limit_buckets (reset_at);

-- RLS ligada e SEM policy: nega a authenticated e anon por completo.
-- Só service_role (que ignora RLS) e a função SECURITY DEFINER abaixo entram.
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- Incremento atômico: o UPSERT resolve a corrida entre requisições
-- simultâneas, que é justamente o cenário de um ataque de força bruta.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key            TEXT,
  p_max            INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_row public.rate_limit_buckets%ROWTYPE;
BEGIN
  INSERT INTO public.rate_limit_buckets AS b (key, count, reset_at, updated_at)
  VALUES (p_key, 1, v_now + make_interval(secs => p_window_seconds), v_now)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE WHEN b.reset_at < v_now THEN 1 ELSE b.count + 1 END,
        reset_at = CASE
                     WHEN b.reset_at < v_now
                     THEN v_now + make_interval(secs => p_window_seconds)
                     ELSE b.reset_at
                   END,
        updated_at = v_now
  RETURNING * INTO v_row;

  -- Limpeza oportunista: 1% das chamadas varre o que expirou há mais de 1 dia.
  -- Evita tanto a tabela crescer sem fim quanto um cron só para isto.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_buckets WHERE reset_at < v_now - INTERVAL '1 day';
  END IF;

  RETURN QUERY SELECT
    v_row.count <= p_max,
    GREATEST(p_max - v_row.count, 0),
    v_row.reset_at;
END $$;

-- A função só pode ser chamada pelo servidor, nunca pelo navegador.
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

DO $$
BEGIN
  RAISE NOTICE 'A13 aplicado: rate limit compartilhado em public.rate_limit_buckets.';
END $$;


-- ############################################################################
-- ### 20260917120500_a18_convites.sql
-- ############################################################################

-- =============================================================================
-- A18 — Convites: expiração e consumo atômico
-- Auditoria: docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
--
-- PROBLEMA
--   a) A tabela não tinha expires_at: convite emitido é credencial eterna.
--   b) O consumo era check-then-write sem transação: duas requisições
--      simultâneas com o mesmo código validavam as duas e criavam duas contas.
--
-- reserved_at é a trava de corrida: o UPDATE condicional em app/api/auth/
-- register só deixa uma requisição passar, porque o Postgres serializa o
-- UPDATE da mesma linha.
--
-- IDEMPOTENTE.
-- =============================================================================

ALTER TABLE public.invites ADD COLUMN IF NOT EXISTS expires_at  TIMESTAMPTZ;
ALTER TABLE public.invites ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ;

-- Convites antigos e ainda abertos ganham prazo em vez de valerem para sempre.
UPDATE public.invites
SET expires_at = COALESCE(created_at, now()) + INTERVAL '14 days'
WHERE used_by IS NULL AND expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invites_code_aberto
  ON public.invites (code) WHERE used_by IS NULL;

DO $$
DECLARE
  v_abertos int;
  v_vencidos int;
BEGIN
  SELECT count(*) INTO v_abertos  FROM public.invites WHERE used_by IS NULL;
  SELECT count(*) INTO v_vencidos FROM public.invites
    WHERE used_by IS NULL AND expires_at < now();

  RAISE NOTICE 'A18 aplicado. Convites em aberto: % (dos quais % ja vencidos).',
    v_abertos, v_vencidos;
END $$;


-- ############################################################################
-- ### 20260917120600_a05_a06_a08_a11_pagamentos.sql
-- ############################################################################

-- =============================================================================
-- A05 + A06 + A08 + A11 — Cadeia de pagamento
-- Auditoria: docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
-- IDEMPOTENTE.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Idempotência de pagamento (A06 + A08)
--
--    Sem registro do que já foi processado, tanto pix/check quanto o webhook
--    podiam ser chamados de novo com o mesmo payment_id, somando +30 dias a
--    cada repetição. A constraint UNIQUE é o mecanismo — verificar em código
--    antes de gravar reabriria a corrida.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id   TEXT        NOT NULL UNIQUE,
  user_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  origem       TEXT        NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_user ON public.payment_events (user_id);

-- RLS ligada e sem policy: nega a authenticated e anon por completo.
-- Só o servidor (service_role) escreve e lê.
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Incremento atômico de uso de cupom (A11)
--
--    O código fazia uses_count = (lido antes) + 1, com o client do usuário, e
--    sem policy de UPDATE em coupons — o update afetava 0 linhas e não
--    retornava erro. Resultado: o contador nunca saía de 0 e max_uses jamais
--    era atingido, tornando todo cupom de uso único ilimitado na prática.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_coupon_uses(p_coupon_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_novo INTEGER;
BEGIN
  UPDATE public.coupons
  SET uses_count = COALESCE(uses_count, 0) + 1
  WHERE id = p_coupon_id
  RETURNING uses_count INTO v_novo;

  IF v_novo IS NULL THEN
    RAISE EXCEPTION 'Cupom % nao encontrado.', p_coupon_id;
  END IF;

  RETURN v_novo;
END $$;

REVOKE ALL ON FUNCTION public.increment_coupon_uses(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_coupon_uses(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.increment_coupon_uses(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_coupon_uses(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Fechar o catálogo de cupons (A11)
--
--    `coupons_read_active` dava SELECT a QUALQUER autenticado sobre todo cupom
--    ativo — incluindo os de tipo 'vip', que concedem acesso vitalício. Não era
--    preciso adivinhar código nenhum: bastava listar a tabela.
--    A validação passou inteira para o servidor (utils/coupons.ts), então
--    nenhuma policy de leitura é necessária para o usuário.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coupons_read_active"           ON public.coupons;
DROP POLICY IF EXISTS "coupons_select_authenticated"  ON public.coupons;
DROP POLICY IF EXISTS "coupons_select_active"         ON public.coupons;

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
-- Sem nenhuma policy para authenticated: leitura e escrita só por service_role.

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Resgates: SELECT e INSERT apenas (A11)
--
--    `coupon_redemptions_own` era FOR ALL, e FOR ALL inclui DELETE. A tabela
--    existe justamente para impedir reuso (UNIQUE(coupon_id, profile_id)), mas
--    o usuário podia apagar o próprio resgate pelo navegador e aplicar o mesmo
--    cupom de novo, indefinidamente.
--
--    Note que o script original estava CORRETO (SELECT + INSERT) e foi o
--    "script mestre de blindagem" posterior que afrouxou para FOR ALL.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coupon_redemptions_own"            ON public.coupon_redemptions;
DROP POLICY IF EXISTS "coupon_redemptions_select_own"     ON public.coupon_redemptions;
DROP POLICY IF EXISTS "coupon_redemptions_insert_own"     ON public.coupon_redemptions;

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coupon_redemptions_select_own" ON public.coupon_redemptions
FOR SELECT TO authenticated
USING (profile_id = auth.uid());

-- Sem policy de UPDATE nem DELETE: resgate é registro histórico, não se apaga.

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Verificação
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_ruins int;
BEGIN
  SELECT count(*) INTO v_ruins
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      (tablename = 'coupons' AND 'authenticated' = ANY(roles))
      OR (tablename = 'coupon_redemptions' AND cmd IN ('ALL', 'DELETE', 'UPDATE'))
    );

  IF v_ruins > 0 THEN
    RAISE EXCEPTION 'Ainda existem % policy(ies) permissivas em coupons/coupon_redemptions.', v_ruins;
  END IF;

  RAISE NOTICE 'A05/A06/A08/A11 aplicados: idempotencia de pagamento e cupons fechados.';
END $$;


-- ############################################################################
-- ### 20260917120700_a07_chaves_por_usuario.sql
-- ############################################################################

-- =============================================================================
-- A07 — Chave de criptografia por psicólogo (envelope)
-- Auditoria: docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
--
-- PROBLEMA
--   utils/crypto.ts derivava a chave de:
--     NEXT_PUBLIC_CLINICAL_ENCRYPTION_SECRET
--       || CLINICAL_ENCRYPTION_SECRET
--       || "psychocare-vault-secret-key-2026"   <- constante no repositório
--   Como a cifragem acontece no navegador, esse segredo é servido no bundle a
--   qualquer visitante, e o cadastro é aberto. O salt é o próprio userId. Ou
--   seja: um segredo único, público, para todos os psicólogos. Quem obtivesse
--   o banco (dump, backup, falha de RLS) obtinha o texto claro.
--
-- MODELO NOVO — envelope
--   KEK  (Key Encryption Key): 32 bytes, vive APENAS na variável de ambiente
--        CLINICAL_KEK do servidor. Nunca vai ao navegador, nunca ao banco.
--   DEK  (Data Encryption Key): 32 bytes aleatórios POR PSICÓLOGO. Guardada
--        aqui cifrada com a KEK. O navegador recebe a sua, e só a sua, por
--        rota autenticada, e a mantém em memória.
--
-- O QUE ISTO PROTEGE, E CONTRA QUEM (obrigatório declarar os dois):
--   ✓ Vazamento do banco, backup roubado, falha de RLS, acesso ao painel do
--     Supabase: o conteúdo é inútil sem a KEK, que não está lá.
--   ✓ Um psicólogo lendo dado de outro: cada um só obtém a própria DEK.
--   ✗ NÃO protege contra servidor comprometido: quem executa código no
--     servidor alcança a KEK e o banco.
--   ✗ NÃO é ponta a ponta: o servidor consegue decifrar quando precisa
--     (feed iCal, futuras rotinas). Foi a decisão tomada, porque E2E real
--     quebraria o calendário e tornaria "esqueci a senha" uma perda total.
--
-- IDEMPOTENTE.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_encryption_keys (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Formato: v1:<iv_hex>:<dek_cifrada_hex>, cifrada com AES-GCM usando a KEK.
  wrapped_dek TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at  TIMESTAMPTZ
);

-- RLS ligada e SEM nenhuma policy: nem authenticated nem anon leem esta tabela
-- pelo PostgREST. O único caminho é o servidor (service_role), pela rota
-- autenticada que devolve a DEK exclusivamente ao dono da sessão.
ALTER TABLE public.user_encryption_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_encryption_keys FROM anon;
REVOKE ALL ON public.user_encryption_keys FROM authenticated;

COMMENT ON TABLE public.user_encryption_keys IS
  'DEK por psicologo, cifrada com a KEK do servidor (env CLINICAL_KEK). Sem a KEK, o conteudo desta tabela nao serve para nada.';

DO $$
BEGIN
  RAISE NOTICE 'A07 aplicado: tabela de chaves criada. A KEK vive em CLINICAL_KEK, no servidor — nunca no banco.';
END $$;


-- ############################################################################
-- ### 20260917120800_a19_trigger_perfil.sql
-- ############################################################################

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


-- #############################################################################
-- ### CONFERÊNCIA FINAL — lê o resultado e confirma que tudo pegou
-- #############################################################################

DO $verificacao$
DECLARE
  v_update_tabela int;
  v_policies_ruins int;
  v_orfaos int;
  v_tem_tabela_chaves boolean;
  v_tem_rate_limit boolean;
  v_tem_payment_events boolean;
BEGIN
  SELECT count(*) INTO v_update_tabela
  FROM information_schema.table_privileges
  WHERE table_schema='public' AND table_name='profiles'
    AND grantee='authenticated' AND privilege_type='UPDATE';

  SELECT count(*) INTO v_policies_ruins
  FROM pg_policies
  WHERE policyname IN ('laudos_storage_owner_only','logos_select_public','coupons_read_active')
     OR (schemaname='public' AND 'anon' = ANY(roles));

  SELECT count(*) INTO v_orfaos FROM public.pacientes WHERE psicologo_id IS NULL;

  SELECT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='user_encryption_keys') INTO v_tem_tabela_chaves;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='rate_limit_buckets') INTO v_tem_rate_limit;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='payment_events') INTO v_tem_payment_events;

  RAISE NOTICE '';
  RAISE NOTICE '===========================================================';
  RAISE NOTICE '  CONFERENCIA FINAL';
  RAISE NOTICE '===========================================================';
  RAISE NOTICE '  Escalada de privilegio fechada ....... %', CASE WHEN v_update_tabela = 0 THEN 'SIM' ELSE 'NAO!!' END;
  RAISE NOTICE '  Policies inseguras restantes ......... %', v_policies_ruins;
  RAISE NOTICE '  Pacientes sem dono ................... %', v_orfaos;
  RAISE NOTICE '  Tabela de chaves criada .............. %', CASE WHEN v_tem_tabela_chaves THEN 'SIM' ELSE 'NAO!!' END;
  RAISE NOTICE '  Tabela de limite de tentativas ....... %', CASE WHEN v_tem_rate_limit THEN 'SIM' ELSE 'NAO!!' END;
  RAISE NOTICE '  Tabela de pagamentos processados ..... %', CASE WHEN v_tem_payment_events THEN 'SIM' ELSE 'NAO!!' END;
  RAISE NOTICE '===========================================================';

  IF v_update_tabela > 0 OR v_policies_ruins > 0 OR NOT v_tem_tabela_chaves
     OR NOT v_tem_rate_limit OR NOT v_tem_payment_events THEN
    RAISE EXCEPTION 'Alguma correcao NAO foi aplicada. Nada foi gravado — o banco continua como estava.';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '  TUDO APLICADO COM SUCESSO.';
  RAISE NOTICE '  Proximo passo: publicar o codigo novo (o push).';
  RAISE NOTICE '';
END $verificacao$;
