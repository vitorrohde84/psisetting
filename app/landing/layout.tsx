import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PsiSetting — Seu setting clínico organizado, protegido e em um só lugar",
  description:
    "Um sistema que entende como uma sessão de psicoterapia realmente acontece. Prontuário protegido, gestão da clínica e documentos conforme a Resolução CFP nº 06/2019.",
  alternates: {
    canonical: "https://psisetting.com.br",
  },
  openGraph: {
    title: "PsiSetting — Seu setting clínico organizado, protegido e em um só lugar",
    description:
      "Desenvolvido e validado em colaboração com psicóloga clínica atuante. Prontuário protegido, gestão da clínica e documentos psicológicos.",
    url: "https://psisetting.com.br",
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
    title: "PsiSetting — Seu setting clínico organizado, protegido e em um só lugar",
    description:
      "Desenvolvido e validado em colaboração com psicóloga clínica atuante. Prontuário protegido, gestão da clínica e documentos psicológicos.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/logo.png" },
      { url: "/icon.png" },
    ],
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  verification: {
    google: "GOOGLE_SITE_VERIFICATION_CODE",
  },
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
