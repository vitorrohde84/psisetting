"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { LogoutButton } from "@/app/components/logout-button";
import { PrivacyToggle } from "@/app/components/privacy-toggle";
import { PsiSettingBrand } from "@/app/components/psi-setting-brand";
import { FeedbackModal } from "@/app/components/feedback-modal";
import {
  LayoutDashboard,
  Users,
  Calendar,
  FileText,
  BookOpen,
  FileCheck,
  DollarSign,
  Settings,
  Menu,
  X,
  ChevronRight,
  Lightbulb,
  ShieldAlert,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Pacientes", href: "/pacientes", icon: Users },
  { label: "Agenda", href: "/agenda", icon: Calendar },
  { label: "Prontuários", href: "/prontuarios", icon: FileText },
  { label: "Diário de Bordo", href: "/diario-bordo", icon: BookOpen },
  { label: "Laudos", href: "/laudos", icon: FileCheck },
  { label: "Financeiro", href: "/financeiro", icon: DollarSign },
  { label: "Configurações", href: "/configuracoes", icon: Settings },
];

interface SidebarProps {
  userName: string;
  userEmail: string;
  logoUrl: string | null;
  isAdmin?: boolean;
}

export function Sidebar({ userName, userEmail, logoUrl, isAdmin = false }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevent background scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  // Generate initials for fallback avatar
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      {/* ===== BARRA SUPERIOR MOBILE (h-14) ===== */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-surface/95 backdrop-blur-md border-b border-border flex items-center justify-between px-4">
        {/* Lado Esquerdo: Branding do Sistema */}
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <PsiSettingBrand size="sm" showIcon={true} showSubtitle={false} />
        </Link>

        {/* Lado Direito: Botão Privacidade + Botão Hambúrguer */}
        <div className="flex items-center gap-2 shrink-0">
          <PrivacyToggle 
            className="p-2 rounded-xl bg-background border border-border text-text-muted hover:text-text active:scale-95 transition-all cursor-pointer"
            size={18}
          />
          
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-xl bg-background border border-border text-text-muted hover:text-text active:scale-95 transition-all cursor-pointer flex items-center justify-center"
            aria-label="Abrir menu de navegação"
          >
            <Menu size={20} />
          </button>
        </div>
      </div>

      {/* ===== OVERLAY MOBILE ===== */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-[65] bg-stone-900/40 backdrop-blur-xs transition-opacity animate-fadeIn"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ===== SIDEBAR / GAVETA MOBILE ===== */}
      <aside
        className={`
          fixed top-0 left-0 z-[70] h-full w-72 max-w-[85vw] bg-surface border-r border-border
          flex flex-col shadow-2xl
          transition-transform duration-300 ease-out
          lg:translate-x-0 lg:static lg:z-auto lg:w-64 lg:shadow-none
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Topo da Sidebar: Branding Oficial do PsiSetting */}
        <div className="p-5 pb-4 border-b border-border/60 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 min-w-0 group">
            <PsiSettingBrand size="md" showIcon={true} showSubtitle={true} subtitleText="Gestão Clínica" />
          </Link>

          {/* Botão Fechar no celular */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-2 rounded-xl text-text-muted hover:bg-background active:scale-95 transition-all cursor-pointer"
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Links de Navegação */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`
                  flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium
                  transition-all duration-200
                  ${
                    active
                      ? "bg-primary/10 text-primary font-semibold shadow-xs"
                      : "text-text-muted hover:bg-background hover:text-text"
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <Icon size={19} strokeWidth={active ? 2.2 : 1.6} />
                  <span>{item.label}</span>
                </div>
                {active && <ChevronRight size={14} className="text-primary" />}
              </Link>
            );
          })}

          {/* Botão de Feedback & Sugestões */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                setFeedbackOpen(true);
              }}
              className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-semibold text-amber-900 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 transition-all cursor-pointer shadow-2xs group"
            >
              <div className="flex items-center gap-2.5">
                <Lightbulb size={16} className="text-amber-700 group-hover:scale-110 transition-transform" />
                <span>Sugestões & Feedbacks</span>
              </div>
              <span className="text-[10px] bg-amber-600/20 text-amber-950 px-1.5 py-0.5 rounded-md font-bold">
                Novo
              </span>
            </button>
          </div>

          {/* Link Exclusivo para Administradores */}
          {isAdmin && (
            <div className="pt-1">
              <Link
                href="/admin"
                onClick={() => setMobileOpen(false)}
                className={`
                  w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-bold
                  transition-all shadow-2xs
                  ${
                    pathname.startsWith("/admin")
                      ? "bg-stone-900 text-white shadow-md"
                      : "text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-300"
                  }
                `}
              >
                <div className="flex items-center gap-2.5">
                  <ShieldAlert size={15} className={pathname.startsWith("/admin") ? "text-amber-400" : "text-stone-800"} />
                  <span>Painel Admin SaaS</span>
                </div>
                <span className="text-[9px] uppercase tracking-wider bg-amber-500/20 text-amber-950 px-1.5 py-0.5 rounded-sm font-black">
                  Admin
                </span>
              </Link>
            </div>
          )}
        </nav>

        {/* Rodapé da Sidebar: Perfil Personalizado do Usuário + Logout */}
        <div className="p-3 border-t border-border/60 bg-background/30 space-y-2">
          <Link
            href="/configuracoes"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface border border-transparent hover:border-border/60 transition-all group"
            title="Acessar Configurações e Perfil"
          >
            {logoUrl ? (
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-surface border border-border/70 overflow-hidden shrink-0 shadow-xs">
                <img src={logoUrl} alt={`${userName} Logo`} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-secondary/15 border border-secondary/20 shrink-0">
                <span className="text-xs font-semibold text-secondary">
                  {initials}
                </span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-text truncate group-hover:text-primary transition-colors">
                {userName}
              </p>
              <p className="text-[10.5px] text-text-muted truncate">{userEmail}</p>
            </div>
          </Link>
          <LogoutButton />
        </div>
      </aside>

      {/* Modal de Feedbacks */}
      <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

      {/* ===== BARRA INFERIOR MOBILE (Tab Bar) ===== */}
      <nav 
        aria-label="Navegação rápida mobile"
        className="no-print lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-md border-t border-border flex items-center justify-around py-1.5 px-2 shadow-lg"
      >
        <Link
          href="/"
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl text-[10px] font-medium transition-colors ${
            isActive("/") ? "text-primary font-bold" : "text-text-muted hover:text-text"
          }`}
        >
          <LayoutDashboard size={19} strokeWidth={isActive("/") ? 2.3 : 1.6} />
          <span>Início</span>
        </Link>

        <Link
          href="/pacientes"
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl text-[10px] font-medium transition-colors ${
            isActive("/pacientes") ? "text-primary font-bold" : "text-text-muted hover:text-text"
          }`}
        >
          <Users size={19} strokeWidth={isActive("/pacientes") ? 2.3 : 1.6} />
          <span>Pacientes</span>
        </Link>

        <Link
          href="/agenda"
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl text-[10px] font-medium transition-colors ${
            isActive("/agenda") ? "text-primary font-bold" : "text-text-muted hover:text-text"
          }`}
        >
          <Calendar size={19} strokeWidth={isActive("/agenda") ? 2.3 : 1.6} />
          <span>Agenda</span>
        </Link>

        <Link
          href="/laudos"
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl text-[10px] font-medium transition-colors ${
            isActive("/laudos") ? "text-primary font-bold" : "text-text-muted hover:text-text"
          }`}
        >
          <FileCheck size={19} strokeWidth={isActive("/laudos") ? 2.3 : 1.6} />
          <span>Laudos</span>
        </Link>

        <button
          onClick={() => setMobileOpen(true)}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl text-[10px] font-medium transition-colors cursor-pointer ${
            mobileOpen ? "text-primary font-bold" : "text-text-muted hover:text-text"
          }`}
        >
          <Menu size={19} strokeWidth={1.6} />
          <span>Menu</span>
        </button>
      </nav>
    </>
  );
}
