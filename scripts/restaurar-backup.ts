/**
 * Restaura um backup gerado por scripts/backup-completo.ts.
 *
 * É a volta atrás para quando uma migração ou a recifragem der errado. Funciona
 * no plano free, sem ferramenta externa.
 *
 * COMO FUNCIONA
 *   Para cada tabela do arquivo, faz upsert linha a linha pela chave primária:
 *   linha que existe é sobrescrita com o conteúdo do backup, linha que não
 *   existe mais é recriada.
 *
 * O QUE ELE NÃO FAZ
 *   Não apaga linhas criadas DEPOIS do backup. Se uma consulta foi registrada
 *   no intervalo, ela continua lá — o que quase sempre é o que você quer.
 *   Não restaura políticas, triggers nem permissões: isso é papel das
 *   migrações, que são todas repetíveis.
 *
 * Uso:
 *   npm run restaurar                          (lista os backups disponíveis)
 *   npm run restaurar -- <arquivo>             (ensaio: mostra o que faria)
 *   npm run restaurar -- <arquivo> --confirmar (grava de verdade)
 *   npm run restaurar -- <arquivo> --confirmar --tabela prontuarios
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const args = process.argv.slice(2);
const CONFIRMAR = args.includes("--confirmar");
const TABELA_FILTRO = (() => {
  const i = args.indexOf("--tabela");
  return i >= 0 ? args[i + 1] : null;
})();
const ARQUIVO = args.find((a) => !a.startsWith("--") && a !== TABELA_FILTRO);

/** Ordem importa: pais antes de filhos, por causa das chaves estrangeiras. */
const ORDEM = [
  "profiles",
  "user_encryption_keys",
  "pacientes",
  "grupos",
  "grupo_membros",
  "grupo_sessoes",
  "agendamentos",
  "prontuarios",
  "diario_bordo",
  "laudos",
  "pagamentos",
  "invites",
  "coupons",
  "coupon_redemptions",
  "payment_events",
  "user_feedbacks",
  "system_announcements",
];

function listarBackups(): string[] {
  const pasta = join(process.cwd(), "backups");
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("\nFalta NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em .env.local\n");
    process.exit(1);
  }

  const disponiveis = listarBackups();

  if (!ARQUIVO) {
    console.log("\nBackups disponíveis em backups/:\n");
    if (disponiveis.length === 0) {
      console.log("  (nenhum — rode `npm run backup` primeiro)\n");
    } else {
      disponiveis.forEach((f, i) => console.log(`  ${i === 0 ? "→" : " "} ${f}`));
      console.log(`\nPara ver o que seria restaurado:\n  npm run restaurar -- ${disponiveis[0]}\n`);
    }
    process.exit(0);
  }

  const caminho = ARQUIVO.includes("/") || ARQUIVO.includes("\\")
    ? ARQUIVO
    : join(process.cwd(), "backups", ARQUIVO);

  if (!existsSync(caminho)) {
    console.error(`\nArquivo não encontrado: ${caminho}\n`);
    process.exit(1);
  }

  const backup = JSON.parse(readFileSync(caminho, "utf8"));
  const tabelas = backup.tabelas || {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = createClient(SUPABASE_URL, SERVICE_KEY);

  console.log("\n" + "=".repeat(64));
  console.log(CONFIRMAR ? "RESTAURAÇÃO — GRAVANDO" : "RESTAURAÇÃO — ENSAIO (nada será gravado)");
  console.log(`Arquivo: ${ARQUIVO}`);
  console.log(`Gerado em: ${backup.gerado_em}`);
  if (backup.projeto !== SUPABASE_URL) {
    console.log(`\n⚠ ATENÇÃO: o backup é do projeto ${backup.projeto}`);
    console.log(`           e você está apontando para ${SUPABASE_URL}`);
    console.log("           Confirme que é isso mesmo antes de usar --confirmar.\n");
  }
  console.log("=".repeat(64) + "\n");

  let totalRestaurado = 0;
  let totalFalhas = 0;

  for (const tabela of ORDEM) {
    const linhas = tabelas[tabela];
    if (!linhas || linhas.length === 0) continue;
    if (TABELA_FILTRO && tabela !== TABELA_FILTRO) continue;

    if (!CONFIRMAR) {
      console.log(`  ${tabela.padEnd(22)} ${String(linhas.length).padStart(5)} linha(s) seriam restauradas`);
      totalRestaurado += linhas.length;
      continue;
    }

    // Lotes pequenos: com poucas centenas de linhas, clareza vale mais que
    // velocidade — e um erro isolado não derruba o resto.
    let ok = 0;
    for (const linha of linhas) {
      const { error } = await supabase.from(tabela).upsert(linha, { onConflict: "id" });
      if (error) {
        totalFalhas++;
        console.error(`  ✗ ${tabela} id=${linha.id}: ${error.message}`);
      } else {
        ok++;
      }
    }

    totalRestaurado += ok;
    console.log(`  ✓ ${tabela.padEnd(22)} ${String(ok).padStart(5)}/${linhas.length}`);
  }

  console.log("\n" + "=".repeat(64));
  console.log(`Linhas ${CONFIRMAR ? "restauradas" : "que seriam restauradas"}: ${totalRestaurado}`);
  if (totalFalhas > 0) console.log(`Falhas: ${totalFalhas}`);
  console.log("=".repeat(64) + "\n");

  if (!CONFIRMAR) {
    console.log("Para gravar de verdade, repita o comando com --confirmar\n");
  }
}

main().catch((err) => {
  console.error("\nErro na restauração:", err.message || err);
  process.exit(1);
});
