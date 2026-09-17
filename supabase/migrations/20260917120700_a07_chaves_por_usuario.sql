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
