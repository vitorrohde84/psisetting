@AGENTS.md

# PsiSetting — memória de contexto

Como trabalhar neste repositório: o que é o produto, como publicar, as regras que
não podem ser quebradas e o que está pendente. As regras de negócio completas
estão no `SPEC.md` (seções 2, 5, 6 e 7). Atualizado em 23/09/2026.

## O produto

- SaaS de gestão clínica para psicólogos: prontuário, laudos (Res. CFP 06/2019),
  agenda com feed iCal, financeiro, Diário de Bordo e supervisão.
- Dois hosts no mesmo deploy, separados pelo `middleware.ts`:
  `www.psisetting.com.br` (vitrine, `app/landing`) e `app.psisetting.com.br` (sistema).
- Pessoas: **Vitor** (dono, admin, conta `vitorrohde84`) e **Hellen Limberger**
  (psicóloga que valida o produto e revisa os textos do site). Base pequena de
  contas reais.

## Stack

Next.js 16 App Router (versão com mudanças — ler `node_modules/next/dist/docs/`,
ver `AGENTS.md`), React 19, TypeScript, Tailwind v4, Supabase (Postgres com RLS,
Auth, Storage), Mercado Pago SDK 3.4, Vercel. Testes: vitest em `tests/`
(`npm test`). CI: `.github/workflows/ci.yml` (audit, tipos, testes, build e
guardas próprias; lint ainda não bloqueia).

## Como publicar — leia antes de qualquer push

- `origin` é a **cópia do Vitor** (github.com/vitorrohde84/psisetting, privado).
  A Vercel está ligada ao repositório **original, na conta da Hellen**. Push aqui
  **não publica**: o Vitor sincroniza pela conta da Hellen, e isso reescreve o
  `main` desta cópia (force-push, mesma árvore, autoria "Hellen").
- Antes de todo push: `git fetch`. Se divergir, confirme que o conteúdo é igual
  (`git diff HEAD origin/main` vazio) e rode
  `git rebase --onto origin/main <último commit já enviado> main`. **Nunca force-push.**
- Push com a conta certa:
  `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin main`
  (GitHub CLI com `vitorrohde84` ativa; identidade local `vitorrohde84 <vitorrohde84@gmail.com>`).
- **Push só com OK explícito do Vitor.** Não diga que está no ar antes de ele sincronizar.
- **SQL:** migrações em `supabase/migrations/`, numeradas e idempotentes, aplicadas
  **à mão** no SQL Editor do Supabase, **antes** do push do código que depende
  delas. O editor roda o arquivo como uma transação e só mostra o último SELECT
  (não mostra RAISE NOTICE) — por isso cada migração termina com um SELECT de
  conferência. `scripts/sql-legado-nao-executar/` é histórico: não rodar.
- Backup: `npm run backup` / `npm run restaurar` (precisam do `.env.local` com
  `SUPABASE_SERVICE_ROLE_KEY`; o `.env.local` não é versionado).

## Como o Vitor prefere trabalhar

- Pedido novo e grande: investigar, mostrar o entendimento e o plano, perguntar só
  o que muda o trabalho. Depois do OK, executar e só perguntar decisões de negócio
  ou de UX.
- Português do Brasil. Comentários explicam o **porquê**.
- Textos do site passam pela Hellen. O site deve ser leve: explicações do produto
  ("o que é o prontuário", "o que é o Diário de Bordo") ficam dentro do sistema
  (`app/components/explicacao-registro.tsx`).

## Regras que não podem ser quebradas

- **Dado clínico** é cifrado no navegador (`utils/crypto.ts`, envelope KEK/DEK). Use
  `ehCifrado()`; nunca teste o prefixo `enc:` na mão (a CI reprova). Nunca regrave
  `TEXTO_CHAVE_INDISPONIVEL` por cima de um registro; texto digitado que começa com
  `enc:v` é recusado (seria gravado em claro).
- Nada secreto com prefixo `NEXT_PUBLIC_` (vai para o navegador).
- **Acesso** é decidido pelas datas (`utils/acesso-assinatura.ts`): VIP/admin,
  `current_period_end` no futuro ou `trial_ends_at` no futuro. `subscription_status`
  é só informação. O Modo Somente Leitura só existe na interface (dívida A23).
- **Preço** só no servidor (`utils/preco-assinatura.ts`). A tela envia o valor que
  mostrou (`valor_esperado`); o servidor responde 409 se diferir.
- **Criar pagamento** só por `criarPagamento` (`utils/mercadopago.ts`), com cliente
  novo por chamada: no SDK 3.4 as `requestOptions` ficam gravadas na configuração
  compartilhada e a chave de idempotência vazaria para o pagamento seguinte. O
  `paymentClient` compartilhado é só para `get`/`search`.
- **Pagamento aprovado** passa sempre por `processarPagamentoAprovado` →
  função SQL `processar_pagamento_aprovado` (idempotente por `payment_id`; dias e
  mensalidade de cupom numa transação). Nunca ative assinatura por outro caminho.
- **Cupom:** o resgate guarda a foto das condições; pausar/vencer não tira o
  desconto de quem já usa; excluir = arquivar, e só se nunca usado. Em cupom de
  desconto, `trial_days = 30` é coluna antiga e não tem efeito.
- **Documento** (laudo, declaração, atestado) nunca usa dados de outra pessoa:
  nome, CRP e cidade são obrigatórios para emitir (`utils/dados-profissionais.ts`).
- **Feed iCal**: sem nome completo nem anotação clínica; supervisões aparecem só
  como "Supervisão (modalidade)".
- **Toda consulta ao Supabase confere `error`.** Um erro descartado deixou a aba
  Laudos da ficha vazia por semanas (a consulta pedia uma coluna que não existe).

## Estado em 23/09/2026 (no ar)

- Migrações aplicadas: as de 17/09 (auditoria de segurança) e
  `20260923120000_cupons_duracao_e_acesso`, `20260923130000_diario_supervisao`,
  `20260923140000_agenda_supervisoes`.
- Publicado: cupom com duração e acesso pelas datas; laudo sem dados da Hellen e
  Termo de Responsabilidade; comentários de supervisão no Diário; aba de
  supervisões na Agenda; botão de WhatsApp e textos revisados no site; correção
  da aba Laudos da ficha do paciente.
- O SQL novo foi validado num Postgres local (PGlite) com cenários de cobrança,
  estorno, permissões e RLS; esse ambiente de teste não está no repositório.
- Revisões: `docs/auditoria/` (auditoria antagônica e handoff de 17/09).

## Pendências

1. **Cartão com cobrança automática** (pedido aprovado, próxima entrega): no
   cartão, a pessoa escolhe "automático" (preapproval do Mercado Pago, valor com
   desconto e subida para R$ 34,90 depois dos meses do cupom) ou "mês a mês";
   cancelamento em Configurações; conferência diária com o Mercado Pago. Só depois
   de validar as entregas de 23/09 com um pagamento real.
2. **Testes com login a confirmar com o Vitor**: cupom de 100% com PIX de R$ 1,00;
   impressão bloqueada sem CRP; comentário de supervisão; supervisão na Agenda.
3. **Dívidas conhecidas**:
   - Somente leitura só na interface (A23): quem está vencido ainda consegue gravar pela API.
   - Lint não bloqueante (~115 erros antigos, a maioria `no-explicit-any`).
   - CSP com `'unsafe-inline'`; bucket `logos` público.
   - Enumeração de e-mail pelo cadastro direto no Supabase.
   - Sem trilha de auditoria de mudanças de privilégio.
   - `LEGACY_MASTER_SECRET` ainda em `utils/crypto.ts`, sem registros `enc:v1:` desde 17/09 — pode sair.
   - `DEFAULT_ADMIN_EMAILS` inclui um e-mail sem conta (decisão do Vitor: manter).
   - Estorno só é revertido pelo webhook (a reconciliação cobre só aprovados).
   - O aviso de conflito de horário da agenda não cruza a meia-noite.
   - `README.md` e `Dockerfile` ainda são de template.
