# Passo a passo — aplicar as correções de segurança

**Para quem:** você, sozinho, no seu ritmo.
**Tempo:** cerca de 2 horas, sem pressa. Dá para parar entre as etapas.
**Quando:** fora do horário de atendimento. Existe uma janela de poucos minutos (Etapa 3) em que pagamentos não ativam.

---

## Entenda a ideia antes de executar

Você vai fazer quatro coisas, nesta ordem:

1. **Preparar** — backup, guardar evidências e gerar a chave-mestra.
2. **Mudar o banco** — 9 migrações que fecham as brechas.
3. **Publicar o código novo** — que sabe conversar com o banco mudado.
4. **Recifrar os prontuários** — trocar a criptografia antiga (com chave pública) pela nova.

**Por que esta ordem e não outra.** O código novo precisa de tabelas que só existem depois das migrações. Se você publicar antes, `/api/crypto/key` responde erro e **ninguém consegue ler nem salvar prontuário**. Já as migrações rodando com o código antigo quebram só a ativação de pagamento, por poucos minutos. Entre estragar o consultório e atrasar uma cobrança, a escolha é óbvia.

As variáveis de ambiente vão **antes de tudo** porque, com o código antigo, elas são ignoradas — e assim o deploy da Etapa 4 já nasce com elas. Isso elimina o erro mais comum: definir a variável, ver que nada mudou e não entender que faltava republicar.

### Cinco regras que valem o tempo todo

1. **Uma etapa por vez.** Leia a saída antes de seguir. Não cole tudo de uma vez.
2. **A `CLINICAL_KEK` é o prontuário.** Perdeu a chave, perdeu os prontuários. Não existe recuperação, e isso é o desenho, não um defeito.
3. **Uma migração que aborta é um freio, não um defeito.** Nunca resolva um aborto com `DELETE`.
4. **Nunca rode nada de `scripts/sql-legado-nao-executar/`.** Um deles reabre exatamente a falha mais grave — e é o arquivo que uma pessoa razoável rodaria ao desconfiar de problema.
5. **Teste com conta comum, em janela anônima.** Todas as travas novas liberam admin e service_role. Testar logado como você não prova nada.

---

# ETAPA 0 — Preparação e evidências

> ⏱️ 20 minutos. Nada é alterado aqui. **Não pule.**

## 0.1 — Salvar quem é admin hoje (tem prazo)

A primeira migração **revoga** `is_admin` de quem não está na lista de três e-mails. Se alguém tiver se auto-promovido explorando a falha, esse rastro some para sempre. E é justamente a pergunta que a LGPD obriga a responder se houver incidente com dado de saúde.

No Supabase: menu lateral → **SQL Editor** → **New query**. Cole e rode:

```sql
SELECT p.id, u.email, p.is_admin, p.is_vip, u.created_at
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.is_admin = true OR p.is_vip = true
ORDER BY u.created_at;
```

Rode também:

```sql
SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC;
```

**Salve os dois resultados num arquivo com a data de hoje.** Use o botão de exportar CSV do próprio editor.

**Leia o resultado com atenção.** Você conhece cada admin e cada VIP dessa lista? Foi você que concedeu?

- **Sim** → siga em frente.
- **Não, tem alguém estranho** → **pare aqui.** Deixa de ser correção técnica e passa a ser incidente de segurança com dado de saúde de pacientes de terceiros. Isso tem dever de apuração (LGPD, art. 48) e a conversa é outra. Me chame antes de continuar.

## 0.2 — Backup do banco

Supabase → **Database** → **Backups** → **Start a backup** (ou o botão de backup sob demanda do seu plano).

- **Anote o horário exato.**
- **Espere terminar** e confirme na tela.

Backup de ontem não serve. Você precisa de um ponto imediatamente anterior à primeira escrita.

> ⚠️ O backup vale até o instante em que foi tirado. Se você fizer a Etapa 6 só amanhã, restaurar este backup significa perder os atendimentos registrados no meio. Por isso o ideal é fazer tudo no mesmo dia.

## 0.3 — Gerar a chave-mestra (`CLINICAL_KEK`)

No terminal, **uma única vez**:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Sai uma linha de 64 caracteres. **Essa é a chave que abre todos os prontuários do sistema.**

Agora gere a impressão digital dela — troque `COLE_A_CHAVE_AQUI` pelo valor:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('COLE_A_CHAVE_AQUI').digest('hex').slice(0,16))"
```

Sai um código curto de 16 caracteres. Ele **não revela a chave** e serve para você provar depois que a chave do seu terminal é a mesma que está na Vercel. Nada no sistema confere isso sozinho — e essa é a falha mais cara possível neste procedimento.

**Guarde agora, antes de seguir:**

- [ ] A chave completa no seu gerenciador de senhas
- [ ] A chave completa num segundo lugar, fora do computador (papel num lugar seguro serve)
- [ ] A impressão digital de 16 caracteres onde você consulte fácil

> ⚠️ **Nunca gere a chave duas vezes.** O erro clássico é gerar uma para a Vercel e outra depois "porque perdi a primeira". A aplicação continua funcionando para dado novo e só o dado recifrado fica ilegível — você descobre semanas depois.

---

# ETAPA 1 — Variáveis de ambiente na Vercel

> ⏱️ 10 minutos. Seguro: o código antigo ignora essas variáveis.

No painel da Vercel → seu projeto → **Settings** → **Environment Variables**.

Adicione as duas:

| Nome | Valor |
|---|---|
| `CLINICAL_KEK` | a chave de 64 caracteres da Etapa 0.3 |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Mercado Pago → Suas integrações → sua aplicação → Webhooks → **Assinatura secreta** |

**Marque os três ambientes** em cada uma: Production, Preview e Development. A tela salva sem reclamar se você marcar só um, e aí a produção fica sem a variável.

⚠️ **Nunca** coloque `NEXT_PUBLIC_` na frente desses nomes. Esse prefixo manda a variável para dentro do JavaScript que o navegador baixa — foi exatamente assim que a chave antiga virou pública.

⚠️ Ao colar a assinatura do Mercado Pago, cuidado com espaço ou quebra de linha na ponta. O webhook falha em silêncio: nada quebra visivelmente, as renovações só param de ativar.

**Não republique ainda.** O deploy da Etapa 4 pega essas variáveis.

---

# ETAPA 2 — Conferir o terreno antes de mexer

> ⏱️ 10 minutos. Só leitura. Evita dois abortos previsíveis.

## 2.1 — Existe registro clínico sem dono?

```sql
SELECT 'pacientes' AS tabela, count(*) FROM pacientes WHERE psicologo_id IS NULL
UNION ALL SELECT 'agendamentos', count(*) FROM agendamentos WHERE psicologo_id IS NULL
UNION ALL SELECT 'prontuarios',  count(*) FROM prontuarios  WHERE psicologo_id IS NULL
UNION ALL SELECT 'diario_bordo', count(*) FROM diario_bordo WHERE psicologo_id IS NULL
UNION ALL SELECT 'laudos',       count(*) FROM laudos       WHERE psicologo_id IS NULL
UNION ALL SELECT 'pagamentos',   count(*) FROM pagamentos   WHERE psicologo_id IS NULL;
```

**Tudo zero?** Ótimo, siga. **Tem número diferente de zero?** Leia o Apêndice A antes de continuar — e nunca resolva isso com `DELETE`.

## 2.2 — Os laudos estão na pasta certa?

```sql
SELECT name FROM storage.objects
WHERE bucket_id = 'laudos' AND name NOT LIKE '%/%/%'
LIMIT 50;
```

Deve vir **vazio**. Se vier algo, esses arquivos ficarão inacessíveis pelo sistema depois da migração 4 (o arquivo não é apagado, só fica fora de alcance). Anote os nomes e me avise — eles precisam ser **movidos**, não apagados.

## 2.3 — Qual é o limite de linhas do seu projeto?

Supabase → **Settings** → **API** → procure **Max rows**. Anote o número (padrão: 1000). É só para conferência — o script de recifragem já pagina sozinho.

---

# ETAPA 3 — Aplicar as 9 migrações

> ⏱️ 20 minutos. **Aqui começa a alteração.** A partir daqui, até a Etapa 4 terminar, ativação de pagamento não funciona. Por isso: fora do horário comercial, e sem pausa longa entre esta etapa e a próxima.

## Como rodar cada uma

Para cada arquivo, na ordem da tabela abaixo:

1. Abra o arquivo em `supabase/migrations/` no seu editor.
2. **Selecione tudo** (`Ctrl+A`) e copie.
3. No Supabase SQL Editor, **New query**, cole.
4. **Clique em qualquer lugar do texto para tirar a seleção.** ⚠️ O botão Run executa **apenas o trecho selecionado** — com texto selecionado, você aplica metade e pula justamente a verificação de segurança do final.
5. **Run**.
6. Leia a saída. Só então passe para a próxima.

> ⚠️ **"Success. No rows returned" não é prova de que deu certo.** Quase todo o critério de aceite está em mensagens `NOTICE`, que o editor do Supabase costuma **não exibir**. Por isso a Etapa 5 valida por `SELECT`, que não mente.

## A ordem (não invente outra)

| # | Arquivo | O que faz | Pode abortar? |
|---|---|---|---|
| 1 | `20260917120000_a01_privilegio_profiles.sql` | Impede o usuário de se tornar admin | Só se algo estiver muito fora do previsto |
| 2 | `20260917120100_a10_integridade_tenant.sql` | Exige dono em todo registro clínico | **Sim, de propósito** |
| 3 | `20260917120200_a20_grupos_cross_tenant.sql` | Impede vincular paciente de outro | Não (pode avisar) |
| 4 | `20260917120300_a03_a04_a14_superficie_publica.sql` | Fecha laudos e troca o link do calendário | Não |
| 5 | `20260917120400_a13_rate_limit_compartilhado.sql` | Limite de tentativas que funciona | Não |
| 6 | `20260917120500_a18_convites.sql` | Convites com prazo | Não |
| 7 | `20260917120600_a05_a06_a08_a11_pagamentos.sql` | Fecha cupons e evita cobrança repetida | Não |
| 8 | `20260917120700_a07_chaves_por_usuario.sql` | Cria a tabela de chaves | Não |
| 9 | `20260917120800_a19_trigger_perfil.sql` | Conserta a criação de conta | Não (pode avisar) |

**A ordem importa de verdade.** A migração 1 é quem cria várias colunas que as outras usam.

## O que fazer quando aparecer mensagem

**A migração 2 abortou, com uma lista de tabelas e números.**
É o comportamento correto: existe registro clínico sem dono e ela se recusa a chutar. **Não apague nada.** Vá para o Apêndice A, resolva, e rode a 2 de novo — ela pode ser repetida à vontade.

**A migração 3 ou a 9 mostrou `WARNING`.**
Não é erro. A correção foi aplicada. O aviso diz que existe coisa antiga para revisar (vínculo de grupo cruzado, ou conta sem perfil). Anote e siga — trate depois com calma.

**Qualquer coisa que diga `ERROR` fora do caso da migração 2.**
Pare. Não rode a próxima. Me mande a mensagem.

**Interrompeu no meio e voltou depois.**
Todas são repetíveis, mas as migrações 1, 4 e 7 **abortam de propósito** se encontrarem resquício inseguro — e o erro parece problema novo. Anote em qual você parou.

---

# ETAPA 4 — Publicar o código novo

> ⏱️ 15 minutos. Fecha a janela aberta na etapa anterior.

Este repositório aqui **não está ligado à Vercel** — você disse que ia replicar para o repositório de produção. Então:

1. Leve os commits para o repositório de produção (push no branch que a Vercel observa).
2. ⚠️ **O push já é o deploy.** Não existe "decido depois quando publicar". No instante do push, o código novo vai ao ar.
3. Acompanhe o build na Vercel até aparecer **Ready**.

Se o build falhar, o site continua no ar com a versão anterior — sem drama, me mande o log.

---

# ETAPA 5 — Verificar que funcionou

> ⏱️ 15 minutos. Não pule: é aqui que você descobre problema enquanto ainda dá para voltar.

## 5.1 — A chave chega ao navegador?

Logado no sistema, abra `https://app.psisetting.com.br/api/crypto/key`.

- **Vê algo como `{"key":"..."}`** → funcionando.
- **Vê erro 500** → a `CLINICAL_KEK` não chegou. Confira se está marcada em **Production** e republique. **Não siga para a Etapa 6 assim.**

## 5.2 — Os prontuários continuam legíveis?

Abra um paciente, um prontuário, um laudo. O texto tem que aparecer normal.

Se aparecer `[Conteúdo protegido - Chave indisponível]`, pare e me chame.

## 5.3 — A escalada de privilégio está fechada? (o teste que importa)

Esta era a falha mais grave: qualquer psicólogo cadastrado virava administrador com um comando e alcançava a base clínica inteira.

**Teste rápido, no SQL Editor:**

```sql
SELECT grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema='public' AND table_name='profiles' AND privilege_type='UPDATE';
```

**Esperado:** `authenticated` **não** aparece. Se aparecer, a migração 1 não pegou.

**Teste definitivo, simulando o atacante.** Este prova de verdade, porque exercita a trava pelo mesmo caminho que um usuário real usaria. No SQL Editor:

```sql
-- Assume a identidade de um psicólogo comum e tenta se promover.
-- Troque pelo UUID de uma conta comum (NÃO a sua, que é admin).
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"COLE_O_UUID_DE_UMA_CONTA_COMUM","role":"authenticated"}';

UPDATE profiles SET is_admin = true WHERE id = 'COLE_O_UUID_DE_UMA_CONTA_COMUM';
ROLLBACK;
```

**Esperado:** um erro, algo como `permission denied` ou `Coluna privilegiada de profiles nao pode ser alterada pelo proprio usuario`.

**Se o UPDATE for aceito, a trava não está funcionando — pare e me chame.**

O `ROLLBACK` no final garante que nada é gravado, mesmo que passe.

## 5.4 — Sobrou alguma brecha conhecida?

```sql
SELECT policyname, tablename FROM pg_policies
WHERE policyname IN ('laudos_storage_owner_only','logos_select_public','coupons_read_active')
   OR 'anon' = ANY(roles);
```

**Esperado: nenhuma linha.** Resultado vazio aqui é boa notícia.

## 5.5 — Avise as psicólogas sobre o calendário

O link antigo da agenda parou de funcionar no momento da migração 4. Isso é o efeito pretendido — aquele link entregava nome de paciente e anotação clínica para quem tivesse a URL.

Mande uma mensagem: **"o link da agenda foi renovado por segurança; entre em Configurações e gere o novo link para reassinar no celular."**

---

# ETAPA 6 — Recifrar os prontuários

> ⏱️ 20 minutos. **É o ponto de não retorno.** Depois daqui, o banco sozinho não abre mais os prontuários — precisa do banco **mais** a `CLINICAL_KEK`.

## 6.1 — Confirmar que a chave é a mesma

No seu `.env.local`, adicione a mesma chave da Etapa 0.3:

```
CLINICAL_KEK=a-mesma-chave-de-64-caracteres
```

Agora confirme que é idêntica à da Vercel, comparando a impressão digital:

```bash
node -e "console.log(require('crypto').createHash('sha256').update(process.env.CLINICAL_KEK||'').digest('hex').slice(0,16))" --env-file=.env.local
```

**O resultado tem que bater com o que você anotou na Etapa 0.3.** Se não bater, **pare**. Rodar com a chave errada grava tudo sob uma chave que a aplicação não tem — e isso não tem volta.

## 6.2 — Ensaio (não grava nada)

```bash
npm run recifrar
```

Ele diz quantos campos seriam convertidos. Leia a saída inteira:

- **`Falhas: 0`** → pode seguir.
- **Qualquer falha** → pare e me mande a saída.

## 6.3 — Backup de segurança extra

Além do backup da Etapa 0.2, tire uma cópia cirúrgica das colunas cifradas. Isso permite voltar atrás sem restaurar o banco inteiro:

```sql
CREATE TABLE backup_v1_prontuarios  AS SELECT id, conteudo FROM prontuarios  WHERE conteudo LIKE 'enc:v1:%';
CREATE TABLE backup_v1_diario       AS SELECT id, conteudo FROM diario_bordo WHERE conteudo LIKE 'enc:v1:%';
CREATE TABLE backup_v1_laudos       AS SELECT id, conteudo FROM laudos       WHERE conteudo LIKE 'enc:v1:%';
CREATE TABLE backup_v1_pacientes    AS SELECT id, nome, cpf, telefone, email, endereco, contato_emergencia, observacoes_gerais FROM pacientes;
```

## 6.4 — Testar em você primeiro

Pegue seu UUID (`SELECT id FROM profiles WHERE email = 'seu@email.com';`) e rode só para você:

```bash
npx tsx --env-file=.env.local scripts/migrate-reencrypt-v1-to-v2.ts --apply --user COLE_SEU_UUID
```

Agora **abra o sistema e confira**: um paciente, um prontuário, um laudo. Tudo legível?

- **Sim** → siga.
- **Não** → pare imediatamente. Não rode para os outros. Me chame.

## 6.5 — Rodar para todo mundo

```bash
npm run recifrar:aplicar
```

⚠️ Use exatamente esse comando. **`npm run recifrar --apply` não aplica nada** — sem os dois traços o npm engole a flag e roda em ensaio, com saída parecida o bastante para enganar.

No final, o script confere no próprio banco o que sobrou e imprime:

```
✓ Remigração completa: nenhum campo em enc:v1: restou no banco.
```

Se disser que sobraram campos, **rode de novo** até chegar a zero.

## 6.6 — Conferência final

```sql
SELECT count(*) FROM user_encryption_keys;
SELECT user_id, count(*) FROM user_encryption_keys GROUP BY user_id HAVING count(*) > 1;
```

A segunda consulta tem que vir **vazia** (ninguém pode ter duas chaves).

---

# Pronto. E agora?

- **Não remova** o `LEGACY_MASTER_SECRET` de `utils/crypto.ts` ainda. Deixe algumas semanas, para o caso de aparecer dado antigo de psicólogo inativo.
- **Nunca exclua uma conta** pelo painel do Supabase sem antes salvar `SELECT user_id, wrapped_dek FROM user_encryption_keys WHERE user_id = '<uuid>';` — a chave dela é apagada junto e o prontuário fica ilegível.
- **A `CLINICAL_KEK` agora vive no seu `.env.local`.** Esse computador passou a guardar a chave-mestra de todos os prontuários. Trate o disco (e o backup dele) com o mesmo cuidado que o servidor.

---

# Apêndice A — Registro clínico sem dono

Se a migração 2 abortou, existe prontuário, paciente ou agendamento sem psicólogo responsável. Ela se recusa a adivinhar — atribuir o prontuário de um paciente ao psicólogo errado é violação de sigilo.

**⚠️ Nunca use `DELETE` aqui.** A tabela `pacientes` apaga em cascata: sumir com um paciente órfão leva junto, em silêncio e sem confirmação, os prontuários, laudos, diário, agendamentos e pagamentos dele. É o erro mais caro do procedimento inteiro.

**1. Guarde antes de tocar:**

```sql
CREATE TABLE quarentena_pacientes AS SELECT * FROM pacientes WHERE psicologo_id IS NULL;
```

**2. Olhe o que é:**

```sql
SELECT * FROM pacientes WHERE psicologo_id IS NULL;
```

Nome real ou dado de teste? Tem prontuário vinculado? Muitas vezes o filho já tem dono e revela a resposta:

```sql
SELECT DISTINCT pr.psicologo_id
FROM prontuarios pr WHERE pr.paciente_id = 'ID_DO_PACIENTE_ORFAO';
```

**3. Corrija um por um** — nunca em massa:

```sql
UPDATE pacientes SET psicologo_id = 'UUID_DO_PSICOLOGO' WHERE id = 'ID_DO_PACIENTE';
```

**4. Rode a migração 2 de novo.** Ela pode ser repetida à vontade.

Se tiver dúvida sobre de quem é algum registro, **pare e me pergunte**. Deixar órfão é bem menos grave que atribuir errado.

---

# Apêndice B — Se algo der errado

| Onde | Dá para voltar? | Como |
|---|---|---|
| Etapas 0 a 2 | Sim, nada foi alterado | — |
| Migrações 1 a 9 | Sim | Restaurar o backup da Etapa 0.2. As migrações são repetíveis. |
| Deploy (Etapa 4) | Sim | Vercel → Deployments → deploy anterior → **Rollback** |
| Recifragem, só você (6.4) | Sim | Restaurar as tabelas `backup_v1_*` da Etapa 6.3 |
| Recifragem geral (6.5) | **Só com a KEK** | O banco sozinho não basta mais |

**A pergunta que define tudo:** você ainda tem a `CLINICAL_KEK` guardada em dois lugares fora do servidor?

- **Sim** → nenhum problema deste procedimento é irreversível de verdade.
- **Não** → pare o que estiver fazendo e guarde agora, antes de qualquer outra coisa.

---

# Checklist

```
ETAPA 0 — Preparação
[ ] 0.1 Lista de admins/VIPs salva em arquivo, com data
[ ] 0.1 Reconheço todos os admins da lista
[ ] 0.2 Backup feito, horário anotado, conclusão confirmada
[ ] 0.3 CLINICAL_KEK gerada UMA vez
[ ] 0.3 Chave guardada em dois lugares fora do servidor
[ ] 0.3 Impressão digital de 16 caracteres anotada

ETAPA 1 — Variáveis
[ ] CLINICAL_KEK na Vercel, nos 3 ambientes, sem NEXT_PUBLIC_
[ ] MERCADO_PAGO_WEBHOOK_SECRET na Vercel, sem espaço nas pontas

ETAPA 2 — Conferência
[ ] 2.1 Registros órfãos: todos zero (ou Apêndice A resolvido)
[ ] 2.2 Laudos fora do padrão de pasta: nenhum
[ ] 2.3 Max rows anotado

ETAPA 3 — Migrações (fora do horário de atendimento)
[ ] 1  privilegio_profiles          [ ] 6  convites
[ ] 2  integridade_tenant           [ ] 7  pagamentos
[ ] 3  grupos_cross_tenant          [ ] 8  chaves_por_usuario
[ ] 4  superficie_publica           [ ] 9  trigger_perfil
[ ] 5  rate_limit_compartilhado

ETAPA 4 — Deploy
[ ] Push no repositório de produção
[ ] Build Ready na Vercel

ETAPA 5 — Verificação
[ ] 5.1 /api/crypto/key responde com a chave
[ ] 5.2 Prontuário e laudo legíveis na tela
[ ] 5.3 authenticated NÃO tem UPDATE em profiles
[ ] 5.4 Consulta de policies perigosas: vazia
[ ] 5.5 Psicólogas avisadas sobre o link do calendário

ETAPA 6 — Recifragem (ponto de não retorno)
[ ] 6.1 Impressão digital da chave bate com a anotada
[ ] 6.2 Ensaio com Falhas: 0
[ ] 6.3 Tabelas backup_v1_* criadas
[ ] 6.4 Testado só na minha conta, e continua legível
[ ] 6.5 npm run recifrar:aplicar (com os dois traços!)
[ ] 6.5 "Remigração completa" confirmado
[ ] 6.6 Ninguém com duas chaves
```
