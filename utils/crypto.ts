/**
 * Criptografia de dados clínicos em nível de aplicação (AES-GCM 256).
 *
 * A07 + A09 — docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
 *
 * ── O que mudou e por quê ────────────────────────────────────────────────
 *
 * ANTES (formato enc:v1:)
 *   A chave era derivada por PBKDF2 de um segredo único:
 *     NEXT_PUBLIC_CLINICAL_ENCRYPTION_SECRET || CLINICAL_ENCRYPTION_SECRET
 *       || "psychocare-vault-secret-key-2026"
 *   Como a cifragem roda no navegador, esse segredo é servido no bundle a
 *   qualquer visitante — e o cadastro é aberto. O salt era o próprio userId,
 *   que não é secreto. Na prática: um segredo público para todos os
 *   psicólogos. Contra quem tivesse o banco, a cifragem não protegia nada.
 *
 * AGORA (formato enc:v2:)
 *   Envelope. Cada psicólogo tem uma DEK de 32 bytes aleatórios, guardada no
 *   banco cifrada com a KEK do servidor (env CLINICAL_KEK, que nunca vai ao
 *   navegador nem ao banco). O navegador busca a SUA DEK em /api/crypto/key,
 *   autenticado, e a mantém só em memória.
 *
 * ── Adversário × propriedade (declare sempre os dois) ────────────────────
 *   ✓ Banco vazado, backup roubado, falha de RLS, acesso ao painel do
 *     Supabase → conteúdo inútil: a KEK não está lá.
 *   ✓ Um psicólogo tentando ler dado de outro → cada sessão só obtém a
 *     própria DEK.
 *   ✗ Servidor comprometido → quem executa código no servidor alcança KEK e
 *     banco. Não há proteção criptográfica contra isso neste modelo.
 *   ✗ NÃO é ponta a ponta. O servidor decifra quando precisa (feed iCal).
 *     Decisão consciente: E2E real quebraria o calendário e faria de "esqueci
 *     a senha" uma perda definitiva do prontuário.
 *
 * ── A09: falha de cifragem não é mais silenciosa ─────────────────────────
 *   O `catch` de encrypt devolvia o TEXTO CLARO, que era gravado no banco com
 *   apenas um console.error. E como decrypt trata "sem prefixo" como dado
 *   legado, depois não havia como distinguir o que nunca foi cifrado. Agora
 *   encrypt lança: é melhor a gravação falhar na cara do usuário do que
 *   prontuário entrar em claro sem ninguém saber.
 */

const CIPHER_PREFIX_V1 = "enc:v1:";
const CIPHER_PREFIX_V2 = "enc:v2:";

/**
 * Segredo do formato legado. Mantido SOMENTE para conseguir ler o que já está
 * gravado em enc:v1: até a remigração terminar. Nunca é usado para cifrar.
 * Remover quando `scripts/migrate-reencrypt-v1-to-v2.ts` tiver rodado em
 * produção e nenhum registro enc:v1: restar.
 */
const LEGACY_MASTER_SECRET =
  process.env.NEXT_PUBLIC_CLINICAL_ENCRYPTION_SECRET ||
  process.env.CLINICAL_ENCRYPTION_SECRET ||
  "psychocare-vault-secret-key-2026";

function getCrypto(): Crypto {
  if (typeof window !== "undefined" && window.crypto) {
    return window.crypto;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require("crypto");
  return nodeCrypto.webcrypto || nodeCrypto;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// O retorno é explicitamente Uint8Array<ArrayBuffer>: a WebCrypto exige
// BufferSource com ArrayBuffer concreto, e o Uint8Array genérico (que aceita
// SharedArrayBuffer) não satisfaz essa assinatura.
function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const pares = hex.match(/.{1,2}/g) || [];
  const bytes = new Uint8Array(new ArrayBuffer(pares.length));
  pares.forEach((p, i) => {
    bytes[i] = parseInt(p, 16);
  });
  return bytes;
}

// ─────────────────────────────────────────────────────────────────────────
// Resolução da chave (DEK), com cache em memória
// ─────────────────────────────────────────────────────────────────────────

/**
 * Cache por userId. Indispensável: uma lista de pacientes decifra 4 campos por
 * linha, e sem cache seria uma ida à rede por campo.
 *
 * Fica só em memória. Nunca em localStorage/sessionStorage — material de chave
 * não pode sobreviver ao fechamento da aba nem ficar em disco.
 */
const dekCache = new Map<string, Promise<CryptoKey>>();

async function importarDek(dekHex: string): Promise<CryptoKey> {
  const subtle = getCrypto().subtle;
  return subtle.importKey("raw", fromHex(dekHex), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function buscarDek(userId: string): Promise<CryptoKey> {
  if (typeof window === "undefined") {
    // Servidor: abre a DEK direto, com a KEK. O import é dinâmico para que o
    // caminho de service_role nunca entre no bundle do navegador.
    const { obterDekHex } = await import("./crypto-keys-server");
    return importarDek(await obterDekHex(userId));
  }

  // Navegador: pede a própria chave, autenticado.
  const resposta = await fetch("/api/crypto/key", {
    credentials: "same-origin",
    cache: "no-store",
  });

  if (!resposta.ok) {
    throw new Error(
      `Não foi possível obter a chave de criptografia (HTTP ${resposta.status}).`
    );
  }

  const { key } = await resposta.json();
  if (!key) throw new Error("Resposta de chave vazia.");

  return importarDek(key);
}

function obterChave(userId: string): Promise<CryptoKey> {
  let promessa = dekCache.get(userId);
  if (!promessa) {
    promessa = buscarDek(userId).catch((err) => {
      // Não deixa erro em cache: a próxima tentativa deve poder se recuperar.
      dekCache.delete(userId);
      throw err;
    });
    dekCache.set(userId, promessa);
  }
  return promessa;
}

/** Limpa a chave da memória. Chame no logout. */
export function limparCacheDeChaves(): void {
  dekCache.clear();
}

/** Derivação do formato legado — leitura apenas. */
async function derivarChaveLegado(userId: string): Promise<CryptoKey> {
  const subtle = getCrypto().subtle;
  const enc = new TextEncoder();

  const material = await subtle.importKey(
    "raw",
    enc.encode(LEGACY_MASTER_SECRET),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(`tenant-salt:${userId}`),
      iterations: 100000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ─────────────────────────────────────────────────────────────────────────
// API pública — assinatura preservada, os ~105 pontos de chamada não mudam
// ─────────────────────────────────────────────────────────────────────────

/**
 * Cifra um dado clínico. Lança em caso de falha (A09) — jamais devolve o
 * texto claro para ser gravado.
 */
export async function encryptClinicalData(
  plainText: string | null | undefined,
  userId: string
): Promise<string> {
  if (!plainText || typeof plainText !== "string") {
    return plainText ?? "";
  }

  if (plainText.startsWith(CIPHER_PREFIX_V2) || plainText.startsWith(CIPHER_PREFIX_V1)) {
    return plainText;
  }

  if (!userId) {
    throw new Error("encryptClinicalData: userId é obrigatório.");
  }

  const cryptoObj = getCrypto();
  const key = await obterChave(userId);
  const iv = cryptoObj.getRandomValues(new Uint8Array(12));

  const cifrado = await cryptoObj.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plainText)
  );

  return `${CIPHER_PREFIX_V2}${toHex(iv)}:${toHex(new Uint8Array(cifrado))}`;
}

/**
 * O que decryptClinicalData devolve quando não consegue decifrar (chave
 * indisponível naquele momento, valor corrompido). Exportado para as telas de
 * edição reconhecerem a falha: esse texto NUNCA pode voltar ao banco cifrado
 * por cima do registro verdadeiro.
 */
export const TEXTO_CHAVE_INDISPONIVEL = "[Conteúdo protegido - Chave indisponível]";

/**
 * Decifra. Entende os dois formatos: enc:v2: (envelope) e enc:v1: (legado,
 * até a remigração terminar). Texto sem prefixo é dado antigo em claro e volta
 * como está.
 */
export async function decryptClinicalData(
  cipherText: string | null | undefined,
  userId: string
): Promise<string> {
  if (!cipherText || typeof cipherText !== "string") {
    return cipherText ?? "";
  }

  const ehV2 = cipherText.startsWith(CIPHER_PREFIX_V2);
  const ehV1 = cipherText.startsWith(CIPHER_PREFIX_V1);
  if (!ehV2 && !ehV1) {
    return cipherText;
  }

  const prefixo = ehV2 ? CIPHER_PREFIX_V2 : CIPHER_PREFIX_V1;
  const partes = cipherText.slice(prefixo.length).split(":");
  if (partes.length !== 2) {
    return cipherText;
  }

  try {
    const key = ehV2 ? await obterChave(userId) : await derivarChaveLegado(userId);

    const aberto = await getCrypto().subtle.decrypt(
      { name: "AES-GCM", iv: fromHex(partes[0]) },
      key,
      fromHex(partes[1])
    );

    return new TextDecoder().decode(aberto);
  } catch (err) {
    console.error("Erro ao descriptografar dado clínico:", err);
    return TEXTO_CHAVE_INDISPONIVEL;
  }
}

/** true se o valor está no formato legado e precisa ser remigrado. */
export function ehFormatoLegado(valor: unknown): boolean {
  return typeof valor === "string" && valor.startsWith(CIPHER_PREFIX_V1);
}

/**
 * true se o valor está cifrado em QUALQUER formato (v1 ou v2).
 *
 * Existe porque havia 17 pontos no app testando `.startsWith("enc:v1:")` na
 * mão. Ao introduzir o v2, todos eles parariam de reconhecer o dado novo como
 * cifrado — e a tela mostraria "enc:v2:9f3a..." no lugar do texto. Sempre que
 * precisar saber se algo está cifrado, use isto, nunca o prefixo direto.
 */
export function ehCifrado(valor: unknown): boolean {
  return (
    typeof valor === "string" &&
    (valor.startsWith(CIPHER_PREFIX_V1) || valor.startsWith(CIPHER_PREFIX_V2))
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PIN do Diário de Bordo
// ─────────────────────────────────────────────────────────────────────────

/**
 * Hash do PIN de 6 dígitos.
 *
 * A16 — ATENÇÃO, e isto não mudou nesta onda: a verificação acontece no
 * navegador, contra um hash guardado em user_metadata, e o desbloqueio fica em
 * sessionStorage. São 10^6 combinações com SHA-256 sem iteração: testáveis
 * fora do sistema em instantes. Isto é uma TRAVA DE TELA contra quem passa
 * pela sala, não um cofre. Tratar como controle de segurança seria engano.
 * A decisão sobre transformá-lo em controle real está pendente com o
 * responsável.
 */
export async function hashDiarioPin(pin: string, userId: string): Promise<string> {
  const cryptoObj = getCrypto();
  const dados = new TextEncoder().encode(`diario-pin-salt:${userId}:${pin}`);
  const hash = await cryptoObj.subtle.digest("SHA-256", dados);
  return toHex(new Uint8Array(hash));
}

export async function verifyDiarioPin(
  pin: string,
  userId: string,
  storedHash: string
): Promise<boolean> {
  if (!pin || !storedHash) return false;
  const calculado = await hashDiarioPin(pin, userId);
  return calculado === storedHash;
}
