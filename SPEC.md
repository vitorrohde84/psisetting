# SPEC — PsiSetting (Gestão Clínica para Psicólogos)

> **PsiSetting** — O setting terapêutico estruturado, ético e seguro no ambiente digital.
> Este arquivo é a especificação e contexto permanente do projeto na raiz do repositório.
> Sempre que uma decisão de arquitetura, design ou regras de negócio for alterada, atualize este arquivo.

---

## 1. Identidade e Propósito do Produto

* **Nome Oficial:** **PsiSetting**
* **Origem do Nome:** Fusão de **Psi** (referência direta à Psicologia / $\Psi$) com **Setting** (o conceito clínico fundamental do *setting terapêutico* — o espaço seguro, estruturado, ético e confidencial onde a psicoterapia acontece).
* **Definição:** SaaS / Web App de gestão clínica exclusivo para psicólogos clínicos autônomos, psicoterapeutas e pequenas clínicas de saúde mental.
* **Proposta de Valor:** Centralizar, organizar e conferir segurança ética a toda a rotina da prática clínica (prontuários sigilosos, laudos oficiais CFP 06/2019, agenda sincronizada e finanças) para atendimentos presenciais e online.
* **Conformidade & Ética:** Desenvolvido e validado em colaboração com psicóloga clínica. Alinhado às normas do **Conselho Federal de Psicologia (CFP)** (Resoluções CFP nº 001/2009, 004/2020, 006/2019) e à **LGPD** (Lei 13.709/2018).

---

## 2. Módulos Essenciais do Sistema

1. **Prontuário Eletrônico & Evoluções:**
   * Registro confidencial e cronológico por sessão.
   * **Modo Privacidade:** Botão de ativação rápida na barra superior e atalhos para ocultação visual instantânea de nomes, diagnósticos e valores em tela (ideal para atendimentos online, presenciais ou locais com circulação).
   * Criptografia AES-256 GCM na camada de aplicação, com **chave própria por psicólogo** (modelo de envelope). Ver a seção 5 para o que isso protege e o que não protege — a declaração honesta do par (adversário, propriedade) faz parte da especificação.

2. **Emissão de Laudos & Documentos (Resolução CFP nº 06/2019):**
   * Modelos oficiais padronizados com preenchimento automático inteligente de dados do paciente e psicólogo:
     - *Declaração de Comparecimento*
     - *Declaração de Acompanhamento Psicológico Ativo*
     - *Atestado Psicológico*
     - *Relatório Psicológico*
     - *Laudo Psicológico (Avaliação Psicológica / Pericial)*
   * Geração e impressão A4 em folha timbrada clássica, sem quebra de páginas, com controle de cabeçalho, logo personalizado, título profissional, cidade/data e assinatura com CRP.
   * **Nenhum documento usa dados de outra pessoa como padrão.** Nome (ou nome completo), CRP e cidade são obrigatórios para emitir: sem eles a impressão é barrada com o aviso "Preencher agora" (`utils/dados-profissionais.ts`). Telefone e endereço são opcionais e somem do rodapé quando vazios.
   * Ao salvar um documento redigido, o psicólogo confirma o **Termo de Responsabilidade na Emissão de Documentos**: os modelos são ferramenta de apoio, e o conteúdo é de responsabilidade de quem emite.

3. **Agenda Clínica & Sincronização:**
   * Controle completo de sessões online e presenciais (horários, recorrência, duração e status).
   * **Feed iCal/Webcal individual:** Sincronização em tempo real com **Apple Calendar (iPhone/Mac)** e **Google Agenda (Android/Web)** com privacidade avançada (título compacto no formato *Primeiro Nome + Iniciais*, ex: `Antoniela A. R. (Presencial)`).
   * **Supervisões:** aba própria na Agenda, com papel ("Eu supervisiono" / "Sou supervisionado(a)"), colega (nome e WhatsApp, sem acesso ao sistema), valor e "pago" dentro da própria aba (não entra no Financeiro). Aparecem também no calendário principal e no feed, só como "Supervisão (Online/Presencial)".

4. **Gestão de Pacientes:**
   * Fichas cadastrais completas, CPF formatado, contatos de emergência e histórico clínico com isolamento total por profissional.

5. **Controle Financeiro:**
   * Acompanhamento de honorários, sessões avulsas, pacotes mensais, status de pagamento e relatórios de faturamento.

6. **Diário de Bordo / Insights Clínicos:**
   * Bloco seguro e de alta confidencialidade para anotações reflexivas e hipóteses de trabalho do psicólogo entre sessões. **Não é parte do prontuário** do paciente — a diferença é explicada dentro do sistema (`app/components/explicacao-registro.tsx`).
   * **Comentários de supervisão** em cada anotação, escritos pelo próprio psicólogo depois da supervisão, cifrados como a anotação.

7. **Assinatura, pagamento e cupons:**
   * **Acesso decidido pelas datas** (`utils/acesso-assinatura.ts`): VIP ou admin, período pago no futuro, ou teste no futuro. Fora disso, Modo Somente Leitura. O `subscription_status` gravado é só informação.
   * Pagamento avulso por PIX ou cartão: cada pagamento aprovado soma 30 dias a partir do maior entre agora, fim do período pago e fim do teste. Não há débito automático. Aviso 5 dias antes de vencer.
   * Preço calculado **só no servidor** (`utils/preco-assinatura.ts`), o mesmo para a tela e para a cobrança; a tela envia o valor que mostrou e o servidor recusa (409) se diferir.
   * **Cupom de desconto** (% ou R$) com duração: N mensalidades ou para sempre. Os meses contam mensalidades pagas com desconto. O resgate guarda a **foto** das condições: pausar, vencer ou editar o cupom não muda nada para quem já usa. Descontos não se somam (vale o menor preço). O admin pode encerrar o desconto de alguém.
   * O direito ao desconto é conferido de novo na **aprovação**, numa transação só (`processar_pagamento_aprovado`). Se o desconto já não cabe, os dias saem proporcionais ao valor pago, pelo preço cheio.
   * Estorno ou chargeback devolve os dias daquele pagamento; a mensalidade de cupom não volta.
   * Pagamento aprovado que não virou dias (webhook perdido, cartão em análise, PIX pago com o modal fechado) é recuperado pela **reconciliação** com o Mercado Pago quando a conta está vencida.

---

## 3. Diretrizes de UI/UX & Design System

* **Tom da Interface:** Acolhedor, elegante, minimalista, seguro e sereno. Afastamento intencional de dashboards corporativos frios ou interfaces genéricas e estridentes.
* **Paleta de Cores (Tons Terrosos e Terapêuticos):**
  ```css
  --color-background: #FAF7F2;   /* Linho / off-white suave, acolhedor */
  --color-surface: #FFFFFF;      /* Branco puro para cartões e áreas de foco */
  --color-primary: #5C6B50;      /* Verde oliva elegante / tom de acolhimento */
  --color-primary-dark: #46533D;
  --color-secondary: #C47B62;    /* Terracota suave / tom terroso complementar */
  --color-text: #2D2A26;         /* Preto quente/mineral, suave para leitura */
  --color-text-muted: #736C65;   /* Texto secundário */
  --color-border: #E8E2D8;       /* Bordas orgânicas e discretas */
  ```
* **Tipografia:**
  - *Títulos e Cabeçalhos de Documentos:* Serifada sofisticada e editorial (`Lora` / `Playfair Display`).
  - *Interface e Dados:* Sans-serif legível e moderna (`Inter`).
* **Assets & Logo:**
  - Estrutura semântica flexível para receber o logotipo oficial do **PsiSetting** em todos os pontos de contato (Navbar, Sidebar, Login, Favicon e Cabeçalhos de Impressão).

---

## 4. Arquitetura Técnica & Segurança

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 16 (App Router + Turbopack), React 19, TypeScript |
| Estilização | Tailwind CSS, Lucide Icons |
| Criptografia | AES-GCM 256 bits isomórfico (WebCrypto no cliente e no Node). Envelope: KEK no servidor (`CLINICAL_KEK`) cifra uma DEK aleatória por psicólogo, guardada em `user_encryption_keys` |
| Backend & DB | Supabase PostgreSQL com Row Level Security (RLS) estrito em todas as tabelas |
| Autenticação | Supabase Auth (Email/Senha + Google OAuth), cadastro aberto com teste de 7 dias ou por convite |
| Storage | Supabase Storage: `laudos` privado com URL assinada; `logos` público para leitura direta, sem listagem |
| Calendário | Rota RFC 5545 iCalendar (`/calendario/[token]`) com fuso `America/Sao_Paulo` |
| Migrações | `supabase/migrations/`, numeradas e idempotentes. `scripts/sql-legado-nao-executar/` é histórico — **não rode nada de lá** |
| Hospedagem | Vercel (deploy contínuo via GitHub) |

---

## 5. Regras de Segurança e Privacidade (CFP & LGPD)

* Todos os dados clínicos (nomes, CPFs, relatos de prontuário, anotações de evolução e laudos) são criptografados na aplicação antes da gravação no banco de dados.
* Nenhuma `service_role key` é exposta no frontend. Nenhum segredo usa o prefixo `NEXT_PUBLIC_` — tudo com esse prefixo é embutido no JavaScript servido ao navegador.
* Acesso estritamente restrito: cada psicólogo acessa unicamente os seus registros (`psicologo_id = auth.uid()`), com RLS cobrindo as quatro operações em `USING` **e** `WITH CHECK`.
* Colunas de privilégio (`is_admin`, `is_vip`, `subscription_status`, `email`, `calendar_token`) **não são graváveis pelo próprio usuário**: há `REVOKE` de coluna e trigger de guarda. Autorização nunca depende de dado que o usuário edita.
* Feeds de calendário externos nunca expõem dados sensíveis (apenas horário, modalidade e primeiro nome com iniciais). Nome completo e anotações clínicas **não entram** no `.ics`. Supervisões entram só como "Supervisão (modalidade)", sem o nome do colega.
* Criar pagamento no Mercado Pago é sempre por `criarPagamento` (`utils/mercadopago.ts`), com cliente novo por chamada: no SDK 3.4, as opções de uma chamada ficam gravadas na configuração compartilhada e a chave de idempotência vazaria para o pagamento seguinte.

### 5.1 O que a criptografia protege — e contra quem NÃO protege

Toda alegação de proteção criptográfica aqui vem com o par (adversário, propriedade). Afirmar "é criptografado" sem dizer contra quem é como não afirmar nada.

**Protege:**
* Vazamento do banco, backup roubado, falha de RLS, acesso ao painel do Supabase — o conteúdo é inútil sem a `CLINICAL_KEK`, que não está no banco.
* Um psicólogo tentando ler dado de outro — cada sessão só obtém a própria chave.

**Não protege:**
* **Servidor comprometido.** Quem executa código no servidor alcança a KEK e o banco. Não há proteção criptográfica contra isso neste modelo.
* **Não é ponta a ponta.** O servidor consegue decifrar quando precisa (feed iCal). Foi decisão consciente: E2E real quebraria o calendário e faria de "esqueci a senha" uma perda definitiva do prontuário.
* **O PIN do Diário de Bordo não é um cofre.** É trava de tela contra quem passa pela sala: a verificação acontece no navegador e são 10⁶ combinações. Não o descreva como controle de segurança.

Qualquer texto de marketing sobre segurança precisa caber nesta seção. Se não couber, o texto está errado — ou a arquitetura mudou e esta seção está desatualizada.

---

## 6. Checklist de segurança (revisar antes de publicar)

> Esta checklist existia no SPEC original, foi removida no commit `964b6c7` (18/08) e voltou com os itens que a auditoria de 17/09 acrescentou. Ela é barata e foi o único gate de segurança que o projeto já teve.

- [ ] Nenhuma `service_role key` no código do frontend
- [ ] Nenhuma variável `NEXT_PUBLIC_` contendo segredo, chave ou token
- [ ] Todas as rotas exigem sessão autenticada, exceto landing, login, webhook e feed de calendário
- [ ] RLS ativo e testado em todas as tabelas (tentar acessar dado de outro usuário deve falhar)
- [ ] Nenhuma policy concede a `anon`/`public`, nem usa `USING (true)`
- [ ] Colunas de privilégio não graváveis pelo usuário (tente `update profiles set is_admin=true` numa conta comum: deve falhar)
- [ ] Bucket de laudos privado, URLs assinadas com expiração, caminho validado por `user.id`
- [ ] Feed `.ics` sem nome completo e sem anotação clínica
- [ ] Preço e concessão de assinatura decididos **apenas** no servidor
- [ ] Webhook de pagamento com validação de assinatura e idempotência
- [ ] `npm audit` sem vulnerabilidade alta ou crítica
- [ ] Nenhum `.sql` solto em `scripts/` (migrações vivem em `supabase/migrations/`)
- [ ] Sessão expira após inatividade e logout limpa a chave da memória
