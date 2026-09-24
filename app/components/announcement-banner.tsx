"use client";

import { useEffect, useState } from "react";
import { Sparkles, AlertCircle, Info, CheckCircle2, ArrowRight, X } from "lucide-react";

interface Announcement {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "tip";
  link_url?: string | null;
  link_label?: string | null;
}

export function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    async function loadAnnouncement() {
      try {
        if (typeof window !== "undefined") {
          const cached = sessionStorage.getItem("cached_announcement");
          const cachedAt = sessionStorage.getItem("cached_announcement_at");
          if (cached && cachedAt && Date.now() - Number(cachedAt) < 120000) {
            const first = JSON.parse(cached);
            if (first?.id && !sessionStorage.getItem(`dismissed_announcement_${first.id}`)) {
              setAnnouncement(first);
            }
            return;
          }
        }

        const res = await fetch("/api/announcements");
        if (res.ok) {
          const data = await res.json();
          if (data.announcements && data.announcements.length > 0) {
            const first = data.announcements[0];
            if (typeof window !== "undefined") {
              sessionStorage.setItem("cached_announcement", JSON.stringify(first));
              sessionStorage.setItem("cached_announcement_at", Date.now().toString());
            }
            const dismissedKey = `dismissed_announcement_${first.id}`;
            if (!sessionStorage.getItem(dismissedKey)) {
              setAnnouncement(first);
            }
          }
        }
      } catch {
        // Silently ignore if not available
      }
    }
    loadAnnouncement();
  }, []);

  if (!announcement || dismissed) return null;

  function handleDismiss() {
    if (announcement) {
      sessionStorage.setItem(`dismissed_announcement_${announcement.id}`, "true");
    }
    setDismissed(true);
  }

  const typeStyles = {
    info: {
      bg: "bg-gradient-to-r from-blue-500/10 via-primary/10 to-blue-500/10 border-blue-500/20 text-blue-900",
      icon: Info,
      iconColor: "text-blue-600",
    },
    success: {
      bg: "bg-gradient-to-r from-emerald-500/10 via-primary/10 to-emerald-500/10 border-emerald-500/20 text-emerald-950",
      icon: CheckCircle2,
      iconColor: "text-emerald-600",
    },
    warning: {
      bg: "bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-amber-500/15 border-amber-500/30 text-amber-950",
      icon: AlertCircle,
      iconColor: "text-amber-600",
    },
    tip: {
      bg: "bg-gradient-to-r from-primary/15 via-secondary/20 to-primary/15 border-primary/30 text-text",
      icon: Sparkles,
      iconColor: "text-primary",
    },
  };

  const currentType = typeStyles[announcement.type] || typeStyles.info;
  const Icon = currentType.icon;

  return (
    <div
      className={`border-b px-4 py-2 text-xs shadow-2xs transition-all animate-fadeIn ${currentType.bg}`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Icon size={15} className={`shrink-0 ${currentType.iconColor}`} />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
            <span className="font-bold">{announcement.title}:</span>
            <span className="text-text-muted">{announcement.message}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {announcement.link_url && (
            <a
              href={announcement.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
            >
              <span>{announcement.link_label || "Saiba mais"}</span>
              <ArrowRight size={12} />
            </a>
          )}

          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 rounded-md text-text-muted hover:text-text hover:bg-black/5 transition-colors cursor-pointer"
            title="Fechar aviso"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
