# Auditoria Antagônica — PsiSetting

**Modo:** Auditoria Holística
**Data:** 2026-09-17
**Artefato analisado:** repositório completo no commit `918199b` (main), 130 commits, 11 scripts SQL, 20 rotas de API, ~22 componentes cliente.
**Escopo:** segurança e privacidade (CFP/LGPD). Usabilidade e UX **fora de escopo** por decisão do responsável — já testadas e aprovadas.
**Confiança no diagnóstico:** **Alta** para código e arquitetura (li o código). **Média** para o estado real do banco de produção — as migrações são manuais e não versionadas, então o que está aplicado hoje no Supabase não é auditável a partir do repositório. Ver Anexo.

---

## TL;DR antagônico

- **Qualquer psicólogo cadastrado vira administrador com um único UPDATE na própria linha.** A política de RLS de `profiles` isola a linha, mas `is_admin` mora dentro dessa linha. Quem se promove alcança as rotas admin, que usam `service_role` e ignoram RLS por definição — ou seja, a base clínica inteira, mais o botão de excluir os dados de qualquer psicólogo. Isso não é teoria: o cadastro é aberto e leva 30 segundos.
- **A criptografia clínica não protege contra esse cenário.** A chave-mestra é uma constante no código, servida no bundle do navegador. Quem chega ao banco chega ao texto claro. As duas camadas de defesa caem com o mesmo golpe.
- **O Next.js 16.2.12 tem RCE não autenticado, e o `next.config.ts` habilita exatamente o vetor (AVIF).** É a correção mais barata do relatório: um upgrade.
- **O feed de calendário publica prontuário.** A URL é pública por design, mas a `DESCRIPTION` do evento leva nome completo do paciente e as observações clínicas em texto claro — e existe um token fixo commitado no repositório.
- **A causa-raiz é uma só, e é honesta:** o SPEC original (`5e0d192`, 30/07) especifica *"uso individual (1 profissional)... Não é um sistema multiusuário/multi-clínica"*, em Space privado. Em quatro semanas virou SaaS público com pagamento e painel admin. O modelo de segurança continuou o do app monousuário. Nenhum destes achados é descuido de programação; todos são a mesma dívida de fronteira de confiança.

**Recomendação de bloqueio:** não conectar este código à Vercel com dados reais antes de A01, A02, A03 e A07 estarem fechados.

---

## Diagnóstico em camadas

### Camada 1 — Código-fonte

O código é consistente e legível, e há sinais claros de cuidado: o Storage é exemplar, nenhum segredo foi commitado, nenhum `dangerouslySetInnerHTML` recebe dado de usuário, nenhum log despeja dado clínico, e o isolamento por `auth.uid()` nas rotas de usuário é uniforme. Os defeitos não estão na escrita — estão em três hábitos: **degradar em silêncio** (cifragem que grava texto claro no catch, webhook que cai para a chave anon, update de cupom que afeta zero linhas sem ninguém notar), **confiar no cliente** (preço do pagamento, `payment_id` sem dono, PIN verificado no navegador) e **ausência total de validação de entrada** (nenhum schema em 20 rotas).

Achados: A02, A05, A06, A07, A08, A09, A13, A16, A18, A21, A22, A25.

### Camada 2 — Arquitetura

Estilo: monólito Next.js App Router com banco como fonte única de verdade e **RLS como único mecanismo de autorização**. Atributo de qualidade dominante e bem servido: velocidade de entrega. Atributo ignorado: **defesa em profundidade**.

Duas decisões estruturais explicam quase tudo:

1. **RLS é a única camada.** Consultas como [session-monitor.tsx:38](../../app/components/session-monitor.tsx:38) nem filtram por `psicologo_id` — confiam inteiramente na política. Isso é legítimo e até elegante, mas significa que *qualquer* falha de RLS é total, sem rede de proteção. A criptografia poderia ser essa rede; não é, porque a chave é pública (A07).
2. **`service_role` virou caminho comum.** Oito rotas usam o cliente administrativo, que **ignora RLS por definição**. Toda a segurança auditada nas políticas simplesmente não se aplica nesses caminhos — o que transfere o peso inteiro para o gate de `requireAdmin()`, que por sua vez lê uma coluna que o usuário pode escrever (A01). O círculo se fecha no lugar errado.

A superfície de privilégio ficou dentro do objeto que o próprio usuário edita. Esse é o erro arquitetural central, e ele tem nome: violação do princípio de que **dados de autorização não podem coabitar com dados de perfil sob a mesma política de escrita**.

Achados: A01, A03, A04, A07, A10, A14, A15, A20, A23.

### Camada 3 — Processos de engenharia

É a camada mais frágil, e é a que produziu as outras duas.

- **Testabilidade: zero.** Não há runner, não há `npm test`, não há `.github/`. Os seis `scripts/test-*.ts` são scripts avulsos com `assert` caseiro, rodados à mão. Um deles, `test-multi-tenant-security.ts`, testa exatamente o isolamento que está quebrado — e, como não roda em pipeline, nunca reprovou nada.
- **Migrações sem ordem nem versão.** Onze `.sql` colados à mão no SQL Editor. Não existe "o estado do banco"; existe o estado que resultou da ordem em que alguém os executou. Pior: **reexecutar o arquivo chamado "AUDITORIA E BLINDAGEM MESTRE" reintroduz o furo mais grave do Storage** (A04). O script que você rodaria ao suspeitar de um incidente é o que reabre a porta.
- **O único gate de segurança que existia foi apagado.** O SPEC original tinha "Checklist de segurança (revisar antes de publicar)" com 8 itens — incluindo *"RLS ativo e testado em todas as tabelas (tentar acessar dado de outro usuário deve falhar)"*. Removida no commit `964b6c7` (18/08), justamente na véspera da explosão de funcionalidades. Os itens dessa checklist descrevem com precisão os furos que apareceram depois.
- **Observabilidade: inexistente.** Nenhum log de auditoria, nenhuma trilha de quem alterou `is_admin`, nenhum registro de evento de pagamento processado. Isso não é só um problema operacional: sem trilha, **é impossível afirmar que A01 não foi explorado** — e o art. 48 da LGPD fala em comunicar incidente, não em comunicar incidente detectado.

Achados: A12, A17, A19, A24, A25, A26, A27.

---

## Achados priorizados

| ID | Sev. | Camada | Achado | Evidência | Remediação |
|---|---|---|---|---|---|
| A01 | **Crítico** | Arquitetura | Escalada a admin: `profiles` é editável pelo dono e `is_admin`/`is_vip`/`email` moram na linha. Leva a service_role → base inteira e exclusão de dados de terceiros | [security-hardening.sql:73](../../scripts/security-hardening.sql:73) + [setup-admin-and-feedbacks-schema.sql:7](../../scripts/setup-admin-and-feedbacks-schema.sql:7) + [admin-auth.ts:49](../../utils/admin-auth.ts:49) + [users/action/route.ts:95](../../app/api/admin/users/action/route.ts:95) | Mover privilégio para tabela própria sem policy de escrita; `REVOKE UPDATE` nas colunas sensíveis; trigger que bloqueia mudança de `is_admin`/`email` |
| A02 | **Crítico** | Código | RCE não autenticado no Next.js 16.2.12 via Image Optimization, com AVIF habilitado no config | [next.config.ts:6](../../next.config.ts:6) + `package.json` `next@16.2.12` + GHSA-2xp9-vwfh-vxw4 | Upgrade para `next@16.3.5` |
| A03 | **Crítico** | Arquitetura | Feed iCal público entrega nome completo e observações clínicas descriptografadas; token fixo no repo; sem rate limit; usa service_role | [calendario/[token]/route.ts:182](../../app/calendario/[token]/route.ts:182) + [route.ts:31](../../app/calendario/[token]/route.ts:31) + [supabase-multiuser-migration.sql:19](../../scripts/supabase-multiuser-migration.sql:19) | Remover `Paciente:` e `Obs:` da DESCRIPTION; revogar o token fixo; rate limit; token com hash no banco |
| A04 | **Crítico** | Arquitetura | IDOR de laudos no Storage: policy exige apenas "estar logado"; `getLaudoSignedUrl` aceita caminho arbitrário | [full-system...sql:207](../../scripts/full-system-security-audit-and-hardening.sql:207) vs [fix-storage-security.sql:16](../../scripts/fix-storage-security.sql:16) + [storage.ts:46](../../utils/supabase/storage.ts:46) | Apagar a policy permissiva em definitivo; validar prefixo do caminho no código |
| A05 | **Crítico** | Código | Preço da assinatura vem do cliente: `transaction_amount` do body é usado como valor final | [process-payment/route.ts:33](../../app/api/subscription/process-payment/route.ts:33) e [:64](../../app/api/subscription/process-payment/route.ts:64) | Preço só do servidor; allowlist de campos do `formData` |
| A06 | **Crítico** | Código | `pix/check` ativa assinatura sem comparar `external_reference` com `user.id`, e sem idempotência (replay infinito) | [pix/check/route.ts:31](../../app/api/subscription/pix/check/route.ts:31) e [:42](../../app/api/subscription/pix/check/route.ts:42) | Exigir `payment.external_reference === user.id`; tabela de eventos processados |
| A07 | **Crítico** | Arquitetura | Chave-mestra de criptografia clínica é constante no código e vai para o bundle do navegador; `.env.local` não define a variável, logo o fallback fixo está ativo | [utils/crypto.ts:9](../../utils/crypto.ts:9) | Envelope: KEK no servidor, DEK por psicólogo, entregue por rota autenticada |
| A08 | Alto | Código | Webhook sem validação de assinatura; replay força `past_due` em terceiros; fallback silencioso para chave anon; `approved` não grava `current_period_end` | [webhooks/mercadopago/route.ts:6](../../app/api/webhooks/mercadopago/route.ts:6) e [:70](../../app/api/webhooks/mercadopago/route.ts:70) | Validar HMAC `x-signature`; falhar alto se faltar service_role; idempotência |
| A09 | Alto | Código | Cifragem falha em silêncio: o `catch` grava **texto claro** no banco e só loga no console. O `decrypt` trata "sem prefixo" como legado, então o dado nunca mais é distinguível | [utils/crypto.ts:100](../../utils/crypto.ts:100) e [:118](../../utils/crypto.ts:118) | Lançar erro e abortar a gravação; auditar registros sem prefixo `enc:v1:` |
| A10 | Alto | Arquitetura | `psicologo_id` NULLABLE com `DEFAULT auth.uid()` avaliado uma só vez no ALTER; sem backfill em `agendamentos`; ausente de um dos dois scripts | [security-hardening.sql:12](../../scripts/security-hardening.sql:12) + [full-system...sql:13](../../scripts/full-system-security-audit-and-hardening.sql:13) | `NOT NULL` + backfill verificado + consulta de órfãos |
| A11 | Alto | Arquitetura | Cupons: catálogo inteiro legível por qualquer autenticado; `max_uses` inaplicável (sem policy de UPDATE, update descartado em silêncio); resgate deletável pelo dono (`FOR ALL`) → reuso infinito | [full-system...sql:187](../../scripts/full-system-security-audit-and-hardening.sql:187) + [coupons/apply/route.ts:103](../../app/api/coupons/apply/route.ts:103) | Validar cupom só no servidor via service_role; restringir policy a SELECT+INSERT |
| A12 | Alto | Processo | Admin concedido por `email ILIKE '%vitor%'` — casa com `vitoria@`, `avitor@`; `%psicologa.com%` casa com qualquer e-mail contendo a string. Cadastro é aberto | [setup-admin-and-feedbacks-schema.sql:63](../../scripts/setup-admin-and-feedbacks-schema.sql:63) | Lista explícita de e-mails com `=`, nunca `ILIKE` com curinga |
| A13 | Alto | Código | Rate limit em memória (some no cold start, um por lambda) e aplicado em 2 de 20 rotas. Sem limite em `/calendario/[token]`, `pix/check`, webhook e `invites` | [utils/rate-limit.ts:11](../../utils/rate-limit.ts:11) | Armazenamento compartilhado; cobrir as rotas sensíveis |
| A14 | Alto | Arquitetura | Bucket `logos` público com policy `TO public` sem escopo de pasta — único ponto com leitura para `anon`; permite enumerar UUIDs de psicólogos | [supabase-multiuser-migration.sql:100](../../scripts/supabase-multiuser-migration.sql:100) | Bucket privado + URL assinada, como já é feito em `laudos` |
| A15 | Alto | Arquitetura | Sem `Content-Security-Policy` e sem `Strict-Transport-Security`, com chave de criptografia morando no navegador | [next.config.ts:10](../../next.config.ts:10) | Adicionar CSP e HSTS aos headers |
| A16 | Alto | Código | O "Cofre" do Diário é trava de UI: verificação no cliente, desbloqueio em `sessionStorage`, SHA-256 de 6 dígitos sem iteração (10⁶ testável offline) | [diario-bordo-view.tsx:75](../../app/components/diario-bordo-view.tsx:75) e [:84](../../app/components/diario-bordo-view.tsx:84) + [crypto.ts:162](../../utils/crypto.ts:162) | Ou vira controle real (derivar a chave do PIN no servidor), ou muda o nome e a promessa |
| A17 | Alto | Processo | Migrações não idempotentes e não ordenáveis: o "script mestre" desfaz a correção do Storage; aborta inteiro se rodado fora de ordem; 4 versões do trigger `handle_new_user`, 3 sem `search_path` fixado | [full-system...sql:207](../../scripts/full-system-security-audit-and-hardening.sql:207) + [fix-auth-trigger.sql:10](../../scripts/fix-auth-trigger.sql:10) | Migrar para `supabase/migrations/` numeradas e idempotentes |
| A18 | Alto | Código | Qualquer usuário emite convites ilimitados, sem cota, sem expiração; consumo é check-then-write sem transação | [invites/route.ts:35](../../app/api/invites/route.ts:35) + [register/route.ts:91](../../app/api/auth/register/route.ts:91) | Cota por conta, `expires_at`, consumo atômico |
| A19 | Médio | Processo | `EXCEPTION WHEN OTHERS` no trigger de criação de perfil: a conta nasce em `auth.users` sem linha em `profiles`, e nenhum erro sobe | [fix-auth-trigger.sql:40](../../scripts/fix-auth-trigger.sql:40) | Tratar só a exceção esperada; monitorar contas órfãs |
| A20 | Médio | Arquitetura | `grupo_membros` valida `psicologo_id` mas não valida que `paciente_id` pertence ao mesmo tenant; FK ignora RLS | [setup-grupos-schema.sql:86](../../scripts/setup-grupos-schema.sql:86) | `WITH CHECK` com subconsulta de posse do paciente |
| A21 | Médio | Código | Nenhuma validação de schema em 20 rotas; `link_url` de comunicado aceita `javascript:`; `Number("abc") ?? 7` produz `NaN` → `Invalid Date` | [admin/announcements/route.ts:38](../../app/api/admin/announcements/route.ts:38) + [users/action/route.ts:65](../../app/api/admin/users/action/route.ts:65) | `zod` nas bordas |
| A22 | Médio | Código | Enumeração de contas: mensagem distinta para e-mail já cadastrado | [register/route.ts:74](../../app/api/auth/register/route.ts:74) | Resposta genérica |
| A23 | Médio | Arquitetura | Modo somente-leitura da assinatura é só de interface; o RLS permite escrita na própria linha independentemente do status, e nenhuma rota valida | `utils/subscription-context.tsx` + ausência de checagem nas policies | Validar no servidor ou na policy |
| A24 | Médio | Processo | Sem testes automatizados, sem CI, sem hooks; a checklist de segurança do SPEC foi removida em `964b6c7` | ausência de `.github/`, de `npm test` | Restaurar a checklist como gate; pipeline mínimo |
| A25 | Médio | Processo | 5 vulnerabilidades em dependências (1 crítica, 4 altas): `next`, `postcss`, `sharp`, `js-yaml`, `nanoid` | `npm audit` | `npm audit fix` + upgrade do Next |
| A26 | Baixo | Processo | Políticas duplicadas por divergência de nome (`diario_*` vs `diario_bordo_*`): 8 policies onde deveriam existir 4. O padrão "dropa antes de criar" não funciona entre os dois scripts | [security-hardening.sql:138](../../scripts/security-hardening.sql:138) vs [full-system...sql:120](../../scripts/full-system-security-audit-and-hardening.sql:120) | Consolidar nomes na migração única |
| A27 | Baixo | Processo | Higiene: `Dockerfile` ainda é de Hugging Face (porta 7860), README boilerplate, pacote `sistema-hellen`, imagem de WhatsApp e `vercel_out.html` versionados, SPEC aponta repositório inexistente | raiz do repositório | Limpeza |

**Calibração:** 27 achados, 7 críticos (26%). Os sete críticos foram verificados individualmente no código, não inferidos.

---

## O que já está bem feito

Não mexa nisto achando que está quebrado:

1. **Storage de laudos no código** — bucket privado, caminho `{user_id}/{paciente_id}/`, URL assinada de 10 minutos, nenhum `getPublicUrl`. É o padrão que o resto do sistema deveria seguir.
2. **Núcleo clínico no banco** — `pacientes`, `agendamentos`, `prontuarios`, `diario_bordo`, `laudos`, `pagamentos` têm RLS ativa e as quatro operações cobertas com `psicologo_id = auth.uid()` em `USING` **e** `WITH CHECK`. É o pedaço mais bem feito do projeto.
3. **`setup-grupos-schema.sql`** — o melhor script do conjunto: `NOT NULL` no `psicologo_id`, políticas completas, nomes consistentes.
4. **Todas as rotas admin chamam `requireAdmin()` antes de qualquer operação** — o gate existe e está em todos os handlers. O problema é o dado que ele consulta, não a ausência do gate.
5. **`service_role` nunca entra em código de cliente**, e `utils/supabase/admin.ts` falha alto se a chave faltar.
6. **Nenhum segredo foi commitado** em 130 commits. `.env.local` fora do versionamento desde sempre.
7. **Tokens de calendário gerados hoje são fortes** (192 bits via `gen_random_bytes`, ou UUIDv4 na regeneração). O problema é só o token legado fixo.
8. **Timeout de inatividade de 30 minutos** implementado pensando em CFP/LGPD.
9. **Índices em `psicologo_id`** nas seis tabelas clínicas — predicado de RLS sem índice vira varredura sequencial sob carga. Alguém pensou nisso.

---

## Plano de Ação Híbrido

### Correções imediatas

Ordem de execução pensada para que cada passo não dependa do seguinte.

1. **Fechar a escalada de privilégio (A01, A12)** — `REVOKE UPDATE` nas colunas de privilégio, trigger que rejeita alteração de `is_admin`/`email`/`is_vip` pelo próprio usuário, e gate de admin lendo fonte que o usuário não escreve. Trocar o `ILIKE` por igualdade. **Pronto quando:** um usuário comum receber erro ao tentar `update profiles set is_admin=true`, com teste automatizado provando. Esforço: M.
2. **Upgrade do Next.js (A02, A25)** — `next@16.3.5` + `npm audit fix`. **Pronto quando:** `npm audit` sem crítico e build passando. Esforço: S.
3. **Estancar o feed de calendário (A03)** — tirar nome completo e observações da `DESCRIPTION`, revogar o token fixo, aplicar rate limit. **Pronto quando:** o `.ics` não contiver nenhum dado clínico além de horário, modalidade e nome abreviado. Esforço: S.
4. **Fechar o Storage (A04)** — apagar em definitivo a policy permissiva e validar o prefixo do caminho no código. **Pronto quando:** tentativa de assinar URL de pasta alheia falhar. Esforço: S.
5. **Corrigir a cadeia de pagamento (A05, A06, A08, A11)** — preço só do servidor, `external_reference` conferido, idempotência, HMAC do webhook, cupom validado por service_role. **Pronto quando:** teste provar que pagamento de R$ 0,01 e replay de `payment_id` alheio são rejeitados. Esforço: M.
6. **Refazer o modelo de chaves (A07, A09)** — envelope com KEK no servidor e DEK por psicólogo, entregue por rota autenticada; cifragem que falha alto em vez de gravar texto claro. Acompanha migração de re-cifragem com backup e ensaio. **Esta é a única correção com risco de perda de dados** — exige janela, backup e confirmação explícita. Esforço: L.
7. **CSP e HSTS (A15)** e **rate limit compartilhado (A13)**. Esforço: S + M.

### Recomendações estratégicas

- **Migrações versionadas** — mover os 11 scripts para `supabase/migrations/` numeradas e idempotentes, com uma migração de consolidação que descreva o estado desejado e seja segura para reexecutar. **Disparador:** antes da próxima alteração de schema. **Sucesso:** `supabase db reset` reconstrói o banco do zero de forma idêntica. **Trade-off:** exige um levantamento do estado atual de produção, que hoje ninguém sabe qual é.
- **Trilha de auditoria** — tabela append-only registrando mudanças de privilégio, eventos de pagamento e acessos ao feed de calendário. **Disparador:** junto com A01. **Sucesso:** conseguir responder "isto foi explorado?" com dado, não com opinião. **Trade-off:** custo de escrita e uma tabela a gerir.
- **Pipeline mínimo de segurança** — CI com `npm audit`, `tsc --noEmit`, lint e o `test-multi-tenant-security.ts` promovido a teste de verdade, rodando contra um projeto Supabase de teste. **Sucesso:** um PR que reabra qualquer furo deste relatório fica vermelho. **Trade-off:** manter um ambiente de teste.
- **Restaurar a checklist de segurança do SPEC** como gate de release, com os itens novos que esta auditoria produziu. Custo quase zero e foi o controle que existia e se perdeu.
- **Decidir a promessa de criptografia** — hoje a landing fala em *"chave derivada por profissional"*, o que é literalmente verdade e materialmente enganoso. Depois de A07, a frase passa a ser defensável. Antes disso, é exposição sob o CDC e sob a LGPD. **Trade-off:** ou o texto muda, ou a arquitetura muda; manter os dois como estão é a única opção insustentável.

---

## A Pergunta Que Você Não Quer Responder

**Quantas contas se cadastraram desde 19/08, e você consegue provar — com log, não com convicção — que nenhuma delas rodou `update profiles set is_admin = true` na própria linha?**

Se a resposta for "não consigo provar", então pelo art. 48 da LGPD isto não é um risco a mitigar: é um possível incidente a investigar, com dados sensíveis de saúde de pacientes de terceiros. E a investigação tem que acontecer antes da correção, porque a correção apaga o rastro.

---

## Anexo — Hipóteses ainda não validadas

- **O estado real do banco de produção.** Auditei os scripts, não o Supabase. Como a ordem de execução determina o resultado (A17), preciso de: lista de políticas ativas (`pg_policies`), se o bucket `logos` está público, e se `laudos_storage_owner_only` existe hoje. Uma consulta resolve.
- **A variável de criptografia na Vercel.** No `.env.local` desta máquina ela não existe, logo o fallback fixo está ativo aqui. Se em produção ela estiver definida como `NEXT_PUBLIC_*`, o segredo continua no bundle — muda o valor, não a natureza do problema. Se estiver definida **sem** o prefixo, a cifragem no navegador estaria usando um segredo diferente do servidor e os dados já estariam ilegíveis, o que não parece ser o caso.
- **Se o token de calendário fixo ainda está em uso.** Depende de alguém ter regenerado desde então.
- **Volume de dados reais.** Confirmado que existem pacientes reais, mas não sei o volume — o que muda a estratégia de migração de re-cifragem, não a decisão de fazê-la.
- **Exploração prévia.** Sem trilha de auditoria, é indeterminável pelo repositório. É a pergunta da seção anterior.
