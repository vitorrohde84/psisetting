/**
 * Remigração da criptografia clínica: enc:v1: → enc:v2:
 *
 * A07 — docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
 *
 * O formato v1 era derivado de um segredo único e público (servido no bundle
 * do navegador). O v2 usa uma DEK por psicólogo, guardada cifrada com a KEK do
 * servidor. Este script lê cada campo em v1, decifra com o esquema antigo e
 * regrava em v2.
 *
 * ┌─ LEIA ANTES DE RODAR ────────────────────────────────────────────────┐
 * │ Isto reescreve prontuário de paciente real. Se a KEK for perdida      │
 * │ DEPOIS desta migração, o dado se torna irrecuperável — não existe     │
 * │ backdoor, é essa a intenção do desenho.                               │
 * │                                                                        │
 * │ 1. FAÇA BACKUP do banco antes (Supabase → Database → Backups).        │
 * │ 2. GUARDE a CLINICAL_KEK em local seguro, fora do servidor também.    │
 * │ 3. Rode primeiro SEM --apply (ensaio). Nada é gravado.                │
 * │ 4. Só depois rode com --apply.                                         │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * Uso:
 *   npx tsx scripts/migrate-reencrypt-v1-to-v2.ts            # ensaio
 *   npx tsx scripts/migrate-reencrypt-v1-to-v2.ts --apply    # grava
 *   npx tsx scripts/migrate-reencrypt-v1-to-v2.ts --apply --user <uuid>
 *
 * Variáveis necessárias: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * CLINICAL_KEK e o segredo legado (se algum dia foi configurado).
 */

import { createClient } from "@supabase/supabase-js";
import { webcrypto } from "crypto";

const APPLY = process.argv.includes("--apply");
const USER_FILTER = (() => {
  const i = process.argv.indexOf("--user");
  return i >= 0 ? process.argv[i + 1] : null;
})();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const KEK_HEX = process.env.CLINICAL_KEK!;

const LEGACY_SECRET =
  process.env.NEXT_PUBLIC_CLINICAL_ENCRYPTION_SECRET ||
  process.env.CLINICAL_ENCRYPTION_SECRET ||
  "psychocare-vault-secret-key-2026";

/** Tabela → colunas cifradas. Mapeado a partir dos pontos de chamada reais. */
const CAMPOS_CIFRADOS: Record<string, string[]> = {
  pacientes: [
    "nome",
    "cpf",
    "telefone",
    "email",
    "endereco",
    "contato_emergencia",
    "observacoes_gerais",
  ],
  prontuarios: ["conteudo"],
  diario_bordo: ["conteudo"],
  laudos: ["conteudo"],
  agendamentos: ["observacoes"],
  grupo_sessoes: ["resumo_coletivo"],
};

const V1 = "enc:v1:";
const V2 = "enc:v2:";

const hex = (b: Uint8Array) =>
  Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const unhex = (s: string): Uint8Array<ArrayBuffer> => {
  const pares = s.match(/.{1,2}/g) || [];
  const bytes = new Uint8Array(new ArrayBuffer(pares.length));
  pares.forEach((p, i) => {
    bytes[i] = parseInt(p, 16);
  });
  return bytes;
};

/**
 * As tabelas e colunas são resolvidas em tempo de execução (CAMPOS_CIFRADOS),
 * então o client tipado do Supabase não tem como inferir os retornos. Este
 * alias deixa isso explícito em vez de espalhar casts pelo arquivo.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbAny = any;

async function chaveLegado(userId: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const material = await webcrypto.subtle.importKey(
    "raw",
    enc.encode(LEGACY_SECRET),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return webcrypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(`tenant-salt:${userId}`),
      iterations: 100000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

async function kek(): Promise<CryptoKey> {
  const bytes = Buffer.from(KEK_HEX, "hex");
  if (bytes.length !== 32) {
    throw new Error("CLINICAL_KEK deve ter 64 caracteres hexadecimais (32 bytes).");
  }
  return webcrypto.subtle.importKey("raw", new Uint8Array(bytes), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function obterDek(supabase: DbAny, userId: string): Promise<CryptoKey> {
  const k = await kek();

  const { data } = await supabase
    .from("user_encryption_keys")
    .select("wrapped_dek")
    .eq("user_id", userId)
    .maybeSingle();

  let dekBytes: Uint8Array;

  if (data?.wrapped_dek) {
    const [, ivHex, cifHex] = (data.wrapped_dek as string).split(":");
    const aberta = await webcrypto.subtle.decrypt(
      { name: "AES-GCM", iv: unhex(ivHex) },
      k,
      unhex(cifHex)
    );
    dekBytes = new Uint8Array(aberta);
  } else {
    dekBytes = webcrypto.getRandomValues(new Uint8Array(32));
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const cifrada = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, k, dekBytes);
    const wrapped = `v1:${hex(iv)}:${hex(new Uint8Array(cifrada))}`;

    if (APPLY) {
      const { error } = await supabase
        .from("user_encryption_keys")
        .insert({ user_id: userId, wrapped_dek: wrapped });
      if (error) throw error;
    }
    console.log(`   chave nova criada para ${userId}${APPLY ? "" : " (ensaio, não gravada)"}`);
  }

  return webcrypto.subtle.importKey("raw", dekBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function decifrarV1(valor: string, chave: CryptoKey): Promise<string> {
  const [ivHex, cifHex] = valor.slice(V1.length).split(":");
  const aberto = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv: unhex(ivHex) },
    chave,
    unhex(cifHex)
  );
  return new TextDecoder().decode(aberto);
}

async function cifrarV2(texto: string, chave: CryptoKey): Promise<string> {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const cifrado = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    chave,
    new TextEncoder().encode(texto)
  );
  return `${V2}${hex(iv)}:${hex(new Uint8Array(cifrado))}`;
}

async function main() {
  const faltando = [
    !SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL",
    !SERVICE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
    !KEK_HEX && "CLINICAL_KEK",
  ].filter(Boolean);

  if (faltando.length > 0) {
    console.error(`\nFalta definir em .env.local: ${faltando.join(", ")}\n`);
    if (faltando.includes("CLINICAL_KEK")) {
      console.error(
        "Para gerar a CLINICAL_KEK:\n" +
          '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
          "Guarde uma cópia fora do servidor antes de continuar.\n"
      );
    }
    process.exit(1);
  }

  const supabase: DbAny = createClient(SUPABASE_URL, SERVICE_KEY);

  console.log("=".repeat(70));
  console.log(APPLY ? "REMIGRAÇÃO v1 → v2 — MODO GRAVAÇÃO" : "REMIGRAÇÃO v1 → v2 — ENSAIO (nada será gravado)");
  console.log("=".repeat(70));

  const { data: perfis, error: perfisError } = await supabase
    .from("profiles")
    .select("id")
    .order("created_at", { ascending: true });

  if (perfisError) throw perfisError;

  const alvos = ((perfis || []) as Array<{ id: string }>).filter(
    (p) => !USER_FILTER || p.id === USER_FILTER
  );
  console.log(`Psicólogos a processar: ${alvos.length}\n`);

  let totalConvertidos = 0;
  let totalFalhas = 0;

  for (const perfil of alvos as Array<{ id: string }>) {
    const userId = perfil.id;
    let convertidosDoUsuario = 0;
    let chaveV2: CryptoKey | null = null;
    const chaveV1 = await chaveLegado(userId);

    for (const [tabela, colunas] of Object.entries(CAMPOS_CIFRADOS)) {
      const { data: linhas, error } = await supabase
        .from(tabela)
        .select(["id", ...colunas].join(", "))
        .eq("psicologo_id", userId);

      if (error) {
        // Coluna ou tabela inexistente não é motivo para abortar tudo.
        console.warn(`   [${tabela}] ignorada: ${error.message}`);
        continue;
      }

      for (const linha of linhas || []) {
        const atualizacao: Record<string, string> = {};

        for (const coluna of colunas) {
          const valor = (linha as Record<string, unknown>)[coluna];
          if (typeof valor !== "string" || !valor.startsWith(V1)) continue;

          try {
            const claro = await decifrarV1(valor, chaveV1);
            if (!chaveV2) chaveV2 = await obterDek(supabase, userId);
            atualizacao[coluna] = await cifrarV2(claro, chaveV2);
          } catch (err) {
            totalFalhas++;
            console.error(
              `   ✗ ${tabela}.${coluna} id=${(linha as { id: string }).id}: não decifrou com a chave legada — ${(err as Error).message}`
            );
          }
        }

        if (Object.keys(atualizacao).length === 0) continue;

        if (APPLY) {
          const { error: upErr } = await supabase
            .from(tabela)
            .update(atualizacao)
            .eq("id", (linha as { id: string }).id);

          if (upErr) {
            totalFalhas++;
            console.error(`   ✗ gravação em ${tabela} id=${(linha as { id: string }).id}: ${upErr.message}`);
            continue;
          }
        }

        convertidosDoUsuario += Object.keys(atualizacao).length;
        totalConvertidos += Object.keys(atualizacao).length;
      }
    }

    if (convertidosDoUsuario > 0) {
      console.log(`✓ ${userId}: ${convertidosDoUsuario} campo(s)${APPLY ? " convertido(s)" : " a converter"}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log(`Campos ${APPLY ? "convertidos" : "que seriam convertidos"}: ${totalConvertidos}`);
  console.log(`Falhas: ${totalFalhas}`);
  console.log("=".repeat(70));

  if (totalFalhas > 0) {
    console.error(
      "\nHá falhas. NÃO remova o suporte a enc:v1: e investigue antes de seguir.\n" +
        "Falha ao decifrar geralmente significa que aquele dado foi cifrado com um segredo diferente do atual."
    );
    process.exit(1);
  }

  if (!APPLY && totalConvertidos > 0) {
    console.log("\nEnsaio concluído sem erros. Para gravar: adicione --apply (com backup feito).");
  }
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
