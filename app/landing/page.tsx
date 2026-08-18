"use client";

import { useState } from "react";
import Link from "next/link";
import { PsiSettingBrand } from "@/app/components/psi-setting-brand";
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
  ClipboardList,
  Clock,
  ShieldAlert,
  CheckCircle2,
  Sparkles,
  Eye,
} from "lucide-react";

/* ──────────────────────────── JSON-LD ──────────────────────────── */

const jsonLdOrganization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "PsiSetting",
  url: "https://psisetting.com.br",
  logo: "https://psisetting.com.br/og-image.png",
  description:
    "Plataforma de gestão clínica para psicólogos — prontuários, laudos, agenda e financeiro em conformidade com LGPD e CFP.",
};

const jsonLdSoftwareApp = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "PsiSetting",
  applicationCategory: "HealthApplication",
  operatingSystem: "Web",
  description:
    "SaaS de gestão clínica para psicólogos com prontuários eletrônicos, laudos CFP 06/2019, agenda, financeiro e Modo Privacidade.",
  offers: {
    "@type": "Offer",
    price: "49.90",
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
    "Gestão clínica para psicólogos — prontuários, laudos, agenda e financeiro.",
};

const faqItems = [
  {
    question: "O PsiSetting é seguro para armazenar prontuários?",
    answer:
      "Sim. Todos os dados clínicos sensíveis são criptografados com AES-256 utilizando uma chave derivada exclusiva de cada profissional. Nem mesmo a equipe do PsiSetting tem acesso ao conteúdo dos seus prontuários.",
  },
  {
    question: "Atende às exigências do Conselho Federal de Psicologia?",
    answer:
      "Sim. Os modelos de laudos e documentos seguem integralmente a Resolução CFP nº 06/2019. A plataforma também implementa isolamento de dados por profissional, timeout automático e criptografia — atendendo às orientações do CFP sobre sigilo profissional em meios digitais.",
  },
  {
    question: "Posso usar no celular?",
    answer:
      "Sim. O PsiSetting é totalmente responsivo e funciona em qualquer navegador de smartphone, tablet ou computador. Não é necessário instalar nenhum aplicativo.",
  },
  {
    question: "Como funciona o Modo Privacidade?",
    answer:
      "Com um clique, o Modo Privacidade aplica um desfoque instantâneo em todos os dados sensíveis na tela — nomes de pacientes, prontuários e informações clínicas. Ideal para quando alguém se aproxima da sua tela durante um atendimento.",
  },
  {
    question: "Meus dados ficam armazenados onde?",
    answer:
      "Os dados são armazenados em servidores seguros da Supabase (baseados na AWS), com criptografia em repouso e em trânsito. Cada profissional tem seus dados completamente isolados através de Row Level Security (RLS).",
  },
  {
    question: "Posso cancelar a qualquer momento?",
    answer:
      "Sim. Não há fidelidade, contratos ou multas. Você pode cancelar sua assinatura a qualquer momento diretamente nas configurações da sua conta.",
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

/* ──────────────────────────── FEATURES ──────────────────────────── */

const features = [
  {
    icon: FileText,
    title: "Prontuário Eletrônico",
    description:
      "Registro de evolução por sessão com Modo Privacidade — ocultação instantânea de dados sensíveis em tela com um clique.",
  },
  {
    icon: FileCheck,
    title: "Laudos e Documentos Oficiais",
    description:
      "5 modelos padronizados conforme Resolução CFP nº 06/2019 com preenchimento automático dos dados do profissional e paciente.",
  },
  {
    icon: Calendar,
    title: "Agenda Clínica",
    description:
      "Visualização semanal e mensal com sincronização automática via iCal — Google Calendar e Apple Calendar.",
  },
  {
    icon: Users,
    title: "Gestão de Pacientes",
    description:
      "Cadastro completo, histórico de sessões e documentos, busca rápida e prontuários vinculados por paciente.",
  },
  {
    icon: DollarSign,
    title: "Controle Financeiro",
    description:
      "Acompanhe recebimentos e pendências, relatórios mensais e status financeiro por sessão em tempo real.",
  },
  {
    icon: BookOpen,
    title: "Diário de Bordo",
    description:
      "Espaço privado para anotações pessoais do psicólogo — insights clínicos, supervisão e reflexões por sessão.",
  },
];

/* ──────────────────────────── PAIN POINTS ──────────────────────────── */

const painPoints = [
  {
    icon: ClipboardList,
    title: "Prontuários soltos por todo lado",
    description:
      "Cadernos, planilhas, documentos no computador... informações clínicas espalhadas e sem padronização, difíceis de acessar quando você mais precisa.",
  },
  {
    icon: Clock,
    title: "Horas perdidas com burocracia",
    description:
      "Formatar laudos, declarações e atestados manualmente toda vez. Copiar e colar dados do paciente, ajustar margens, conferir normas do CFP...",
  },
  {
    icon: ShieldAlert,
    title: "Receio constante com sigilo",
    description:
      "O medo de que alguém veja a tela durante um atendimento. A preocupação com a fiscalização do CRP. A incerteza sobre a segurança dos seus registros digitais.",
  },
];

/* ──────────────────────────── SECURITY ITEMS ──────────────────────────── */

const securityItems = [
  {
    icon: Lock,
    title: "Criptografia AES-256",
    description: "Dados clínicos criptografados ponta a ponta com chave exclusiva por profissional.",
  },
  {
    icon: Scale,
    title: "Conformidade LGPD",
    description: "Tratamento de dados alinhado à Lei Geral de Proteção de Dados.",
  },
  {
    icon: Shield,
    title: "Resoluções do CFP",
    description: "Laudos e práticas conforme normativas do Conselho Federal de Psicologia.",
  },
  {
    icon: Database,
    title: "Isolamento de Dados",
    description: "Row Level Security — cada profissional acessa apenas seus próprios dados.",
  },
  {
    icon: Timer,
    title: "Timeout Automático",
    description: "Sessão encerrada automaticamente após 30 minutos de inatividade.",
  },
  {
    icon: Eye,
    title: "Modo Privacidade",
    description: "Desfoque instantâneo de dados sensíveis na tela com um clique.",
  },
];

/* ──────────────────────────── PLAN FEATURES ──────────────────────────── */

const planFeatures = [
  "Pacientes ilimitados",
  "Prontuários por sessão",
  "5 modelos de laudos CFP 06/2019",
  "Agenda com sincronização iCal",
  "Controle financeiro completo",
  "Modo Privacidade",
  "Diário de Bordo",
  "Criptografia AES-256",
  "Conformidade LGPD",
  "Suporte por e-mail",
];

/* ──────────────────────────── FAQ ACCORDION ──────────────────────────── */

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border/60 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 px-1 text-left group cursor-pointer"
        aria-expanded={open}
      >
        <span className="text-[15px] font-medium text-text group-hover:text-primary transition-colors pr-4">
          {question}
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-text-muted transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${open ? "max-h-60 pb-5" : "max-h-0"}`}
      >
        <p className="text-sm text-text-muted leading-relaxed px-1">{answer}</p>
      </div>
    </div>
  );
}

/* ──────────────────────────── MAIN PAGE ──────────────────────────── */

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/landing" className="shrink-0">
            <PsiSettingBrand size="md" />
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#funcionalidades" className="text-sm text-text-muted hover:text-text transition-colors">
              Funcionalidades
            </a>
            <a href="#seguranca" className="text-sm text-text-muted hover:text-text transition-colors">
              Segurança
            </a>
            <a href="#preco" className="text-sm text-text-muted hover:text-text transition-colors">
              Preço
            </a>
            <a href="#faq" className="text-sm text-text-muted hover:text-text transition-colors">
              FAQ
            </a>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-all shadow-sm"
            >
              Começar Agora
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

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-surface border-t border-border/40 shadow-lg">
            <div className="px-4 py-4 flex flex-col gap-3">
              <a
                href="#funcionalidades"
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm text-text-muted hover:text-text py-2 transition-colors"
              >
                Funcionalidades
              </a>
              <a
                href="#seguranca"
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm text-text-muted hover:text-text py-2 transition-colors"
              >
                Segurança
              </a>
              <a
                href="#preco"
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm text-text-muted hover:text-text py-2 transition-colors"
              >
                Preço
              </a>
              <a
                href="#faq"
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm text-text-muted hover:text-text py-2 transition-colors"
              >
                FAQ
              </a>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-all shadow-sm mt-1"
              >
                Começar Agora
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ───────── HERO ───────── */}
      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 overflow-hidden">
        {/* Background decorations */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-20 right-0 w-[500px] h-[500px] rounded-full bg-primary/[0.04] blur-3xl" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-secondary/[0.06] blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6 border border-primary/15">
              <Sparkles size={14} />
              <span>Gestão Clínica para Psicólogos</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-semibold text-text leading-tight tracking-tight">
              O <em className="not-italic text-primary">setting</em> terapêutico do seu consultório,{" "}
              <span className="whitespace-nowrap">agora também digital.</span>
            </h1>

            <p className="mt-6 text-base sm:text-lg text-text-muted leading-relaxed max-w-2xl mx-auto">
              Prontuários, laudos, agenda e financeiro — tudo em um só lugar, seguro e em conformidade com o CFP.
              Para que seu foco seja apenas a escuta.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dark transition-all shadow-md hover:shadow-lg text-sm sm:text-base"
              >
                Começar Agora
                <ArrowRight size={18} />
              </Link>
              <a
                href="#funcionalidades"
                className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-surface text-text font-semibold border border-border/60 hover:border-border hover:bg-background transition-all text-sm sm:text-base"
              >
                Conheça as Funcionalidades
              </a>
            </div>
          </div>

          {/* Dashboard Mockup Placeholder */}
          <div className="mt-16 sm:mt-20 max-w-4xl mx-auto">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/10 border border-border/40 bg-surface">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-4 py-3 bg-background border-b border-border/40">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-danger/60" />
                  <div className="w-3 h-3 rounded-full bg-secondary/60" />
                  <div className="w-3 h-3 rounded-full bg-success/60" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="px-4 py-1 rounded-lg bg-surface text-xs text-text-muted border border-border/40 font-mono">
                    app.psisetting.com.br
                  </div>
                </div>
              </div>
              {/* Mock dashboard content */}
              <div className="p-6 sm:p-8 min-h-[280px] sm:min-h-[360px] bg-background">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
                  {[
                    { label: "Hoje", value: "4 sessões", color: "bg-primary/10 text-primary" },
                    { label: "Próximos 7 dias", value: "18 sessões", color: "bg-primary/10 text-primary" },
                    { label: "Recebido", value: "R$ 3.240", color: "bg-success/10 text-success" },
                    { label: "Pendente", value: "R$ 780", color: "bg-secondary/20 text-secondary" },
                  ].map((card) => (
                    <div key={card.label} className="bg-surface rounded-xl p-4 border border-border/40 shadow-xs">
                      <p className="text-[11px] text-text-muted font-medium uppercase tracking-wide">{card.label}</p>
                      <p className={`text-lg sm:text-xl font-bold mt-1 ${card.color.split(" ")[1]}`}>{card.value}</p>
                    </div>
                  ))}
                </div>
                {/* Fake table rows */}
                <div className="space-y-2.5">
                  {[
                    { name: "Antoniela A. R.", time: "08:00", status: "Confirmada" },
                    { name: "Carlos M. S.", time: "09:00", status: "Confirmada" },
                    { name: "Juliana P. L.", time: "10:30", status: "Pendente" },
                    { name: "Roberto F. N.", time: "14:00", status: "Confirmada" },
                  ].map((row) => (
                    <div key={row.name} className="flex items-center justify-between bg-surface rounded-lg px-4 py-2.5 border border-border/30">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-xs font-semibold text-primary">{row.name[0]}</span>
                        </div>
                        <span className="text-sm font-medium text-text">{row.name}</span>
                      </div>
                      <span className="text-xs text-text-muted">{row.time}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${row.status === "Confirmada" ? "bg-success/10 text-success" : "bg-secondary/15 text-secondary"}`}>
                        {row.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── DOR / PROBLEMA ───────── */}
      <section className="py-20 sm:py-28 bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-serif font-semibold text-text">
              A dor que você conhece bem
            </h2>
            <p className="mt-3 text-text-muted max-w-xl mx-auto text-sm sm:text-base">
              O trabalho clínico já exige presença total. A burocracia não deveria competir com a escuta.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {painPoints.map((item) => (
              <div
                key={item.title}
                className="bg-background rounded-2xl p-6 border border-border/50 hover:border-primary/30 transition-all duration-300 group"
              >
                <div className="w-11 h-11 rounded-xl bg-secondary/15 flex items-center justify-center mb-4 group-hover:bg-secondary/25 transition-colors">
                  <item.icon size={20} className="text-secondary" strokeWidth={1.8} />
                </div>
                <h3 className="text-base font-semibold text-text mb-2">{item.title}</h3>
                <p className="text-sm text-text-muted leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── FUNCIONALIDADES ───────── */}
      <section id="funcionalidades" className="py-20 sm:py-28 scroll-mt-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-serif font-semibold text-text">
              Tudo que seu consultório precisa
            </h2>
            <p className="mt-3 text-text-muted max-w-xl mx-auto text-sm sm:text-base">
              Do prontuário ao financeiro, cada módulo foi pensado por e para psicólogos.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feat) => (
              <div
                key={feat.title}
                className="bg-surface rounded-2xl p-6 border border-border/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/[0.04] transition-all duration-300 group"
              >
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                  <feat.icon size={20} className="text-primary" strokeWidth={1.8} />
                </div>
                <h3 className="text-base font-semibold text-text mb-2">{feat.title}</h3>
                <p className="text-sm text-text-muted leading-relaxed">{feat.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── SEGURANÇA ───────── */}
      <section id="seguranca" className="py-20 sm:py-28 bg-surface scroll-mt-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-serif font-semibold text-text">
              Segurança e conformidade que você pode confiar
            </h2>
            <p className="mt-3 text-text-muted max-w-xl mx-auto text-sm sm:text-base">
              Seus dados clínicos protegidos com o mesmo rigor ético do setting presencial.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {securityItems.map((item) => (
              <div
                key={item.title}
                className="flex gap-4 p-5 rounded-xl bg-background border border-border/40 hover:border-primary/25 transition-all duration-300"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <item.icon size={18} className="text-primary" strokeWidth={1.8} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text mb-1">{item.title}</h3>
                  <p className="text-xs text-text-muted leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── COMO FUNCIONA ───────── */}
      <section className="py-20 sm:py-28 scroll-mt-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-serif font-semibold text-text">
              Comece em 3 passos
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-3xl mx-auto">
            {[
              {
                step: "1",
                title: "Crie sua conta",
                description: "Cadastro rápido com Google ou e-mail. Sem cartão de crédito.",
              },
              {
                step: "2",
                title: "Cadastre seus pacientes",
                description: "Registre um a um, no seu ritmo. Simples e intuitivo.",
              },
              {
                step: "3",
                title: "Foque no que importa",
                description: "A escuta. O PsiSetting cuida do resto.",
              },
            ].map((item, i) => (
              <div key={item.step} className="text-center relative">
                {/* Connector line (desktop only) */}
                {i < 2 && (
                  <div className="hidden md:block absolute top-8 left-[calc(50%+32px)] w-[calc(100%-64px)] h-px bg-border/60" />
                )}
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mb-4 mx-auto border border-primary/15">
                  <span className="text-xl font-serif font-bold">{item.step}</span>
                </div>
                <h3 className="text-base font-semibold text-text mb-2">{item.title}</h3>
                <p className="text-sm text-text-muted leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── PREÇO ───────── */}
      <section id="preco" className="py-20 sm:py-28 bg-surface scroll-mt-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-serif font-semibold text-text">
              Um plano. Tudo incluso.
            </h2>
            <p className="mt-3 text-text-muted max-w-xl mx-auto text-sm sm:text-base">
              Sem surpresas, sem funcionalidades bloqueadas. Acesso completo a todas as ferramentas.
            </p>
          </div>

          <div className="max-w-md mx-auto">
            <div className="bg-background rounded-2xl border-2 border-primary/30 p-8 shadow-xl shadow-primary/[0.06] relative overflow-hidden">
              {/* Popular badge */}
              <div className="absolute top-0 right-0 bg-primary text-white text-xs font-bold px-4 py-1.5 rounded-bl-xl">
                Profissional
              </div>

              <div className="text-center mb-6">
                <div className="flex items-baseline justify-center gap-1 mb-1">
                  <span className="text-sm text-text-muted font-medium">R$</span>
                  <span className="text-5xl font-serif font-bold text-text tracking-tight">49</span>
                  <span className="text-xl font-serif font-semibold text-text">,90</span>
                  <span className="text-sm text-text-muted font-medium">/mês</span>
                </div>
                <p className="text-xs text-text-muted">
                  Cancele a qualquer momento. Sem fidelidade.
                </p>
              </div>

              <div className="space-y-3 mb-8">
                {planFeatures.map((feat) => (
                  <div key={feat} className="flex items-start gap-3">
                    <CheckCircle2 size={16} className="text-success shrink-0 mt-0.5" />
                    <span className="text-sm text-text">{feat}</span>
                  </div>
                ))}
              </div>

              <Link
                href="/login"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dark transition-all shadow-sm text-sm sm:text-base"
              >
                Começar Agora
                <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section id="faq" className="py-20 sm:py-28 scroll-mt-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-serif font-semibold text-text">
              Perguntas Frequentes
            </h2>
          </div>

          <div className="bg-surface rounded-2xl border border-border/50 px-6 divide-y-0">
            {faqItems.map((item) => (
              <FAQItem key={item.question} question={item.question} answer={item.answer} />
            ))}
          </div>
        </div>
      </section>

      {/* ───────── CTA FINAL ───────── */}
      <section className="py-20 sm:py-28 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.06] via-transparent to-secondary/[0.06]" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary mb-6 border border-primary/15">
            <span className="text-2xl font-serif font-bold">Ψ</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-serif font-semibold text-text">
            Comece a transformar sua prática clínica hoje.
          </h2>
          <p className="mt-4 text-text-muted max-w-lg mx-auto text-sm sm:text-base leading-relaxed">
            Junte-se a psicólogos que já escolheram um setting digital seguro, ético e acolhedor.
          </p>
          <div className="mt-8">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dark transition-all shadow-md hover:shadow-lg text-sm sm:text-base"
            >
              Criar Minha Conta
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* ───────── FOOTER ───────── */}
      <footer className="border-t border-border/40 py-12 bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex flex-col items-center sm:items-start gap-2">
              <PsiSettingBrand size="sm" showSubtitle={true} subtitleText="Gestão Clínica" />
              <div className="flex items-center gap-2 mt-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-semibold border border-primary/15">
                  <Shield size={11} />
                  LGPD
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-semibold border border-primary/15">
                  <Scale size={11} />
                  CFP
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6 text-xs text-text-muted">
              <a href="#" className="hover:text-text transition-colors">Termos de Uso</a>
              <a href="#" className="hover:text-text transition-colors">Privacidade</a>
              <a href="mailto:contato@psisetting.com.br" className="hover:text-text transition-colors">Contato</a>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-border/30 text-center">
            <p className="text-xs text-text-muted">
              © {new Date().getFullYear()} PsiSetting. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
