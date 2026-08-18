import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PsiSetting — Gestão Clínica para Psicólogos | Prontuários, Laudos e Agenda",
  description:
    "Plataforma segura de gestão clínica para psicólogos. Prontuários eletrônicos, laudos CFP 06/2019, agenda com iCal, financeiro e Modo Privacidade. Conforme LGPD.",
  alternates: {
    canonical: "https://psisetting.com.br/landing",
  },
  openGraph: {
    title: "PsiSetting — Seu setting terapêutico, agora também digital",
    description:
      "Prontuários, laudos, agenda e financeiro em conformidade com o CFP. Foque na escuta.",
    url: "https://psisetting.com.br/landing",
    siteName: "PsiSetting",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "PsiSetting — Gestão Clínica para Psicólogos",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PsiSetting — Gestão Clínica para Psicólogos",
    description:
      "Plataforma segura de gestão clínica. Prontuários, laudos CFP, agenda e financeiro. Conforme LGPD.",
    images: ["/og-image.png"],
  },
  verification: {
    google: "GOOGLE_SITE_VERIFICATION_CODE", // Substituir quando configurar o Search Console
  },
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
