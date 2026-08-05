import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { Sidebar } from "@/app/components/sidebar";
import { SessionMonitor } from "@/app/components/session-monitor";
import { PrivacyToggle } from "@/app/components/privacy-toggle";

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

  // Fetch profile with logo_url
  const { data: profile } = await supabase
    .from("profiles")
    .select("nome, logo_url")
    .eq("id", user.id)
    .single();

  const userName = profile?.nome || user.email?.split("@")[0] || "Usuário";
  const userEmail = user.email || "";

  // Construct public logo URL if available
  const logoUrl = profile?.logo_url
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${profile.logo_url}`
    : null;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar userName={userName} userEmail={userEmail} logoUrl={logoUrl} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Spacer for mobile top bar */}
        <div className="lg:hidden h-14 shrink-0" />

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>

      <PrivacyToggle />
      <SessionMonitor />
    </div>
  );
}
