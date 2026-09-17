# ⛔ NÃO EXECUTE NADA DESTA PASTA

Estes onze scripts foram a forma de migrar o banco até 17/09/2026. Eles estão
aqui **apenas como registro histórico**. Rodar qualquer um deles hoje
**reabre falhas de segurança já corrigidas**.

As migrações válidas vivem em [`supabase/migrations/`](../../supabase/migrations/),
são numeradas, idempotentes e seguras para reexecutar.

## Por que foram aposentados

A auditoria de 17/09 (`docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md`, achado
A17) mostrou que o estado do banco **dependia da ordem em que alguém colou os
arquivos no SQL Editor**. Não existia "o estado do banco"; existia o estado que
resultou daquela ordem. Três consequências concretas:

1. **`full-system-security-audit-and-hardening.sql` desfazia a correção de
   `fix-storage-security.sql`.** O arquivo chamado "AUDITORIA E BLINDAGEM
   MESTRE" recriava a política que permitia a qualquer psicólogo ler, sobrescrever
   e apagar o PDF de laudo de qualquer outro. Ou seja: o script que alguém rodaria
   ao *suspeitar* de um incidente era justamente o que reabria o furo mais grave.

2. **O mesmo arquivo aborta inteiro se rodado fora de ordem.** O SQL Editor
   executa o buffer como uma transação: um `ALTER` numa tabela que ainda não
   existe faz rollback de tudo, inclusive dos `ENABLE ROW LEVEL SECURITY` e das
   40+ políticas anteriores. O operador vê uma mensagem de erro e pode não
   perceber que **nenhuma** blindagem foi aplicada.

3. **Quatro versões concorrentes de `handle_new_user`,** três delas sem
   `SET search_path` fixado. Reexecutar a versão errada remove a proteção que a
   outra aplicou.

Havia ainda dois problemas que não dependiam de ordem nenhuma:

- `setup-admin-and-feedbacks-schema.sql` concedia admin com
  `email ILIKE '%vitor%' OR email ILIKE '%hellen%'`, que casa com `vitoria@`,
  `avitor@`, `michellen@`. Com cadastro aberto, bastava registrar-se com o
  e-mail certo e aguardar a próxima execução do script.
- `supabase-multiuser-migration.sql` gravava o token de calendário
  `hellen-cal-a7f3e9b2d1c8` em texto claro. Esse token dá acesso não
  autenticado à agenda clínica. Ele já foi rotacionado pela migração
  `20260917120300`.

## O que ainda vale destes arquivos

O trabalho de RLS do núcleo clínico (`pacientes`, `agendamentos`, `prontuarios`,
`diario_bordo`, `laudos`, `pagamentos`) estava **correto** e continua valendo —
as quatro operações cobertas com `psicologo_id = auth.uid()` em `USING` e
`WITH CHECK`. `setup-grupos-schema.sql` era o melhor do conjunto. As migrações
novas preservam tudo isso; elas corrigem o que estava frouxo, não refazem o que
estava de pé.

## Se precisar reconstruir um banco do zero

Aplique, nesta ordem:

1. os scripts desta pasta que **criam tabelas** (`supabase-multiuser-migration`,
   `create-subscription-and-coupons-schema`, `setup-admin-and-feedbacks-schema`,
   `setup-grupos-schema`, `add-*`), **lendo antes cada um** e pulando os blocos
   de concessão de admin por `ILIKE` e o `UPDATE` do token de calendário;
2. em seguida, **todas** as migrações de `supabase/migrations/` em ordem
   numérica — elas são a fonte de verdade das políticas de segurança.

O caminho correto, porém, é consolidar a criação de tabelas numa migração nova.
Está registrado como dívida no relatório de handoff.
