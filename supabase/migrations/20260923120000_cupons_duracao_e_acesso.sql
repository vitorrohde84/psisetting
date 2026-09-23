-- =============================================================================
--  ENTREGA 1 — Cupons com duração, pagamento aprovado atômico, acesso pelas datas
--  IDEMPOTENTE. Rode o arquivo INTEIRO no SQL Editor do Supabase, ANTES do push.
-- =============================================================================
--
--  COMO USAR
--    1. Faça o backup:  npm run backup
--    2. Supabase → SQL Editor → New query → cole este arquivo inteiro
--    3. Clique numa parte vazia do texto (nada selecionado) → Run
--    4. Leia a TABELA do final. Toda linha de "conferência" tem que dizer OK.
--       As linhas de "acesso" listam quem perde acesso com a regra nova.
--    5. Só então faça o push do código.
--
--  TUDO OU NADA: o SQL Editor roda o arquivo como uma transação. Se algo
--  falhar, a mensagem de erro aparece e NADA é gravado.
--
--  POR QUE O SQL VEM ANTES DO CÓDIGO
--    O código novo registra o pagamento aprovado numa função que só existe
--    depois deste arquivo. Ele tem um caminho de reserva para o caso de a
--    função ainda não existir, mas esse caminho não conta os meses de cupom.
--    O código antigo continua funcionando com o banco novo, então aplicar
--    este arquivo antes do push não quebra nada que está no ar.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Cupom: duração do desconto
--
--    "Para sempre" é explícito (para_sempre = true e duracao_meses NULL), em vez
--    de dar significado ao NULL: um NULL que vem de coluna não preenchida viraria
--    desconto eterno em silêncio.
--    Cupons existentes ficam com 1 mês — é como eles funcionam hoje: um resgate
--    por pessoa, no primeiro pagamento.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS duracao_meses INTEGER DEFAULT 1;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS para_sempre   BOOLEAN NOT NULL DEFAULT false;
-- Excluir cupom vira arquivar: um PIX gerado com o cupom pode ser pago depois
-- da exclusão, e o registro do pagamento precisa encontrar o cupom.
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS arquivado_em  TIMESTAMPTZ;

UPDATE public.coupons SET duracao_meses = 1
WHERE duracao_meses IS NULL AND para_sempre = false;

ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_duracao_ck;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_duracao_ck CHECK (
  (para_sempre AND duracao_meses IS NULL)
  OR (NOT para_sempre AND duracao_meses BETWEEN 1 AND 120)
);

-- uses_count nunca subia antes de 17/09 (A11): o incremento era descartado em
-- silêncio. Sem isto, um cupom de uso único resgatado em agosto ainda aceitaria
-- outra pessoa.
UPDATE public.coupons c
SET uses_count = GREATEST(
  COALESCE(c.uses_count, 0),
  (SELECT count(*) FROM public.coupon_redemptions r WHERE r.coupon_id = c.id)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Resgate: a FOTO das condições no momento em que a pessoa entrou
--
--    Pausar, vencer ou editar o cupom não muda nada para quem já usa: o preço
--    sai da foto. É o requisito "desativar mantendo quem já utilizou".
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.coupon_redemptions ADD COLUMN IF NOT EXISTS desconto_tipo       TEXT;
ALTER TABLE public.coupon_redemptions ADD COLUMN IF NOT EXISTS desconto_valor      NUMERIC;
ALTER TABLE public.coupon_redemptions ADD COLUMN IF NOT EXISTS duracao_meses       INTEGER;
ALTER TABLE public.coupon_redemptions ADD COLUMN IF NOT EXISTS para_sempre         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.coupon_redemptions ADD COLUMN IF NOT EXISTS mensalidades_usadas INTEGER NOT NULL DEFAULT 0;
-- Saída de emergência do admin: encerra o desconto de alguém (cupom vazado).
ALTER TABLE public.coupon_redemptions ADD COLUMN IF NOT EXISTS encerrado_em        TIMESTAMPTZ;

-- Backfill dos resgates antigos. Os de desconto só eram gravados depois de um
-- pagamento aprovado, então já consumiram a única mensalidade que davam.
UPDATE public.coupon_redemptions r
SET desconto_tipo       = COALESCE(c.discount_type, 'trial_days'),
    desconto_valor      = c.discount_value,
    duracao_meses       = 1,
    para_sempre         = false,
    mensalidades_usadas = CASE WHEN c.discount_type IN ('percent', 'fixed') THEN 1 ELSE 0 END
FROM public.coupons c
WHERE c.id = r.coupon_id
  AND r.desconto_tipo IS NULL;

-- Resgate gravado sem foto (código antigo no ar entre este SQL e o push, um
-- rollback da Vercel, o caminho de VIP/dias de teste, um restore de backup):
-- o próprio banco copia as condições do cupom.
CREATE OR REPLACE FUNCTION public.coupon_redemptions_foto()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cupom public.coupons%ROWTYPE;
BEGIN
  IF NEW.desconto_tipo IS NULL THEN
    SELECT * INTO v_cupom FROM public.coupons WHERE id = NEW.coupon_id;
    NEW.desconto_tipo  := COALESCE(v_cupom.discount_type, 'trial_days');
    NEW.desconto_valor := v_cupom.discount_value;
    NEW.para_sempre    := COALESCE(v_cupom.para_sempre, false);
    NEW.duracao_meses  := CASE WHEN COALESCE(v_cupom.para_sempre, false) THEN NULL
                               ELSE COALESCE(v_cupom.duracao_meses, 1) END;
    -- Sem foto = código antigo, que só grava resgate de DESCONTO depois do
    -- pagamento aprovado: a 1ª mensalidade já foi usada (mesma regra do
    -- backfill). Sem isto, a pessoa ganharia um mês de desconto a mais.
    IF NEW.desconto_tipo IN ('percent', 'fixed') THEN
      NEW.mensalidades_usadas := GREATEST(COALESCE(NEW.mensalidades_usadas, 0), 1);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS coupon_redemptions_foto_trg ON public.coupon_redemptions;
CREATE TRIGGER coupon_redemptions_foto_trg
  BEFORE INSERT ON public.coupon_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.coupon_redemptions_foto();

ALTER TABLE public.coupon_redemptions ALTER COLUMN desconto_tipo SET NOT NULL;

-- Resgate antigo de desconto com valor 0 ou acima de 100%: já foi consumido e
-- nunca daria desconto. Sem valor, ele passa na regra abaixo — senão qualquer
-- UPDATE futuro nessa linha (encerrar desconto, por exemplo) falharia.
UPDATE public.coupon_redemptions
SET desconto_valor = NULL
WHERE desconto_tipo IN ('percent', 'fixed')
  AND NOT (COALESCE(desconto_valor, 0) > 0 AND (desconto_tipo <> 'percent' OR desconto_valor <= 100));

-- NOT VALID: vale para toda linha nova, sem reprovar dado antigo esquisito
-- (um cupom de agosto com valor 0 abortaria o arquivo inteiro).
ALTER TABLE public.coupon_redemptions DROP CONSTRAINT IF EXISTS coupon_redemptions_foto_ck;
ALTER TABLE public.coupon_redemptions ADD CONSTRAINT coupon_redemptions_foto_ck CHECK (
  desconto_tipo IN ('trial_days', 'percent', 'fixed', 'vip')
  AND mensalidades_usadas >= 0
  AND (
    (para_sempre AND duracao_meses IS NULL)
    OR (NOT para_sempre AND duracao_meses BETWEEN 1 AND 120)
  )
  AND (
    desconto_tipo NOT IN ('percent', 'fixed')
    OR (desconto_valor > 0 AND (desconto_tipo <> 'percent' OR desconto_valor <= 100))
  )
) NOT VALID;

-- Garante o ON CONFLICT / a trava de um resgate por pessoa, qualquer que seja o
-- nome da constraint que os scripts antigos criaram.
CREATE UNIQUE INDEX IF NOT EXISTS coupon_redemptions_coupon_profile_uniq
  ON public.coupon_redemptions (coupon_id, profile_id);

-- A FK antiga era ON DELETE CASCADE: excluir o cupom apagava o desconto de quem
-- usa. Troca por RESTRICT. Derruba TODAS as FKs coupon_id → coupons (o nome
-- variou conforme a ordem dos scripts) e cria uma só; duas FKs iguais deixariam
-- ambíguo o embed do PostgREST usado pelo painel admin.
DO $$
DECLARE
  v_fk record;
  v_attnum smallint;
BEGIN
  SELECT attnum INTO v_attnum FROM pg_attribute
  WHERE attrelid = 'public.coupon_redemptions'::regclass AND attname = 'coupon_id';

  FOR v_fk IN
    SELECT conname FROM pg_constraint
    WHERE contype = 'f'
      AND conrelid  = 'public.coupon_redemptions'::regclass
      AND confrelid = 'public.coupons'::regclass
      AND conkey = ARRAY[v_attnum]
  LOOP
    EXECUTE format('ALTER TABLE public.coupon_redemptions DROP CONSTRAINT %I', v_fk.conname);
  END LOOP;

  ALTER TABLE public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_coupon_id_fkey
    FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE RESTRICT;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Uma linha por mensalidade paga com desconto
--
--    É a chave de idempotência da contagem de meses (payment_id UNIQUE): o mesmo
--    pagamento chega por process-payment, pix/check, webhook e reconciliação.
--    CASCADE: excluir a conta pelo admin (LGPD) apaga junto; sem isso a FK
--    travaria a exclusão em silêncio.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coupon_mensalidades (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  redemption_id UUID NOT NULL REFERENCES public.coupon_redemptions(id) ON DELETE CASCADE,
  payment_id    TEXT NOT NULL UNIQUE,
  valor_cobrado NUMERIC,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupon_mensalidades_resgate
  ON public.coupon_mensalidades (redemption_id);

ALTER TABLE public.coupon_mensalidades ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Pagamentos processados: o que cada um concedeu
--
--    Guardar os dias e as datas permite desfazer um estorno ou chargeback com
--    exatidão, e mostrar no admin por onde a pessoa pagou.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payment_events ADD COLUMN IF NOT EXISTS meio            TEXT;
ALTER TABLE public.payment_events ADD COLUMN IF NOT EXISTS valor           NUMERIC;
ALTER TABLE public.payment_events ADD COLUMN IF NOT EXISTS dias_concedidos INTEGER;
ALTER TABLE public.payment_events ADD COLUMN IF NOT EXISTS fim_anterior    TIMESTAMPTZ;
ALTER TABLE public.payment_events ADD COLUMN IF NOT EXISTS fim_novo        TIMESTAMPTZ;
ALTER TABLE public.payment_events ADD COLUMN IF NOT EXISTS observacao      TEXT;
ALTER TABLE public.payment_events ADD COLUMN IF NOT EXISTS revertido_em    TIMESTAMPTZ;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Ninguém além do servidor escreve nessas tabelas
--
--    Hoje só a RLS barra. Se um script antigo recriar uma policy de INSERT, a
--    pessoa gravaria o próprio resgate com 100% "para sempre" — e agora o preço
--    sai do resgate. O GRANT é a segunda trava.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.coupon_redemptions  FROM anon, authenticated;
REVOKE ALL                              ON public.coupon_mensalidades FROM anon, authenticated;
REVOKE ALL                              ON public.payment_events      FROM anon, authenticated;
REVOKE ALL                              ON public.coupons             FROM anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Pagamento aprovado — tudo numa transação
--
--    Antes eram passos separados: gravar a trava de idempotência, atualizar o
--    perfil, registrar o cupom. Se um passo do meio falhava, a trava já estava
--    gravada, toda nova tentativa respondia "já processado" e o cliente ficava
--    sem os dias pelos quais pagou. Aqui é tudo ou nada: uma falha desfaz tudo,
--    e a próxima tentativa (pix/check, webhook, reconciliação) refaz inteiro.
--
--    O direito ao desconto é decidido AQUI, na aprovação, com o perfil travado
--    (FOR UPDATE): dois pagamentos com desconto gerados ao mesmo tempo não
--    consomem a mesma mensalidade. Se o desconto já não vale (mensalidades
--    esgotadas, cupom pausado ou no limite de usos), o dinheiro já foi cobrado —
--    então os dias saem proporcionais ao valor pago, pelo preço cheio. Ninguém
--    ganha dias a mais do que pagou, e ninguém paga sem receber.
--
--    A foto do desconto vem nos parâmetros (gravada no pagamento, na criação),
--    não do cupom atual: o que o cliente viu é o que vale.
--
--    SECURITY INVOKER: quem chama é o servidor (service_role, que já ignora
--    RLS). DEFINER só abriria a porta para um usuário chamar pela API.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.processar_pagamento_aprovado(
  p_payment_id        TEXT,
  p_user_id           UUID,
  p_origem            TEXT,
  p_meio              TEXT,
  p_valor             NUMERIC,
  p_preco_base        NUMERIC,
  p_cupom_id          UUID    DEFAULT NULL,
  p_cupom_tipo        TEXT    DEFAULT NULL,
  p_cupom_valor       NUMERIC DEFAULT NULL,
  p_cupom_duracao     INTEGER DEFAULT NULL,
  p_cupom_para_sempre BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inseriu       INTEGER;
  v_perfil        public.profiles%ROWTYPE;
  v_cupom         public.coupons%ROWTYPE;
  v_resgate       public.coupon_redemptions%ROWTYPE;
  v_resgate_id    UUID;
  v_dias          INTEGER := 30;
  v_dentro        BOOLEAN := true;
  v_contou        BOOLEAN := false;
  v_obs           TEXT;
  v_base          TIMESTAMPTZ;
  v_fim_novo      TIMESTAMPTZ;
BEGIN
  IF p_payment_id IS NULL OR p_user_id IS NULL OR p_preco_base IS NULL OR p_preco_base <= 0 THEN
    RAISE EXCEPTION 'processar_pagamento_aprovado: parametros obrigatorios ausentes.';
  END IF;

  -- Trava de idempotência. Numa transação: se algo abaixo falhar, esta linha
  -- também é desfeita.
  INSERT INTO public.payment_events (payment_id, user_id, origem, meio, valor)
  VALUES (p_payment_id, p_user_id, p_origem, p_meio, p_valor)
  ON CONFLICT (payment_id) DO NOTHING;
  GET DIAGNOSTICS v_inseriu = ROW_COUNT;

  IF v_inseriu = 0 THEN
    RETURN jsonb_build_object('ja_processado', true);
  END IF;

  -- Serializa os pagamentos da mesma pessoa.
  SELECT * INTO v_perfil FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'processar_pagamento_aprovado: perfil % nao encontrado.', p_user_id;
  END IF;

  IF p_cupom_id IS NOT NULL AND p_cupom_tipo IN ('percent', 'fixed') THEN
    SELECT * INTO v_cupom FROM public.coupons WHERE id = p_cupom_id FOR UPDATE;

    IF NOT FOUND THEN
      v_dentro := false;
      v_obs := 'cupom nao encontrado';
    ELSE
      SELECT * INTO v_resgate FROM public.coupon_redemptions
      WHERE coupon_id = p_cupom_id AND profile_id = p_user_id
      FOR UPDATE;

      IF FOUND THEN
        v_resgate_id := v_resgate.id;
        IF v_resgate.encerrado_em IS NOT NULL THEN
          v_dentro := false;
          v_obs := 'desconto encerrado pelo admin';
        ELSIF v_resgate.desconto_tipo NOT IN ('percent', 'fixed') THEN
          v_dentro := false;
          v_obs := 'resgate nao e de desconto';
        ELSIF NOT v_resgate.para_sempre
              AND v_resgate.mensalidades_usadas >= COALESCE(v_resgate.duracao_meses, 0) THEN
          v_dentro := false;
          v_obs := 'mensalidades com desconto esgotadas';
        END IF;
      ELSIF v_cupom.active IS NOT TRUE OR v_cupom.arquivado_em IS NOT NULL THEN
        v_dentro := false;
        v_obs := 'cupom pausado antes da aprovacao';
      ELSIF v_cupom.max_uses IS NOT NULL AND COALESCE(v_cupom.uses_count, 0) >= v_cupom.max_uses THEN
        v_dentro := false;
        v_obs := 'cupom atingiu o limite de usos';
      ELSE
        INSERT INTO public.coupon_redemptions (
          coupon_id, profile_id, desconto_tipo, desconto_valor,
          duracao_meses, para_sempre, mensalidades_usadas
        ) VALUES (
          p_cupom_id, p_user_id, p_cupom_tipo, p_cupom_valor,
          CASE WHEN p_cupom_para_sempre THEN NULL ELSE COALESCE(p_cupom_duracao, 1) END,
          COALESCE(p_cupom_para_sempre, false), 0
        )
        RETURNING id INTO v_resgate_id;

        UPDATE public.coupons SET uses_count = COALESCE(uses_count, 0) + 1 WHERE id = p_cupom_id;
      END IF;
    END IF;

    IF v_dentro THEN
      INSERT INTO public.coupon_mensalidades (redemption_id, payment_id, valor_cobrado)
      VALUES (v_resgate_id, p_payment_id, p_valor);

      UPDATE public.coupon_redemptions
      SET mensalidades_usadas = mensalidades_usadas + 1
      WHERE id = v_resgate_id;

      v_contou := true;
    ELSE
      v_dias := GREATEST(1, round(30 * COALESCE(p_valor, 0) / p_preco_base)::INTEGER);
    END IF;
  END IF;

  -- Nunca encurta: quem paga durante o teste ou antes de vencer não perde dias.
  v_base := GREATEST(now(), COALESCE(v_perfil.current_period_end, now()), COALESCE(v_perfil.trial_ends_at, now()));
  v_fim_novo := v_base + make_interval(days => v_dias);

  UPDATE public.profiles
  SET subscription_status = 'active',
      current_period_end  = v_fim_novo
  WHERE id = p_user_id;

  UPDATE public.payment_events
  SET dias_concedidos = v_dias,
      fim_anterior    = v_perfil.current_period_end,
      fim_novo        = v_fim_novo,
      observacao      = v_obs
  WHERE payment_id = p_payment_id;

  RETURN jsonb_build_object(
    'ja_processado', false,
    'dias', v_dias,
    'fim', v_fim_novo,
    'cupom_contado', v_contou,
    'observacao', v_obs
  );
END $$;

REVOKE ALL ON FUNCTION public.processar_pagamento_aprovado(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, UUID, TEXT, NUMERIC, INTEGER, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.processar_pagamento_aprovado(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, UUID, TEXT, NUMERIC, INTEGER, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.processar_pagamento_aprovado(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, UUID, TEXT, NUMERIC, INTEGER, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.processar_pagamento_aprovado(TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, UUID, TEXT, NUMERIC, INTEGER, BOOLEAN) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Estorno e chargeback
--
--    Com o acesso decidido pelas datas, gravar "past_due" deixou de ter efeito:
--    quem estornava continuava com os dias. Aqui os dias daquele pagamento são
--    devolvidos (sem passar de agora). A mensalidade do cupom NÃO volta: se
--    voltasse, estornar viraria um jeito de reusar o desconto.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reverter_pagamento(p_payment_id TEXT, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_evento public.payment_events%ROWTYPE;
BEGIN
  SELECT * INTO v_evento FROM public.payment_events WHERE payment_id = p_payment_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('encontrado', false);
  END IF;

  IF v_evento.revertido_em IS NOT NULL THEN
    RETURN jsonb_build_object('encontrado', true, 'ja_revertido', true);
  END IF;

  -- "past_due" só para quem ficou sem dias; quem estornou um de dois
  -- pagamentos continua assinante no painel (o acesso é pelas datas de qualquer jeito).
  --
  -- trial_ends_at também recua quando está no fim do período pago ou depois
  -- dele: o código anterior a 23/09 gravava a MESMA data nos dois campos a cada
  -- pagamento, e um cupom de dias de teste soma depois do período pago. Sem
  -- isto, o teste "herdado" manteria o acesso do pagamento estornado. (Numa
  -- UPDATE, current_period_end à direita é o valor ANTERIOR.)
  UPDATE public.profiles
  SET current_period_end = GREATEST(
        now(),
        current_period_end - make_interval(days => COALESCE(v_evento.dias_concedidos, 30))
      ),
      trial_ends_at = CASE
        WHEN trial_ends_at IS NOT NULL AND trial_ends_at >= current_period_end
          THEN GREATEST(now(), trial_ends_at - make_interval(days => COALESCE(v_evento.dias_concedidos, 30)))
        ELSE trial_ends_at
      END,
      subscription_status = CASE
        WHEN current_period_end - make_interval(days => COALESCE(v_evento.dias_concedidos, 30)) > now()
          THEN subscription_status
        ELSE 'past_due'
      END
  WHERE id = v_evento.user_id
    AND current_period_end IS NOT NULL;

  UPDATE public.payment_events
  SET revertido_em = now(),
      observacao   = concat_ws(' | ', observacao, 'revertido: ' || COALESCE(p_motivo, '?'))
  WHERE payment_id = p_payment_id;

  RETURN jsonb_build_object('encontrado', true, 'ja_revertido', false);
END $$;

REVOKE ALL ON FUNCTION public.reverter_pagamento(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverter_pagamento(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.reverter_pagamento(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reverter_pagamento(TEXT, TEXT) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Correção da trava de privilégio de 17/09 (A01)
--
--    A função de guarda era SECURITY DEFINER e começava com
--        IF current_user IN ('service_role', 'postgres', 'supabase_admin')
--    Dentro de uma função DEFINER, current_user é o DONO da função (postgres),
--    nunca quem chamou. A condição era sempre verdadeira e a guarda deixava tudo
--    passar. A escalada a admin continuou fechada pela primeira trava (UPDATE só
--    nas colunas de perfil), mas o INSERT ficou aberto: uma conta sem perfil
--    (anterior à A19) podia criar o próprio perfil como VIP ou com teste até 2999.
--
--    SECURITY INVOKER faz current_user ser quem chamou: authenticated pela API,
--    service_role pelo servidor, postgres dentro de handle_new_user.
--    No INSERT feito pelo usuário, o teste também passa a ser forçado — com o
--    acesso decidido pelas datas, trial_ends_at virou a trava de quem não paga.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.profiles_guard_privilegio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- service_role e superusuário passam: são os caminhos de servidor legítimos
  -- (webhook de pagamento, rotas admin, migrações, handle_new_user).
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Ninguém nasce admin, VIP, assinante ou com teste estendido por conta própria.
    NEW.is_admin            := false;
    NEW.is_vip              := false;
    NEW.subscription_status := 'trialing';
    NEW.trial_ends_at       := now() + INTERVAL '7 days';
    -- O e-mail do perfil é lido pelo painel admin. Quem cria o próprio perfil
    -- pela API não escolhe o e-mail (poderia usar o de um administrador); o
    -- caminho legítimo, handle_new_user, roda como postgres e não passa aqui.
    NEW.email               := NULL;
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


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Conferência estrutural — falha alto (e desfaz tudo) se algo não pegou
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fks INTEGER;
  v_fk_restrict BOOLEAN;
BEGIN
  SELECT count(*), bool_and(confdeltype = 'r') INTO v_fks, v_fk_restrict
  FROM pg_constraint
  WHERE contype = 'f'
    AND conrelid  = 'public.coupon_redemptions'::regclass
    AND confrelid = 'public.coupons'::regclass;

  IF v_fks <> 1 OR NOT v_fk_restrict THEN
    RAISE EXCEPTION 'FK coupon_redemptions -> coupons: esperado 1 com RESTRICT, encontrado % (restrict=%).', v_fks, v_fk_restrict;
  END IF;

  IF has_function_privilege('authenticated', 'public.processar_pagamento_aprovado(text,uuid,text,text,numeric,numeric,uuid,text,numeric,integer,boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.processar_pagamento_aprovado(text,uuid,text,text,numeric,numeric,uuid,text,numeric,integer,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reverter_pagamento(text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.reverter_pagamento(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Funcoes de pagamento executaveis por usuario comum. Nada foi gravado.';
  END IF;

  IF has_table_privilege('authenticated', 'public.coupon_redemptions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.coupon_mensalidades', 'INSERT')
     OR has_table_privilege('authenticated', 'public.payment_events', 'INSERT') THEN
    RAISE EXCEPTION 'Usuario comum ainda pode gravar em tabelas de cobranca. Nada foi gravado.';
  END IF;

  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.profiles_guard_privilegio()'::regprocedure) THEN
    RAISE EXCEPTION 'profiles_guard_privilegio continua SECURITY DEFINER. Nada foi gravado.';
  END IF;
END $$;

-- O PostgREST precisa enxergar as colunas e funções novas sem esperar o cache.
NOTIFY pgrst, 'reload schema';


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. RESULTADO — a única tabela que o SQL Editor mostra
--
--     "conferência": tem que estar tudo OK.
--     "acesso": quem PERDE acesso com a regra nova (pelas datas). Se aparecer
--     alguém, decida antes do push — ou é o certo (não pagou), ou dê dias pelo
--     painel admin ("Estender teste").
--     "cupom": cupons que já atingiram o limite de usos.
-- ─────────────────────────────────────────────────────────────────────────────
WITH contas AS (
  SELECT
    u.email,
    COALESCE(p.subscription_status, 'trialing') AS status_gravado,
    p.is_vip IS TRUE   AS vip,
    p.is_admin IS TRUE AS admin,
    p.current_period_end,
    p.trial_ends_at,
    p.mp_subscription_id
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
),
perde AS (
  SELECT * FROM contas
  WHERE NOT vip
    AND NOT admin
    AND COALESCE(current_period_end > now(), false) = false
    AND COALESCE(trial_ends_at > now(), false) = false
    AND (trial_ends_at IS NULL OR status_gravado <> 'trialing')
)
SELECT 'conferência' AS tipo, 'Duração nos cupons' AS item,
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.coupons WHERE NOT para_sempre AND duracao_meses IS NULL)
            THEN 'OK' ELSE 'FALHOU' END AS resultado,
       (SELECT count(*) FROM public.coupons)::text || ' cupom(ns)' AS detalhe
UNION ALL
SELECT 'conferência', 'Foto nos resgates',
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.coupon_redemptions WHERE desconto_tipo IS NULL)
            THEN 'OK' ELSE 'FALHOU' END,
       (SELECT count(*) FROM public.coupon_redemptions)::text || ' resgate(s)'
UNION ALL
SELECT 'conferência', 'Excluir cupom não apaga resgates (RESTRICT)', 'OK', 'verificado acima'
UNION ALL
SELECT 'conferência', 'Funções de pagamento fechadas para usuários', 'OK', 'verificado acima'
UNION ALL
SELECT 'conferência', 'Trava de privilégio corrigida (INVOKER)', 'OK', 'verificado acima'
UNION ALL
SELECT 'acesso', email,
       '>>> PERDE ACESSO',
       concat_ws(' · ',
         'status ' || status_gravado,
         'pago até ' || COALESCE(to_char(current_period_end AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'), '—'),
         'teste até ' || COALESCE(to_char(trial_ends_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'), '—'),
         CASE WHEN mp_subscription_id IS NOT NULL THEN 'tem assinatura no Mercado Pago: ' || mp_subscription_id END)
FROM perde
UNION ALL
SELECT 'acesso', '(ninguém)', 'OK', 'nenhuma conta perde acesso com a regra nova'
WHERE NOT EXISTS (SELECT 1 FROM perde)
UNION ALL
SELECT 'cupom', code, 'no limite',
       COALESCE(uses_count, 0)::text || ' de ' || max_uses::text || ' usos'
FROM public.coupons
WHERE max_uses IS NOT NULL AND COALESCE(uses_count, 0) >= max_uses AND active;
