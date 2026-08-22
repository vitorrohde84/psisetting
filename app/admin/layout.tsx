import { redirect } from "next/navigation";
import { requireAdmin } from "@/utils/admin-auth";

export const metadata = {
  title: "Admin Central | PsiSetting SaaS",
  description: "Painel de inteligência, métricas e gestão do SaaS PsiSetting.",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await requireAdmin();

  if (!auth.isAdmin) {
    // Se o usuário não for admin, redireciona silenciosamente para a home
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[#F5F2EC] text-text font-sans antialiased selection:bg-primary/20">
      {children}
    </div>
  );
}
