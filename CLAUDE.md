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
Auth, Storage), Mercado Pago SDK 3.4, Vercel (com um cron diário em
`vercel.json`). Testes: vitest em `tests/` (`npm test`). CI:
`.github/workflows/ci.yml` (audit, tipos, lint sem erros nem avisos, testes, build
e guardas próprias). Exceção de lint só com `eslint-disable-next-line` e o motivo.

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
- Falar de cada frente pelo que ela faz ("cartão automático", "PIX de 15
  minutos"), nunca por rótulos internos de plano ("Entrega 2"), que confundem.
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
  `current_period_end` no futuro ou `trial_ends_at` no futuro — mais 10 dias de
  tolerância depois desses dias enquanto a renovação automática está ativa
  (`CARENCIA_CARTAO_DIAS`: a janela em que o Mercado Pago tenta de novo um cartão
  recusado), só se ela foi ligada ANTES de os dias acabarem (`renovacaoDesde`).
  Acesso pela tolerância nunca é "pagamento aprovado" na tela.
  `subscription_status` é só informação. O Modo Somente Leitura só
  existe na interface (dívida A23).
- **Preço** só no servidor (`utils/preco-assinatura.ts`). A tela envia o valor que
  mostrou (`valor_esperado`); o servidor responde 409 se diferir.
- **Criar pagamento** só por `criarPagamento` (`utils/mercadopago.ts`), com cliente
  novo por chamada: no SDK 3.4 as `requestOptions` ficam gravadas na configuração
  compartilhada e a chave de idempotência vazaria para o pagamento seguinte.
  **Assinatura** (renovação automática): criar só por `criarAssinaturaMP` (sem
  novas tentativas: um reenvio viraria uma segunda assinatura no mesmo cartão) e
  mudar valor ou cancelar só por `atualizarAssinaturaMP`. Os clientes
  compartilhados (`paymentClient`, `preApprovalClient`, `invoiceClient`) são só
  para `get`/`search`.
- **Pagamento aprovado** passa sempre por `processarPagamentoAprovado` →
  função SQL `processar_pagamento_aprovado` (idempotente por `payment_id`; dias e
  mensalidade de cupom numa transação). Nunca ative assinatura por outro caminho.
  Vale para as cobranças automáticas: o Mercado Pago não copia a nossa metadata,
  então a foto do cupom vem do resgate gravado ao assinar; nunca dias proporcionais.
- **Renovação automática** (`utils/assinatura-cartao.ts` e `-servidor.ts`): nunca
  duas por pessoa. A trava é o índice único de `assinaturas_cartao` (`criando` ou
  `ativa`), e a linha `criando` é gravada antes de chamar o Mercado Pago; resposta
  ambígua fica `criando` até a assinatura ser achada lá — nunca criar de novo às
  cegas. Com ela ligada, PIX e cartão avulso respondem 409. Conta com assinatura
  viva não pode ser apagada (gatilho no banco); excluir, dar VIP ou tornar admin
  cancela antes, e só grava "cancelada" depois de o Mercado Pago confirmar.
  Recusa `CC_VAL_433` = verificação do cartão barrada (antifraude ou banco): o
  motivo real está no pagamento de verificação — ver
  `/api/admin/diagnostico-assinaturas` e a coluna `erro` antes de mudar código.
- **Cupom:** o resgate guarda a foto das condições; pausar/vencer não tira o
  desconto de quem já usa; excluir = arquivar, e só se nunca usado. Em cupom de
  desconto, `trial_days = 30` é coluna antiga e não tem efeito.
- **Documento** (laudo, declaração, atestado) nunca usa dados de outra pessoa:
  nome, CRP e cidade são obrigatórios para emitir (`utils/dados-profissionais.ts`).
- **Feed iCal**: sem nome completo nem anotação clínica; supervisões aparecem só
  como "Supervisão (modalidade)".
- **Toda consulta ao Supabase confere `error`.** Um erro descartado deixou a aba
  Laudos da ficha vazia por semanas (a consulta pedia uma coluna que não existe).

## Estado em 23/09/2026 (noite)

- Migrações aplicadas: as de 17/09 (auditoria de segurança),
  `20260923120000_cupons_duracao_e_acesso`, `20260923130000_diario_supervisao`,
  `20260923140000_agenda_supervisoes` e `20260923150000_cartao_automatico`.
- Publicado:
  - cupom com duração e acesso pelas datas;
  - laudo sem dados da Hellen e Termo de Responsabilidade;
  - comentários de supervisão no Diário e aba de supervisões na Agenda;
  - botão de WhatsApp e textos revisados no site;
  - correções da aba Laudos da ficha e do CSP do formulário de cartão (o cartão
    avulso foi pago em produção depois disso);
  - **renovação automática no cartão** (rotas, telas, webhook, conferência
    diária em `/api/cron/assinaturas`, cancelamento em Configurações, admin);
  - PIX com validade de 15 minutos na tela;
  - lint zerado e bloqueante na CI;
  - credenciais tiradas dos scripts de teste.
- O SQL foi validado num Postgres local (PGlite) com cenários de cobrança,
  estorno, permissões e RLS; esse ambiente de teste não está no repositório.
- Revisões: `docs/auditoria/` (auditoria antagônica e handoff de 17/09).

### Renovação automática: a criação é recusada pelo antifraude (em aberto)

- **Sintoma:** ligar o automático volta HTTP 400 `CC_VAL_433 Credit card
  validation has failed`. O pagamento avulso passa com o mesmo cartão.
- **Motivo real** (lido em `/api/admin/diagnostico-assinaturas`): a **primeira
  mensalidade**, cobrada na hora da criação (quem já está vencido), foi recusada
  com `status_detail = cc_rejected_high_risk`, isto é, pelo antifraude. Foram 5
  tentativas em 23/09, entre 21h48 e 22h11 de Brasília, todas com o mesmo cartão
  (Master final 2485) e valores de R$ 1,00 e R$ 3,49 (cupons de 100% e 90%).
  Pagamentos 179600554327, 180594401684, 179600873037, 180596532588 e
  180595923810.
- **O que já foi feito**, tudo no ar:
  - device ID do `security.js` no cabeçalho `X-Meli-Session-Id`;
  - Card Payment Brick no automático, com o e-mail da conta preenchido e o campo
    escondido;
  - criação por `fetch` direto, que guarda `code` e `x-request-id`;
  - busca do motivo da verificação;
  - página de diagnóstico para o admin.

  O Card Payment Brick ainda **não foi testado**.
- **Leitura mais provável:** padrão de "teste de cartão", com cobranças
  recorrentes de R$ 1, repetidas, com o mesmo cartão, do próprio dono. Não
  concluir que o fluxo não funciona antes do próximo teste.
- **Aprendido:**
  - a cobrança da assinatura vem com `point_of_interaction.type =
    "SUBSCRIPTIONS"`, `operation_type = "regular_payment"` e `external_reference`
    igual ao id da conta;
  - o motivo da recusa só aparece nesse pagamento (a busca não traz o e-mail do
    pagador);
  - o SDK 3.4 descarta `code` e `x-request-id` do erro.
- **Próximo teste:** valor normal (R$ 34,90, sem cupom grande), cartão de outra
  pessoa (não o dono da conta Mercado Pago que recebe), uma tentativa só, sem
  usar o cartão final 2485 por um tempo.
- **Plano B, se voltar `cc_rejected_high_risk`:** a pessoa confirma a assinatura
  numa tela do Mercado Pago, logada na conta dela (preapproval `pending` com
  `init_point`), o que dá ao antifraude muito mais sinal. Riscos: pode exigir
  login com o mesmo e-mail do `payer_email`, e houve relato de `init_point` com
  "página não existe" em 09/2026 (`mercadopago/sdk-nodejs#480`). Em paralelo,
  abrir chamado no suporte do Mercado Pago com os pagamentos acima.

## Pendências

1. **Cartão automático:**
   - resolver a recusa acima;
   - confirmar que `CRON_SECRET` existe na Vercel (sem ele o cron responde 401 e a
     conferência diária não roda) e que o evento "Planos e assinaturas" está
     ligado no webhook do Mercado Pago;
   - teste de ponta a ponta com cartão real: ligar, ver a cobrança virar dias,
     cancelar em Configurações;
   - a Hellen revisar os textos novos de pagamento (FAQ do site, Termos,
     Privacidade);
   - decidir o automático com cupom de 100% (hoje vira assinatura de R$ 1,00,
     que o antifraude tende a barrar; sugestão: não oferecer o automático
     quando o valor for R$ 1,00).
2. **Testes com login a confirmar com o Vitor**: cupom de 100% com PIX de R$ 1,00;
   impressão bloqueada sem CRP; comentário de supervisão; supervisão na Agenda.
3. **Segurança — ação do Vitor:** a senha da conta `hellen@psicologa.com` esteve
   escrita em três scripts de teste e continua no histórico do git (nesta cópia e
   no repositório da Hellen). Os scripts agora leem `TESTE_EMAIL`/`TESTE_SENHA`;
   a senha precisa ser trocada.
4. **Consultas que tratam falha do banco como "vazio"** (achadas na limpeza de
   lint de 23/09; algumas podem apagar dados — perfil do laudo salvo em branco,
   link do calendário regenerado, PIN do Diário substituído, backup incompleto) e
   o redirecionamento aberto em `app/auth/callback` (`next`), mais três no painel
   admin (exclusão de conta, `set_trial_days`, métricas). Lista completa na
   tarefa separada "Corrigir consultas que ignoram erro do banco".
5. **Dívidas conhecidas**:
   - Somente leitura só na interface (A23): quem está vencido ainda consegue gravar pela API.
   - CSP com `'unsafe-inline'`; bucket `logos` público.
   - Enumeração de e-mail pelo cadastro direto no Supabase.
   - Sem trilha de auditoria de mudanças de privilégio.
   - `LEGACY_MASTER_SECRET` ainda em `utils/crypto.ts`, sem registros `enc:v1:` desde 17/09 — pode sair.
   - `DEFAULT_ADMIN_EMAILS` inclui um e-mail sem conta (decisão do Vitor: manter).
   - Estorno só é revertido pelo webhook (a reconciliação cobre só aprovados).
   - O aviso de conflito de horário da agenda não cruza a meia-noite.
   - `README.md` e `Dockerfile` ainda são de template.
