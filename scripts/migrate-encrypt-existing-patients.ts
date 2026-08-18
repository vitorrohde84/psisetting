/**
 * Script de Migração e Anonimização em Massa dos Pacientes Existentes
 * 
 * Lê todos os pacientes cadastrados no Supabase e aplica criptografia AES-GCM 256 bits
 * nos campos: nome, cpf, telefone, email, endereco, contato_emergencia, observacoes_gerais.
 */

import { createClient } from "@supabase/supabase-js";
import { encryptClinicalData } from "../utils/crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("ERRO: Variáveis de ambiente Supabase ausentes.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function migratePatients() {
  console.log("==========================================================");
  console.log("🔒 INICIANDO ANONIMIZAÇÃO / CRIPTOGRAFIA DE PACIENTES");
  console.log("==========================================================\n");

  const { data: pacientes, error } = await supabase
    .from("pacientes")
    .select("*");

  if (error || !pacientes) {
    console.error("Erro ao buscar pacientes:", error);
    process.exit(1);
  }

  console.log(`Encontrados ${pacientes.length} pacientes para anonimizar.\n`);

  let updatedCount = 0;

  for (const p of pacientes) {
    const userId = p.psicologo_id;
    if (!userId) {
      console.warn(`⚠️ Paciente ${p.id} não possui psicologo_id vinculado. Pulando.`);
      continue;
    }

    console.log(`Criptografando paciente: ${p.nome.slice(0, 15)}... (ID: ${p.id})`);

    const encryptedNome = await encryptClinicalData(p.nome, userId);
    const encryptedCpf = p.cpf ? await encryptClinicalData(p.cpf.replace(/\D/g, ""), userId) : null;
    const encryptedTelefone = p.telefone ? await encryptClinicalData(p.telefone.replace(/\D/g, ""), userId) : null;
    const encryptedEmail = p.email ? await encryptClinicalData(p.email, userId) : null;
    const encryptedEndereco = p.endereco ? await encryptClinicalData(p.endereco, userId) : null;
    const encryptedContatoEmergencia = p.contato_emergencia ? await encryptClinicalData(p.contato_emergencia, userId) : null;
    const encryptedObservacoes = p.observacoes_gerais ? await encryptClinicalData(p.observacoes_gerais, userId) : null;

    const { error: updateError } = await supabase
      .from("pacientes")
      .update({
        nome: encryptedNome,
        cpf: encryptedCpf,
        telefone: encryptedTelefone,
        email: encryptedEmail,
        endereco: encryptedEndereco,
        contato_emergencia: encryptedContatoEmergencia,
        observacoes_gerais: encryptedObservacoes,
      })
      .eq("id", p.id);

    if (updateError) {
      console.error(`❌ Erro ao atualizar paciente ${p.id}:`, updateError);
    } else {
      updatedCount++;
      console.log(`✅ Paciente ${p.id} anonimizado com sucesso.`);
    }
  }

  console.log("\n==========================================================");
  console.log(`🎉 MIGRAÇÃO CONCLUÍDA: ${updatedCount}/${pacientes.length} pacientes anonimizados.`);
  console.log("==========================================================");
}

migratePatients().catch((err) => {
  console.error("Erro fatal na migração:", err);
  process.exit(1);
});
