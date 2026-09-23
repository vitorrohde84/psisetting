/**
 * Utilitário de Exportação e Backup Completo dos Dados Clínicos.
 * Executado 100% no navegador da psicóloga com descriptografia client-side.
 * Gera arquivo .CSV consolidado com UTF-8 BOM para compatibilidade com Excel / Google Sheets.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { decryptClinicalData , ehCifrado } from "./crypto";
import {
  COLUNAS_SUPERVISAO,
  linhasSupervisaoParaBackup,
  type AnotacaoParaBackup,
  type ComentarioSupervisao,
} from "./diario-supervisao";
import {
  COLUNAS_SUPERVISAO_AGENDA,
  linhasSupervisaoAgendaParaBackup,
  normalizarLinha,
} from "./supervisao-agenda";

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
      supervisoesRes,
      agendaSupervisoesRes,
    ] = await Promise.all([
      supabase.from("pacientes").select("*").order("nome", { ascending: true }),
      supabase.from("prontuarios").select("*").order("data", { ascending: false }),
      supabase.from("diario_bordo").select("*").order("data", { ascending: false }),
      supabase.from("agendamentos").select("*").order("data", { ascending: false }),
      supabase.from("pagamentos").select("*").order("data_vencimento", { ascending: false }),
      supabase.from("laudos").select("*").order("created_at", { ascending: false }),
      supabase.from("diario_supervisoes").select(COLUNAS_SUPERVISAO),
      supabase.from("agenda_supervisoes").select(COLUNAS_SUPERVISAO_AGENDA).order("data", { ascending: false }),
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
    // Guarda cada anotação decifrada pelo id: é assim que os comentários de
    // supervisão, logo abaixo, são ligados à anotação e ao paciente.
    const anotacoesPorId = new Map<string, AnotacaoParaBackup>();
    const decryptedDiarios = await Promise.all(
      (diariosRes.data || []).map(async (d) => {
        const conteudoDec = await decryptClinicalData(d.conteudo, userId);
        anotacoesPorId.set(d.id, {
          paciente: pacientesMap.get(d.paciente_id) || "Paciente",
          data: d.data || "",
          conteudo: conteudoDec,
        });
        return {
          paciente: pacientesMap.get(d.paciente_id) || "Paciente",
          data: d.data ? new Date(d.data + "T12:00:00").toLocaleDateString("pt-BR") : "",
          anotacoes_estudo_caso: conteudoDec,
          criado_em: d.created_at ? new Date(d.created_at).toLocaleString("pt-BR") : "",
        };
      })
    );

    // 4.1 Descriptografa Comentários de Supervisão do Diário
    // Falha nesta leitura não derruba o backup inteiro (o resto já está em
    // mãos), mas também não some em silêncio: a seção sai com o aviso no lugar
    // das linhas, para ninguém guardar o arquivo achando que a supervisão está lá.
    const erroSupervisoes = supervisoesRes.error
      ? supervisoesRes.error.message || "falha ao ler a tabela diario_supervisoes"
      : null;
    const supervisoesDecifradas: ComentarioSupervisao[] = await Promise.all(
      ((supervisoesRes.data || []) as ComentarioSupervisao[]).map(async (s) => ({
        ...s,
        conteudo: await decryptClinicalData(s.conteudo, userId),
        supervisor: s.supervisor ? await decryptClinicalData(s.supervisor, userId) : null,
      }))
    );
    const linhasSupervisao = linhasSupervisaoParaBackup(supervisoesDecifradas, anotacoesPorId);

    // 5. Descriptografa Agendamentos
    const decryptedAgendamentos = await Promise.all(
      (agendsRes.data || []).map(async (a) => {
        let obsDec = a.observacoes;
        if (obsDec && ehCifrado(obsDec)) {
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

    // 5.1 Agenda de Supervisões (aba Supervisões da Agenda)
    // Mesmo tratamento dos comentários de supervisão do diário: falha na
    // leitura não derruba o backup, mas a seção sai com o aviso no lugar das
    // linhas — ninguém guarda o arquivo achando que a agenda está lá.
    const erroAgendaSupervisoes = agendaSupervisoesRes.error
      ? agendaSupervisoesRes.error.message || "falha ao ler a tabela agenda_supervisoes"
      : null;
    const agendaSupervisoesDecifradas = await Promise.all(
      ((agendaSupervisoesRes.data || []) as Record<string, unknown>[]).map(async (linha) => {
        const s = normalizarLinha(linha);
        return s.observacoes && ehCifrado(s.observacoes)
          ? { ...s, observacoes: await decryptClinicalData(s.observacoes, userId) }
          : s;
      })
    );
    const linhasAgendaSupervisoes = linhasSupervisaoAgendaParaBackup(agendaSupervisoesDecifradas);

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
        if (l.tipo_documento === "text" && cont && ehCifrado(cont)) {
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
    csv += createCSVRow([
      "Total de Comentários de Supervisão:",
      erroSupervisoes ? "não exportados (ver seção 3.1)" : linhasSupervisao.length,
    ]);
    csv += createCSVRow([
      "Total de Supervisões na Agenda:",
      erroAgendaSupervisoes ? "não exportadas (ver seção 4.1)" : linhasAgendaSupervisoes.length,
    ]);
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

    // SEÇÃO 3.1: SUPERVISÃO DO DIÁRIO (numerada como subseção para não mudar a
    // numeração das seções que já existiam nos backups anteriores)
    csv += createCSVRow(["--- 3.1. COMENTÁRIOS DE SUPERVISÃO (DIÁRIO DE BORDO) ---"]);
    csv += createCSVRow([
      "Paciente",
      "Data da Nota",
      "Início da Nota",
      "Data da Supervisão",
      "Supervisor(a)",
      "Comentário de Supervisão",
      "Data de Registro no Sistema",
    ]);
    if (erroSupervisoes) {
      csv += createCSVRow([`ATENÇÃO: os comentários de supervisão NÃO foram exportados (${erroSupervisoes}). Tente gerar o backup novamente.`]);
    } else {
      linhasSupervisao.forEach((s) => {
        csv += createCSVRow([
          s.paciente,
          s.dataNota,
          s.trechoNota,
          s.dataSupervisao,
          s.supervisor,
          s.comentario,
          s.created_at ? new Date(s.created_at).toLocaleString("pt-BR") : "",
        ]);
      });
    }
    csv += createCSVRow([]);

    // SEÇÃO 4: AGENDAMENTOS
    csv += createCSVRow(["--- 4. HISTÓRICO DE AGENDAMENTOS & SESSÕES ---"]);
    csv += createCSVRow(["Paciente", "Data", "Horário", "Tipo de Sessão", "Status", "Valor", "Observações"]);
    decryptedAgendamentos.forEach((a) => {
      csv += createCSVRow([a.paciente, a.data, a.horario, a.tipo_sessao, a.status, a.valor, a.observacoes]);
    });
    csv += createCSVRow([]);

    // SEÇÃO 4.1: AGENDA DE SUPERVISÕES (subseção, como a 3.1, para não mudar a
    // numeração das seções que já existiam nos backups anteriores)
    csv += createCSVRow(["--- 4.1. AGENDA DE SUPERVISÕES ---"]);
    csv += createCSVRow([
      "Data",
      "Horário",
      "Duração",
      "Papel",
      "Colega",
      "WhatsApp do Colega",
      "Modalidade",
      "Status",
      "Valor",
      "Pagamento",
      "Faz Parte de Série",
      "Observações",
    ]);
    if (erroAgendaSupervisoes) {
      csv += createCSVRow([`ATENÇÃO: as supervisões da agenda NÃO foram exportadas (${erroAgendaSupervisoes}). Tente gerar o backup novamente.`]);
    } else {
      linhasAgendaSupervisoes.forEach((s) => {
        csv += createCSVRow([
          s.data,
          s.horario,
          s.duracao,
          s.papel,
          s.colega,
          s.whatsapp,
          s.modalidade,
          s.status,
          s.valor,
          s.situacaoPagamento,
          s.serie,
          s.observacoes,
        ]);
      });
    }
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
