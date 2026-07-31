"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { LogoutButton } from "@/app/components/logout-button";
import {
  LayoutDashboard,
  Users,
  Calendar,
  FileText,
  BookOpen,
  FileCheck,
  DollarSign,
  Menu,
  X,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Pacientes", href: "/pacientes", icon: Users },
  { label: "Agenda", href: "/agenda", icon: Calendar },
  { label: "Prontuários", href: "/prontuarios", icon: FileText },
  { label: "Diário de Bordo", href: "/diario-bordo", icon: BookOpen },
  { label: "Laudos", href: "/laudos", icon: FileCheck },
  { label: "Financeiro", href: "/financeiro", icon: DollarSign },
];

interface SidebarProps {
  userName: string;
  userEmail: string;
}

export function Sidebar({ userName, userEmail }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-surface border-b border-border flex items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-transparent overflow-hidden shrink-0">
            <img src="/logo1.png" alt="Hellen Limberger Logo" className="w-full h-full object-cover" />
          </div>
          <span className="text-sm font-serif font-semibold text-text">Hellen Limberger</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-lg text-text-muted hover:bg-background transition-colors cursor-pointer"
          aria-label="Abrir menu"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-text/20 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-40 h-full w-64 bg-surface border-r border-border
          flex flex-col
          transition-transform duration-300 ease-in-out
          lg:translate-x-0 lg:static lg:z-auto
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Logo / Brand */}
        <div className="p-5 pb-4 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-transparent overflow-hidden shrink-0">
              <img src="/logo1.png" alt="Hellen Limberger Logo" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-serif font-semibold text-text leading-tight truncate">
                Hellen Limberger
              </h1>
              <p className="text-[11px] text-text-muted truncate">Sistema de Gestão</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                  transition-all duration-200
                  ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-text-muted hover:bg-background hover:text-text"
                  }
                `}
              >
                <Icon size={18} strokeWidth={active ? 2 : 1.5} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User info + Logout */}
        <div className="p-3 border-t border-border/60">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary/10 shrink-0">
              <span className="text-xs font-semibold text-secondary">
                {userName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text truncate">{userName}</p>
              <p className="text-[11px] text-text-muted truncate">{userEmail}</p>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>
    </>
  );
}
