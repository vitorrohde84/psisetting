import { createClient } from "./client";

/**
 * Uploads a PDF to the 'laudos' private bucket with multi-tenant isolation.
 * The path will be: {user_id}/{paciente_id}/{timestamp}-{filename}
 */
export async function uploadLaudoPdf(
  file: File,
  pacienteId: string
): Promise<{ path: string | null; error: string | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { path: null, error: "Usuário não autenticado." };
  }

  const fileExt = file.name.split(".").pop();
  const timestamp = Date.now();
  const cleanName = file.name
    .replace(/[^a-zA-Z0-9.-]/g, "_")
    .replace(`.${fileExt}`, "");
  const filePath = `${user.id}/${pacienteId}/${timestamp}-${cleanName}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from("laudos")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.error("Upload error:", error);
    return { path: null, error: error.message };
  }

  return { path: data.path, error: null };
}

/**
 * Generates a signed URL for a file in the 'laudos' bucket.
 * The URL expires in 10 minutes (600 seconds) to ensure security.
 */
export async function getLaudoSignedUrl(
  filePath: string
): Promise<{ signedUrl: string | null; error: string | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { signedUrl: null, error: "Usuário não autenticado." };
  }

  // A04 — defesa em profundidade. A policy do Storage já exige que a primeira
  // pasta seja o auth.uid(), mas esta função aceitava caminho arbitrário e era
  // a rota de exploração pronta caso a policy voltasse a afrouxar (o que já
  // aconteceu uma vez, por reexecução de script). Validar aqui custa nada.
  if (!filePath || !filePath.startsWith(`${user.id}/`)) {
    return { signedUrl: null, error: "Caminho de arquivo inválido." };
  }

  const { data, error } = await supabase.storage
    .from("laudos")
    .createSignedUrl(filePath, 600); // 10 minutes

  if (error) {
    console.error("Signed URL error:", error);
    return { signedUrl: null, error: error.message };
  }

  return { signedUrl: data.signedUrl, error: null };
}

