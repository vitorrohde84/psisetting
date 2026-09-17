# Handoff — Correções de segurança do PsiSetting

**Data:** 2026-09-17
**Entrada:** `AUDITORIA-ANTAGONICA-2026-09-17.md` (27 achados, 7 críticos)
**Commits:** `603bb8b` (auditoria) → `4fd2770` (onda 5)
**Escopo:** segurança e privacidade. Usabilidade e UX intocadas, por decisão do responsável.

---

## ⛔ NÃO pode ir a produção antes de:

1. **Definir `CLINICAL_KEK`** na Vercel (32 bytes em hex, sem prefixo `NEXT_PUBLIC_`). Sem ela, nenhuma cifragem ou decifragem de dado clínico funciona.
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   **Guarde uma cópia fora do servidor.** Perder a KEK depois da remigração = perder todos os prontuários, definitivamente. Não existe backdoor — é o desenho.

2. **Definir `MERCADO_PAGO_WEBHOOK_SECRET`** (Mercado Pago → Suas integrações → Webhooks → Assinatura secreta). Sem ele o webhook **recusa tudo**, por decisão de projeto: sem segredo não há como distinguir o Mercado Pago de qualquer pessoa na internet. As ativações continuam funcionando por `process-payment` e `pix/check`.

3. **Aplicar as migrações** de `supabase/migrations/` em ordem numérica.

4. **Rodar a remigração da criptografia**, com backup feito e ensaio antes (ver seção 3).

5. **Responder à pergunta forense** da seção 6. Ela vem antes, não depois — a correção apaga o rastro.

6. **Rotacionar o token de calendário** já é automático na migração `20260917120300`, mas **avise os psicólogos**: o link antigo para de funcionar e eles precisam reassinar a agenda em Configurações. É o efeito pretendido, não um bug.

---

## 1. O que foi corrigido

| ID | Sev. | O que era | Estado |
|---|---|---|---|
| A01 | Crítico | Qualquer psicólogo virava admin com um UPDATE na própria linha | ✅ |
| A02 | Crítico | RCE não autenticado no Next 16.2.12, com AVIF habilitado | ✅ |
| A03 | Crítico | Feed iCal público com nome completo e anotação clínica | ✅ |
| A04 | Crítico | IDOR: qualquer psicólogo lia/apagava laudo de qualquer outro | ✅ |
| A05 | Crítico | Cliente definia o próprio preço da assinatura | ✅ |
| A06 | Crítico | `pix/check` sem dono e com replay infinito | ✅ |
| A07 | Crítico | Chave de criptografia pública no bundle | ✅ código; ⏳ remigração |
| A08 | Alto | Webhook sem assinatura, com fallback para chave anon | ✅ |
| A09 | Alto | Cifragem falhando gravava texto claro em silêncio | ✅ |
| A10 | Alto | `psicologo_id` nullable, sem backfill em `agendamentos` | ✅ migração pronta |
| A11 | Alto | Catálogo de cupons legível; `max_uses` inaplicável | ✅ |
| A12 | Alto | Admin por `email ILIKE '%vitor%'` | ✅ |
| A13 | Alto | Rate limit em memória, em 2 de 20 rotas | ✅ |
| A14 | Alto | Enumeração de psicólogos pelo bucket de logos | ✅ parcial (ver dívidas) |
| A15 | Alto | Sem CSP nem HSTS | ✅ parcial (ver dívidas) |
| A17 | Alto | Replay de script antigo reabria a IDOR de laudos | ✅ |
| A18 | Alto | Convites ilimitados, eternos, com corrida no consumo | ✅ |
| A19 | Médio | Trigger criava conta sem perfil, em silêncio | ✅ |
| A20 | Médio | Vínculo cross-tenant em grupos | ✅ |
| A21 | Médio | `javascript:` aceito em link de comunicado | ✅ |
| A22 | Médio | Enumeração de e-mail no cadastro | ✅ |
| A24 | Médio | Sem testes, sem CI | ✅ |
| A25 | Médio | 5 vulnerabilidades em dependências | ✅ `npm audit` = 0 |
| A16 | Alto | PIN do Diário é trava de tela, não cofre | ⏳ decisão sua |
| A23 | Médio | Modo somente-leitura só na interface | ⏳ decisão sua |
| A26/A27 | Baixo | Policies duplicadas, higiene do repositório | ⏳ parcial |

**Metas medidas** (número, não "feito"):
- `npm audit`: 5 vulnerabilidades (1 crítica, 4 altas) → **0**
- Testes automatizados: 0 → **10 passando**
- Rotas com rate limit: 2/20 → **7/20** (as sensíveis)
- Scripts SQL de execução manual e ordem-dependente: 11 → **0**

---

## 2. Ordem de aplicação das migrações

Aplique no SQL Editor do Supabase, **uma por vez, lendo a saída de cada uma**:

| # | Arquivo | O que faz | Pode falhar? |
|---|---|---|---|
| 1 | `20260917120000_a01_privilegio_profiles` | Trava colunas de privilégio | Não. Se falhar, pare tudo. |
| 2 | `20260917120100_a10_integridade_tenant` | `NOT NULL` em `psicologo_id` | **Sim, de propósito** — aborta se houver registro clínico órfão. Ver seção 4. |
| 3 | `20260917120200_a20_grupos_cross_tenant` | Posse de paciente em grupos | Não. Emite aviso se houver vínculo cruzado antigo. |
| 4 | `20260917120300_a03_a04_a14_superficie_publica` | Storage e token de calendário | Não. |
| 5 | `20260917120400_a13_rate_limit_compartilhado` | Contador no Postgres | Não. |
| 6 | `20260917120500_a18_convites` | Expiração e reserva | Não. |
| 7 | `20260917120600_a05_a06_a08_a11_pagamentos` | Idempotência e cupons | Não. |
| 8 | `20260917120700_a07_chaves_por_usuario` | Tabela de chaves | Não. |
| 9 | `20260917120800_a19_trigger_perfil` | Trigger de perfil | Não. Avisa se houver conta órfã. |

A #2 é a única projetada para abortar. Isso é intencional: atribuir dono a um prontuário órfão no chute violaria o sigilo do paciente. Se ela abortar, ela diz quantos registros e em quais tabelas.

---

## 3. Remigração da criptografia (a parte com risco real)

**Antes:**
1. Backup do banco (Supabase → Database → Backups).
2. `CLINICAL_KEK` definida, com cópia guardada fora do servidor.
3. Migração #8 aplicada.

**Ensaio — não grava nada:**
```bash
npx tsx scripts/migrate-reencrypt-v1-to-v2.ts
```
Ele diz quantos campos seriam convertidos e falha alto se algum não abrir com a chave antiga.

**Gravação:**
```bash
npx tsx scripts/migrate-reencrypt-v1-to-v2.ts --apply
```

Dá para começar por um psicólogo só, com `--user <uuid>`. Recomendado: faça isso com a sua própria conta primeiro e confira na tela que prontuário, laudo e diário continuam legíveis.

O código lê os dois formatos durante a transição, então não há janela de indisponibilidade. Quando nenhum registro `enc:v1:` restar, remova o `LEGACY_MASTER_SECRET` de `utils/crypto.ts`.

---

## 4. Consultas de verificação

Rode no SQL Editor depois de aplicar tudo.

```sql
-- 1. A escalada de privilégio está fechada?
--    Esperado: authenticated NÃO deve aparecer com UPDATE na tabela.
SELECT grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema='public' AND table_name='profiles' AND privilege_type='UPDATE';

-- 2. Alguma policy perigosa sobreviveu?
--    Esperado: zero linhas.
SELECT schemaname, tablename, policyname, roles, qual
FROM pg_policies
WHERE policyname IN ('laudos_storage_owner_only','logos_select_public','coupons_read_active')
   OR 'anon' = ANY(roles);

-- 3. Registros clínicos órfãos (o que faz a migração #2 abortar).
SELECT 'pacientes' t, count(*) FROM pacientes WHERE psicologo_id IS NULL
UNION ALL SELECT 'agendamentos', count(*) FROM agendamentos WHERE psicologo_id IS NULL
UNION ALL SELECT 'prontuarios',  count(*) FROM prontuarios  WHERE psicologo_id IS NULL
UNION ALL SELECT 'diario_bordo', count(*) FROM diario_bordo WHERE psicologo_id IS NULL
UNION ALL SELECT 'laudos',       count(*) FROM laudos       WHERE psicologo_id IS NULL
UNION ALL SELECT 'pagamentos',   count(*) FROM pagamentos   WHERE psicologo_id IS NULL;

-- 4. Quem é admin hoje?
SELECT p.id, u.email, p.is_admin, p.is_vip
FROM profiles p JOIN auth.users u ON u.id = p.id
WHERE p.is_admin = true OR p.is_vip = true;

-- 5. Contas sem perfil (efeito do A19 antes da correção).
SELECT count(*) FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id WHERE p.id IS NULL;
```

E o teste manual que vale por todos: **entre com uma conta comum e tente**
```js
await supabase.from('profiles').update({ is_admin: true }).eq('id', (await supabase.auth.getUser()).data.user.id)
```
no console do navegador. Tem que falhar. Se passar, a migração #1 não foi aplicada.

---

## 5. Dívidas declaradas

Nenhuma destas trava o funcionamento. Todas estão registradas para não virarem esquecimento.

| Dívida | Por que ficou | O que se perde |
|---|---|---|
| **Bucket `logos` ainda público** | Privatizar exige trocar 3 montagens de URL, incluindo o timbre impresso dos laudos. Um erro ali some com documento oficial do CFP em silêncio. A enumeração, que era o risco real, já foi fechada. | Quem souber o UUID do psicólogo e o nome do arquivo ainda busca aquele logo. É material de marca. |
| **CSP com `'unsafe-inline'`** | A hidratação do App Router injeta script inline. Remover exige CSP por nonce no middleware, que muda o caminho de renderização de toda requisição. | A CSP bloqueia script externo, clickjacking e sequestro de formulário, mas **não** XSS inline. Não a apresente como proteção contra XSS. |
| **Lint não-bloqueante no CI** | 115 erros pré-existentes (87 `no-explicit-any`, 74 `no-unused-vars`). | Regressão de estilo passa. Zerar o backlog e trocar para bloqueante. |
| **Criação de tabelas ainda depende dos scripts legados** | Consolidar exige levantar o estado real de produção primeiro. | Recriar o banco do zero ainda é trabalhoso. |
| **Enumeração de e-mail pelo Supabase** | A mensagem da nossa rota foi generalizada, mas o `signUp` direto do cliente ([login/page.tsx:299](../../app/login/page.tsx:299)) recebe o erro do próprio Supabase. Mudar nossa mensagem não fecha o oráculo — ele é da plataforma. | Ainda dá para descobrir se um e-mail tem conta. Fechar de verdade exige mover o cadastro todo para rota de servidor. |
| **Sem trilha de auditoria** | Trabalho próprio, não cabia nestas ondas. | Continua impossível responder "isto foi explorado?" com dado. Ver seção 6. |
| **`Dockerfile` e imagem solta na raiz** | `Dockerfile` ainda é de Hugging Face (porta 7860) e há um `.jpeg` de WhatsApp versionado. Não removi por não saber se você ainda usa. | Ruído. |

---

## 6. A pergunta que continua sem resposta

**Quantas contas se cadastraram desde 19/08, e é possível provar — com log, não com convicção — que nenhuma delas rodou `update profiles set is_admin = true` na própria linha?**

Não há trilha de auditoria, então o repositório não responde. A consulta 4 da seção anterior mostra quem é admin **hoje**; ela não mostra quem já foi. Se aparecer algum `is_admin` ou `is_vip` que você não concedeu, isso deixa de ser risco e passa a ser incidente com dado sensível de saúde de pacientes de terceiros — com dever de apuração pela LGPD (art. 48).

Rode a consulta 4 **antes** de aplicar a migração #1. Depois dela, a resposta fica mais difícil de obter.

---

## 7. O que não foi tocado

Usabilidade, UX, layout, textos, preço e funcionalidades — fora de escopo por decisão sua.

Uma mudança de segurança tem efeito visível e precisa ser comunicada: **o link do calendário muda**. O `.ics` também deixa de trazer o nome completo e as observações; passa a trazer "Maria S. (Online)" e a modalidade. Era exatamente o dado que vazava.

E permanece pendente de decisão sua o **PIN do Diário (A16)**: hoje ele é trava de tela, não cofre. Transformá-lo em controle real muda o fluxo que o psicólogo já conhece, então não mexi.
