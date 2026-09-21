import type { Metadata, Viewport } from "next";
import { Inter, Lora } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#5C6753",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://www.psisetting.com.br"),
  title: "PsiSetting — O Software Clínico mais Elegante e Seguro para Psicólogos",
  description:
    "Gestão de consultório descomplicada: prontuários criptografados, 5 modelos CFP, agenda integrada e controle financeiro completo. Experimente grátis.",
  applicationName: "PsiSetting",
  // Manifesto e appleWebApp (o que torna a página instalável) NÃO ficam aqui:
  // este layout também serve a landing de www.psisetting.com.br. Ver utils/pwa.ts.
  formatDetection: {
    telephone: false,
  },
  keywords: [
    "software para psicólogos",
    "prontuário eletrônico psicologia",
    "gestão clínica psicologia",
    "laudos cfp",
    "psicologia clínica",
    "agenda para psicólogos",
  ],
  authors: [{ name: "PsiSetting" }],
  creator: "PsiSetting",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "https://www.psisetting.com.br",
    title: "PsiSetting — Gestão Clínica para Psicólogos",
    description:
      "Prontuários eletrônicos com criptografia clínica, 5 modelos oficiais CFP, agenda e financeiro. Teste grátis.",
    siteName: "PsiSetting",
    images: [
      {
        url: "/psisetting-logo.png",
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
      "Software clínico acolhedor, seguro e em conformidade com o CFP. Teste grátis.",
    images: ["/psisetting-logo.png"],
  },
  icons: {
    icon: [
      { url: "/logo.png" },
      { url: "/icon.png" },
      { url: "/favicon.ico" },
    ],
    shortcut: "/logo.png",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${lora.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-text font-sans">
        {children}
      </body>
    </html>
  );
}
