"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { limparCacheDeChaves } from "@/utils/crypto";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // A chave clínica vive em memória (A07). Ao sair, ela some junto — do
    // contrário continuaria acessível a quem assumisse a aba em seguida.
    limparCacheDeChaves();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                 text-text-muted hover:text-danger hover:bg-danger/5
                 transition-all duration-200 cursor-pointer"
      aria-label="Sair do sistema"
    >
      <LogOut size={18} strokeWidth={1.5} />
      Sair
    </button>
  );
}
