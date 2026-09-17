# Passo a passo — aplicar as correções de segurança

**Situação real do seu sistema:** 3 contas (você, Hellen e Isabella), 11 pacientes, 102 linhas no banco inteiro, 80 campos cifrados. É pequeno. Dá para fazer tudo com calma numa tarde.

**Tempo:** cerca de 1 hora.
**Quando:** num horário em que a Hellen e a Isabella não estejam atendendo. Existe uma janela de uns 15 minutos em que o sistema fica instável.

---

## Três medos que você pode riscar da lista

Antes de começar, três coisas já foram verificadas no seu banco:

1. **Ninguém se aproveitou da falha de administrador.** As 3 contas estão com `is_admin = false`. A brecha existia, mas não foi usada. Não há incidente a apurar.
2. **Não há registro clínico sem dono.** A migração que eu tinha avisado que poderia travar **não vai travar** no seu caso.
3. **O backup já está feito.** Rodei `npm run backup` e o arquivo está em `backups/backup-2026-09-17T19-03-27.json`, com as 102 linhas.

---

## A ideia, em quatro frases

1. Você guarda cópias do que existe hoje.
2. Muda o banco (9 arquivos de SQL, copiar e colar).
3. Publica o código novo.
4. Troca a criptografia antiga pela nova.

**Por que nesta ordem:** o código novo precisa de tabelas que só existem depois do passo 2. Se você publicar antes, ninguém consegue abrir prontuário.

---

# PASSO 1 — Cópias de segurança

> ⏱️ 15 minutos. Nada muda no sistema.

Você está no plano free do Supabase, que não tem backup no painel. Então a proteção vem de duas fontes, e cada uma cobre um tipo de problema diferente:

| Cópia | Protege contra |
|---|---|
| O JSON do banco (já feito) | Uma migração dar errado |
| O CSV que cada psicóloga exporta | A recifragem dar errado |

## 1.1 — Peça o CSV para a Hellen e para a Isabella

Cada uma entra no sistema e vai em **Configurações → Backup completo de dados** e baixa o arquivo `.CSV`.

Esse arquivo sai com **tudo em texto legível** — nomes, prontuários, diário, laudos. É por isso que ele é a rede de proteção: se a criptografia der qualquer problema, o conteúdo clínico existe em texto puro, em Excel, independente do sistema.

⚠️ Justamente por sair legível, ele é um prontuário em arquivo. Oriente as duas a guardarem num lugar seguro e a apagarem depois que tudo estiver funcionando.

Você também pode fazer o seu.

## 1.2 — Guarde o JSON fora deste computador

O arquivo `backups/backup-2026-09-17T19-03-27.json` está na sua máquina. Copie para um pendrive ou para a nuvem — em algum lugar que não seja este computador.

Se quiser gerar um mais novo a qualquer momento:

```bash
npm run backup
```

---

# PASSO 2 — Gerar a chave-mestra

> ⏱️ 10 minutos. É o passo mais importante do procedimento inteiro.

Hoje a criptografia dos prontuários usa uma senha que está escrita dentro do código — ou seja, qualquer pessoa que abra o site consegue extrair. Você vai substituir por uma chave de verdade, que só o servidor conhece.

**No terminal, uma única vez:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Vai sair uma linha grande de letras e números. **Essa linha abre todos os prontuários do sistema.**

**Guarde em dois lugares, agora:**
- No seu gerenciador de senhas
- Num segundo lugar fora do computador (pode ser papel, num lugar seguro)

**Por que dois lugares:** depois do PASSO 7, o banco sozinho não abre mais os prontuários. Ele precisa do banco **mais** essa chave. Se você perder a chave, os prontuários da Hellen e da Isabella ficam ilegíveis para sempre — e nem eu, nem o Supabase, nem ninguém consegue recuperar. Não é um defeito: é o que faz o banco vazado não virar prontuário vazado.

**Agora gere uma "impressão digital" dela.** Troque `COLE_A_CHAVE` pelo valor que saiu acima:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('COLE_A_CHAVE').digest('hex').slice(0,16))"
```

Sai um código curto de 16 caracteres. **Anote.** Ele não revela a chave, e serve para você conferir depois que a chave do seu computador é a mesma que está na Vercel — coisa que nada no sistema verifica sozinho, e que, se estiver diferente, estraga a recifragem em silêncio.

---

# PASSO 3 — Variáveis na Vercel

> ⏱️ 5 minutos. Seguro: o código que está no ar hoje ignora essas variáveis.

Vercel → seu projeto → **Settings** → **Environment Variables**. Adicione duas:

**Primeira:**
- Nome: `CLINICAL_KEK`
- Valor: a chave grande do PASSO 2

**Segunda:**
- Nome: `MERCADO_PAGO_WEBHOOK_SECRET`
- Valor: pegue em Mercado Pago → Suas integrações → sua aplicação → Webhooks → **Assinatura secreta**

Em cada uma, **marque os três ambientes** (Production, Preview, Development). A tela salva sem reclamar se você marcar só um, e aí a produção fica sem.

⚠️ **Nunca** escreva `NEXT_PUBLIC_` na frente desses nomes. Esse prefixo joga a variável dentro do JavaScript que o navegador baixa — foi exatamente assim que a chave antiga virou pública.

⚠️ Ao colar a assinatura do Mercado Pago, não deixe espaço no começo nem no fim.

**Não republique ainda.** O PASSO 5 faz isso.

---

# PASSO 4 — Rodar os 9 arquivos de SQL

> ⏱️ 15 minutos. **Aqui começa a mudança.** Daqui até o fim do PASSO 5, cobranças não ativam. Faça os dois passos seguidos.

## Como rodar cada arquivo

No Supabase: menu lateral → **SQL Editor** → **New query**.

Para cada arquivo da lista, nesta ordem:

1. Abra o arquivo (estão em `supabase/migrations/`) no seu editor de código
2. `Ctrl+A` para selecionar tudo, `Ctrl+C` para copiar
3. Cole no SQL Editor
4. **Clique numa parte vazia do texto** para não deixar nada selecionado
   ⚠️ O botão Run executa **só o que estiver selecionado**. Com texto selecionado, você aplica metade.
5. Clique em **Run**
6. Se não aparecer erro em vermelho, passe para o próximo

## A ordem

```
1. 20260917120000_a01_privilegio_profiles.sql
2. 20260917120100_a10_integridade_tenant.sql
3. 20260917120200_a20_grupos_cross_tenant.sql
4. 20260917120300_a03_a04_a14_superficie_publica.sql
5. 20260917120400_a13_rate_limit_compartilhado.sql
6. 20260917120500_a18_convites.sql
7. 20260917120600_a05_a06_a08_a11_pagamentos.sql
8. 20260917120700_a07_chaves_por_usuario.sql
9. 20260917120800_a19_trigger_perfil.sql
```

**A ordem importa.** O arquivo 1 cria colunas que os outros usam.

## O que esperar

- **"Success. No rows returned"** é o normal. Não é confirmação de nada, é só o editor dizendo que rodou sem erro.
- **Mensagem amarela de aviso (`WARNING`)** nos arquivos 3 e 9: não é erro, a correção foi aplicada. É só um aviso sobre dado antigo.
- **Erro vermelho (`ERROR`)**: pare, não rode o próximo, me mande a mensagem.

**Se algo der errado aqui**, a volta é simples — está no final deste guia.

---

# PASSO 5 — Publicar o código

> ⏱️ 10 minutos.

Este repositório aqui não está ligado à Vercel. Você mencionou que ia replicar para o repositório de produção — então leve os commits para lá (push no branch que a Vercel observa).

⚠️ **O push já é a publicação.** No instante em que você empurra, o código novo vai ao ar. Não existe publicar depois.

Acompanhe na Vercel até aparecer **Ready**. Se o build falhar, o site continua no ar com a versão anterior — sem drama, me mande o log.

---

# PASSO 6 — Conferir se funcionou

> ⏱️ 10 minutos. Não pule: é aqui que dá para descobrir problema antes de mexer nos prontuários.

## 6.1 — A chave chegou?

Logado no sistema, abra no navegador:
`https://app.psisetting.com.br/api/crypto/key`

- **Aparece algo como `{"key":"..."}`** → certo, siga.
- **Aparece erro 500** → a `CLINICAL_KEK` não chegou na Vercel. Confira se está marcada em **Production** e republique. **Não siga para o PASSO 7 assim.**

## 6.2 — Os prontuários estão legíveis?

Entre no sistema e abra um paciente, um prontuário e um laudo. Tem que aparecer tudo normal.

Se aparecer `[Conteúdo protegido - Chave indisponível]`, pare e me chame.

## 6.3 — A falha principal está fechada?

No SQL Editor:

```sql
SELECT grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema='public' AND table_name='profiles' AND privilege_type='UPDATE';
```

**O esperado é que `authenticated` NÃO apareça na lista.** Se aparecer, o arquivo 1 não pegou.

## 6.4 — Sobrou alguma brecha?

```sql
SELECT policyname, tablename FROM pg_policies
WHERE policyname IN ('laudos_storage_owner_only','logos_select_public','coupons_read_active')
   OR 'anon' = ANY(roles);
```

**O esperado é nenhuma linha.** Resultado vazio aqui é boa notícia.

## 6.5 — Avise a Hellen

O link de calendário dela vai parar de funcionar. O da Isabella e o seu continuam normais — só o dela precisa ser renovado.

Motivo: o link dela é o que está escrito dentro do código do projeto, então qualquer pessoa com acesso ao código conseguiria ver a agenda dela, com nome de paciente. A migração troca por um aleatório.

Mensagem para ela: *"o link da agenda foi renovado por segurança. Entra em Configurações, gera o link novo e assina de novo no celular."*

---

# PASSO 7 — Trocar a criptografia

> ⏱️ 15 minutos. **É o ponto sem volta.** São 80 campos.

## 7.1 — Conferir que a chave é a mesma

Abra o arquivo `.env.local` (na pasta do projeto) e acrescente uma linha com a mesma chave do PASSO 2:

```
CLINICAL_KEK=cole-aqui-a-mesma-chave
```

Confirme que é idêntica à da Vercel:

```bash
node --env-file=.env.local -e "console.log(require('crypto').createHash('sha256').update(process.env.CLINICAL_KEK||'').digest('hex').slice(0,16))"
```

**O resultado tem que ser igual ao que você anotou no PASSO 2.**

Se for diferente, **pare**. Rodar com a chave errada grava tudo com uma chave que a aplicação não tem, e o ensaio não detecta isso.

## 7.2 — Ensaio (não grava nada)

```bash
npm run recifrar
```

Ele mostra quantos campos seriam convertidos — deve dizer algo em torno de 80 — e termina com `Falhas: 0`.

Se aparecer qualquer falha, pare e me mande o que apareceu na tela.

## 7.3 — Testar primeiro só na sua conta

Pegue seu identificador:

```sql
SELECT id FROM profiles WHERE email = 'vitorrohde84@gmail.com';
```

E rode só para você:

```bash
npx tsx --env-file=.env.local scripts/migrate-reencrypt-v1-to-v2.ts --apply --user COLE_O_ID_AQUI
```

**Agora abra o sistema com a sua conta e confira** se o que é seu continua legível.

- **Tudo certo** → siga.
- **Algo ilegível** → pare. Não rode para as outras duas. Me chame.

## 7.4 — Rodar para todo mundo

```bash
npm run recifrar:aplicar
```

⚠️ Use exatamente esse comando. **`npm run recifrar --apply` não funciona** — sem os dois traços, o npm engole a opção e roda só o ensaio, com uma saída parecida o bastante para enganar.

No fim ele confere no banco e mostra:

```
✓ Remigração completa: nenhum campo em enc:v1: restou no banco.
```

Se disser que sobraram campos, rode de novo até zerar.

## 7.5 — Conferência final

Peça para a Hellen e para a Isabella abrirem o sistema e conferirem um prontuário cada. É o teste que vale.

---

# Se algo der errado

Com 102 linhas, quase tudo tem volta.

| Onde deu errado | Como voltar |
|---|---|
| PASSOS 1 a 3 | Nada foi alterado ainda |
| Um dos 9 arquivos de SQL | `npm run restaurar -- <arquivo> --confirmar` |
| Depois de publicar | Vercel → Deployments → o anterior → **Rollback** |
| Recifragem, só na sua conta | `npm run restaurar -- <arquivo> --confirmar` |
| Recifragem geral | `npm run restaurar`, **se você tiver a chave** |

Para ver os backups disponíveis:

```bash
npm run restaurar
```

Para desfazer usando o backup de hoje:

```bash
npm run restaurar -- backup-2026-09-17T19-03-27.json --confirmar
```

E, no pior cenário de todos — chave perdida e banco recifrado — ainda restam os CSVs que a Hellen e a Isabella baixaram no PASSO 1. O conteúdo clínico não se perde; seria trabalhoso recadastrar, mas nada de paciente desaparece. **É por isso que o PASSO 1 não é opcional.**

---

# Checklist

```
PASSO 1 — Cópias
[ ] Hellen baixou o CSV dela
[ ] Isabella baixou o CSV dela
[ ] O arquivo JSON está copiado fora deste computador

PASSO 2 — Chave
[ ] Chave gerada UMA vez
[ ] Guardada no gerenciador de senhas
[ ] Guardada num segundo lugar fora do computador
[ ] Impressão digital de 16 caracteres anotada

PASSO 3 — Vercel
[ ] CLINICAL_KEK criada, nos 3 ambientes, sem NEXT_PUBLIC_
[ ] MERCADO_PAGO_WEBHOOK_SECRET criada, sem espaços

PASSO 4 — SQL (fora do horário de atendimento)
[ ] 1    [ ] 4    [ ] 7
[ ] 2    [ ] 5    [ ] 8
[ ] 3    [ ] 6    [ ] 9

PASSO 5 — Publicar
[ ] Push feito
[ ] Build Ready na Vercel

PASSO 6 — Conferir
[ ] /api/crypto/key respondeu com a chave
[ ] Prontuário e laudo legíveis
[ ] authenticated NÃO tem UPDATE em profiles
[ ] Consulta de brechas: vazia
[ ] Hellen avisada sobre o link da agenda

PASSO 7 — Criptografia (ponto sem volta)
[ ] Impressão digital confere com a anotada
[ ] Ensaio com Falhas: 0
[ ] Testado só na minha conta e continua legível
[ ] npm run recifrar:aplicar (com os dois traços!)
[ ] "Remigração completa" apareceu
[ ] Hellen e Isabella confirmaram que está tudo normal
```

---

**Dúvida em qualquer ponto, pare e pergunte.** Nada aqui tem pressa, e a única coisa que realmente não tem volta é perder a chave do PASSO 2.
