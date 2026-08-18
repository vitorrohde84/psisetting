import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { decryptClinicalData } from "@/utils/crypto";

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

export async function GET(_request: Request, { params }: RouteParams) {
  const { token } = await params;

  if (!token) {
    return new NextResponse("Não autorizado", { status: 403 });
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
      .select("id, data, horario, duracao_minutos, modalidade, status, observacoes, pacientes(nome)")
      .eq("psicologo_id", psicologoId)
      .gte("data", cutoffDate)
      .in("status", ["agendado", "confirmado", "realizado"])
      .order("data", { ascending: true })
      .order("horario", { ascending: true });

    if (error) {
      console.error("iCal feed error:", error);
      return new NextResponse("Erro interno", { status: 500 });
    }

    // Decodificar dados confidenciais (nome do paciente e observações) para o feed da psicóloga
    const decryptedAgendamentos = await Promise.all(
      (agendamentos || []).map(async (ag) => {
        let pacNome = (ag.pacientes as { nome?: string })?.nome || "Paciente";
        if (pacNome && pacNome.startsWith("enc:v1:")) {
          pacNome = await decryptClinicalData(pacNome, psicologoId);
        }
        let obs = ag.observacoes;
        if (obs && obs.startsWith("enc:v1:")) {
          obs = await decryptClinicalData(obs, psicologoId);
        }
        return {
          ...ag,
          pacienteNomeDecrypted: pacNome,
          observacoesDecrypted: obs,
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
  if (!fullName) return "Paciente";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "Paciente";

  const firstName = parts[0];
  const initials = parts
    .slice(1)
    .filter((p) => !["de", "da", "do", "das", "dos", "e"].includes(p.toLowerCase()))
    .map((p) => `${p[0].toUpperCase()}.`)
    .join(" ");

  return initials ? `${firstName} ${initials}` : firstName;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generateICS(agendamentos: any[], psicologoNome: string): string {
  const now = formatICSDate(new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PsychoCare//Agenda//PT-BR",
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
    lines.push(`UID:${ag.id}@psychocare.app`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;TZID=America/Sao_Paulo:${dtStart}`);
    lines.push(`DTEND;TZID=America/Sao_Paulo:${dtEnd}`);
    lines.push(`SUMMARY:${summary}`);
    lines.push(`STATUS:${icsStatus}`);

    const obs = ag.observacoesDecrypted || ag.observacoes;
    const descriptionParts = [
      `Paciente: ${pacienteNome}`,
      ag.modalidade ? `Modalidade: ${ag.modalidade === "online" ? "Online" : "Presencial"}` : null,
      obs ? `Obs: ${obs}` : null,
    ].filter(Boolean);

    if (descriptionParts.length > 0) {
      lines.push(`DESCRIPTION:${escapeICS(descriptionParts.join(" | "))}`);
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
    .replace(/\n/g, "\\n");
}
