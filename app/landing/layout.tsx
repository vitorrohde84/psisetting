import type { Metadata } from "next";

// Título e descrição são o que aparece no resultado do Google. Antes eram o
// slogan, que não contém nenhum termo que um psicólogo digite ao procurar um
// sistema. O slogan continua no topo da página e no compartilhamento.
export const metadata: Metadata = {
  title: "Sistema para Psicólogos com Prontuário Eletrônico | PsiSetting",
  description:
    "Sistema para psicólogos com prontuário eletrônico criptografado, agenda, financeiro e os 5 documentos da Resolução CFP 06/2019. Teste grátis por 7 dias.",
  alternates: {
    canonical: "https://www.psisetting.com.br",
  },
  openGraph: {
    title: "PsiSetting — Seu setting clínico organizado, protegido e em um só lugar",
    description:
      "Desenvolvido e validado em colaboração com psicóloga clínica atuante. Prontuário protegido, gestão da clínica e documentos psicológicos.",
    url: "https://www.psisetting.com.br",
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
  // Sem `verification`: estava no ar com o texto de exemplo
  // "GOOGLE_SITE_VERIFICATION_CODE", que não verifica nada. A verificação do
  // Search Console é feita pelo DNS do domínio, que cobre www e app de uma vez.
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
