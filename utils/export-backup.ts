/**
 * Utilitário de Exportação e Backup Completo dos Dados Clínicos.
 * Executado 100% no navegador da psicóloga com descriptografia client-side.
 * Gera arquivo .CSV consolidado com UTF-8 BOM para compatibilidade com Excel / Google Sheets.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { decryptClinicalData } from "./crypto";

function escapeCSV(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

function createCSVRow(cells: any[]): string {
  return cells.map(escapeCSV).join(";") + "\r\n";
}

export async function generateFullSystemBackupCSV(
  supabase: SupabaseClient,
  userId: string,
  userNome: string
): Promise<{ success: boolean; filename?: string; error?: string }> {
  try {
    // 1. Busca todos os dados do psicólogo em paralelo
    const [
      pacsRes,
      prontsRes,
      diariosRes,
      agendsRes,
      pagsRes,
      laudosRes,
    ] = await Promise.all([
      supabase.from("pacientes").select("*").order("nome", { ascending: true }),
      supabase.from("prontuarios").select("*").order("data", { ascending: false }),
      supabase.from("diario_bordo").select("*").order("data", { ascending: false }),
      supabase.from("agendamentos").select("*").order("data", { ascending: false }),
      supabase.from("pagamentos").select("*").order("data_vencimento", { ascending: false }),
      supabase.from("laudos").select("*").order("created_at", { ascending: false }),
    ]);

    if (pacsRes.error) throw pacsRes.error;

    // 2. Descriptografa Pacientes
    const pacientesMap = new Map<string, string>();
    const decryptedPacientes = await Promise.all(
      (pacsRes.data || []).map(async (p) => {
        const nomeDec = await decryptClinicalData(p.nome, userId);
        const cpfDec = await decryptClinicalData(p.cpf, userId);
        const telDec = await decryptClinicalData(p.telefone, userId);
        const emailDec = await decryptClinicalData(p.email, userId);
        const endDec = await decryptClinicalData(p.endereco, userId);
        const emergDec = await decryptClinicalData(p.contato_emergencia, userId);
        const obsDec = await decryptClinicalData(p.observacoes_gerais, userId);

        pacientesMap.set(p.id, nomeDec || "Paciente");

        return {
          id: p.id,
          nome: nomeDec,
          cpf: cpfDec,
          telefone: telDec,
          email: emailDec,
          data_nascimento: p.data_nascimento || "",
          endereco: endDec,
          contato_emergencia: emergDec,
          observacoes_gerais: obsDec,
          status: p.ativo ? "Ativo" : "Inativo",
          cadastrado_em: p.created_at ? new Date(p.created_at).toLocaleDateString("pt-BR") : "",
        };
      })
    );

    // 3. Descriptografa Prontuários
    const decryptedProntuarios = await Promise.all(
      (prontsRes.data || []).map(async (p) => {
        const conteudoDec = await decryptClinicalData(p.conteudo, userId);
        return {
          paciente: pacientesMap.get(p.paciente_id) || "Paciente",
          data_sessao: p.data ? new Date(p.data + "T12:00:00").toLocaleDateString("pt-BR") : "",
          evolucao_clinica: conteudoDec,
          criado_em: p.created_at ? new Date(p.created_at).toLocaleString("pt-BR") : "",
        };
      })
    );

    // 4. Descriptografa Diário de Bordo
    const decryptedDiarios = await Promise.all(
      (diariosRes.data || []).map(async (d) => {
        const conteudoDec = await decryptClinicalData(d.conteudo, userId);
        return {
          paciente: pacientesMap.get(d.paciente_id) || "Paciente",
          data: d.data ? new Date(d.data + "T12:00:00").toLocaleDateString("pt-BR") : "",
          anotacoes_estudo_caso: conteudoDec,
          criado_em: d.created_at ? new Date(d.created_at).toLocaleString("pt-BR") : "",
        };
      })
    );

    // 5. Descriptografa Agendamentos
    const decryptedAgendamentos = await Promise.all(
      (agendsRes.data || []).map(async (a) => {
        let obsDec = a.observacoes;
        if (obsDec && obsDec.startsWith("enc:v1:")) {
          obsDec = await decryptClinicalData(obsDec, userId);
        }
        return {
          paciente: pacientesMap.get(a.paciente_id) || "Paciente",
          data: a.data ? new Date(a.data + "T12:00:00").toLocaleDateString("pt-BR") : "",
          horario: a.horario || "",
          tipo_sessao: a.tipo_sessao || "Individual",
          status: a.status || "agendado",
          valor: a.valor ? `R$ ${Number(a.valor).toFixed(2).replace(".", ",")}` : "R$ 0,00",
          observacoes: obsDec || "",
        };
      })
    );

    // 6. Pagamentos / Financeiro
    const decryptedPagamentos = (pagsRes.data || []).map((pg) => ({
      paciente: pacientesMap.get(pg.paciente_id) || "Paciente",
      valor: pg.valor ? `R$ ${Number(pg.valor).toFixed(2).replace(".", ",")}` : "R$ 0,00",
      data_vencimento: pg.data_vencimento ? new Date(pg.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR") : "",
      status: pg.status === "pago" ? "Pago" : "Pendente",
      forma_pagamento: pg.forma_pagamento || "Não informada",
      receita_saude: pg.receita_saude ? "Sim" : "Não",
    }));

    // 7. Laudos & Documentos
    const decryptedLaudos = await Promise.all(
      (laudosRes.data || []).map(async (l) => {
        let cont = l.conteudo;
        if (l.tipo_documento === "text" && cont && cont.startsWith("enc:v1:")) {
          cont = await decryptClinicalData(cont, userId);
        }
        return {
          paciente: pacientesMap.get(l.paciente_id) || "Paciente",
          titulo: l.titulo || "Documento Clínico",
          tipo: l.tipo_documento === "text" ? "Texto Estruturado" : "Arquivo PDF",
          conteudo: cont || "",
          emitido_em: l.created_at ? new Date(l.created_at).toLocaleString("pt-BR") : "",
        };
      })
    );

    // ─── CONSTRUÇÃO DO CSV CONSOLIDADO (UTF-8 BOM) ───
    let csv = "\uFEFF"; // Byte Order Mark para acentuação perfeita no Microsoft Excel

    // Cabeçalho Geral do Backup
    csv += createCSVRow(["BACKUP COMPLETO DO SISTEMA - PSISETTING GESTÃO CLÍNICA"]);
    csv += createCSVRow(["Profissional Responsável:", userNome || "Psicólogo(a)"]);
    csv += createCSVRow(["Data do Backup:", new Date().toLocaleString("pt-BR")]);
    csv += createCSVRow(["Total de Pacientes:", decryptedPacientes.length]);
    csv += createCSVRow(["Total de Evoluções de Prontuário:", decryptedProntuarios.length]);
    csv += createCSVRow(["Total de Notas do Diário de Bordo:", decryptedDiarios.length]);
    csv += createCSVRow(["Conformidade Legal:", "CFP Resolução nº 01/2009 & Lei Geral de Proteção de Dados (LGPD)"]);
    csv += createCSVRow([]);
    csv += createCSVRow(["================================================================================"]);
    csv += createCSVRow([]);

    // SEÇÃO 1: PACIENTES
    csv += createCSVRow(["--- 1. PACIENTES CADASTRADOS ---"]);
    csv += createCSVRow([
      "Nome Completo",
      "CPF",
      "Telefone",
      "E-mail",
      "Data de Nascimento",
      "Endereço",
      "Contato de Emergência",
      "Status",
      "Data de Cadastro",
      "Observações Gerais",
    ]);
    decryptedPacientes.forEach((p) => {
      csv += createCSVRow([
        p.nome,
        p.cpf,
        p.telefone,
        p.email,
        p.data_nascimento,
        p.endereco,
        p.contato_emergencia,
        p.status,
        p.cadastrado_em,
        p.observacoes_gerais,
      ]);
    });
    csv += createCSVRow([]);

    // SEÇÃO 2: PRONTUÁRIOS
    csv += createCSVRow(["--- 2. PRONTUÁRIOS & EVOLUÇÕES CLÍNICAS ---"]);
    csv += createCSVRow(["Paciente", "Data da Sessão", "Evolução Clínica / Registro", "Data de Registro no Sistema"]);
    decryptedProntuarios.forEach((pr) => {
      csv += createCSVRow([pr.paciente, pr.data_sessao, pr.evolucao_clinica, pr.criado_em]);
    });
    csv += createCSVRow([]);

    // SEÇÃO 3: DIÁRIO DE BORDO
    csv += createCSVRow(["--- 3. DIÁRIO DE BORDO & ESTUDO DE CASO ---"]);
    csv += createCSVRow(["Paciente", "Data da Nota", "Anotações Clínicas / Supervisão", "Data de Criação"]);
    decryptedDiarios.forEach((d) => {
      csv += createCSVRow([d.paciente, d.data, d.anotacoes_estudo_caso, d.criado_em]);
    });
    csv += createCSVRow([]);

    // SEÇÃO 4: AGENDAMENTOS
    csv += createCSVRow(["--- 4. HISTÓRICO DE AGENDAMENTOS & SESSÕES ---"]);
    csv += createCSVRow(["Paciente", "Data", "Horário", "Tipo de Sessão", "Status", "Valor", "Observações"]);
    decryptedAgendamentos.forEach((a) => {
      csv += createCSVRow([a.paciente, a.data, a.horario, a.tipo_sessao, a.status, a.valor, a.observacoes]);
    });
    csv += createCSVRow([]);

    // SEÇÃO 5: FINANCEIRO
    csv += createCSVRow(["--- 5. REGISTROS FINANCEIROS & PAGAMENTOS ---"]);
    csv += createCSVRow(["Paciente", "Valor", "Vencimento", "Status", "Forma de Pagamento", "Receita Saúde"]);
    decryptedPagamentos.forEach((pg) => {
      csv += createCSVRow([pg.paciente, pg.valor, pg.data_vencimento, pg.status, pg.forma_pagamento, pg.receita_saude]);
    });
    csv += createCSVRow([]);

    // SEÇÃO 6: LAUDOS E DOCUMENTOS
    csv += createCSVRow(["--- 6. LAUDOS & DOCUMENTOS EMITIDOS ---"]);
    csv += createCSVRow(["Paciente", "Título do Documento", "Tipo", "Data de Emissão", "Conteúdo"]);
    decryptedLaudos.forEach((l) => {
      csv += createCSVRow([l.paciente, l.titulo, l.tipo, l.emitido_em, l.conteudo]);
    });

    // ─── DISPARO DO DOWNLOAD NO NAVEGADOR ───
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const dataAtual = new Date().toISOString().split("T")[0];
    const nomeLimpo = (userNome || "psicologo")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "_");
    const filename = `backup_psisetting_${nomeLimpo}_${dataAtual}.csv`;

    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return { success: true, filename };
  } catch (err: any) {
    console.error("Erro ao gerar backup completo:", err);
    return { success: false, error: err.message || "Falha ao gerar backup" };
  }
}
