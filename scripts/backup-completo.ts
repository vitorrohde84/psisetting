/**
 * Backup completo do banco, em JSON, sem depender de ferramenta externa.
 *
 * Por que isto existe: o plano free do Supabase não oferece backup no painel, e
 * pg_dump/psql não estão instalados. Este script baixa todas as tabelas usando
 * a própria chave de serviço e grava um arquivo local.
 *
 * O que ele salva: as linhas EXATAMENTE como estão no banco — ou seja, os
 * campos clínicos continuam cifrados. É o backup certo para desfazer uma
 * migração que deu errado.
 *
 * O que ele NÃO substitui: a exportação em CSV que cada psicóloga faz dentro do
 * sistema (Configurações → Backup). Aquela sai descriptografada e é a rede de
 * proteção para o caso de a recifragem dar errado. As duas se complementam:
 *   - este arquivo  → volta o banco ao estado anterior
 *   - o CSV         → garante que o conteúdo clínico existe em texto legível
 *
 * ⚠️ O arquivo gerado contém dados de pacientes. Guarde como guardaria um
 *    prontuário de papel. A pasta backups/ está no .gitignore de propósito.
 *
 * Uso:
 *   npm run backup
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Tabelas que valem a pena salvar. Inexistentes são puladas com aviso. */
const TABELAS = [
  "profiles",
  "pacientes",
  "agendamentos",
  "prontuarios",
  "diario_bordo",
  "diario_supervisoes",
  "agenda_supervisoes",
  "laudos",
  "pagamentos",
  "grupos",
  "grupo_membros",
  "grupo_sessoes",
  "invites",
  "coupons",
  "coupon_redemptions",
  "coupon_mensalidades",
  "user_feedbacks",
  "system_announcements",
  "user_encryption_keys",
  "payment_events",
];

const PAGINA = 500;

async function main() {
  const faltando = [
    !SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL",
    !SERVICE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);

  if (faltando.length > 0) {
    console.error(`\nFalta definir em .env.local: ${faltando.join(", ")}\n`);
    process.exit(1);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = createClient(SUPABASE_URL, SERVICE_KEY);

  console.log("=".repeat(64));
  console.log("BACKUP COMPLETO DO BANCO");
  console.log(`Projeto: ${SUPABASE_URL}`);
  console.log("=".repeat(64) + "\n");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dump: Record<string, any[]> = {};
  const resumo: string[] = [];
  const ausentes: string[] = [];

  for (const tabela of TABELAS) {
    // Paginado: o PostgREST corta a resposta no limite de "Max rows" sem avisar.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linhas: any[] = [];
    let inicio = 0;
    let erro = null;

    for (;;) {
      const { data, error } = await supabase
        .from(tabela)
        .select("*")
        .range(inicio, inicio + PAGINA - 1);

      if (error) {
        erro = error;
        break;
      }

      const lote = data || [];
      linhas.push(...lote);
      if (lote.length < PAGINA) break;
      inicio += PAGINA;
    }

    if (erro) {
      ausentes.push(`${tabela} (${erro.message})`);
      continue;
    }

    dump[tabela] = linhas;
    resumo.push(`  ${tabela.padEnd(22)} ${String(linhas.length).padStart(6)} linha(s)`);
    console.log(`✓ ${tabela}: ${linhas.length}`);
  }

  const agora = new Date();
  const carimbo = agora.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const pasta = join(process.cwd(), "backups");
  if (!existsSync(pasta)) mkdirSync(pasta, { recursive: true });

  const caminho = join(pasta, `backup-${carimbo}.json`);

  writeFileSync(
    caminho,
    JSON.stringify(
      {
        gerado_em: agora.toISOString(),
        projeto: SUPABASE_URL,
        aviso: "Contem dados clinicos de pacientes. Guardar com o mesmo cuidado de um prontuario.",
        tabelas: dump,
      },
      null,
      2
    ),
    "utf8"
  );

  const totalLinhas = Object.values(dump).reduce((s, l) => s + l.length, 0);

  console.log("\n" + "=".repeat(64));
  console.log(resumo.join("\n"));
  console.log("-".repeat(64));
  console.log(`  TOTAL                  ${String(totalLinhas).padStart(6)} linha(s)`);
  if (ausentes.length > 0) {
    console.log(`\n  Tabelas nao encontradas (normal se a migracao ainda nao rodou):`);
    ausentes.forEach((t) => console.log(`    - ${t}`));
  }
  console.log("=".repeat(64));
  console.log(`\n✓ Salvo em: ${caminho}\n`);
  console.log("Guarde uma copia deste arquivo FORA deste computador antes de seguir.");
  console.log("Ele contem dados de pacientes — trate como prontuario.\n");
}

main().catch((err) => {
  console.error("\nErro no backup:", err.message || err);
  process.exit(1);
});
