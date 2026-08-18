"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
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
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
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
        transform: isVisible ? "translateY(0)" : "translateY(28px)",
        transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
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

/* ──────────────────────────── DATA ──────────────────────────── */

const features = [
  {
    icon: FileText,
    title: "Prontuário Eletrônico",
    description:
      "Registro de evolução por sessão com Modo Privacidade — ocultação instantânea de dados sensíveis em tela com um clique.",
    accent: "from-emerald-500/20 to-emerald-600/5",
    iconBg: "bg-emerald-500/12",
    iconColor: "text-emerald-700",
  },
  {
    icon: FileCheck,
    title: "Laudos Oficiais CFP",
    description:
      "5 modelos padronizados conforme Resolução CFP nº 06/2019 com preenchimento automático dos dados do profissional e paciente.",
    accent: "from-amber-500/20 to-amber-600/5",
    iconBg: "bg-amber-500/12",
    iconColor: "text-amber-700",
  },
  {
    icon: Calendar,
    title: "Agenda Clínica",
    description:
      "Visualização semanal e mensal com sincronização automática via iCal — Google Calendar e Apple Calendar.",
    accent: "from-sky-500/20 to-sky-600/5",
    iconBg: "bg-sky-500/12",
    iconColor: "text-sky-700",
  },
  {
    icon: Users,
    title: "Gestão de Pacientes",
    description:
      "Cadastro completo, histórico de sessões e documentos, busca rápida e prontuários vinculados por paciente.",
    accent: "from-violet-500/20 to-violet-600/5",
    iconBg: "bg-violet-500/12",
    iconColor: "text-violet-700",
  },
  {
    icon: DollarSign,
    title: "Controle Financeiro",
    description:
      "Acompanhe recebimentos e pendências, relatórios mensais e status financeiro por sessão em tempo real.",
    accent: "from-rose-500/20 to-rose-600/5",
    iconBg: "bg-rose-500/12",
    iconColor: "text-rose-700",
  },
  {
    icon: BookOpen,
    title: "Diário de Bordo",
    description:
      "Espaço privado para anotações pessoais do psicólogo — insights clínicos, supervisão e reflexões por sessão.",
    accent: "from-teal-500/20 to-teal-600/5",
    iconBg: "bg-teal-500/12",
    iconColor: "text-teal-700",
  },
];

const painPoints = [
  {
    icon: ClipboardList,
    title: "Prontuários soltos por todo lado",
    description:
      "Cadernos, planilhas, documentos no computador... informações clínicas espalhadas e sem padronização.",
  },
  {
    icon: Clock,
    title: "Horas perdidas com burocracia",
    description:
      "Formatar laudos, declarações e atestados manualmente toda vez. Copiar dados, ajustar margens, conferir normas.",
  },
  {
    icon: ShieldAlert,
    title: "Receio constante com sigilo",
    description:
      "O medo de que alguém veja a tela. A preocupação com a fiscalização do CRP. A incerteza sobre a segurança digital.",
  },
];

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

function FAQItem({ question, answer, index }: { question: string; answer: string; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <Reveal delay={index * 60}>
      <div className="border border-border/50 rounded-xl mb-3 overflow-hidden bg-surface/80 backdrop-blur-sm hover:border-primary/25 transition-all duration-300">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between py-4.5 px-5 text-left group cursor-pointer"
          aria-expanded={open}
        >
          <span className="text-[15px] font-medium text-text group-hover:text-primary transition-colors pr-4">
            {question}
          </span>
          <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-300 ${open ? "bg-primary/15 rotate-180" : "bg-background"}`}>
            <ChevronDown size={15} className={`transition-colors ${open ? "text-primary" : "text-text-muted"}`} />
          </div>
        </button>
        <div
          className={`overflow-hidden transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${open ? "max-h-60" : "max-h-0"}`}
        >
          <p className="text-sm text-text-muted leading-relaxed px-5 pb-5">{answer}</p>
        </div>
      </div>
    </Reveal>
  );
}

/* ──────────────────────────── MAIN PAGE ──────────────────────────── */

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
            ? "bg-surface/85 backdrop-blur-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border-b border-border/30"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/landing" className="shrink-0">
            <PsiSettingBrand size="md" />
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            {["Funcionalidades", "Segurança", "Preço", "FAQ"].map((label) => (
              <a
                key={label}
                href={`#${label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`}
                className="text-[13px] font-medium text-text-muted hover:text-text transition-colors relative after:absolute after:bottom-[-4px] after:left-0 after:right-0 after:h-[2px] after:bg-primary after:scale-x-0 after:transition-transform after:duration-300 hover:after:scale-x-100 after:origin-left"
              >
                {label}
              </a>
            ))}
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark hover:shadow-md transition-all duration-200"
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

        {/* Mobile menu */}
        <div
          className={`md:hidden overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            mobileMenuOpen ? "max-h-80 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="bg-surface/95 backdrop-blur-2xl border-t border-border/30 px-4 py-4 flex flex-col gap-1">
            {[
              { label: "Funcionalidades", href: "#funcionalidades" },
              { label: "Segurança", href: "#seguranca" },
              { label: "Preço", href: "#preco" },
              { label: "FAQ", href: "#faq" },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm text-text-muted hover:text-text hover:bg-background/60 rounded-lg py-2.5 px-3 transition-all"
              >
                {item.label}
              </a>
            ))}
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-all mt-2"
            >
              Começar Agora
            </Link>
          </div>
        </div>
      </nav>

      {/* ───────── HERO ───────── */}
      <section className="relative pt-28 pb-8 sm:pt-32 lg:pt-36 overflow-hidden min-h-[90vh] flex items-center">
        {/* Background elements */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-gradient-radial from-primary/[0.07] via-transparent to-transparent rounded-full blur-3xl" />
          <div className="absolute top-40 right-0 w-[300px] h-[300px] rounded-full bg-secondary/[0.08] blur-3xl" />
          <div className="absolute bottom-0 left-10 w-[250px] h-[250px] rounded-full bg-primary/[0.05] blur-3xl" />
          {/* Floating decorative shapes */}
          <div className="absolute top-32 left-[8%] w-3 h-3 rounded-full bg-primary/20 animate-[float_6s_ease-in-out_infinite]" />
          <div className="absolute top-48 right-[12%] w-2 h-2 rounded-full bg-secondary/30 animate-[float_8s_ease-in-out_infinite_1s]" />
          <div className="absolute bottom-40 left-[15%] w-2.5 h-2.5 rounded-full bg-primary/15 animate-[float_7s_ease-in-out_infinite_2s]" />
          <div className="absolute top-60 left-[25%] w-1.5 h-1.5 rounded-full bg-secondary/25 animate-[float_5s_ease-in-out_infinite_0.5s]" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            {/* Left — Text */}
            <div className="max-w-xl">
              <Reveal>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/[0.08] text-primary text-xs font-medium mb-6 border border-primary/[0.12] backdrop-blur-sm">
                  <Sparkles size={13} />
                  <span>Gestão Clínica para Psicólogos</span>
                </div>
              </Reveal>

              <Reveal delay={80}>
                <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-serif font-semibold text-text leading-[1.18] tracking-tight">
                  O <em className="not-italic text-primary">setting</em> terapêutico{" "}
                  do seu consultório, agora também digital.
                </h1>
              </Reveal>

              <Reveal delay={160}>
                <p className="mt-5 text-base sm:text-[17px] text-text-muted leading-relaxed">
                  Prontuários, laudos, agenda e financeiro — tudo em um só lugar, seguro e em conformidade
                  com o CFP. Para que seu foco seja apenas a escuta.
                </p>
              </Reveal>

              <Reveal delay={240}>
                <div className="mt-8 flex flex-col sm:flex-row items-start gap-3">
                  <Link
                    href="/login"
                    className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dark transition-all shadow-[0_4px_16px_rgba(110,115,96,0.25)] hover:shadow-[0_6px_24px_rgba(110,115,96,0.35)] text-[15px]"
                  >
                    Começar Agora
                    <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <a
                    href="#funcionalidades"
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-text font-semibold border border-border/70 hover:border-primary/30 hover:bg-surface/60 backdrop-blur-sm transition-all text-[15px]"
                  >
                    Ver Funcionalidades
                  </a>
                </div>
              </Reveal>

              <Reveal delay={320}>
                <div className="mt-8 flex items-center gap-6 text-xs text-text-muted">
                  <div className="flex items-center gap-1.5">
                    <Shield size={13} className="text-primary" />
                    <span>Conforme LGPD</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Lock size={13} className="text-primary" />
                    <span>AES-256</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Scale size={13} className="text-primary" />
                    <span>CFP 06/2019</span>
                  </div>
                </div>
              </Reveal>
            </div>

            {/* Right — Dashboard Mockup with 3D perspective */}
            <Reveal delay={200} className="relative lg:pl-4">
              <div className="relative">
                {/* Glow behind mockup */}
                <div className="absolute -inset-6 bg-gradient-to-br from-primary/[0.08] via-transparent to-secondary/[0.06] rounded-3xl blur-2xl" />

                {/* 3D perspective container */}
                <div
                  className="relative rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.12),0_4px_16px_rgba(0,0,0,0.06)] border border-border/30 bg-surface"
                  style={{
                    transform: "perspective(1200px) rotateY(-6deg) rotateX(2deg)",
                    transformOrigin: "center center",
                  }}
                >
                  {/* Browser chrome */}
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-[#F2F0EC] border-b border-border/30">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
                      <div className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
                      <div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
                    </div>
                    <div className="flex-1 flex justify-center">
                      <div className="px-6 py-1 rounded-md bg-white/70 text-[11px] text-text-muted border border-border/30 font-mono">
                        app.psisetting.com.br
                      </div>
                    </div>
                  </div>

                  {/* Dashboard image */}
                  <Image
                    src="/dashboard-preview.jpg"
                    alt="Dashboard do PsiSetting — Gestão clínica para psicólogos"
                    width={800}
                    height={533}
                    className="w-full h-auto"
                    priority
                  />
                </div>

                {/* Floating accent cards */}
                <div
                  className="absolute -bottom-4 -left-6 bg-surface/90 backdrop-blur-xl rounded-xl shadow-lg border border-border/30 px-4 py-3 flex items-center gap-3"
                  style={{ transform: "perspective(800px) rotateY(4deg)" }}
                >
                  <div className="w-9 h-9 rounded-lg bg-success/15 flex items-center justify-center">
                    <Lock size={16} className="text-success" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-text">Criptografia AES-256</p>
                    <p className="text-[10px] text-text-muted">Dados protegidos</p>
                  </div>
                </div>

                <div
                  className="absolute -top-3 -right-4 bg-surface/90 backdrop-blur-xl rounded-xl shadow-lg border border-border/30 px-4 py-3 flex items-center gap-3"
                  style={{ transform: "perspective(800px) rotateY(-4deg)" }}
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
                    <Eye size={16} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-text">Modo Privacidade</p>
                    <p className="text-[10px] text-text-muted">Sigilo em 1 clique</p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ───────── DOR / PROBLEMA ───────── */}
      <section className="py-24 sm:py-32 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-surface/50 to-surface" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center mb-16">
              <p className="text-xs font-semibold text-secondary uppercase tracking-widest mb-3">O problema</p>
              <h2 className="text-2xl sm:text-3xl lg:text-[2.125rem] font-serif font-semibold text-text">
                A dor que você conhece bem
              </h2>
              <p className="mt-4 text-text-muted max-w-lg mx-auto text-[15px] leading-relaxed">
                O trabalho clínico já exige presença total. A burocracia não deveria competir com a escuta.
              </p>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-5">
            {painPoints.map((item, i) => (
              <Reveal key={item.title} delay={i * 100}>
                <div className="bg-surface/80 backdrop-blur-sm rounded-2xl p-7 border border-border/40 hover:border-secondary/30 hover:shadow-[0_8px_32px_rgba(0,0,0,0.06)] transition-all duration-500 group h-full">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-secondary/20 to-secondary/5 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform duration-300">
                    <item.icon size={22} className="text-secondary" strokeWidth={1.6} />
                  </div>
                  <h3 className="text-[15px] font-semibold text-text mb-2.5">{item.title}</h3>
                  <p className="text-sm text-text-muted leading-relaxed">{item.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── FUNCIONALIDADES ───────── */}
      <section id="funcionalidades" className="py-24 sm:py-32 bg-surface scroll-mt-20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/[0.03] rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-secondary/[0.04] rounded-full blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center mb-16">
              <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">Funcionalidades</p>
              <h2 className="text-2xl sm:text-3xl lg:text-[2.125rem] font-serif font-semibold text-text">
                Tudo que seu consultório precisa
              </h2>
              <p className="mt-4 text-text-muted max-w-lg mx-auto text-[15px] leading-relaxed">
                Do prontuário ao financeiro, cada módulo foi pensado por e para psicólogos.
              </p>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feat, i) => (
              <Reveal key={feat.title} delay={i * 80}>
                <div className="relative bg-background/80 backdrop-blur-sm rounded-2xl p-7 border border-border/40 hover:border-primary/20 hover:shadow-[0_12px_40px_rgba(0,0,0,0.06)] transition-all duration-500 group h-full overflow-hidden">
                  {/* Subtle gradient accent */}
                  <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${feat.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

                  <div className={`w-12 h-12 rounded-xl ${feat.iconBg} flex items-center justify-center mb-5 group-hover:scale-105 transition-transform duration-300`}>
                    <feat.icon size={22} className={feat.iconColor} strokeWidth={1.6} />
                  </div>
                  <h3 className="text-[15px] font-semibold text-text mb-2.5">{feat.title}</h3>
                  <p className="text-sm text-text-muted leading-relaxed">{feat.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── SEGURANÇA ───────── */}
      <section id="seguranca" className="py-24 sm:py-32 scroll-mt-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/[0.03]" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left text */}
            <div>
              <Reveal>
                <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">Segurança</p>
                <h2 className="text-2xl sm:text-3xl lg:text-[2.125rem] font-serif font-semibold text-text leading-tight">
                  Segurança e conformidade que você pode confiar
                </h2>
                <p className="mt-4 text-text-muted text-[15px] leading-relaxed">
                  Seus dados clínicos protegidos com o mesmo rigor ético do setting presencial.
                  Cada camada de segurança foi projetada para que você atenda com tranquilidade.
                </p>
              </Reveal>

              <Reveal delay={150}>
                <div className="mt-8 flex flex-wrap gap-3">
                  {["LGPD", "CFP", "AES-256", "RLS"].map((badge) => (
                    <span
                      key={badge}
                      className="inline-flex items-center px-3.5 py-1.5 rounded-lg bg-primary/[0.08] text-primary text-xs font-bold border border-primary/[0.12] tracking-wide"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              </Reveal>
            </div>

            {/* Right grid */}
            <div className="grid grid-cols-2 gap-3.5">
              {securityItems.map((item, i) => (
                <Reveal key={item.title} delay={i * 70}>
                  <div className="bg-surface/80 backdrop-blur-sm rounded-xl p-5 border border-border/40 hover:border-primary/20 hover:shadow-[0_8px_24px_rgba(0,0,0,0.05)] transition-all duration-400 group h-full">
                    <div className="w-10 h-10 rounded-lg bg-primary/[0.08] flex items-center justify-center mb-3 group-hover:bg-primary/[0.12] transition-colors duration-300">
                      <item.icon size={18} className="text-primary" strokeWidth={1.6} />
                    </div>
                    <h3 className="text-[13px] font-semibold text-text mb-1">{item.title}</h3>
                    <p className="text-xs text-text-muted leading-relaxed">{item.description}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────── COMO FUNCIONA ───────── */}
      <section className="py-24 sm:py-32 bg-surface relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/[0.03] rounded-full blur-3xl" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center mb-16">
              <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">Como funciona</p>
              <h2 className="text-2xl sm:text-3xl lg:text-[2.125rem] font-serif font-semibold text-text">
                Comece em 3 passos
              </h2>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-0">
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
              <Reveal key={item.step} delay={i * 120}>
                <div className="text-center relative px-6 py-6">
                  {/* Connector line */}
                  {i < 2 && (
                    <div className="hidden md:block absolute top-[52px] left-[calc(50%+40px)] w-[calc(100%-80px)] h-px bg-gradient-to-r from-primary/20 to-primary/5" />
                  )}
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary mb-5 mx-auto border border-primary/10 shadow-[0_4px_16px_rgba(110,115,96,0.1)]">
                    <span className="text-xl font-serif font-bold">{item.step}</span>
                  </div>
                  <h3 className="text-base font-semibold text-text mb-2">{item.title}</h3>
                  <p className="text-sm text-text-muted leading-relaxed max-w-[220px] mx-auto">{item.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── PREÇO ───────── */}
      <section id="preco" className="py-24 sm:py-32 scroll-mt-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-primary/[0.03]" />
        <div className="absolute top-20 right-[10%] w-2 h-2 rounded-full bg-primary/15 animate-[float_6s_ease-in-out_infinite]" />
        <div className="absolute bottom-20 left-[15%] w-3 h-3 rounded-full bg-secondary/15 animate-[float_8s_ease-in-out_infinite_1s]" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center mb-16">
              <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">Preço</p>
              <h2 className="text-2xl sm:text-3xl lg:text-[2.125rem] font-serif font-semibold text-text">
                Um plano. Tudo incluso.
              </h2>
              <p className="mt-4 text-text-muted max-w-lg mx-auto text-[15px] leading-relaxed">
                Sem surpresas, sem funcionalidades bloqueadas. Acesso completo a todas as ferramentas.
              </p>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="max-w-md mx-auto">
              <div className="relative bg-surface rounded-2xl border border-primary/20 p-8 sm:p-10 shadow-[0_16px_48px_rgba(110,115,96,0.1),0_4px_12px_rgba(0,0,0,0.04)] overflow-hidden">
                {/* Top gradient accent */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/60 via-primary to-primary/60" />

                {/* Badge */}
                <div className="flex justify-center mb-6">
                  <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/15">
                    <Sparkles size={12} />
                    Profissional
                  </span>
                </div>

                <div className="text-center mb-8">
                  <div className="flex items-baseline justify-center gap-1 mb-2">
                    <span className="text-sm text-text-muted font-medium">R$</span>
                    <span className="text-5xl sm:text-6xl font-serif font-bold text-text tracking-tight">49</span>
                    <span className="text-xl font-serif font-semibold text-text">,90</span>
                  </div>
                  <p className="text-sm text-text-muted">
                    por mês · cancele quando quiser
                  </p>
                </div>

                <div className="space-y-3.5 mb-8">
                  {planFeatures.map((feat) => (
                    <div key={feat} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-success/15 flex items-center justify-center shrink-0 mt-0.5">
                        <CheckCircle2 size={13} className="text-success" />
                      </div>
                      <span className="text-sm text-text leading-snug">{feat}</span>
                    </div>
                  ))}
                </div>

                <Link
                  href="/login"
                  className="group flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dark transition-all shadow-[0_4px_16px_rgba(110,115,96,0.25)] hover:shadow-[0_6px_24px_rgba(110,115,96,0.35)] text-[15px]"
                >
                  Começar Agora
                  <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
                </Link>

                <p className="text-center text-xs text-text-muted mt-4">
                  Sem fidelidade · Sem cartão para testar · Cancele a qualquer momento
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section id="faq" className="py-24 sm:py-32 bg-surface scroll-mt-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center mb-14">
              <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">FAQ</p>
              <h2 className="text-2xl sm:text-3xl font-serif font-semibold text-text">
                Perguntas Frequentes
              </h2>
            </div>
          </Reveal>

          <div>
            {faqItems.map((item, i) => (
              <FAQItem key={item.question} question={item.question} answer={item.answer} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ───────── CTA FINAL ───────── */}
      <section className="py-24 sm:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.06] via-transparent to-secondary/[0.05]" />
        <div className="absolute top-10 left-[20%] w-2 h-2 rounded-full bg-primary/20 animate-[float_6s_ease-in-out_infinite]" />
        <div className="absolute bottom-10 right-[20%] w-2.5 h-2.5 rounded-full bg-secondary/20 animate-[float_7s_ease-in-out_infinite_1.5s]" />

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Reveal>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary mb-6 border border-primary/10 shadow-[0_4px_16px_rgba(110,115,96,0.1)]">
              <span className="text-2xl font-serif font-bold">Ψ</span>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="text-2xl sm:text-3xl lg:text-[2.125rem] font-serif font-semibold text-text leading-tight">
              Comece a transformar sua prática clínica hoje.
            </h2>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-5 text-text-muted max-w-lg mx-auto text-[15px] leading-relaxed">
              Junte-se a psicólogos que já escolheram um setting digital seguro, ético e acolhedor.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-8">
              <Link
                href="/login"
                className="group inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dark transition-all shadow-[0_4px_16px_rgba(110,115,96,0.25)] hover:shadow-[0_8px_32px_rgba(110,115,96,0.35)] text-[15px]"
              >
                Criar Minha Conta
                <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────── FOOTER ───────── */}
      <footer className="border-t border-border/30 py-12 bg-surface/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex flex-col items-center sm:items-start gap-3">
              <PsiSettingBrand size="sm" showSubtitle={true} subtitleText="Gestão Clínica" />
              <div className="flex items-center gap-2">
                {[
                  { icon: Shield, label: "LGPD" },
                  { icon: Scale, label: "CFP" },
                ].map(({ icon: Icon, label }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/[0.06] text-primary text-[10px] font-bold border border-primary/10"
                  >
                    <Icon size={10} />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-6 text-xs text-text-muted">
              <a href="#" className="hover:text-text transition-colors">Termos de Uso</a>
              <a href="#" className="hover:text-text transition-colors">Privacidade</a>
              <a href="mailto:contato@psisetting.com.br" className="hover:text-text transition-colors">Contato</a>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-border/20 text-center">
            <p className="text-[11px] text-text-muted/70">
              © {new Date().getFullYear()} PsiSetting. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>

      {/* ───────── CUSTOM KEYFRAMES ───────── */}
      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
      `}</style>
    </>
  );
}
