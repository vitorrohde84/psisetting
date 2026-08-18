# SPEC — PsiSetting (Gestão Clínica para Psicólogos)

> **PsiSetting** — O setting terapêutico estruturado, ético e seguro no ambiente digital.
> Este arquivo é a especificação e contexto permanente do projeto na raiz do repositório.
> Sempre que uma decisão de arquitetura, design ou regras de negócio for alterada, atualize este arquivo.

---

## 1. Identidade e Propósito do Produto

* **Nome Oficial:** **PsiSetting**
* **Origem do Nome:** Fusão de **Psi** (referência direta à Psicologia / $\Psi$) com **Setting** (o conceito clínico fundamental do *setting terapêutico* — o espaço seguro, estruturado, ético e confidencial onde a psicoterapia acontece).
* **Definição:** SaaS / Web App de gestão clínica exclusivo para psicólogos clínicos autônomos, psicoterapeutas e pequenas clínicas de saúde mental.
* **Proposta de Valor:** Eliminar o atrito burocrático e a sobrecarga mental do profissional (prontuários, laudos, finanças e agendamentos) para que o foco total permaneça na escuta clínica e no acolhimento do paciente.
* **Conformidade & Ética:** Alinhado às normas do **Conselho Federal de Psicologia (CFP)** (Resoluções CFP nº 001/2009, 004/2020, 006/2019) e à **LGPD** (Lei 13.709/2018).

---

## 2. Módulos Essenciais do Sistema

1. **Prontuário Eletrônico & Evoluções:**
   * Registro confidencial e cronológico por sessão.
   * **Modo Privacidade:** Botão de ativação rápida na barra superior e atalhos para ocultação visual instantânea de nomes, diagnósticos e valores em tela (ideal para consultórios ou locais públicos).
   * Criptografia ponta a ponta na camada de aplicação (AES-256 GCM).

2. **Emissão de Laudos & Documentos (Resolução CFP nº 06/2019):**
   * Modelos oficiais padronizados com preenchimento automático inteligente de dados do paciente e psicólogo:
     - *Declaração de Comparecimento*
     - *Declaração de Acompanhamento Psicológico Ativo*
     - *Atestado Psicológico*
     - *Relatório Psicológico*
     - *Laudo Psicológico (Avaliação Psicológica / Pericial)*
   * Geração e impressão A4 em folha timbrada clássica, sem quebra de páginas, com controle de cabeçalho, logo personalizado, título profissional, cidade/data e assinatura com CRP.

3. **Agenda Clínica & Sincronização:**
   * Controle completo de sessões online e presenciais (horários, recorrência, duração e status).
   * **Feed iCal/Webcal individual:** Sincronização em tempo real com **Apple Calendar (iPhone/Mac)** e **Google Agenda (Android/Web)** com privacidade avançada (título compacto no formato *Primeiro Nome + Iniciais*, ex: `Antoniela A. R. (Presencial)`).

4. **Gestão de Pacientes:**
   * Fichas cadastrais completas, CPF formatado, contatos de emergência e histórico clínico com isolamento total por profissional.

5. **Controle Financeiro:**
   * Acompanhamento de honorários, sessões avulsas, pacotes mensais, status de pagamento e relatórios de faturamento.

6. **Diário de Bordo / Insights Clínicos:**
   * Bloco seguro e de alta confidencialidade para anotações reflexivas e hipóteses de trabalho do psicólogo entre sessões.

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
| Criptografia | AES-GCM 256 bits isomórfico (WebCrypto API no cliente e Node.js) com chave derivada por usuário |
| Backend & DB | Supabase PostgreSQL com Row Level Security (RLS) estrito em todas as tabelas |
| Autenticação | Supabase Auth (Email/Senha + Google OAuth) com cadastro por convite e tokens individuais |
| Storage | Supabase Storage com buckets privados para laudos e logos |
| Calendário | Rota RFC 5545 iCalendar (`/calendario/[token]`) com fuso `America/Sao_Paulo` |
| Hospedagem | Vercel (Deploy contínuo via GitHub: `psihellenlimberger-lgtm/hellen-sistema`) |

---

## 5. Regras de Segurança e Privacidade (CFP & LGPD)

* Todos os dados clínicos (nomes, CPFs, relatos de prontuário, anotações de evolução e laudos) são criptografados na aplicação antes da gravação no banco de dados.
* Nenhuma `service_role key` é exposta no frontend.
* Acesso estritamente restrito: cada psicólogo acessa unicamente os seus registros (`psicologo_id = auth.uid()`).
* Feeds de calendário externos nunca expõem dados sensíveis (apenas horário, modalidade e primeiro nome com iniciais).
