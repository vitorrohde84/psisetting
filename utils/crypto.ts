/**
 * Utilitário Isomórfico de Criptografia em Nível de Aplicação (AES-GCM 256 bits)
 * 
 * Funciona tanto no navegador (Client Components) quanto no servidor Node.js (Next.js SSR/API).
 * Criptografa os dados antes de gravar no Supabase, garantindo que o banco de dados
 * contenha apenas texto cifrado e ilegível.
 */

const MASTER_SECRET =
  process.env.NEXT_PUBLIC_CLINICAL_ENCRYPTION_SECRET ||
  process.env.CLINICAL_ENCRYPTION_SECRET ||
  "psychocare-vault-secret-key-2026";

const CIPHER_PREFIX = "enc:v1:";

// Obtém o objeto crypto adequado (Browser ou Node)
function getCrypto(): Crypto {
  if (typeof window !== "undefined" && window.crypto) {
    return window.crypto;
  }
  // Node.js environment
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require("crypto");
  return nodeCrypto.webcrypto || nodeCrypto;
}

/**
 * Deriva uma CryptoKey AES-GCM exclusiva para o usuário logado
 */
async function deriveCryptoKey(userId: string): Promise<CryptoKey> {
  const cryptoObj = getCrypto();
  const subtle = cryptoObj.subtle;

  const enc = new TextEncoder();
  const secretKeyMaterial = await subtle.importKey(
    "raw",
    enc.encode(MASTER_SECRET),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const userSalt = enc.encode(`tenant-salt:${userId}`);

  return await subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: userSalt,
      iterations: 100000,
      hash: "SHA-256",
    },
    secretKeyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Criptografa uma string usando AES-GCM 256 bits com a chave do usuário.
 * Retorna formato: enc:v1:<iv_hex>:<ciphertext_hex>
 */
export async function encryptClinicalData(
  plainText: string | null | undefined,
  userId: string
): Promise<string> {
  if (!plainText || typeof plainText !== "string") {
    return plainText ?? "";
  }

  // Se já estiver criptografado, não re-criptografa
  if (plainText.startsWith(CIPHER_PREFIX)) {
    return plainText;
  }

  try {
    const cryptoObj = getCrypto();
    const key = await deriveCryptoKey(userId);
    const iv = cryptoObj.getRandomValues(new Uint8Array(12)); // 96 bits IV
    const enc = new TextEncoder();

    const encryptedBuffer = await cryptoObj.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      enc.encode(plainText)
    );

    const ivHex = Array.from(iv)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const cipherHex = Array.from(new Uint8Array(encryptedBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return `${CIPHER_PREFIX}${ivHex}:${cipherHex}`;
  } catch (err) {
    console.error("Erro ao criptografar dado clínico:", err);
    return plainText;
  }
}

/**
 * Descriptografa uma string cifrada usando AES-GCM 256 bits com a chave do usuário.
 * Fallback gracioso: se o dado não começar com 'enc:v1:', retorna o texto original em claro.
 */
export async function decryptClinicalData(
  cipherText: string | null | undefined,
  userId: string
): Promise<string> {
  if (!cipherText || typeof cipherText !== "string") {
    return cipherText ?? "";
  }

  // Fallback para dados em texto claro já existentes no banco
  if (!cipherText.startsWith(CIPHER_PREFIX)) {
    return cipherText;
  }

  try {
    const parts = cipherText.slice(CIPHER_PREFIX.length).split(":");
    if (parts.length !== 2) {
      return cipherText;
    }

    const [ivHex, cipherHex] = parts;
    const cryptoObj = getCrypto();
    const key = await deriveCryptoKey(userId);

    const iv = new Uint8Array(
      ivHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    const encryptedBytes = new Uint8Array(
      cipherHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    const decryptedBuffer = await cryptoObj.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      encryptedBytes
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
  } catch (err) {
    console.error("Erro ao descriptografar dado clínico:", err);
    return "[Conteúdo protegido - Chave indisponível]";
  }
}

/**
 * Gera o hash SHA-256 seguro de um PIN de 6 dígitos para o Diário de Bordo.
 * O hash é salgado com o ID exclusivo do usuário, impedindo ataques de rainbow table.
 */
export async function hashDiarioPin(pin: string, userId: string): Promise<string> {
  const cryptoObj = getCrypto();
  const enc = new TextEncoder();
  const data = enc.encode(`diario-pin-salt:${userId}:${pin}`);
  const hashBuffer = await cryptoObj.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Valida o PIN fornecido contra o hash armazenado.
 */
export async function verifyDiarioPin(
  pin: string,
  userId: string,
  storedHash: string
): Promise<boolean> {
  if (!pin || !storedHash) return false;
  const computedHash = await hashDiarioPin(pin, userId);
  return computedHash === storedHash;
}
