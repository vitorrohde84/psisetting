import { PacienteDetailClient } from "@/app/components/paciente-detail";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PacienteDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <PacienteDetailClient pacienteId={id} />;
}
