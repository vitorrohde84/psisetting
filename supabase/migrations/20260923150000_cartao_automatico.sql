-- ═════════════════════════════════════════════════════════════════════════════
-- Cartão com renovação automática (assinatura "preapproval" do Mercado Pago)
--
-- Rodar no SQL Editor do Supabase ANTES do push do código que usa isto.
-- Idempotente: pode rodar de novo sem efeito colateral. Termina com um SELECT de
-- conferência — tudo tem que sair "OK".
--
-- O que muda:
--   1. assinaturas_cartao: uma linha por assinatura criada no Mercado Pago. É
--      daqui que a tela tira "próxima cobrança", o admin tira "automático" e a
--      conferência diária sabe o que conferir. Uma assinatura viva por pessoa,
--      garantido pelo banco (índice único parcial) — o /preapproval do Mercado
--      Pago não tem idempotência documentada, então a trava tem que ser nossa.
--   2. reservar_cupom_assinatura / liberar_reserva_cupom: o cupom digitado ao
--      assinar vira resgate NA HORA, não na primeira cobrança. Quem ainda tem
--      dias pagos só é cobrado semanas depois; sem a reserva, o cupom podia ser
--      pausado ou bater no limite de usos nesse meio-tempo, e a promessa feita na
--      tela ("R$ X nos N primeiros meses") não seria cumprida.
--
-- Nada muda em processar_pagamento_aprovado: as cobranças automáticas passam
-- por ela como qualquer pagamento (idempotente por payment_id). A foto do
-- desconto de cada cobrança vem do resgate — o Mercado Pago não copia a nossa
-- metadata para as cobranças da assinatura (utils/pagamento-aprovado.ts).
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Assinaturas no cartão
--
--    situacao é o NOSSO ciclo de vida:
--      criando   — linha gravada antes de chamar o Mercado Pago (é ela que
--                  impede a segunda assinatura em dois cliques ou duas abas);
--      ativa     — o Mercado Pago aceitou; cobra sozinho todo mês;
--      cancelada — pela pessoa, pelo admin, pelo Mercado Pago (3 faturas
--                  recusadas) ou pelo sistema (conta excluída, virou VIP);
--      falhou    — o Mercado Pago recusou criar, ou a criação nunca se confirmou.
--    mp_status guarda o status cru do Mercado Pago (authorized, paused,
--    cancelled...), só como informação.
--
--    O acesso continua decidido pelas DATAS do perfil. Esta tabela só acrescenta
--    a tolerância de cartão recusado enquanto a assinatura está ativa
--    (utils/acesso-assinatura.ts).
--
--    CASCADE: excluir a conta pelo admin apaga junto (o código cancela no
--    Mercado Pago antes).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assinaturas_cartao (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mp_preapproval_id    TEXT UNIQUE,
  situacao             TEXT NOT NULL DEFAULT 'criando',
  mp_status            TEXT,
  valor_atual          NUMERIC(10, 2),
  primeira_cobranca    TIMESTAMPTZ,
  proxima_cobranca     TIMESTAMPTZ,
  payer_email          TEXT,
  cartao_final         TEXT,
  cartao_bandeira      TEXT,
  resgate_reservado_id UUID REFERENCES public.coupon_redemptions(id) ON DELETE SET NULL,
  ultima_recusa_em     TIMESTAMPTZ,
  cancelada_em         TIMESTAMPTZ,
  cancelada_por        TEXT,
  erro                 TEXT,
  criada_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizada_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.assinaturas_cartao DROP CONSTRAINT IF EXISTS assinaturas_cartao_situacao_ck;
ALTER TABLE public.assinaturas_cartao ADD CONSTRAINT assinaturas_cartao_situacao_ck
  CHECK (situacao IN ('criando', 'ativa', 'cancelada', 'falhou'));

ALTER TABLE public.assinaturas_cartao DROP CONSTRAINT IF EXISTS assinaturas_cartao_cancelada_por_ck;
ALTER TABLE public.assinaturas_cartao ADD CONSTRAINT assinaturas_cartao_cancelada_por_ck
  CHECK (cancelada_por IS NULL OR cancelada_por IN ('usuario', 'admin', 'mercadopago', 'sistema'));

-- Só os 4 últimos dígitos, nunca mais que isso.
ALTER TABLE public.assinaturas_cartao DROP CONSTRAINT IF EXISTS assinaturas_cartao_final_ck;
ALTER TABLE public.assinaturas_cartao ADD CONSTRAINT assinaturas_cartao_final_ck
  CHECK (cartao_final IS NULL OR cartao_final ~ '^[0-9]{4}$');

-- Uma assinatura viva por pessoa. É a trava real contra cobrança em dobro.
CREATE UNIQUE INDEX IF NOT EXISTS assinaturas_cartao_uma_viva
  ON public.assinaturas_cartao (user_id)
  WHERE situacao IN ('criando', 'ativa');

CREATE INDEX IF NOT EXISTS idx_assinaturas_cartao_user
  ON public.assinaturas_cartao (user_id, criada_em DESC);

-- Só o servidor (service_role) lê e grava. A tela recebe o que precisa pela
-- rota de status; o payer_email e o id do Mercado Pago não vão para o navegador.
ALTER TABLE public.assinaturas_cartao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assinaturas_cartao FROM anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Reserva do cupom ao assinar
--
--    Mesmas regras de processar_pagamento_aprovado para um resgate novo (cupom
--    ativo, não arquivado, dentro do limite de usos) mais a validade — aqui é
--    o momento do uso. Grava o resgate com a foto e mensalidades_usadas = 0; as
--    mensalidades são contadas depois, uma por cobrança aprovada.
--
--    Trava na mesma ordem de processar_pagamento_aprovado (perfil → cupom →
--    resgate), para as duas nunca se esperarem em ordem trocada.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reservar_cupom_assinatura(
  p_user_id     UUID,
  p_cupom_id    UUID,
  p_tipo        TEXT,
  p_valor       NUMERIC,
  p_duracao     INTEGER,
  p_para_sempre BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cupom   public.coupons%ROWTYPE;
  v_resgate public.coupon_redemptions%ROWTYPE;
  v_id      UUID;
BEGIN
  IF p_user_id IS NULL OR p_cupom_id IS NULL OR p_tipo IS NULL OR p_tipo NOT IN ('percent', 'fixed') THEN
    RAISE EXCEPTION 'reservar_cupom_assinatura: parametros invalidos.';
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reservar_cupom_assinatura: perfil % nao encontrado.', p_user_id;
  END IF;

  SELECT * INTO v_cupom FROM public.coupons WHERE id = p_cupom_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'cupom nao encontrado');
  END IF;

  SELECT * INTO v_resgate FROM public.coupon_redemptions
  WHERE coupon_id = p_cupom_id AND profile_id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    -- Já é um desconto em uso da pessoa: nada a reservar, e nada a liberar se
    -- a assinatura for cancelada.
    IF v_resgate.encerrado_em IS NULL
       AND v_resgate.desconto_tipo IN ('percent', 'fixed')
       AND (v_resgate.para_sempre OR v_resgate.mensalidades_usadas < COALESCE(v_resgate.duracao_meses, 0)) THEN
      RETURN jsonb_build_object('ok', true, 'reservado', false, 'resgate_id', v_resgate.id);
    END IF;
    RETURN jsonb_build_object('ok', false, 'motivo', 'cupom ja utilizado');
  END IF;

  IF v_cupom.active IS NOT TRUE OR v_cupom.arquivado_em IS NOT NULL
     OR (v_cupom.expires_at IS NOT NULL AND v_cupom.expires_at < now()) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'cupom indisponivel');
  END IF;

  IF v_cupom.max_uses IS NOT NULL AND COALESCE(v_cupom.uses_count, 0) >= v_cupom.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'cupom atingiu o limite de usos');
  END IF;

  INSERT INTO public.coupon_redemptions (
    coupon_id, profile_id, desconto_tipo, desconto_valor,
    duracao_meses, para_sempre, mensalidades_usadas
  ) VALUES (
    p_cupom_id, p_user_id, p_tipo, p_valor,
    CASE WHEN COALESCE(p_para_sempre, false) THEN NULL ELSE COALESCE(p_duracao, 1) END,
    COALESCE(p_para_sempre, false), 0
  )
  RETURNING id INTO v_id;

  UPDATE public.coupons SET uses_count = COALESCE(uses_count, 0) + 1 WHERE id = p_cupom_id;

  RETURN jsonb_build_object('ok', true, 'reservado', true, 'resgate_id', v_id);
END $$;

REVOKE ALL ON FUNCTION public.reservar_cupom_assinatura(UUID, UUID, TEXT, NUMERIC, INTEGER, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reservar_cupom_assinatura(UUID, UUID, TEXT, NUMERIC, INTEGER, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.reservar_cupom_assinatura(UUID, UUID, TEXT, NUMERIC, INTEGER, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_cupom_assinatura(UUID, UUID, TEXT, NUMERIC, INTEGER, BOOLEAN) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Devolver a reserva que nunca foi usada
--
--    A assinatura não chegou a existir (o Mercado Pago recusou o cartão) ou foi
--    cancelada antes da primeira cobrança: o cupom volta a valer para a pessoa
--    (senão ela ouviria "você já utilizou este cupom" num PIX) e o uso volta
--    para o limite. Com qualquer mensalidade já paga, não devolve nada — é um
--    desconto em uso, com as regras de sempre.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.liberar_reserva_cupom(
  p_user_id    UUID,
  p_resgate_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_resgate public.coupon_redemptions%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_resgate_id IS NULL THEN
    RETURN jsonb_build_object('liberado', false, 'motivo', 'sem reserva');
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  SELECT * INTO v_resgate FROM public.coupon_redemptions
  WHERE id = p_resgate_id AND profile_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('liberado', false, 'motivo', 'reserva nao encontrada');
  END IF;

  PERFORM 1 FROM public.coupons WHERE id = v_resgate.coupon_id FOR UPDATE;

  SELECT * INTO v_resgate FROM public.coupon_redemptions WHERE id = p_resgate_id FOR UPDATE;

  IF v_resgate.mensalidades_usadas > 0
     OR EXISTS (SELECT 1 FROM public.coupon_mensalidades WHERE redemption_id = p_resgate_id) THEN
    RETURN jsonb_build_object('liberado', false, 'motivo', 'desconto ja usado');
  END IF;

  -- Desconto encerrado pelo admin: apagar o resgate faria o cupom voltar a
  -- valer para a pessoa — o contrário do que o admin decidiu.
  IF v_resgate.encerrado_em IS NOT NULL THEN
    RETURN jsonb_build_object('liberado', false, 'motivo', 'desconto encerrado');
  END IF;

  DELETE FROM public.coupon_redemptions WHERE id = p_resgate_id;
  UPDATE public.coupons
  SET uses_count = GREATEST(0, COALESCE(uses_count, 0) - 1)
  WHERE id = v_resgate.coupon_id;

  RETURN jsonb_build_object('liberado', true);
END $$;

REVOKE ALL ON FUNCTION public.liberar_reserva_cupom(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.liberar_reserva_cupom(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.liberar_reserva_cupom(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.liberar_reserva_cupom(UUID, UUID) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Conta com assinatura viva não pode ser apagada
--
--    O painel admin cancela a assinatura no Mercado Pago antes de excluir a
--    conta. Uma exclusão por outro caminho (painel do Supabase, script) levaria
--    a linha junto pelo CASCADE, e o Mercado Pago seguiria cobrando o cartão de
--    alguém que não tem mais conta — sem rastro nenhum aqui. Melhor falhar alto.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.profiles_bloqueia_exclusao_com_assinatura()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.assinaturas_cartao
    WHERE user_id = OLD.id AND situacao IN ('criando', 'ativa')
  ) THEN
    RAISE EXCEPTION 'Conta % tem renovacao automatica ligada no cartao. Cancele no painel admin antes de excluir.', OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS profiles_bloqueia_exclusao_com_assinatura_trg ON public.profiles;
CREATE TRIGGER profiles_bloqueia_exclusao_com_assinatura_trg
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_bloqueia_exclusao_com_assinatura();


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Conferência estrutural — falha alto (e desfaz tudo) se algo não pegou
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.assinaturas_cartao', 'SELECT')
     OR has_table_privilege('authenticated', 'public.assinaturas_cartao', 'INSERT')
     OR has_table_privilege('authenticated', 'public.assinaturas_cartao', 'UPDATE')
     OR has_table_privilege('anon', 'public.assinaturas_cartao', 'SELECT') THEN
    RAISE EXCEPTION 'assinaturas_cartao acessivel por usuario comum. Nada foi gravado.';
  END IF;

  IF has_function_privilege('authenticated', 'public.reservar_cupom_assinatura(uuid,uuid,text,numeric,integer,boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.reservar_cupom_assinatura(uuid,uuid,text,numeric,integer,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.liberar_reserva_cupom(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.liberar_reserva_cupom(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Funcoes de cupom da assinatura executaveis por usuario comum. Nada foi gravado.';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.assinaturas_cartao'::regclass) THEN
    RAISE EXCEPTION 'RLS desligada em assinaturas_cartao. Nada foi gravado.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RESULTADO — a única tabela que o SQL Editor mostra. Tudo "OK".
--
--    "assinatura antiga": contas com mp_subscription_id gravado pelo código de
--    antes (a rota antiga de assinatura, apagada em 23/09). Se aparecer alguém,
--    confira no painel do Mercado Pago se a assinatura ainda cobra — ela não
--    está nesta tabela e o sistema novo não a acompanha.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'conferência' AS tipo, 'Tabela assinaturas_cartao' AS item,
       CASE WHEN to_regclass('public.assinaturas_cartao') IS NOT NULL THEN 'OK' ELSE 'FALHOU' END AS resultado,
       (SELECT count(*) FROM public.assinaturas_cartao)::text || ' assinatura(s)' AS detalhe
UNION ALL
SELECT 'conferência', 'Uma assinatura viva por pessoa (índice único)',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'assinaturas_cartao_uma_viva')
            THEN 'OK' ELSE 'FALHOU' END,
       'criando + ativa'
UNION ALL
SELECT 'conferência', 'Tabela e funções fechadas para usuários', 'OK', 'verificado acima'
UNION ALL
SELECT 'conferência', 'Conta com assinatura viva não pode ser apagada',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'profiles_bloqueia_exclusao_com_assinatura_trg')
            THEN 'OK' ELSE 'FALHOU' END,
       'gatilho em profiles'
UNION ALL
SELECT 'assinatura antiga', u.email, '>>> CONFERIR NO MERCADO PAGO', 'mp_subscription_id ' || p.mp_subscription_id
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.mp_subscription_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.assinaturas_cartao a WHERE a.mp_preapproval_id = p.mp_subscription_id);
