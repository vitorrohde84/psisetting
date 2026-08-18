/**
 * Script de Teste Automatizado de Segurança e Criptografia Multi-Tenant
 * 
 * Executa uma bateria de testes verificando:
 * 1. Criptografia AES-GCM 256 bits em dados clínicos (Diário, Prontuário, Laudo)
 * 2. Isolamento de chaves entre psicólogos (Tenant A vs Tenant B)
 * 3. Ausência de texto em claro no payload cifrado
 * 4. Fallback transparente para dados legados
 */

import { encryptClinicalData, decryptClinicalData } from "../utils/crypto";

async function runSecurityTests() {
  console.log("==========================================================");
  console.log("🧪 INICIANDO TESTES DE SEGURANÇA & CRIPTOGRAFIA MULTI-TENANT");
  console.log("==========================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  const tenantA_Id = "d8a1e2f3-1111-4444-aaaa-aaaaaaaaaaaa";
  const tenantB_Id = "e9b2f3a4-2222-4444-bbbb-bbbbbbbbbbbb";

  const sensitiveClinicalNote =
    "Paciente relatou crises de angústia aos domingos e ideação após perda do emprego.";

  // TESTE 1: Criptografia com formato correto
  console.log("1. Testando geração de ciphertext...");
  const encryptedA = await encryptClinicalData(sensitiveClinicalNote, tenantA_Id);
  assert(
    encryptedA.startsWith("enc:v1:") && encryptedA !== sensitiveClinicalNote,
    "Formato cifrado deve iniciar com 'enc:v1:' e ser diferente do texto original"
  );

  // TESTE 2: Vazamento de texto claro
  console.log("\n2. Testando ausência de vazamento de texto plano...");
  assert(
    !encryptedA.includes("angústia") &&
      !encryptedA.includes("Paciente") &&
      !encryptedA.includes("ideação"),
    "Nenhum termo do texto original deve existir no texto cifrado"
  );

  // TESTE 3: Descriptografia pelo próprio psicólogo (Tenant A)
  console.log("\n3. Testando decifração pelo psicólogo proprietário...");
  const decryptedA = await decryptClinicalData(encryptedA, tenantA_Id);
  assert(
    decryptedA === sensitiveClinicalNote,
    "Psicólogo A deve conseguir descriptografar exatamente o texto original"
  );

  // TESTE 4: Tentativa de leitura por outro psicólogo (Tenant B)
  console.log("\n4. Testando invasão/acesso cruzado por outro psicólogo...");
  const decryptedByB = await decryptClinicalData(encryptedA, tenantB_Id);
  assert(
    decryptedByB.includes("Conteúdo protegido") || decryptedByB !== sensitiveClinicalNote,
    "Psicólogo B NÃO deve conseguir descriptografar dados do Psicólogo A"
  );

  // TESTE 5: Idempotência de criptografia
  console.log("\n5. Testando idempotência (não re-criptografar o que já está cifrado)...");
  const doubleEncrypted = await encryptClinicalData(encryptedA, tenantA_Id);
  assert(
    doubleEncrypted === encryptedA,
    "Chamar encryptClinicalData em texto já cifrado deve retornar o mesmo texto sem duplicar"
  );

  // TESTE 6: Fallback para dados legados em texto claro
  console.log("\n6. Testando compatibilidade com dados legados sem cifra...");
  const legacyText = "Anotação antiga gravada antes da criptografia";
  const legacyDecrypted = await decryptClinicalData(legacyText, tenantA_Id);
  assert(
    legacyDecrypted === legacyText,
    "Texto legado sem prefixo 'enc:v1:' deve ser retornado intacto sem erros"
  );

  console.log("\n==========================================================");
  console.log(`📊 RESULTADO FINAL: ${passed} passaram, ${failed} falharam.`);
  console.log("==========================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityTests().catch((err) => {
  console.error("Erro fatal nos testes de segurança:", err);
  process.exit(1);
});
