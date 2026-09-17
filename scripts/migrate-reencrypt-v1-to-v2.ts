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

/**
 * --incluir-texto-puro
 *
 * Alguns registros são anteriores à criptografia ter sido implantada e estão
 * em TEXTO PURO no banco — no PsiSetting eram 13 dos 17 prontuários, mais
 * laudos e observações de agenda. O sistema sempre os exibiu normalmente
 * (decryptClinicalData devolve como está o que não tem prefixo), e por isso
 * ninguém percebeu que nunca foram protegidos.
 *
 * Com esta opção eles também passam a ser cifrados, em v2.
 */
const INCLUIR_TEXTO_PURO = process.argv.includes("--incluir-texto-puro");

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

  // O erro precisa subir. Descartá-lo faria o script concluir que o psicólogo
  // não tem chave e GERAR UMA SEGUNDA — parte do dado ficaria cifrada com uma
  // chave que ninguém mais vai procurar. Se a tabela não existir (migração 8
  // não aplicada), é aqui que tem que estourar, inclusive no ensaio.
  const { data, error: leituraError } = await supabase
    .from("user_encryption_keys")
    .select("wrapped_dek")
    .eq("user_id", userId)
    .maybeSingle();

  if (leituraError) {
    throw new Error(
      `Não foi possível ler user_encryption_keys (${leituraError.message}). ` +
        `Aplique a migração 20260917120700_a07_chaves_por_usuario.sql antes de rodar este script.`
    );
  }

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
  console.log(APPLY ? "REMIGRAÇÃO — MODO GRAVAÇÃO" : "REMIGRAÇÃO — ENSAIO (nada será gravado)");
  console.log(INCLUIR_TEXTO_PURO ? "Escopo: formato antigo (v1) + campos em TEXTO PURO" : "Escopo: apenas formato antigo (v1)");
  console.log("=".repeat(70));

  // PAGINAÇÃO OBRIGATÓRIA.
  // O PostgREST do Supabase corta a resposta no limite de "Max rows" (1000 por
  // padrão) SEM avisar. Sem paginar, o script converteria as primeiras 1000
  // linhas, imprimiria "Falhas: 0" e você concluiria que terminou — deixando o
  // resto em enc:v1: para ficar ilegível no dia em que o segredo legado sair.
  const PAGINA = 500;

  async function buscarTudo(
    tabela: string,
    colunas: string,
    filtro?: { coluna: string; valor: string }
  ): Promise<Array<Record<string, unknown>>> {
    const acumulado: Array<Record<string, unknown>> = [];
    let inicio = 0;

    for (;;) {
      let consulta = supabase.from(tabela).select(colunas);
      if (filtro) consulta = consulta.eq(filtro.coluna, filtro.valor);

      const { data, error } = await consulta.range(inicio, inicio + PAGINA - 1);
      if (error) throw error;

      const lote = (data || []) as Array<Record<string, unknown>>;
      acumulado.push(...lote);

      if (lote.length < PAGINA) return acumulado;
      inicio += PAGINA;
    }
  }

  let perfis: Array<Record<string, unknown>>;
  try {
    perfis = await buscarTudo("profiles", "id");
  } catch (err) {
    console.error("Não foi possível listar os psicólogos:", (err as Error).message);
    process.exit(1);
  }

  const alvos = ((perfis || []) as Array<{ id: string }>).filter(
    (p) => !USER_FILTER || p.id === USER_FILTER
  );
  console.log(`Psicólogos a processar: ${alvos.length}\n`);

  let totalConvertidos = 0;
  let totalFalhas = 0;
  let totalTextoPuro = 0;

  for (const perfil of alvos as Array<{ id: string }>) {
    const userId = perfil.id;
    let convertidosDoUsuario = 0;
    let chaveV2: CryptoKey | null = null;
    const chaveV1 = await chaveLegado(userId);

    for (const [tabela, colunas] of Object.entries(CAMPOS_CIFRADOS)) {
      let linhas: Array<Record<string, unknown>>;
      try {
        linhas = await buscarTudo(tabela, ["id", ...colunas].join(", "), {
          coluna: "psicologo_id",
          valor: userId,
        });
      } catch (err) {
        // Coluna ou tabela inexistente não é motivo para abortar tudo.
        console.warn(`   [${tabela}] ignorada: ${(err as Error).message}`);
        continue;
      }

      for (const linha of linhas) {
        const atualizacao: Record<string, string> = {};

        for (const coluna of colunas) {
          const valor = (linha as Record<string, unknown>)[coluna];
          if (typeof valor !== "string" || !valor) continue;

          // Já está no formato novo: nada a fazer.
          if (valor.startsWith(V2)) continue;

          const ehLegado = valor.startsWith(V1);
          const ehTextoPuro = !ehLegado && !valor.startsWith("enc:");

          if (!ehLegado && !(ehTextoPuro && INCLUIR_TEXTO_PURO)) continue;

          // A obtenção da DEK fica FORA do try da decifragem. Dentro dele, uma
          // falha de KEK era reportada como "não decifrou com a chave legada" —
          // mandando você investigar o segredo errado enquanto a causa real
          // era a CLINICAL_KEK.
          if (!chaveV2) chaveV2 = await obterDek(supabase, userId);

          try {
            // Texto puro já está legível: só precisa ser cifrado.
            const claro = ehLegado ? await decifrarV1(valor, chaveV1) : valor;
            atualizacao[coluna] = await cifrarV2(claro, chaveV2);
            if (ehTextoPuro) totalTextoPuro++;
          } catch (err) {
            totalFalhas++;
            console.error(
              `   ✗ ${tabela}.${coluna} id=${(linha as { id: string }).id}: ${
                ehLegado
                  ? "não decifrou com a chave legada"
                  : "falhou ao cifrar texto puro"
              } — ${(err as Error).message}`
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

  // ── Verificação de resíduo, contra o BANCO ────────────────────────────
  // O contador acima é o que o script ACHA que fez. Isto é o que o banco
  // realmente tem. Se divergirem, confie no banco.
  console.log("\nConferindo o que restou em enc:v1: no banco...");
  let residuoTotal = 0;
  const residuoPorTabela: string[] = [];

  for (const [tabela, colunas] of Object.entries(CAMPOS_CIFRADOS)) {
    for (const coluna of colunas) {
      const { count, error } = await supabase
        .from(tabela)
        .select(coluna, { count: "exact", head: true })
        .like(coluna, `${V1}%`);

      if (error) continue;
      if ((count ?? 0) > 0) {
        residuoTotal += count ?? 0;
        residuoPorTabela.push(`   ${tabela}.${coluna}: ${count}`);
      }
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log(`Campos ${APPLY ? "convertidos" : "que seriam convertidos"}: ${totalConvertidos}`);
  if (INCLUIR_TEXTO_PURO) {
    console.log(`  dos quais estavam em TEXTO PURO: ${totalTextoPuro}`);
    console.log(`  vindos do formato antigo (v1)  : ${totalConvertidos - totalTextoPuro}`);
  }
  console.log(`Falhas: ${totalFalhas}`);
  console.log(`Ainda em enc:v1: no banco: ${residuoTotal}`);
  if (residuoPorTabela.length > 0) {
    console.log(residuoPorTabela.join("\n"));
  }
  console.log("=".repeat(70));

  if (APPLY && residuoTotal > 0) {
    console.error(
      `\n⚠ Sobraram ${residuoTotal} campo(s) em enc:v1:. A remigração NÃO terminou.\n` +
        "Rode o script de novo. NÃO remova o LEGACY_MASTER_SECRET de utils/crypto.ts\n" +
        "enquanto este número não for zero — cada resíduo vira ilegível para sempre."
    );
    process.exit(1);
  }

  if (APPLY && residuoTotal === 0 && totalFalhas === 0) {
    console.log(
      "\n✓ Remigração completa: nenhum campo em enc:v1: restou no banco.\n" +
        "  Guarde a CLINICAL_KEK. A partir daqui, o banco sozinho não abre os prontuários."
    );
  }

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
