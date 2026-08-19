"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { PsiSettingBrand } from "@/app/components/psi-setting-brand";
import { MercadoPagoBadge } from "@/app/components/mercadopago-badge";
import {
  FileText,
  FileCheck,
  Calendar,
  Users,
  DollarSign,
  BookOpen,
  Shield,
  Lock,
  Scale,
  Database,
  Timer,
  ChevronDown,
  ArrowRight,
  Menu,
  X,
  CheckCircle2,
  Sparkles,
  Eye,
  EyeOff,
  Check,
  FolderX,
  FileCheck2,
  LockKeyhole,
  HeartHandshake,
  Lightbulb,
  Workflow,
  AlertCircle,
} from "lucide-react";

/* ──────────────────────────── SCROLL ANIMATION HOOK ──────────────────────────── */

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, isVisible } = useScrollReveal();

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* ──────────────────────────── JSON-LD ──────────────────────────── */

const jsonLdOrganization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "PsiSetting",
  url: "https://psisetting.com.br",
  logo: "https://psisetting.com.br/og-image.png",
  description:
    "Seu setting clínico organizado, protegido e em um só lugar. Desenvolvido e validado em colaboração com psicóloga clínica atuante.",
};

const jsonLdSoftwareApp = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "PsiSetting",
  applicationCategory: "HealthApplication",
  operatingSystem: "Web",
  description:
    "Sistema de apoio e gestão para psicólogos clínicos com prontuários protegidos, 5 modelos conforme a Resolução CFP 06/2019, agenda, financeiro e diário de bordo.",
  offers: {
    "@type": "Offer",
    price: "29.90",
    priceCurrency: "BRL",
    priceValidUntil: "2027-12-31",
    availability: "https://schema.org/InStock",
  },
};

const jsonLdWebSite = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "PsiSetting",
  url: "https://psisetting.com.br",
  description:
    "Seu setting clínico organizado, protegido e em um só lugar. Prontuário protegido, gestão da clínica e documentos psicológicos.",
};

const faqItems = [
  {
    question: "Como o PsiSetting protege os dados clínicos dos pacientes?",
    answer:
      "A plataforma implementa camadas de proteção com criptografia AES-256 e chave derivada por profissional para o armazenamento de campos clínicos sensíveis, além de isolamento estrito de dados entre contas no banco de dados e tráfego HTTPS/TLS.",
  },
  {
    question: "Como funcionam os 5 modelos de documentos conforme a Resolução CFP nº 06/2019?",
    answer:
      "O sistema disponibiliza 5 referências estruturadas com base na Resolução CFP nº 06/2019 (Declaração de Comparecimento, Declaração de Acompanhamento, Atestado Psicológico, Relatório Psicológico e Laudo de Avaliação). Os modelos são ferramentas de apoio e devem ser revisados e adequados pelo profissional conforme o caso concreto.",
  },
  {
    question: "Como funciona o 'Modo Privacidade' durante os atendimentos?",
    answer:
      "Com apenas um clique no ícone de privacidade (ou tecla de atalho), o sistema aplica um desfoque instantâneo nos dados sensíveis na tela (nomes de pacientes, registros e valores). Você pode atender com seu computador aberto sem receio de expor anotações sigilosas.",
  },
  {
    question: "Como o Diário de Bordo apoia o processo de supervisão clínica?",
    answer:
      "O Diário de Bordo é um espaço confidencial exclusivo para o psicólogo registrar impressões contratransferenciais, dúvidas teóricas, hipóteses diagnósticas e pontos a serem levados para supervisão clínica, conectando a sessão à continuidade do tratamento.",
  },
  {
    question: "Como funciona a sincronização com a agenda do celular?",
    answer:
      "O PsiSetting gera um link de integração iCal (.ics) exclusivo para você. Basta adicioná-lo ao Google Agenda ou Apple Calendário (iPhone) para visualizar seus horários no celular com privacidade.",
  },
  {
    question: "Existe fidelidade ou contrato de permanência?",
    answer:
      "Nenhuma fidelidade. Você tem 7 dias de teste gratuitos para experimentar todas as funcionalidades. Após o período, a assinatura do Plano Único é de apenas R$ 29,90/mês e você pode cancelar a qualquer momento nas configurações da sua conta.",
  },
];

const jsonLdFAQ = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

/* ──────────────────────────── CFP 06/2019 MODELS DATA ──────────────────────────── */

const cfpModels = [
  {
    id: "atestado",
    name: "Atestado Psicológico",
    badge: "Art. 10 - Res. 06/2019",
    category: "Finalidade Específica",
    description: "Certifica estado psicológico para justificar faltas, licenças ou aptidões.",
    preview: {
      title: "ATESTADO PSICOLÓGICO",
      subtitle: "Estrutura conforme a Resolução CFP nº 06/2019",
      body: "Atesto, para os devidos fins a pedido do(a) interessado(a), que o(a) Paciente 1, sob meus cuidados profissionais em psicoterapia, encontra-se em acompanhamento clínico regular. Recomenda-se o afastamento de suas atividades por período de 05 (cinco) dias a contar desta data.",
      sections: ["Identificação Profissional & CRP", "Descrição Sintética do Estado", "Prazo ou Finalidade Recomendada", "Indicação de Guarda por 5 Anos"],
    },
  },
  {
    id: "relatorio",
    name: "Relatório Psicológico",
    badge: "Art. 11 - Res. 06/2019",
    category: "Comunicação Técnica",
    description: "Comunica histórico, procedimentos e encaminhamentos a outros profissionais.",
    preview: {
      title: "RELATÓRIO PSICOLÓGICO",
      subtitle: "Estrutura conforme a Resolução CFP nº 06/2019",
      body: "O presente relatório tem por objetivo prestar informações acerca do processo terapêutico desenvolvido com o(a) Paciente 1. Foram realizadas 16 sessões semanais com foco no acolhimento, escuta clínica e desenvolvimento de recursos para manejo das demandas apresentadas.",
      sections: ["1. Identificação do Solicitante e Paciente", "2. Descrição da Demanda Clínica", "3. Procedimentos & Técnicas Empregadas", "4. Análise e Encaminhamentos Finais"],
    },
  },
  {
    id: "declaracao-comp",
    name: "Declaração de Comparecimento",
    badge: "Art. 9º - Res. 06/2019",
    category: "Comprovação de Horário",
    description: "Comprova presença do paciente ou acompanhante na data e horário da sessão.",
    preview: {
      title: "DECLARAÇÃO DE COMPARECIMENTO",
      subtitle: "Estrutura conforme a Resolução CFP nº 06/2019",
      body: "Declaro, para os devidos fins de comprovação, que Paciente 1 compareceu ao atendimento psicológico no dia 18/08/2026, no horário das 14:00 às 15:00 horas, sob meus cuidados profissionais.",
      sections: ["Identificação do Paciente", "Data e Horário de Início e Término", "Identificação com Nome e CRP", "Local e Data de Emissão"],
    },
  },
  {
    id: "declaracao-acomp",
    name: "Declaração de Acompanhamento",
    badge: "Art. 9º - Res. 06/2019",
    category: "Processo em Andamento",
    description: "Atesta que o paciente está em processo psicoterápico ativo e continuado.",
    preview: {
      title: "DECLARAÇÃO DE ACOMPANHAMENTO",
      subtitle: "Estrutura conforme a Resolução CFP nº 06/2019",
      body: "Declaro que o(a) Paciente 1 realiza acompanhamento psicológico regular sob meus cuidados profissionais, com frequência de sessões semanais, desde fevereiro de 2026 até a presente data.",
      sections: ["Declaração de Vínculo Clínico", "Frequência dos Atendimentos", "Finalidade sem Quebra de Sigilo", "Assinatura do Profissional"],
    },
  },
  {
    id: "laudo",
    name: "Laudo Psicológico",
    badge: "Art. 13 - Res. 06/2019",
    category: "Avaliação Psicológica",
    description: "Resultado aprofundado de processo de avaliação ou perícia psicológica.",
    preview: {
      title: "LAUDO PSICOLÓGICO",
      subtitle: "Estrutura conforme a Resolução CFP nº 06/2019",
      body: "Trata-se de processo de avaliação psicológica estruturada conduzido em 6 encontros diagnósticos. Foram aplicadas entrevistas clínicas, instrumentos fundamentados tecnicamente e observação comportamental sistematizada.",
      sections: ["1. Identificação Completa", "2. Descrição Minuciosa da Demanda", "3. Procedimentos & Instrumentos Utilizados", "4. Análise Compreensiva & Conclusão"],
    },
  },
];

/* ──────────────────────────── 3 CENTRAL PILLARS DATA ──────────────────────────── */

const corePillars = [
  {
    id: "prontuario",
    icon: LockKeyhole,
    title: "1. Prontuário Protegido",
    subtitle: "Sigilo ético e confidencialidade",
    description:
      "Registro de evoluções clínicas por sessão com chave de criptografia individual e botão de Modo Privacidade para atendimentos seguros.",
    badge: "Sigilo & Ética",
    badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-200",
    iconColor: "text-emerald-700 bg-emerald-500/15",
    features: [
      "Evoluções clínicas confidenciais",
      "Modo Privacidade com 1 clique",
      "Criptografia AES-256 em repouso",
      "Guarda de registros em conformidade com o CFP",
    ],
  },
  {
    id: "gestao",
    icon: Calendar,
    title: "2. Gestão da Clínica",
    subtitle: "Agenda e finanças sem ruído",
    description:
      "Tudo o que sua rotina precisa para funcionar com tranquilidade: agenda sincronizada com seu celular e controle financeiro de sessões.",
    badge: "Organização",
    badgeColor: "bg-sky-100 text-sky-800 border-sky-200",
    iconColor: "text-sky-700 bg-sky-500/15",
    features: [
      "Agenda com sincronização iCal (iPhone e Google)",
      "Controle de sessões pagas e pendentes",
      "Emissão de recibos de atendimento",
      "Ficha cadastral humanizada de pacientes",
    ],
  },
  {
    id: "documentos",
    icon: FileCheck2,
    title: "3. Documentos Psicológicos",
    subtitle: "Conforme a Resolução CFP nº 06/2019",
    description:
      "5 modelos estruturados conforme a normativa do CFP para elaboração ágil de declarações, atestados, relatórios e laudos em PDF timbrado.",
    badge: "Resolução CFP 06/2019",
    badgeColor: "bg-amber-100 text-amber-900 border-amber-200",
    iconColor: "text-amber-700 bg-amber-500/15",
    features: [
      "5 modelos fundamentados na Res. CFP 06/2019",
      "Tópicos normativos pré-organizados",
      "Exportação em PDF A4 com timbre",
      "Ferramenta de apoio com revisão do profissional",
    ],
  },
];

/* ──────────────────────────── BEFORE VS AFTER DATA ──────────────────────────── */

const beforeItems = [
  { icon: "📄", text: "Arquivos e anotações espalhados em pastas e cadernos" },
  { icon: "📝", text: "Modelos em Word desformatados e retrabalho manual" },
  { icon: "📱", text: "Agenda pessoal misturada com a clínica no celular" },
  { icon: "💰", text: "Controle financeiro em planilhas soltas e recibos manuais" },
  { icon: "🔓", text: "Prontuário exposto sem proteção ao abrir a tela" },
];

const afterItems = [
  { text: "Prontuário protegido com criptografia e organização por paciente" },
  { text: "5 modelos de documentos conforme a Resolução CFP nº 06/2019" },
  { text: "Agenda sincronizada com seu celular (Apple e Google)" },
  { text: "Controle financeiro de sessões e emissão de recibos" },
  { text: "Modo Privacidade com 1 clique para atendimentos seguros" },
];

/* ──────────────────────────── COMPLIANCE POINTS ──────────────────────────── */

const compliancePoints = [
  {
    title: "Criptografia de Dados Clínicos",
    desc: "Camada de criptografia AES-256 e chave derivada por profissional para proteção de registros confidenciais.",
    icon: LockKeyhole,
    highlight: "Criptografia AES-256",
  },
  {
    title: "Resolução CFP nº 06/2019",
    desc: "Estruturas documentais normatizadas e organização para apoio à guarda documental de 5 anos.",
    icon: Scale,
    highlight: "Normativa CFP",
  },
  {
    title: "Privacidade e Proteção de Dados",
    desc: "Arquitetura multi-tenant com isolamento estrito de dados entre psicólogos no banco de dados.",
    icon: Shield,
    highlight: "Conformidade LGPD",
  },
  {
    title: "Timeout de Sessão por Inatividade",
    desc: "Bloqueio automático após 30 minutos de ausência para impedir acessos indevidos no consultório.",
    icon: Timer,
    highlight: "Segurança Ativa",
  },
];

/* ──────────────────────────── MAIN COMPONENT ──────────────────────────── */

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Interactive Privacy Simulator State
  const [isPrivacyActive, setIsPrivacyActive] = useState(false);

  // Interactive CFP Model Tab State
  const [activeCfpTab, setActiveCfpTab] = useState(cfpModels[0].id);

  // FAQ Accordion State
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const selectedCfpModel = cfpModels.find((m) => m.id === activeCfpTab) || cfpModels[0];

  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdOrganization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdSoftwareApp) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdWebSite) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFAQ) }}
      />

      {/* ───────── NAVBAR ───────── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-surface/90 backdrop-blur-xl shadow-xs border-b border-border/60"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/landing" className="shrink-0 flex items-center gap-2">
            <PsiSettingBrand size="md" />
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-6">
            <a
              href="#pilares"
              className="text-sm font-medium text-text-muted hover:text-primary transition-colors"
            >
              Os 3 Pilares
            </a>
            <a
              href="#supervisao"
              className="text-sm font-medium text-text-muted hover:text-primary transition-colors"
            >
              Diário & Supervisão
            </a>
            <a
              href="#modelos-cfp"
              className="text-sm font-medium text-text-muted hover:text-primary transition-colors"
            >
              Documentos CFP
            </a>
            <a
              href="#seguranca"
              className="text-sm font-medium text-text-muted hover:text-primary transition-colors"
            >
              Privacidade & Ética
            </a>
            <a
              href="#preco"
              className="text-sm font-medium text-text-muted hover:text-primary transition-colors"
            >
              Plano Único
            </a>
            <a
              href="#faq"
              className="text-sm font-medium text-text-muted hover:text-primary transition-colors"
            >
              FAQ
            </a>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark shadow-xs hover:shadow-md transition-all duration-200"
            >
              <span>Testar 7 Dias Grátis</span>
              <ArrowRight size={15} />
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-text-muted hover:text-text transition-colors"
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-surface border-t border-border/60 shadow-lg px-4 py-4 flex flex-col gap-2">
            <a
              href="#pilares"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm text-text hover:bg-background/80 rounded-lg py-2 px-3"
            >
              Os 3 Pilares Clínicos
            </a>
            <a
              href="#supervisao"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm text-text hover:bg-background/80 rounded-lg py-2 px-3"
            >
              Diário de Bordo & Supervisão
            </a>
            <a
              href="#modelos-cfp"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm text-text hover:bg-background/80 rounded-lg py-2 px-3"
            >
              Documentos CFP 06/2019
            </a>
            <a
              href="#seguranca"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm text-text hover:bg-background/80 rounded-lg py-2 px-3"
            >
              Privacidade & Ética
            </a>
            <a
              href="#preco"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm text-text hover:bg-background/80 rounded-lg py-2 px-3"
            >
              Plano Único
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm text-text hover:bg-background/80 rounded-lg py-2 px-3"
            >
              FAQ
            </a>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark mt-2"
            >
              Acessar Plataforma
            </Link>
          </div>
        )}
      </nav>

      {/* ───────── HERO SECTION (NOVO POSICIONAMENTO CLÍNICO) ───────── */}
      <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24 overflow-hidden">
        {/* Glows de fundo sutis */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-10 left-1/4 w-[550px] h-[550px] rounded-full bg-primary/10 blur-[100px]" />
          <div className="absolute top-32 right-10 w-[450px] h-[450px] rounded-full bg-secondary/15 blur-[90px]" />
          <div className="absolute bottom-10 left-10 w-[350px] h-[350px] rounded-full bg-emerald-500/10 blur-[80px]" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* LADO ESQUERDO: Headline & Proposta de Valor */}
            <div className="lg:col-span-6 space-y-6">
              <Reveal>
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold tracking-wide shadow-2xs">
                  <Sparkles size={14} className="text-secondary" />
                  <span>Desenvolvido e validado em colaboração com psicóloga clínica atuante</span>
                </div>
              </Reveal>

              <Reveal delay={80}>
                <h1 className="text-3xl sm:text-4xl lg:text-[2.85rem] font-serif font-bold text-text leading-[1.18] tracking-tight">
                  Seu <span className="text-primary font-serif italic">setting</span> clínico organizado, protegido e em um só lugar.
                </h1>
              </Reveal>

              <Reveal delay={160}>
                <p className="text-base sm:text-lg text-text-muted leading-relaxed max-w-xl">
                  Um sistema que entende como uma sessão de psicoterapia realmente acontece. Prontuários protegidos, gestão da clínica e documentos psicológicos estruturados conforme a Resolução CFP nº 06/2019.
                </p>
              </Reveal>

              {/* 3 Pilares em Pílulas */}
              <Reveal delay={220}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-surface border border-border/80 text-xs font-semibold text-text">
                    <div className="p-1 rounded-md bg-emerald-100 text-emerald-700">
                      <Lock size={13} strokeWidth={2.5} />
                    </div>
                    <span>Prontuário protegido</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-surface border border-border/80 text-xs font-semibold text-text">
                    <div className="p-1 rounded-md bg-sky-100 text-sky-700">
                      <Calendar size={13} strokeWidth={2.5} />
                    </div>
                    <span>Gestão da clínica</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-surface border border-border/80 text-xs font-semibold text-text">
                    <div className="p-1 rounded-md bg-amber-100 text-amber-800">
                      <FileCheck2 size={13} strokeWidth={2.5} />
                    </div>
                    <span>Documentos CFP</span>
                  </div>
                </div>
              </Reveal>

              {/* Botões CTA */}
              <Reveal delay={280}>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 pt-2">
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dark shadow-sm hover:shadow-md transition-all text-base group"
                  >
                    <span>Começar Gratuitamente</span>
                    <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                  <a
                    href="#demonstracao"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-surface border border-border text-text font-semibold hover:bg-background hover:border-primary/40 transition-all text-base shadow-2xs"
                  >
                    <Eye size={17} className="text-primary" />
                    <span>Ver Demonstração</span>
                  </a>
                </div>
                <p className="text-xs text-text-muted pt-2 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-amber-600 shrink-0" />
                  <span>7 dias de teste grátis · Sem cartão de crédito · Plano Único de R$ 29,90/mês</span>
                </p>
              </Reveal>
            </div>

            {/* LADO DIREITO: HUB INTERATIVO (SIMULADOR DO MODO PRIVACIDADE) */}
            <div className="lg:col-span-6" id="demonstracao">
              <Reveal delay={200}>
                <div className="relative rounded-3xl bg-surface border border-border/80 shadow-[0_12px_40px_rgba(0,0,0,0.08)] p-6 sm:p-7 overflow-hidden">
                  {/* Top Bar do Card Interativo */}
                  <div className="flex items-center justify-between pb-4 border-b border-border/60">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-serif font-bold text-sm">
                        Ψ
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-text">Setting Clínico Digital</h3>
                        <p className="text-[11px] text-text-muted">Simulador do Modo Privacidade</p>
                      </div>
                    </div>

                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold">
                      <Lock size={11} className="text-emerald-600" />
                      <span>Criptografia AES-256</span>
                    </div>
                  </div>

                  {/* MINI-PRONTUÁRIO INTERATIVO */}
                  <div className="mt-5 rounded-2xl bg-background border border-border/70 p-4.5 space-y-3.5 relative">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-8 h-8 rounded-full bg-secondary/20 text-secondary flex items-center justify-center font-bold text-xs transition-all duration-300 ${
                            isPrivacyActive ? "blur-[3px] opacity-50" : ""
                          }`}
                        >
                          P1
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-semibold text-text transition-all duration-300 ${
                                isPrivacyActive ? "blur-[6px] opacity-30 select-none pointer-events-none" : ""
                              }`}
                            >
                              Paciente 1
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary font-medium">
                              Sessão #14
                            </span>
                          </div>
                          <p
                            className={`text-[11px] text-text-muted transition-all duration-300 ${
                              isPrivacyActive ? "blur-[5px] opacity-30 select-none pointer-events-none" : ""
                            }`}
                          >
                            Demanda: Acompanhamento Psicoterapêutico Regular
                          </p>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-text-muted">14:00h</span>
                    </div>

                    <div className="p-3 rounded-xl bg-surface border border-border/50 text-xs leading-relaxed text-text relative overflow-hidden">
                      <p className="font-semibold text-text-muted text-[10px] uppercase tracking-wider mb-1">
                        Evolução Clínica da Sessão
                      </p>
                      <p
                        className={`transition-all duration-300 leading-relaxed ${
                          isPrivacyActive ? "blur-[7px] opacity-25 select-none pointer-events-none" : ""
                        }`}
                      >
                        &ldquo;Sessão dedicada à escuta e elaboração das questões trazidas sobre a rotina e relações interpessoais. Paciente participativo(a), demonstrando reflexão sobre os temas abordados. Alinhados os pontos de continuidade para o processo terapêutico.&rdquo;
                      </p>
                      {isPrivacyActive && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-700/90 text-white text-[11px] font-bold shadow-md backdrop-blur-xs animate-in fade-in zoom-in duration-200">
                            <Lock size={11} />
                            <span>Dado Protegido (Modo Privacidade)</span>
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <span className="text-text-muted">Status do Sigilo em Tela:</span>
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          isPrivacyActive ? "text-emerald-700" : "text-amber-700"
                        }`}
                      >
                        {isPrivacyActive ? (
                          <>
                            <CheckCircle2 size={13} className="text-emerald-600" />
                            <span>Protegido (Ocultado)</span>
                          </>
                        ) : (
                          <>
                            <Eye size={13} className="text-amber-600" />
                            <span>Visível em Tela</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* BOTÃO INTERATIVO DO MODO PRIVACIDADE */}
                  <div className="mt-5 p-4 rounded-2xl bg-gradient-to-r from-primary/10 via-surface to-secondary/10 border border-primary/20 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`p-2 rounded-xl transition-colors ${
                          isPrivacyActive ? "bg-emerald-600 text-white" : "bg-primary text-white"
                        }`}
                      >
                        {isPrivacyActive ? <EyeOff size={18} /> : <Eye size={18} />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-text">Experimente o Modo Privacidade</p>
                        <p className="text-[11px] text-text-muted">Ofusque nomes e anotações com 1 clique</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsPrivacyActive(!isPrivacyActive)}
                      className={`w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5 ${
                        isPrivacyActive
                          ? "bg-emerald-700 text-white hover:bg-emerald-800 ring-2 ring-emerald-400/40"
                          : "bg-primary text-white hover:bg-primary-dark ring-2 ring-primary/30"
                      }`}
                    >
                      {isPrivacyActive ? (
                        <>
                          <Eye size={14} />
                          <span>Desativar Desfoque</span>
                        </>
                      ) : (
                        <>
                          <EyeOff size={14} />
                          <span>Ativar Desfoque</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── SEÇÃO: COMPARATIVO DIRETO (ANTES vs. COM PSISETTING) ───────── */}
      <section className="py-16 sm:py-24 bg-surface border-y border-border/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto mb-12">
              <span className="text-xs font-bold uppercase tracking-wider text-primary px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
                Clareza & Organização
              </span>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-bold text-text mt-3">
                A rotina clínica antes e com o PsiSetting
              </h2>
              <p className="text-sm sm:text-base text-text-muted mt-2">
                Menos dispersão documental, mais foco no vínculo e na escuta terapêutica.
              </p>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* ANTES */}
            <Reveal delay={80}>
              <div className="h-full rounded-3xl bg-rose-50/40 border border-rose-200/70 p-6 sm:p-7 space-y-4 shadow-2xs">
                <div className="flex items-center gap-3 pb-3 border-b border-rose-200/60">
                  <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                    <FolderX size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-rose-950">ANTES</h3>
                    <p className="text-xs text-rose-700">Dispersão e retrabalho</p>
                  </div>
                </div>

                <ul className="space-y-3 pt-1">
                  {beforeItems.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-rose-950/90 leading-relaxed">
                      <span className="text-base shrink-0">{item.icon}</span>
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            {/* COM PSISETTING */}
            <Reveal delay={160}>
              <div className="h-full rounded-3xl bg-emerald-50/50 border-2 border-emerald-300 p-6 sm:p-7 space-y-4 shadow-md relative overflow-hidden">
                <div className="flex items-center gap-3 pb-3 border-b border-emerald-200/80">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-emerald-950">COM O PSISETTING</h3>
                    <p className="text-xs text-emerald-700 font-medium">Tudo integrado no seu setting</p>
                  </div>
                </div>

                <ul className="space-y-3 pt-1">
                  {afterItems.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-emerald-950 leading-relaxed font-medium">
                      <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                        <Check size={12} strokeWidth={3} />
                      </div>
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ───────── SEÇÃO: OS 3 PILARES CENTRAIS ───────── */}
      <section className="py-20 sm:py-28" id="pilares">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto mb-14">
              <span className="text-xs font-bold uppercase tracking-wider text-secondary px-3 py-1 rounded-full bg-secondary/15 border border-secondary/20">
                Estrutura Essencial
              </span>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-bold text-text mt-3">
                Os 3 pilares do PsiSetting
              </h2>
              <p className="text-sm sm:text-base text-text-muted mt-2">
                Construído especificamente para atender à rotina, às exigências éticas e à sensibilidade da clínica psicológica.
              </p>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-6">
            {corePillars.map((pilar, idx) => (
              <Reveal key={pilar.id} delay={idx * 100}>
                <div className="h-full rounded-3xl bg-surface border border-border/80 hover:border-primary/40 p-6 sm:p-7 space-y-4 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className={`w-12 h-12 rounded-2xl ${pilar.iconColor} flex items-center justify-center transition-transform group-hover:scale-105 duration-300`}>
                        <pilar.icon size={22} />
                      </div>
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${pilar.badgeColor}`}>
                        {pilar.badge}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-lg font-serif font-bold text-text group-hover:text-primary transition-colors">
                        {pilar.title}
                      </h3>
                      <p className="text-xs font-semibold text-text-muted mt-0.5">
                        {pilar.subtitle}
                      </p>
                      <p className="text-xs text-text-muted leading-relaxed mt-2.5">
                        {pilar.description}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border/60 space-y-2">
                    {pilar.features.map((feat, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-text">
                        <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── SEÇÃO ESPECIAL: DIÁRIO DE BORDO & SUPERVISÃO CLÍNICA ───────── */}
      <section className="py-20 sm:py-24 bg-gradient-to-b from-surface via-background to-surface border-y border-border/60" id="supervisao">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-12 gap-10 items-center">
            {/* Lado Esquerdo: Texto de Identidade Clínica */}
            <div className="lg:col-span-6 space-y-5">
              <Reveal>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-100 text-teal-900 border border-teal-200 text-xs font-bold">
                  <HeartHandshake size={13} />
                  <span>Diferencial de Identidade Clínica</span>
                </div>
              </Reveal>

              <Reveal delay={80}>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-bold text-text leading-tight">
                  Diário de Bordo & Supervisão: Da sessão à elaboração clínica.
                </h2>
              </Reveal>

              <Reveal delay={160}>
                <p className="text-sm text-text-muted leading-relaxed">
                  Sistemas genéricos tratam consultas como meros agendamentos médicos. O PsiSetting entende que o trabalho do psicólogo continua após o paciente sair da sala:
                </p>
              </Reveal>

              {/* Fluxo da Jornada Clínica */}
              <Reveal delay={220}>
                <div className="p-4 rounded-2xl bg-surface border border-border/80 space-y-2.5 shadow-2xs">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-teal-800">
                    O ciclo de elaboração clínica no PsiSetting:
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-text">
                    <span className="px-2.5 py-1 rounded-lg bg-teal-50 text-teal-900 border border-teal-200">Sessão</span>
                    <span className="text-text-muted">→</span>
                    <span className="px-2.5 py-1 rounded-lg bg-teal-50 text-teal-900 border border-teal-200">Elaboração Clínica</span>
                    <span className="text-text-muted">→</span>
                    <span className="px-2.5 py-1 rounded-lg bg-teal-50 text-teal-900 border border-teal-200">Supervisão</span>
                    <span className="text-text-muted">→</span>
                    <span className="px-2.5 py-1 rounded-lg bg-teal-50 text-teal-900 border border-teal-200">Hipótese</span>
                    <span className="text-text-muted">→</span>
                    <span className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20">Continuidade</span>
                  </div>
                </div>
              </Reveal>

              <Reveal delay={280}>
                <p className="text-xs text-text-muted leading-relaxed">
                  Registre contratransferências, pontos de atenção para supervisão e insights teóricos em um espaço isolado do prontuário oficial do paciente.
                </p>
              </Reveal>
            </div>

            {/* Lado Direito: Card Visual Ilustrativo */}
            <div className="lg:col-span-6">
              <Reveal delay={200}>
                <div className="rounded-3xl bg-surface border border-border/80 shadow-lg p-6 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-border/60">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center">
                        <BookOpen size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-text">Diário de Bordo & Supervisão</h4>
                        <p className="text-[10px] text-text-muted">Espaço reflexivo confidencial</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                      Caso: Paciente 1
                    </span>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="p-3 rounded-xl bg-background border border-border/60 space-y-1">
                      <span className="text-[10px] font-bold text-teal-800 uppercase">💡 Ponto para Supervisão:</span>
                      <p className="text-text-muted leading-relaxed text-[11px]">
                        &ldquo;Refletir sobre a dinâmica dos encontros recentes e aprofundar na elaboração das queixas trazidas na sessão.&rdquo;
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-background border border-border/60 space-y-1">
                      <span className="text-[10px] font-bold text-primary uppercase">📌 Hipótese de Manejo:</span>
                      <p className="text-text-muted leading-relaxed text-[11px]">
                        &ldquo;Aprofundar na compreensão dos afetos e na aliança terapêutica antes de novas intervenções.&rdquo;
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── SEÇÃO: VITRINE DOS 5 MODELOS CFP (RES. 06/2019) COM DISCLAIMER ───────── */}
      <section className="py-20 sm:py-28" id="modelos-cfp">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto mb-12">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800 px-3 py-1 rounded-full bg-amber-100 border border-amber-200">
                Normativa Vigente
              </span>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-bold text-text mt-3">
                5 modelos de documentos conforme a Resolução CFP nº 06/2019
              </h2>
              <p className="text-sm sm:text-base text-text-muted mt-2">
                Estruturas normativas pré-formatadas para apoiar a elaboração ágil e fundamentada de documentos psicológicos.
              </p>
            </div>
          </Reveal>

          {/* DISCLAIMER ÉTICO / LEGAL */}
          <Reveal delay={60}>
            <div className="max-w-4xl mx-auto mb-8 p-4 rounded-2xl bg-amber-50/80 border border-amber-200 flex items-start gap-3 text-xs text-amber-950">
              <AlertCircle size={17} className="text-amber-800 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Aviso Ético e Responsabilidade Técnica:</strong> Os modelos disponibilizados são ferramentas de apoio estruturadas com base na Resolução CFP nº 06/2019. A revisão, adequação ao caso concreto e utilização do documento são de inteira responsabilidade do profissional, conforme seu conhecimento técnico e as normas vigentes.
              </p>
            </div>
          </Reveal>

          {/* SELETOR DE ABAS INTERATIVO DOS MODELOS */}
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-wrap items-center justify-center gap-2 p-1.5 rounded-2xl bg-surface border border-border/80 shadow-2xs mb-8">
              {cfpModels.map((model) => {
                const isActive = activeCfpTab === model.id;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => setActiveCfpTab(model.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      isActive
                        ? "bg-primary text-white shadow-xs"
                        : "text-text-muted hover:text-text hover:bg-background"
                    }`}
                  >
                    <span>{model.name}</span>
                  </button>
                );
              })}
            </div>

            {/* PREVIEW DO DOCUMENTO SELECIONADO */}
            <Reveal delay={100}>
              <div className="rounded-3xl bg-surface border border-border/80 shadow-lg p-6 sm:p-10 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-primary to-secondary" />

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-6 border-b border-border/60">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200">
                      {selectedCfpModel.badge}
                    </span>
                    <h3 className="text-xl font-serif font-bold text-text mt-1.5">
                      {selectedCfpModel.name}
                    </h3>
                    <p className="text-xs text-text-muted mt-0.5">{selectedCfpModel.description}</p>
                  </div>

                  <Link
                    href="/login"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors shrink-0"
                  >
                    <span>Emitir no Sistema</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>

                <div className="mt-6 grid sm:grid-cols-12 gap-6">
                  {/* Seções Obrigatórias */}
                  <div className="sm:col-span-5 space-y-3">
                    <p className="text-xs font-bold uppercase text-text tracking-wide">
                      Estrutura Normativa (Res. 06/2019):
                    </p>
                    <div className="space-y-2">
                      {selectedCfpModel.preview.sections.map((sec, i) => (
                        <div key={i} className="flex items-center gap-2 p-2.5 rounded-xl bg-background border border-border/60 text-xs font-medium text-text">
                          <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                          <span>{sec}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Preview da Folha Timbrada */}
                  <div className="sm:col-span-7 bg-[#FBFBFA] border border-border/80 rounded-2xl p-5 shadow-inner space-y-3 font-serif">
                    <div className="text-center border-b border-border/40 pb-2">
                      <p className="text-xs font-bold tracking-widest text-text">
                        {selectedCfpModel.preview.title}
                      </p>
                      <p className="text-[10px] text-text-muted font-sans">
                        {selectedCfpModel.preview.subtitle}
                      </p>
                    </div>

                    <p className="text-xs text-text leading-relaxed text-justify italic">
                      &ldquo;{selectedCfpModel.preview.body}&rdquo;
                    </p>

                    <div className="pt-3 border-t border-border/40 flex justify-between items-end text-[10px] font-sans text-text-muted">
                      <div>
                        <p className="font-bold text-text">PSICÓLOGO(A) RESPONSÁVEL</p>
                        <p>CRP 07/XXXXX</p>
                      </div>
                      <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Exportação em PDF A4
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ───────── SEÇÃO: PRIVACIDADE, ÉTICA & SEGURANÇA (BLOCO ESCURO) ───────── */}
      <section className="py-20 sm:py-28 bg-[#1B261A] text-white relative overflow-hidden" id="seguranca">
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-emerald-500/10 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-primary/20 blur-[100px] pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 space-y-6">
              <Reveal>
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-700/50 text-xs font-semibold">
                  <Lock size={13} />
                  <span>Privacidade e Proteção de Dados</span>
                </div>
              </Reveal>

              <Reveal delay={80}>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-bold leading-tight">
                  Seus prontuários protegidos com o rigor ético que a psicologia exige.
                </h2>
              </Reveal>

              <Reveal delay={160}>
                <p className="text-sm sm:text-base text-gray-300 leading-relaxed">
                  O Código de Ética Profissional do Psicólogo estabelece o dever de guarda confidencial dos registros. Desenvolvemos o PsiSetting com camadas de proteção de dados e criptografia para apoiar sua prática clínica com responsabilidade técnica e tranquilidade.
                </p>
              </Reveal>

              <Reveal delay={220}>
                <div className="pt-2 flex flex-wrap gap-2.5">
                  <span className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-bold text-emerald-300 border border-white/10">
                    🔒 Criptografia AES-256
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-bold text-amber-300 border border-white/10">
                    📜 Resolução CFP 06/2019
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-bold text-sky-300 border border-white/10">
                    🛡️ Boas Práticas LGPD
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-bold text-rose-300 border border-white/10">
                    ⏱️ Timeout de Sessão
                  </span>
                </div>
              </Reveal>
            </div>

            <div className="lg:col-span-7 grid sm:grid-cols-2 gap-4">
              {compliancePoints.map((pt, i) => (
                <Reveal key={pt.title} delay={i * 80}>
                  <div className="h-full rounded-2xl bg-white/5 border border-white/10 hover:border-emerald-500/40 p-5 space-y-2.5 backdrop-blur-xs transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <pt.icon size={20} />
                      </div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                        {pt.highlight}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white pt-1">{pt.title}</h3>
                    <p className="text-xs text-gray-300 leading-relaxed">{pt.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────── SEÇÃO: PLANO ÚNICO & PREÇO CLARO ───────── */}
      <section className="py-20 sm:py-28" id="preco">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center max-w-xl mx-auto mb-14">
              <span className="text-xs font-bold uppercase tracking-wider text-secondary px-3 py-1 rounded-full bg-secondary/15 border border-secondary/20">
                Plano Único Profissional
              </span>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-bold text-text mt-3">
                Apenas um plano. Tudo incluso, sem taxas ocultas.
              </h2>
              <p className="text-sm sm:text-base text-text-muted mt-2">
                Acesso total e irrestrito para manter toda a sua prática clínica organizada e protegida.
              </p>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="max-w-lg mx-auto rounded-3xl bg-surface border-2 border-primary/40 shadow-xl p-8 sm:p-10 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-primary text-white text-xs font-bold px-4 py-1.5 rounded-bl-2xl uppercase tracking-wider shadow-xs">
                7 Dias Grátis
              </div>

              <div className="text-center pb-6 border-b border-border/60">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold mb-3">
                  <Sparkles size={13} />
                  <span>Experimente 7 dias sem compromisso</span>
                </div>
                <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Plano Único Profissional Clínico</p>
                <div className="mt-3 flex items-baseline justify-center gap-1">
                  <span className="text-lg font-bold text-text">R$</span>
                  <span className="text-5xl font-serif font-black text-text tracking-tight">29</span>
                  <span className="text-2xl font-serif font-bold text-text">,90</span>
                  <span className="text-sm text-text-muted font-medium">/mês</span>
                </div>
                <p className="text-xs text-text-muted mt-2">Após os 7 dias grátis · Sem fidelidade · Cancele quando quiser</p>
              </div>

              <div className="py-6 space-y-3">
                {[
                  "Pacientes e Prontuários Ilimitados",
                  "5 Modelos de Documentos conforme a Res. CFP 06/2019",
                  "Modo Privacidade com 1 Clique",
                  "Criptografia de Dados Clínicos (AES-256)",
                  "Agenda com Sincronização iCal (Apple & Google)",
                  "Controle Financeiro de Sessões & Recibos",
                  "Diário de Bordo para Supervisão Clínica",
                  "Timeout Automático e Boas Práticas LGPD",
                  "Suporte Técnico Dedicado",
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 text-xs sm:text-sm text-text font-medium">
                    <div className="p-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                      <Check size={14} strokeWidth={3} />
                    </div>
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <Link
                href="/login"
                className="w-full py-4 rounded-xl bg-primary text-white font-bold text-center block hover:bg-primary-dark shadow-md hover:shadow-lg transition-all text-sm group"
              >
                <span>Começar 7 Dias de Teste Grátis</span>
                <ArrowRight size={16} className="inline ml-1.5 group-hover:translate-x-1 transition-transform" />
              </Link>

              <p className="text-[11px] text-center text-text-muted mt-3 mb-4">
                Sem necessidade de cartão de crédito para iniciar o teste.
              </p>

              <MercadoPagoBadge variant="compact" className="w-full justify-center" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────── SEÇÃO: FAQ ───────── */}
      <section className="py-20 sm:py-28 bg-surface border-t border-border/60" id="faq">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center mb-14">
              <span className="text-xs font-bold uppercase tracking-wider text-primary px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
                Tire Suas Dúvidas
              </span>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-bold text-text mt-3">
                Perguntas Frequentes de Psicólogos
              </h2>
            </div>
          </Reveal>

          <div className="space-y-3">
            {faqItems.map((item, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <Reveal key={index} delay={index * 50}>
                  <div className="rounded-2xl bg-background border border-border/80 overflow-hidden transition-colors">
                    <button
                      type="button"
                      onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                      className="w-full p-5 text-left font-semibold text-text text-sm sm:text-base flex items-center justify-between gap-4 cursor-pointer"
                    >
                      <span>{item.question}</span>
                      <ChevronDown
                        size={18}
                        className={`text-primary shrink-0 transition-transform duration-200 ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 text-xs sm:text-sm text-text-muted leading-relaxed border-t border-border/40 pt-3">
                        {item.answer}
                      </div>
                    )}
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ───────── SEÇÃO: CTA FINAL ───────── */}
      <section className="py-20 sm:py-28 bg-gradient-to-b from-surface via-background to-background text-center relative">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <Reveal>
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-serif font-bold text-2xl mx-auto mb-4 border border-primary/20 shadow-xs">
              Ψ
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-text leading-tight">
              Seu setting clínico organizado e protegido.
            </h2>
            <p className="text-base sm:text-lg text-text-muted max-w-xl mx-auto mt-4">
              Junte-se a psicólogos que já centralizaram prontuários, documentos e finanças com tranquilidade e responsabilidade ética.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark shadow-md hover:shadow-lg transition-all text-base group"
              >
                <span>Começar Meus 7 Dias Grátis</span>
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
            <p className="text-xs text-text-muted mt-3">
              Sem cartão de crédito para testar · Apenas R$ 29,90/mês após os 7 dias.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ───────── FOOTER ───────── */}
      <footer className="py-12 bg-surface border-t border-border/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <PsiSettingBrand size="sm" showSubtitle={true} subtitleText="Setting Clínico" />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-text-muted font-medium">
            <a href="#pilares" className="hover:text-primary transition-colors">Os 3 Pilares</a>
            <a href="#supervisao" className="hover:text-primary transition-colors">Diário & Supervisão</a>
            <a href="#modelos-cfp" className="hover:text-primary transition-colors">Documentos CFP</a>
            <a href="#seguranca" className="hover:text-primary transition-colors">Privacidade</a>
            <a href="#preco" className="hover:text-primary transition-colors">Preço</a>
            <Link href="/termos" className="hover:text-primary transition-colors">Termos de Uso</Link>
            <Link href="/privacidade" className="hover:text-primary transition-colors">Privacidade</Link>
            <Link href="/login" className="hover:text-primary transition-colors">Login</Link>
          </div>

          <p className="text-xs text-text-muted">
            © {new Date().getFullYear()} PsiSetting. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </>
  );
}
