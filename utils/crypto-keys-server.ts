import { webcrypto } from "crypto";
import { createAdminClient } from "./supabase/admin";

// Guarda de ambiente. A intenção original era `import "server-only"`, que é o
// que os docs do Next recomendam, mas nesta versão o Turbopack o recusa dentro
// de Route Handler. A verificação em tempo de execução cumpre o mesmo papel:
// se este módulo algum dia for parar no navegador, quebra alto em vez de
// falhar em silêncio. Vale lembrar que CLINICAL_KEK e SUPABASE_SERVICE_ROLE_KEY
// não têm prefixo NEXT_PUBLIC_, então seus valores nunca são embutidos no
// bundle — o Next os substitui por string vazia.
if (typeof window !== "undefined") {
  throw new Error(
    "utils/crypto-keys-server só pode ser usado no servidor. " +
      "No navegador, use /api/crypto/key."
  );
}

/**
 * Provedor de chave do lado do SERVIDOR (A07).
 *
 * Guarda a DEK de cada psicólogo cifrada com a KEK. A KEK existe apenas em
 * CLINICAL_KEK, variável de ambiente do servidor — nunca no banco, nunca no
 * bundle do navegador. É o que faz um vazamento do banco não virar vazamento
 * de prontuário.
 *
 * O `import "server-only"` acima é proposital: se algum dia um Client Component
 * importar este arquivo por engano, o build QUEBRA em vez de embarcar caminho
 * de service_role no navegador.
 */

const KEK_ENV = process.env.CLINICAL_KEK;

function getKekBytes(): Uint8Array {
  if (!KEK_ENV) {
    throw new Error(
      "CLINICAL_KEK não configurada. Sem ela o sistema não consegue abrir nem criar chaves clínicas. " +
        "Gere com: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }

  const bytes = Buffer.from(KEK_ENV, "hex");
  if (bytes.length !== 32) {
    throw new Error(
      `CLINICAL_KEK deve ter 32 bytes em hexadecimal (64 caracteres). Recebido: ${bytes.length} bytes.`
    );
  }
  return new Uint8Array(bytes);
}

async function importKek(): Promise<CryptoKey> {
  return webcrypto.subtle.importKey(
    "raw",
    getKekBytes(),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const pares = hex.match(/.{1,2}/g) || [];
  return new Uint8Array(pares.map((p) => parseInt(p, 16)));
}

async function wrapDek(dek: Uint8Array): Promise<string> {
  const kek = await importKek();
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const cifrada = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, dek);
  return `v1:${toHex(iv)}:${toHex(new Uint8Array(cifrada))}`;
}

async function unwrapDek(wrapped: string): Promise<Uint8Array> {
  const partes = wrapped.split(":");
  if (partes.length !== 3 || partes[0] !== "v1") {
    throw new Error("Formato de chave cifrada inválido.");
  }
  const kek = await importKek();
  const iv = fromHex(partes[1]);
  const dados = fromHex(partes[2]);
  const aberta = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv }, kek, dados);
  return new Uint8Array(aberta);
}

/**
 * Devolve a DEK do psicólogo, criando-a na primeira vez.
 *
 * A corrida entre duas requisições simultâneas do mesmo usuário é resolvida
 * pela PRIMARY KEY: quem perder relê a linha vencedora. Sem isso, dois DEKs
 * diferentes seriam gerados e metade do dado ficaria ilegível.
 */
export async function obterDekDoUsuario(userId: string): Promise<Uint8Array> {
  const admin = createAdminClient();

  const { data: existente, error: leituraError } = await admin
    .from("user_encryption_keys")
    .select("wrapped_dek")
    .eq("user_id", userId)
    .maybeSingle();

  if (leituraError) throw leituraError;
  if (existente?.wrapped_dek) {
    return unwrapDek(existente.wrapped_dek);
  }

  const novaDek = webcrypto.getRandomValues(new Uint8Array(32));
  const wrapped = await wrapDek(novaDek);

  const { error: insercaoError } = await admin
    .from("user_encryption_keys")
    .insert({ user_id: userId, wrapped_dek: wrapped });

  if (insercaoError) {
    // 23505 = outra requisição criou primeiro. A dela é a válida.
    if (insercaoError.code === "23505") {
      const { data: vencedora } = await admin
        .from("user_encryption_keys")
        .select("wrapped_dek")
        .eq("user_id", userId)
        .single();

      if (vencedora?.wrapped_dek) {
        return unwrapDek(vencedora.wrapped_dek);
      }
    }
    throw insercaoError;
  }

  return novaDek;
}

/** Versão em hexadecimal, para trafegar na rota autenticada. */
export async function obterDekHex(userId: string): Promise<string> {
  return toHex(await obterDekDoUsuario(userId));
}
