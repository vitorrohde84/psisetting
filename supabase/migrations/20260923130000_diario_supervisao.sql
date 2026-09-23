-- =============================================================================
--  Diário de Bordo — comentários de supervisão
--  IDEMPOTENTE. Rode o arquivo INTEIRO no SQL Editor do Supabase, ANTES do push.
-- =============================================================================
--
--  COMO USAR
--    1. Faça o backup:  npm run backup
--    2. Supabase → SQL Editor → New query → cole este arquivo inteiro
--    3. Clique numa parte vazia do texto (nada selecionado) → Run
--    4. Leia a TABELA do final. Toda linha tem que dizer OK.
--    5. Só então faça o push do código.
--
--  TUDO OU NADA: o SQL Editor roda o arquivo como uma transação. Se algo
--  falhar, a mensagem de erro aparece e NADA é gravado.
--
--  O QUE É
--    Cada anotação do Diário de Bordo ganha comentários de supervisão: o que o
--    psicólogo ouviu na supervisão com outro psicólogo sobre aquela sessão.
--    Quem escreve é sempre o próprio psicólogo — o supervisor não acessa o
--    sistema. `conteudo` e `supervisor` chegam CIFRADOS pelo navegador
--    (enc:v2:, mesma chave do diário); o banco nunca vê o texto claro.
--
--  POR QUE O SQL VEM ANTES DO CÓDIGO
--    O código novo lê esta tabela ao abrir o diário de um paciente. Se ela
--    ainda não existir, o diário continua funcionando, mas a supervisão fica
--    escondida com um aviso de "não foi possível carregar" — e o backup CSV
--    sai com a seção de supervisão marcada como não exportada.
--    O código antigo ignora a tabela, então aplicar antes do push não quebra
--    nada que está no ar.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabela
--
--    psicologo_id repete o dono da anotação em vez de depender só do JOIN com
--    diario_bordo: a RLS fica uma comparação direta, igual às outras tabelas
--    clínicas, e o backup/restauração não precisa reconstruir o dono.
--    ON DELETE CASCADE na anotação: comentário de supervisão sem a anotação a
--    que se refere perde o sentido clínico.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.diario_supervisoes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  diario_id       UUID        NOT NULL REFERENCES public.diario_bordo(id) ON DELETE CASCADE,
  psicologo_id    UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  data_supervisao DATE        NOT NULL DEFAULT current_date,
  supervisor      TEXT        NULL,
  conteudo        TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A tela busca por diario_id (uma consulta por página de anotações); a RLS
-- filtra por psicologo_id em toda leitura.
CREATE INDEX IF NOT EXISTS idx_diario_supervisoes_diario    ON public.diario_supervisoes (diario_id);
CREATE INDEX IF NOT EXISTS idx_diario_supervisoes_psicologo ON public.diario_supervisoes (psicologo_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. updated_at automático
--
--    Feito no banco, não no navegador: um relógio de cliente adiantado ou
--    atrasado não pode reescrever quando o comentário mudou.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.diario_supervisoes_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS diario_supervisoes_updated_at_trg ON public.diario_supervisoes;
CREATE TRIGGER diario_supervisoes_updated_at_trg
BEFORE UPDATE ON public.diario_supervisoes
FOR EACH ROW
EXECUTE FUNCTION public.diario_supervisoes_touch_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS — quatro policies, só para quem está logado
--
--    O EXISTS em INSERT e UPDATE não é redundante: a verificação de chave
--    estrangeira IGNORA a RLS. Só com psicologo_id = auth.uid(), qualquer
--    psicólogo conseguiria pendurar comentário no diário de OUTRO (bastava
--    conhecer o UUID) — o mesmo furo da A20 em grupo_membros, incluindo o
--    CASCADE: o dono legítimo, ao excluir a anotação, apagaria o comentário
--    alheio em silêncio.
--
--    diario_id vai qualificado com o nome da tabela: sem isso, se um dia
--    diario_bordo ganhar uma coluna diario_id, o nome passaria a apontar para
--    ela dentro do subselect e a checagem mudaria de sentido sem ninguém ver.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.diario_supervisoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diario_supervisoes_select_own" ON public.diario_supervisoes;
CREATE POLICY "diario_supervisoes_select_own" ON public.diario_supervisoes
FOR SELECT TO authenticated
USING (psicologo_id = auth.uid());

DROP POLICY IF EXISTS "diario_supervisoes_insert_own" ON public.diario_supervisoes;
CREATE POLICY "diario_supervisoes_insert_own" ON public.diario_supervisoes
FOR INSERT TO authenticated
WITH CHECK (
  psicologo_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.diario_bordo d
    WHERE d.id = diario_supervisoes.diario_id AND d.psicologo_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "diario_supervisoes_update_own" ON public.diario_supervisoes;
CREATE POLICY "diario_supervisoes_update_own" ON public.diario_supervisoes
FOR UPDATE TO authenticated
USING (psicologo_id = auth.uid())
WITH CHECK (
  psicologo_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.diario_bordo d
    WHERE d.id = diario_supervisoes.diario_id AND d.psicologo_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "diario_supervisoes_delete_own" ON public.diario_supervisoes;
CREATE POLICY "diario_supervisoes_delete_own" ON public.diario_supervisoes
FOR DELETE TO authenticated
USING (psicologo_id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Permissões de tabela — a segunda trava, além da RLS
--
--    O Supabase dá ALL em tabela nova para anon e authenticated por padrão.
--    anon (visitante sem login) não tem o que fazer aqui: sai tudo.
--    authenticated fica só com as quatro operações que as policies cobrem —
--    TRUNCATE, em especial, não passa pela RLS.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON public.diario_supervisoes FROM anon;
REVOKE ALL ON public.diario_supervisoes FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diario_supervisoes TO authenticated;
-- Backup e restauração (scripts/backup-completo.ts, restaurar-backup.ts).
GRANT ALL ON public.diario_supervisoes TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Conferência estrutural — falha alto (e desfaz tudo) se algo não pegou
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_cmds       TEXT[];
  v_sem_dono   INTEGER;
  v_largas     INTEGER;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.diario_supervisoes'::regclass) THEN
    RAISE EXCEPTION 'RLS desligada em diario_supervisoes. Nada foi gravado.';
  END IF;

  SELECT array_agg(DISTINCT cmd ORDER BY cmd) INTO v_cmds
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'diario_supervisoes'
    AND 'authenticated' = ANY(roles);

  IF v_cmds IS DISTINCT FROM ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE'] THEN
    RAISE EXCEPTION 'diario_supervisoes: esperado policies SELECT/INSERT/UPDATE/DELETE para authenticated, encontrado %. Nada foi gravado.', v_cmds;
  END IF;

  -- Policy FOR ALL, para anon ou para public abriria o que as quatro fecham
  -- (policies permissivas se somam com OR).
  SELECT count(*) INTO v_largas
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'diario_supervisoes'
    AND (cmd = 'ALL' OR 'anon' = ANY(roles) OR 'public' = ANY(roles));

  IF v_largas > 0 THEN
    RAISE EXCEPTION 'diario_supervisoes: % policy(ies) larga(s) demais (FOR ALL, anon ou public). Nada foi gravado.', v_largas;
  END IF;

  -- INSERT e UPDATE precisam conferir o dono da anotação (ver seção 3).
  SELECT count(*) INTO v_sem_dono
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'diario_supervisoes'
    AND cmd IN ('INSERT', 'UPDATE')
    AND (with_check IS NULL OR with_check NOT LIKE '%diario_bordo%');

  IF v_sem_dono > 0 THEN
    RAISE EXCEPTION 'diario_supervisoes: % policy(ies) de INSERT/UPDATE sem conferir o dono da anotacao. Nada foi gravado.', v_sem_dono;
  END IF;

  -- Com lista de privilégios, has_table_privilege é true se QUALQUER um existir.
  IF has_table_privilege('anon', 'public.diario_supervisoes',
                         'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') THEN
    RAISE EXCEPTION 'Visitante sem login (anon) ainda tem privilegio em diario_supervisoes. Nada foi gravado.';
  END IF;

  IF has_table_privilege('authenticated', 'public.diario_supervisoes', 'TRUNCATE') THEN
    RAISE EXCEPTION 'authenticated ainda pode dar TRUNCATE em diario_supervisoes. Nada foi gravado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.diario_supervisoes'::regclass
      AND tgname  = 'diario_supervisoes_updated_at_trg'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Trigger de updated_at ausente em diario_supervisoes. Nada foi gravado.';
  END IF;
END $$;

-- O PostgREST precisa enxergar a tabela nova sem esperar o cache.
NOTIFY pgrst, 'reload schema';


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RESULTADO — a única tabela que o SQL Editor mostra
--
--    Tudo tem que dizer OK. (Se algo tivesse falhado, o bloco acima já teria
--    parado com erro e nada estaria gravado; esta tabela é a confirmação
--    visível, porque o SQL Editor não mostra RAISE NOTICE.)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'conferência' AS tipo, 'Tabela diario_supervisoes' AS item,
       CASE WHEN to_regclass('public.diario_supervisoes') IS NOT NULL THEN 'OK' ELSE 'FALHOU' END AS resultado,
       (SELECT count(*) FROM public.diario_supervisoes)::text || ' comentário(s) gravado(s)' AS detalhe
UNION ALL
SELECT 'conferência', 'RLS ligada',
       CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.diario_supervisoes'::regclass)
            THEN 'OK' ELSE 'FALHOU' END,
       ''
UNION ALL
SELECT 'conferência', 'Policies SELECT/INSERT/UPDATE/DELETE (só logado)',
       CASE WHEN (SELECT array_agg(DISTINCT cmd ORDER BY cmd) FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'diario_supervisoes'
                    AND 'authenticated' = ANY(roles))
                 = ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']
            THEN 'OK' ELSE 'FALHOU' END,
       (SELECT string_agg(policyname::text, ', ' ORDER BY policyname) FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'diario_supervisoes')
UNION ALL
SELECT 'conferência', 'Comentário só em anotação do próprio psicólogo',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies
                             WHERE schemaname = 'public' AND tablename = 'diario_supervisoes'
                               AND cmd IN ('INSERT', 'UPDATE')
                               AND (with_check IS NULL OR with_check NOT LIKE '%diario_bordo%'))
            THEN 'OK' ELSE 'FALHOU' END,
       'INSERT e UPDATE conferem o dono em diario_bordo'
UNION ALL
SELECT 'conferência', 'Visitante sem login (anon) sem acesso',
       CASE WHEN NOT has_table_privilege('anon', 'public.diario_supervisoes',
                                         'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
            THEN 'OK' ELSE 'FALHOU' END,
       ''
UNION ALL
SELECT 'conferência', 'updated_at automático (trigger)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                         WHERE tgrelid = 'public.diario_supervisoes'::regclass
                           AND tgname = 'diario_supervisoes_updated_at_trg' AND NOT tgisinternal)
            THEN 'OK' ELSE 'FALHOU' END,
       '';
