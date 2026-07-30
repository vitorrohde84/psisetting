import { createClient } from "./client";

/**
 * Uploads a PDF to the 'laudos' private bucket.
 * The path will be: {paciente_id}/{timestamp}-{filename}
 */
export async function uploadLaudoPdf(
  file: File,
  pacienteId: string
): Promise<{ path: string | null; error: string | null }> {
  const supabase = createClient();
  const fileExt = file.name.split(".").pop();
  const timestamp = Date.now();
  const cleanName = file.name
    .replace(/[^a-zA-Z0-9.-]/g, "_")
    .replace(`.${fileExt}`, "");
  const filePath = `${pacienteId}/${timestamp}-${cleanName}.${fileExt}`;

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
  const { data, error } = await supabase.storage
    .from("laudos")
    .createSignedUrl(filePath, 600); // 10 minutes

  if (error) {
    console.error("Signed URL error:", error);
    return { signedUrl: null, error: error.message };
  }

  return { signedUrl: data.signedUrl, error: null };
}
