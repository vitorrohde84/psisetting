# SPEC — Sistema de Gestão para Consultório de Psicologia

> Este arquivo deve ficar na raiz do repositório. É o contexto permanente do projeto —
> leia-o antes de executar qualquer prompt novo. Sempre que uma decisão mudar, atualize
> este arquivo antes de continuar, para o histórico de prompts não ficar desalinhado
> com o código.

---

## 1. Visão geral

Sistema web privado de gestão de consultório para psicólogos clínicos,
com suporte a múltiplos profissionais (multi-user). Cada psicólogo tem
sua própria conta com dados completamente isolados via RLS (Row Level Security).
Protegido por login com cadastro por convite, hospedado como Space privado no
Hugging Face, com dados em Supabase (Postgres + Auth + Storage).

**Modelo de acesso:** Cadastro por convite — somente psicólogos convidados por
usuários existentes podem criar conta.

**Funcionalidades por psicólogo:**
- Dados isolados (pacientes, agendamentos, prontuários, etc.)
- Logo personalizado do consultório
- Feed iCal individual (token por profissional)
- Geração de convites para novos profissionais

**Não-objetivos (não construir isso):**
- Não precisa de cadastro público de novos usuários (somente convite)
- Não precisa de app mobile nativo — é web responsivo
- Não integra diretamente (CalDAV) com o app Calendário da Apple — usa feed `.ics` assinado (ver seção 6)

---

## 2. Stack técnica

| Camada | Tecnologia |
|---|---|
| Frontend | [DEFINIR: React/Next.js ou Streamlit] |
| Autenticação | Supabase Auth (email + senha) |
| Banco de dados | Supabase Postgres, com Row Level Security (RLS) ativo em todas as tabelas |
| Armazenamento de arquivos | Supabase Storage, bucket **privado** |
| Hospedagem | Hugging Face Spaces (Space **privado**, não público) |
| Secrets | `SUPABASE_URL` e `SUPABASE_ANON_KEY` como Secrets do Space — nunca hardcoded no código |

**Regra crítica de segurança:** nunca usar a `service_role key` do Supabase no frontend.
Somente a `anon key`, protegida pelas policies de RLS.

---

## 3. Identidade visual

Referência: [www.psicologahellenlimberger.com.br](https://www.psicologahellenlimberger.com.br)
— tom psicanalítico, acolhedor, sóbrio. Nada de UI "corporativa fria" nem "gamificada
colorida". A estética deve transmitir calma, sigilo e cuidado.

> **Nota:** os tokens de cor abaixo são uma aproximação a partir do tom do site (não
> foi possível extrair o hex exato via fetch). Se a Hellen quiser fidelidade exata,
> enviar print do site para ajuste fino antes do Prompt 1.

### Paleta (proposta — ajustável)
```css
--color-background: #FAF7F2;   /* off-white quente, tipo papel */
--color-surface: #FFFFFF;
--color-primary: #A85C4A;      /* terracota suave */
--color-primary-dark: #8A4536;
--color-secondary: #6B7A5E;    /* verde-sálvia, tom terapêutico */
--color-text: #2E2A26;         /* quase-preto quente, não #000 puro */
--color-text-muted: #6E655C;
--color-border: #E5DED4;
--color-danger: #B3483F;       /* usar só em ações destrutivas, ex: excluir paciente */
--color-success: #6B8A5E;
```

### Tipografia
- Títulos: serifada elegante (ex: "Playfair Display", "Lora" ou similar — evitar fontes serifadas "clássicas demais" tipo Times)
- Corpo de texto: sans-serif limpa (ex: "Inter", "Work Sans")
- Evitar ícones/emojis exagerados na interface — o tom é sóbrio, não lúdico

### Princípios de UI
- Espaçamento generoso, sem sensação de "dashboard SaaS lotado"
- Sem gráficos coloridos chamativos — se houver dashboard, usar a paleta acima em tons neutros
- Microcopy em português, tom respeitoso e direto (ex: "Tem certeza que deseja excluir este prontuário?" em vez de "Confirmar exclusão?")

---

## 4. Schema do banco (já criado no Supabase — não recriar, só referenciar)

Tabelas existentes: `profiles`, `pacientes`, `agendamentos`, `prontuarios`,
`diario_bordo`, `laudos`, `pagamentos`, `notas_receita_saude`.

Todas com RLS ativo — regra geral: um registro só é visível se
`psicologo_id = auth.uid()` (diretamente ou via join com `pacientes`).

> Consulte o banco diretamente via Supabase MCP/CLI se precisar dos tipos de coluna
> exatos — não redefinir schema nos prompts do Antigravity, apenas consumir.

### Tabela com regra especial: `diario_bordo`
Contém a descrição detalhada do que aconteceu em cada sessão — é o dado mais sensível
do sistema. Regras de produto obrigatórias:
- Exige reconfirmação de senha ao abrir/editar, mesmo com sessão já autenticada
- Sem botão de exportar, copiar ou imprimir
- Aviso visual fixo: "Conteúdo confidencial — uso exclusivo do profissional"

---

## 5. Módulos do sistema (ordem de construção)

1. Autenticação (login, esqueci senha, expiração de sessão em 30min)
2. Pacientes (CRUD + busca)
3. Agenda (CRUD de agendamentos + calendário visual)
4. Exportação `.ics` para assinatura no iPhone (ver seção 6)
5. Prontuário (evolução clínica "oficial")
6. Diário de bordo (acesso restrito — ver regras na seção 4)
7. Laudos (editor + upload PDF + geração de PDF)
8. Pagamentos (status + dashboard simples de recebido/pendente)
9. Notas Receita Saúde (geração de recibo em PDF, numeração sequencial)
10. Revisão final de segurança (ver checklist seção 7)

Cada módulo = um prompt separado para o Antigravity. Não pedir dois módulos no
mesmo prompt — mais fácil de testar e revisar isoladamente.

---

## 6. Integração com iOS (Calendário)

Não existe integração de escrita direta no app Calendário da Apple sem CalDAV
completo ou app nativo assinado. A solução adotada é:

- Cada psicólogo possui um `calendar_token` único gerado automaticamente
  na criação da conta (armazenado em `profiles.calendar_token`)
- Gerar feed `.ics` (RFC 5545) dinâmico, filtrado por `psicologo_id`,
  servido a partir de: `/calendario/{calendar_token}`
- O psicólogo copia a URL do feed na página de Configurações e assina
  no iPhone: `Ajustes > Calendário > Contas > Adicionar Conta > Outra >
  Adicionar Calendário Assinado` — colar a URL no formato `webcal://...`
- O calendário do iPhone atualiza sozinho periodicamente (a Apple controla o
  intervalo, não é instantâneo — pode levar algumas horas para refletir mudanças)

---

## 7. Checklist de segurança (revisar antes de publicar)

- [ ] Nenhuma `service_role key` no código do frontend
- [ ] Todas as rotas exigem sessão autenticada, exceto `/login`
- [ ] RLS ativo e testado em todas as tabelas (tentar acessar dado de outro usuário deve falhar)
- [ ] Bucket do Supabase Storage é privado, URLs assinadas com expiração
- [ ] Space do Hugging Face configurado como privado
- [ ] Diário de bordo exige reconfirmação de senha
- [ ] Logout visível em todas as telas
- [ ] Sessão expira após inatividade

---

## 8. Log de decisões

Use esta seção para registrar decisões tomadas durante o desenvolvimento, para
prompts futuros não contradizerem decisões já tomadas.

- 2026-07-30 — Stack de frontend definida: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- 2026-08-05 — Sistema convertido para multi-user com cadastro por convite
- 2026-08-05 — Cada psicólogo tem calendar_token individual (em profiles)
- 2026-08-05 — Logo personalizado por psicólogo (bucket 'logos' no Storage)
- 2026-08-05 — Página de Configurações adicionada (/configuracoes)
- [DATA] — Space configurado como privado: sim/não
- [DATA] — Paleta de cores ajustada com base em print real do site: sim/não
