import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { obterDekHex } from "@/utils/crypto-keys-server";

/**
 * Entrega ao psicólogo autenticado a SUA chave de dados (DEK).
 *
 * A07 — docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
 *
 * Substitui o segredo único que era embutido no bundle e valia para todo
 * mundo. Aqui cada sessão recebe exclusivamente a chave do próprio usuário, e
 * só depois de autenticar.
 *
 * Adversário × propriedade:
 *   ✓ quem obtiver o banco não decifra nada (a KEK não está lá)
 *   ✓ um psicólogo não alcança a chave de outro
 *   ✗ quem já controla a sessão do psicólogo alcança os dados dele — é o
 *     mesmo acesso que ele teria pela tela, então não é regressão
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const dek = await obterDekHex(user.id);

    return NextResponse.json(
      { key: dek },
      {
        headers: {
          // Nenhum intermediário guarda material de chave.
          "Cache-Control": "no-store, no-cache, must-revalidate, private",
          Pragma: "no-cache",
        },
      }
    );
  } catch (err) {
    console.error("[crypto/key] falha ao obter chave do usuário:", err);
    return NextResponse.json(
      { error: "Não foi possível obter a chave de criptografia." },
      { status: 500 }
    );
  }
}
