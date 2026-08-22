"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PsiSettingBrand } from "@/app/components/psi-setting-brand";
import {
  TrendingUp,
  Users,
  Tag,
  AlertTriangle,
  Radio,
  Lightbulb,
  ArrowLeft,
  Crown,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";

export type AdminTabType = "overview" | "users" | "coupons" | "churn" | "announcements" | "feedbacks";

interface AdminSidebarProps {
  activeTab: AdminTabType;
  onSelectTab: (tab: AdminTabType) => void;
  counts: {
    users: number;
    coupons: number;
    atRisk: number;
    announcements: number;
    feedbacks: number;
  };
}

export function AdminSidebar({ activeTab, onSelectTab, counts }: AdminSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Prevent scroll when mobile drawer is open
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

  const navItems: { id: AdminTabType; label: string; icon: any; count?: number; badgeColor?: string }[] = [
    { id: "overview", label: "Visão Geral & Métricas", icon: TrendingUp },
    { id: "users", label: "Psicólogos & Contas", icon: Users, count: counts.users },
    { id: "coupons", label: "Cupons & Campanhas", icon: Tag, count: counts.coupons },
    {
      id: "churn",
      label: "Radar de Retenção",
      icon: AlertTriangle,
      count: counts.atRisk,
      badgeColor: counts.atRisk > 0 ? "bg-amber-100 text-amber-900 font-bold" : undefined,
    },
    { id: "announcements", label: "Comunicados Globais", icon: Radio, count: counts.announcements },
    {
      id: "feedbacks",
      label: "Central de Feedbacks",
      icon: Lightbulb,
      count: counts.feedbacks,
      badgeColor: counts.feedbacks > 0 ? "bg-primary/15 text-primary font-bold" : undefined,
    },
  ];

  return (
    <>
      {/* Top Bar Mobile */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-surface/95 backdrop-blur-md border-b border-border/80 flex items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <PsiSettingBrand size="sm" showIcon={true} showSubtitle={false} />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-xl bg-background border border-border text-text-muted hover:text-text cursor-pointer"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-[65] bg-stone-900/40 backdrop-blur-xs animate-fadeIn"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Principal */}
      <aside
        className={`
          fixed top-0 left-0 z-[70] h-full w-72 max-w-[85vw] bg-surface border-r border-border/80
          flex flex-col shadow-2xl transition-transform duration-300 ease-out
          lg:translate-x-0 lg:static lg:z-auto lg:w-64 lg:shadow-none
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Header da Sidebar */}
        <div className="p-5 pb-4 border-b border-border/60 flex items-center justify-between">
          <div>
            <PsiSettingBrand size="md" showIcon={true} showSubtitle={true} subtitleText="Gestão Executiva" />
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-text-muted hover:bg-background cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Links de Navegação */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <p className="px-3.5 pb-2 text-[10.5px] font-bold uppercase tracking-wider text-text-muted">
            Painel Administrativo
          </p>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isSelected = activeTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  setMobileOpen(false);
                }}
                className={`
                  w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold
                  transition-all duration-200 cursor-pointer
                  ${
                    isSelected
                      ? "bg-primary/10 text-primary font-bold shadow-2xs"
                      : "text-text-muted hover:bg-background hover:text-text"
                  }
                `}
              >
                <div className="flex items-center gap-2.5">
                  <Icon size={17} strokeWidth={isSelected ? 2.2 : 1.8} className={isSelected ? "text-primary" : "text-text-muted"} />
                  <span>{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {item.count !== undefined && item.count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        item.badgeColor || (isSelected ? "bg-primary text-white" : "bg-border text-text-muted")
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                  {isSelected && <ChevronRight size={13} className="text-primary" />}
                </div>
              </button>
            );
          })}
        </nav>

        {/* Rodapé: Voltar ao Consultório */}
        <div className="p-3 border-t border-border/60 bg-background/30 space-y-2">
          <Link
            href="/"
            className="w-full flex items-center justify-between p-2.5 rounded-xl bg-surface hover:bg-background border border-border/80 text-text hover:text-primary transition-all text-xs font-semibold group shadow-2xs"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary group-hover:scale-105 transition-transform">
                <ArrowLeft size={14} />
              </div>
              <div className="text-left">
                <p className="font-bold text-xs text-text group-hover:text-primary">Modo Consultório</p>
                <p className="text-[10px] text-text-muted">Voltar para a área clínica</p>
              </div>
            </div>
            <ChevronRight size={14} className="text-text-muted group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </aside>
    </>
  );
}
