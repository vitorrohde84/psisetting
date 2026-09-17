import { createClient } from "@/utils/supabase/server";

export const DEFAULT_ADMIN_EMAILS = [
  "vitorrohde84@gmail.com",
  "psihellenlimberger@gmail.com",
  "hellenlimberger@gmail.com",
];

/**
 * Verifica se um e-mail ou perfil possui privilégios de administrador
 */
export function isEmailAdmin(email?: string | null): boolean {
  if (!email) return false;
  
  const envEmails = (process.env.ADMIN_EMAILS || "")
    .toLowerCase()
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  const allAdminEmails = Array.from(
    new Set([...DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase()), ...envEmails])
  );

  return allAdminEmails.includes(email.toLowerCase());
}

/**
 * Autentica o usuário atual e valida se ele é administrador
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { isAdmin: false, user: null, profile: null, error: "Não autenticado." };
  }

  // Buscar perfil para verificar a flag is_admin.
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // O e-mail considerado é SEMPRE o de auth.users (user.email), validado pelo
  // servidor de auth. A coluna profiles.email é editável pelo próprio usuário
  // e, se confiada aqui, permite forjar identidade de administrador.
  // Ver A01 em docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md.
  const isAdmin = Boolean(profile?.is_admin) || isEmailAdmin(user.email);

  if (!isAdmin) {
    return { isAdmin: false, user, profile, error: "Acesso negado. Apenas administradores." };
  }

  return { isAdmin: true, user, profile, error: null };
}
