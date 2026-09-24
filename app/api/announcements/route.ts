import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ announcements: [] });
    }

    const adminClient = createAdminClient();

    const { data: announcements, error } = await adminClient
      .from("system_announcements")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      // Tabela pode ainda não ter sido criada
      return NextResponse.json({ announcements: [] });
    }

    return NextResponse.json({ announcements: announcements || [] });
  } catch (err: unknown) {
    console.error("Erro ao buscar comunicados públicos:", err);
    return NextResponse.json({ announcements: [] });
  }
}
