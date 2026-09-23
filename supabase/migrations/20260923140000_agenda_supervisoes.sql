-- =============================================================================
--  Agenda de supervisões
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
--    A Agenda ganha a aba "Supervisões". O psicólogo pode estar dos dois lados:
--    supervisiona um colega que traz casos para ele (papel 'supervisor') ou
--    leva os próprios casos a um supervisor (papel 'supervisionado'). O colega
--    NÃO tem conta no sistema: guardamos só o nome e, se quiser, o WhatsApp.
--    Valor e "pago" moram aqui mesmo, sem passar pelo Financeiro (decisão do
--    dono em 23/09). `observacoes` chega CIFRADA pelo navegador (enc:v2:, a
--    mesma chave do agendamento) e o banco recusa texto claro nessa coluna.
--
--  POR QUE O SQL VEM ANTES DO CÓDIGO
--    O código novo lê esta tabela ao abrir a Agenda e ao montar o feed do
--    celular. Se ela ainda não existir, os atendimentos continuam aparecendo
--    normalmente: a aba Supervisões mostra "não foi possível carregar", o feed
--    sai só com os atendimentos e o backup CSV marca a seção como não
--    exportada. O código antigo ignora a tabela, então aplicar antes do push
--    não quebra nada que está no ar.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabela
--
--    data e horario seguem os tipos de agendamentos (DATE e TIME): a tela, o
--    feed .ics e a checagem de conflito tratam os dois do mesmo jeito
--    ("AAAA-MM-DD" e "HH:MM:SS"), sem conversão de fuso no meio.
--
--    As CHECKs têm nome para a conferência da seção 5 achar cada uma — e para
--    a mensagem de erro dizer qual regra barrou a gravação.
--
--    colega_nome fica em texto (a CHECK de 1 a 120 vale para o nome que se
--    lê) e NUNCA sai no feed do celular. observacoes, que pode citar caso
--    clínico discutido na supervisão, só entra cifrada: a CHECK é a segunda
--    trava, para o dia em que um bug no navegador tentar gravar em claro.
--
--    colega_whatsapp guarda só dígitos (10 a 13: DDD + número, com ou sem o
--    55), igual ao telefone do paciente. Texto livre ali não abre conversa.
--
--    serie_id agrupa as supervisões criadas juntas pelo "Repetir": é por ele
--    que "cancelar/excluir esta e as próximas" acha as irmãs. Não é chave
--    estrangeira — a série não existe como linha própria.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agenda_supervisoes (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  psicologo_id    UUID          NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  papel           TEXT          NOT NULL,
  colega_nome     TEXT          NOT NULL,
  colega_whatsapp TEXT          NULL,
  data            DATE          NOT NULL,
  horario         TIME          NOT NULL,
  duracao_minutos INTEGER       NOT NULL DEFAULT 60,
  modalidade      TEXT          NOT NULL DEFAULT 'presencial',
  status          TEXT          NOT NULL DEFAULT 'agendada',
  valor           NUMERIC(10,2) NULL,
  pago            BOOLEAN       NOT NULL DEFAULT false,
  observacoes     TEXT          NULL,
  serie_id        UUID          NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT agenda_supervisoes_papel_chk
    CHECK (papel IN ('supervisor', 'supervisionado')),
  CONSTRAINT agenda_supervisoes_colega_nome_chk
    CHECK (char_length(btrim(colega_nome)) >= 1 AND char_length(colega_nome) <= 120),
  CONSTRAINT agenda_supervisoes_colega_whatsapp_chk
    CHECK (colega_whatsapp IS NULL OR colega_whatsapp ~ '^[0-9]{10,13}$'),
  CONSTRAINT agenda_supervisoes_duracao_chk
    CHECK (duracao_minutos BETWEEN 5 AND 600),
  CONSTRAINT agenda_supervisoes_modalidade_chk
    CHECK (modalidade IN ('presencial', 'online')),
  CONSTRAINT agenda_supervisoes_status_chk
    CHECK (status IN ('agendada', 'realizada', 'cancelada')),
  CONSTRAINT agenda_supervisoes_valor_chk
    CHECK (valor IS NULL OR valor >= 0),
  CONSTRAINT agenda_supervisoes_observacoes_cifradas_chk
    CHECK (observacoes IS NULL OR observacoes LIKE 'enc:v_:%')
);

-- A Agenda busca por intervalo de datas (o mês do calendário, as próximas, as
-- passadas) e a RLS filtra por psicologo_id em toda leitura: um índice cobre
-- as duas coisas, como em agendamentos.
CREATE INDEX IF NOT EXISTS idx_agenda_supervisoes_psicologo_data
  ON public.agenda_supervisoes (psicologo_id, data);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. updated_at automático
--
--    Feito no banco, não no navegador: um relógio de cliente adiantado ou
--    atrasado não pode reescrever quando a supervisão mudou.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agenda_supervisoes_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS agenda_supervisoes_updated_at_trg ON public.agenda_supervisoes;
CREATE TRIGGER agenda_supervisoes_updated_at_trg
BEFORE UPDATE ON public.agenda_supervisoes
FOR EACH ROW
EXECUTE FUNCTION public.agenda_supervisoes_touch_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS — quatro policies, só para quem está logado
--
--    Sem EXISTS em outra tabela (ao contrário de diario_supervisoes): aqui não
--    há chave estrangeira para dado de outro psicólogo — o colega é só um nome.
--    psicologo_id = auth.uid() em USING e em WITH CHECK basta, e o WITH CHECK
--    do UPDATE impede "doar" a linha para outra conta.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.agenda_supervisoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agenda_supervisoes_select_own" ON public.agenda_supervisoes;
CREATE POLICY "agenda_supervisoes_select_own" ON public.agenda_supervisoes
FOR SELECT TO authenticated
USING (psicologo_id = auth.uid());

DROP POLICY IF EXISTS "agenda_supervisoes_insert_own" ON public.agenda_supervisoes;
CREATE POLICY "agenda_supervisoes_insert_own" ON public.agenda_supervisoes
FOR INSERT TO authenticated
WITH CHECK (psicologo_id = auth.uid());

DROP POLICY IF EXISTS "agenda_supervisoes_update_own" ON public.agenda_supervisoes;
CREATE POLICY "agenda_supervisoes_update_own" ON public.agenda_supervisoes
FOR UPDATE TO authenticated
USING (psicologo_id = auth.uid())
WITH CHECK (psicologo_id = auth.uid());

DROP POLICY IF EXISTS "agenda_supervisoes_delete_own" ON public.agenda_supervisoes;
CREATE POLICY "agenda_supervisoes_delete_own" ON public.agenda_supervisoes
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
REVOKE ALL ON public.agenda_supervisoes FROM anon;
REVOKE ALL ON public.agenda_supervisoes FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_supervisoes TO authenticated;
-- Feed do celular (app/calendario/[token]) e backup/restauração
-- (scripts/backup-completo.ts, restaurar-backup.ts).
GRANT ALL ON public.agenda_supervisoes TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Conferência estrutural — falha alto (e desfaz tudo) se algo não pegou
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_cmds        TEXT[];
  v_largas      INTEGER;
  v_sem_dono    INTEGER;
  v_faltando    TEXT[];
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.agenda_supervisoes'::regclass) THEN
    RAISE EXCEPTION 'RLS desligada em agenda_supervisoes. Nada foi gravado.';
  END IF;

  SELECT array_agg(DISTINCT cmd ORDER BY cmd) INTO v_cmds
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'agenda_supervisoes'
    AND 'authenticated' = ANY(roles);

  IF v_cmds IS DISTINCT FROM ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE'] THEN
    RAISE EXCEPTION 'agenda_supervisoes: esperado policies SELECT/INSERT/UPDATE/DELETE para authenticated, encontrado %. Nada foi gravado.', v_cmds;
  END IF;

  -- Policy FOR ALL, para anon ou para public abriria o que as quatro fecham
  -- (policies permissivas se somam com OR).
  SELECT count(*) INTO v_largas
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'agenda_supervisoes'
    AND (cmd = 'ALL' OR 'anon' = ANY(roles) OR 'public' = ANY(roles));

  IF v_largas > 0 THEN
    RAISE EXCEPTION 'agenda_supervisoes: % policy(ies) larga(s) demais (FOR ALL, anon ou public). Nada foi gravado.', v_largas;
  END IF;

  -- Toda condição tem que amarrar ao dono logado; o UPDATE, nas duas pontas
  -- (quem pode mexer e como a linha pode ficar).
  SELECT count(*) INTO v_sem_dono
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'agenda_supervisoes'
    AND (
      (cmd IN ('SELECT', 'DELETE', 'UPDATE') AND (qual IS NULL OR qual NOT LIKE '%auth.uid()%'))
      OR (cmd IN ('INSERT', 'UPDATE') AND (with_check IS NULL OR with_check NOT LIKE '%auth.uid()%'))
    );

  IF v_sem_dono > 0 THEN
    RAISE EXCEPTION 'agenda_supervisoes: % policy(ies) sem psicologo_id = auth.uid(). Nada foi gravado.', v_sem_dono;
  END IF;

  -- Uma tabela de uma execução antiga, sem alguma CHECK, passaria pelo
  -- CREATE TABLE IF NOT EXISTS calada. Aqui ela para.
  SELECT array_agg(esperada ORDER BY esperada) INTO v_faltando
  FROM unnest(ARRAY[
    'agenda_supervisoes_papel_chk',
    'agenda_supervisoes_colega_nome_chk',
    'agenda_supervisoes_colega_whatsapp_chk',
    'agenda_supervisoes_duracao_chk',
    'agenda_supervisoes_modalidade_chk',
    'agenda_supervisoes_status_chk',
    'agenda_supervisoes_valor_chk',
    'agenda_supervisoes_observacoes_cifradas_chk'
  ]) AS esperada
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.agenda_supervisoes'::regclass
      AND conname  = esperada
      AND contype  = 'c'
  );

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'agenda_supervisoes: faltam as regras %. Nada foi gravado.', v_faltando;
  END IF;

  -- Com lista de privilégios, has_table_privilege é true se QUALQUER um existir.
  IF has_table_privilege('anon', 'public.agenda_supervisoes',
                         'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') THEN
    RAISE EXCEPTION 'Visitante sem login (anon) ainda tem privilegio em agenda_supervisoes. Nada foi gravado.';
  END IF;

  IF has_table_privilege('authenticated', 'public.agenda_supervisoes', 'TRUNCATE') THEN
    RAISE EXCEPTION 'authenticated ainda pode dar TRUNCATE em agenda_supervisoes. Nada foi gravado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.agenda_supervisoes'::regclass
      AND tgname  = 'agenda_supervisoes_updated_at_trg'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Trigger de updated_at ausente em agenda_supervisoes. Nada foi gravado.';
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
SELECT 'conferência' AS tipo, 'Tabela agenda_supervisoes' AS item,
       CASE WHEN to_regclass('public.agenda_supervisoes') IS NOT NULL THEN 'OK' ELSE 'FALHOU' END AS resultado,
       (SELECT count(*) FROM public.agenda_supervisoes)::text || ' supervisão(ões) gravada(s)' AS detalhe
UNION ALL
SELECT 'conferência', 'RLS ligada',
       CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.agenda_supervisoes'::regclass)
            THEN 'OK' ELSE 'FALHOU' END,
       ''
UNION ALL
SELECT 'conferência', 'Policies SELECT/INSERT/UPDATE/DELETE (só logado)',
       CASE WHEN (SELECT array_agg(DISTINCT cmd ORDER BY cmd) FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'agenda_supervisoes'
                    AND 'authenticated' = ANY(roles))
                 = ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']
            THEN 'OK' ELSE 'FALHOU' END,
       (SELECT string_agg(policyname::text, ', ' ORDER BY policyname) FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'agenda_supervisoes')
UNION ALL
SELECT 'conferência', 'Cada psicólogo só vê e altera as próprias',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies
                             WHERE schemaname = 'public' AND tablename = 'agenda_supervisoes'
                               AND ((cmd IN ('SELECT', 'DELETE', 'UPDATE') AND (qual IS NULL OR qual NOT LIKE '%auth.uid()%'))
                                 OR (cmd IN ('INSERT', 'UPDATE') AND (with_check IS NULL OR with_check NOT LIKE '%auth.uid()%'))))
            THEN 'OK' ELSE 'FALHOU' END,
       'psicologo_id = auth.uid() em USING e WITH CHECK'
UNION ALL
SELECT 'conferência', 'Regras de valores (papel, status, duração, valor…)',
       CASE WHEN (SELECT count(*) FROM pg_constraint
                  WHERE conrelid = 'public.agenda_supervisoes'::regclass AND contype = 'c'
                    AND conname LIKE 'agenda_supervisoes_%_chk') = 8
            THEN 'OK' ELSE 'FALHOU' END,
       (SELECT count(*) FROM pg_constraint
        WHERE conrelid = 'public.agenda_supervisoes'::regclass AND contype = 'c'
          AND conname LIKE 'agenda_supervisoes_%_chk')::text || ' de 8 regras'
UNION ALL
SELECT 'conferência', 'Observações só entram cifradas',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                         WHERE conrelid = 'public.agenda_supervisoes'::regclass
                           AND conname = 'agenda_supervisoes_observacoes_cifradas_chk')
            THEN 'OK' ELSE 'FALHOU' END,
       ''
UNION ALL
SELECT 'conferência', 'Visitante sem login (anon) sem acesso',
       CASE WHEN NOT has_table_privilege('anon', 'public.agenda_supervisoes',
                                         'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
            THEN 'OK' ELSE 'FALHOU' END,
       ''
UNION ALL
SELECT 'conferência', 'Logado sem TRUNCATE',
       CASE WHEN NOT has_table_privilege('authenticated', 'public.agenda_supervisoes', 'TRUNCATE')
            THEN 'OK' ELSE 'FALHOU' END,
       ''
UNION ALL
SELECT 'conferência', 'updated_at automático (trigger)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                         WHERE tgrelid = 'public.agenda_supervisoes'::regclass
                           AND tgname = 'agenda_supervisoes_updated_at_trg' AND NOT tgisinternal)
            THEN 'OK' ELSE 'FALHOU' END,
       '';
