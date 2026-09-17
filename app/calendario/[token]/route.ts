import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { decryptClinicalData , ehCifrado } from "@/utils/crypto";
import { checkRateLimit, getClientIp } from "@/utils/rate-limit";

/**
 * RFC 5545 iCalendar feed for subscribing in Apple Calendar / iPhone.
 *
 * URL: /calendario/[token]
 * Protocol: webcal://hostname/calendario/[token]
 *
 * MULTI-USER: Each psychologist has their own unique calendar_token
 * stored in the profiles table. The token is looked up to identify
 * which psychologist's appointments to include in the feed.
 *
 * This route is public (no auth required) — secured by the secret token.
 * Uses the admin client (service_role) to bypass RLS since there's no user session.
 */

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { token } = await params;

  if (!token) {
    return new NextResponse("Não autorizado", { status: 403 });
  }

  // O token é a única credencial deste caminho, e a rota lê dado clínico sem
  // sessão. Sem limite, ela é um oráculo de adivinhação ilimitado. 60 requisições
  // por hora acomodam qualquer cliente de calendário real — o iPhone atualiza
  // algumas vezes ao dia.
  const rate = await checkRateLimit(`ical:${getClientIp(request)}`, 60, 60 * 60 * 1000);
  if (!rate.success) {
    return new NextResponse("Muitas requisições", { status: 429 });
  }

  try {
    const supabase = createAdminClient();

    // Look up the psychologist by their calendar_token
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, nome")
      .eq("calendar_token", token)
      .single();

    if (profileError || !profile) {
      return new NextResponse("Não autorizado", { status: 403 });
    }

    const psicologoId = profile.id;
    const psicologoNome = profile.nome || "Psicólogo";

    // Fetch upcoming and recent agendamentos for THIS psychologist
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString().split("T")[0];

    const { data: agendamentos, error } = await supabase
      .from("agendamentos")
      // `observacoes` deixou de ser buscado: não entra mais no feed (A03), e o
      // que não é lido não pode vazar.
      .select("id, data, horario, duracao_minutos, modalidade, status, pacientes(nome)")
      .eq("psicologo_id", psicologoId)
      .gte("data", cutoffDate)
      .in("status", ["agendado", "confirmado", "realizado"])
      .order("data", { ascending: true })
      .order("horario", { ascending: true });

    if (error) {
      console.error("iCal feed error:", error);
      return new NextResponse("Erro interno", { status: 500 });
    }

    // O nome é descriptografado apenas para ser reduzido a "Maria S." no
    // SUMMARY. Ele não sai daqui inteiro — ver A03 e o comentário na montagem
    // da DESCRIPTION. As observações clínicas não são mais lidas.
    const decryptedAgendamentos = await Promise.all(
      (agendamentos || []).map(async (ag) => {
        let pacNome = (ag.pacientes as { nome?: string })?.nome || "Paciente";
        if (pacNome && ehCifrado(pacNome)) {
          pacNome = await decryptClinicalData(pacNome, psicologoId);
        }
        return {
          ...ag,
          pacienteNomeDecrypted: pacNome,
        };
      })
    );

    // Generate iCalendar content
    const icsContent = generateICS(decryptedAgendamentos, psicologoNome);

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="agenda-${psicologoNome.toLowerCase().replace(/\s+/g, "-")}.ics"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err) {
    console.error("iCal feed error:", err);
    return new NextResponse("Erro ao gerar calendário", { status: 500 });
  }
}

function formatShortPatientName(fullName: string): string {
  if (!fullName || ehCifrado(fullName)) return "Paciente";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "Paciente";

  const firstName = parts[0];
  const initials = parts
    .slice(1)
    .filter((p) => !["de", "da", "do", "das", "dos", "e"].includes(p.toLowerCase()))
    .map((p) => `${p[0]?.toUpperCase()}.`)
    .join(" ");

  return initials ? `${firstName} ${initials}` : firstName;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generateICS(agendamentos: any[], psicologoNome: string): string {
  const now = formatICSDate(new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PsiSetting//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:Agenda — ${escapeICS(psicologoNome)}`,
    "X-WR-TIMEZONE:America/Sao_Paulo",
    "",
    // Timezone definition
    "BEGIN:VTIMEZONE",
    "TZID:America/Sao_Paulo",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:-0300",
    "TZOFFSETTO:-0300",
    "TZNAME:BRT",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const ag of agendamentos) {
    const pacienteNome =
      ag.pacienteNomeDecrypted ||
      (ag.pacientes as { nome?: string })?.nome ||
      "Paciente";

    const shortName = formatShortPatientName(pacienteNome);

    // Parse date and time
    const dateStr = ag.data; // YYYY-MM-DD
    const timeStr = ag.horario || "00:00:00"; // HH:MM:SS
    const duration = ag.duracao_minutos || 50; // Default 50min session

    // Build DTSTART: YYYYMMDDTHHMMSS
    const dtStart = `${dateStr.replace(/-/g, "")}T${timeStr.replace(/:/g, "").slice(0, 6)}`;

    // Calculate DTEND
    const startDate = new Date(`${dateStr}T${timeStr}`);
    const endDate = new Date(startDate.getTime() + duration * 60000);
    const dtEnd = formatICSDate(endDate);

    // Build summary: "Nome S. (Modalidade)"
    const modalidade = ag.modalidade === "online" ? " (Online)" : ag.modalidade === "presencial" ? " (Presencial)" : "";
    const summary = escapeICS(`${shortName}${modalidade}`);

    // Status mapping
    let icsStatus = "CONFIRMED";
    if (ag.status === "agendado") icsStatus = "TENTATIVE";
    if (ag.status === "cancelado") icsStatus = "CANCELLED";

    lines.push("");
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ag.id}@psisetting.app`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;TZID=America/Sao_Paulo:${dtStart}`);
    lines.push(`DTEND;TZID=America/Sao_Paulo:${dtEnd}`);
    lines.push(`SUMMARY:${summary}`);
    lines.push(`STATUS:${icsStatus}`);

    // A03 — docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
    //
    // A DESCRIPTION levava `Paciente: <nome completo>` e `Obs: <anotação
    // clínica>` em texto claro. Esta rota é PÚBLICA: basta a URL. E uma URL de
    // calendário trafega por histórico de navegador, logs de proxy/CDN e
    // backup de iPhone — lugares onde dado sensível de saúde (LGPD art. 11)
    // não pode estar.
    //
    // A anonimização do SUMMARY ("Maria S.") não servia de nada enquanto a
    // DESCRIPTION a desfazia logo abaixo. O feed passa a carregar apenas o que
    // um calendário precisa para ser útil: quando, por quanto tempo e em que
    // modalidade. Quem precisa do prontuário abre o sistema, autenticado.
    if (ag.modalidade) {
      const modalidadeLabel = ag.modalidade === "online" ? "Online" : "Presencial";
      lines.push(`DESCRIPTION:${escapeICS(`Modalidade: ${modalidadeLabel}`)}`);
    }

    lines.push("END:VEVENT");
  }

  lines.push("");
  lines.push("END:VCALENDAR");

  return lines.join("\r\n");
}

function formatICSDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    date.getFullYear().toString() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    "T" +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    // \r precisa ser tratado junto com \n: o iCal separa propriedades por
    // CRLF, então um CR solto permite injetar propriedades no evento.
    .replace(/\r\n|\r|\n/g, "\\n");
}
