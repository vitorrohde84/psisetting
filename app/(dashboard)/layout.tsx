import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { Sidebar } from "@/app/components/sidebar";
import { SessionMonitor } from "@/app/components/session-monitor";
import { SubscriptionProvider } from "@/utils/subscription-context";
import { SubscriptionBanner } from "@/app/components/subscription-banner";
import { SubscriptionModal } from "@/app/components/subscription-modal";
import { AnnouncementBanner } from "@/app/components/announcement-banner";
import { isEmailAdmin } from "@/utils/admin-auth";
import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch profile with logo_url, crp, and is_admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("nome, crp, logo_url, is_admin")
    .eq("id", user.id)
    .single();

  const userName = profile?.nome || user.email?.split("@")[0] || "Profissional";
  const userEmail = user.email || "";
  const isProfileIncomplete = !profile?.crp || !profile?.nome;
  const isAdmin = Boolean(profile?.is_admin) || isEmailAdmin(user.email);

  // Construct public logo URL if available
  const logoUrl = profile?.logo_url
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${profile.logo_url}`
    : null;

  return (
    <SubscriptionProvider>
      <div className="flex min-h-screen bg-background">
        <Sidebar userName={userName} userEmail={userEmail} logoUrl={logoUrl} isAdmin={isAdmin} />

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Spacer for mobile top bar */}
          <div className="lg:hidden h-14 shrink-0" />

          {/* Comunicado Global do Administrador (Broadcast) */}
          <div className="no-print">
            <AnnouncementBanner />
          </div>

          {/* Banner de Assinatura / Modo Somente Leitura */}
          <div className="no-print">
            <SubscriptionBanner />
          </div>

          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:py-8 lg:pb-8">
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Onboarding Banner sutil se o perfil estiver incompleto */}
              {isProfileIncomplete && (
                <div className="no-print bg-primary/10 border border-primary/20 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2.5 text-text">
                    <div className="p-2 rounded-xl bg-primary/15 text-primary shrink-0">
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <p className="font-medium text-text">
                        Configure seu perfil profissional (CRP e Logotipo)
                      </p>
                      <p className="text-xs text-text-muted">
                        Seus laudos e recibos serão gerados automaticamente com seus dados profissionais.
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/configuracoes"
                    className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-all cursor-pointer shadow-xs"
                  >
                    <span>Completar Perfil</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
              )}

              {children}
            </div>
          </main>
        </div>

        <SessionMonitor />
        <SubscriptionModal />
      </div>
    </SubscriptionProvider>
  );
}
