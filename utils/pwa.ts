import type { Metadata } from "next";

/**
 * Metadados que tornam a página instalável como aplicativo (PWA).
 *
 * Entram SOMENTE nas páginas do app (app.psisetting.com.br: login e sistema).
 * O site institucional em www.psisetting.com.br não é o aplicativo: com
 * manifesto, o Chrome oferece "Instalar" na landing, e quem instala ganha um
 * atalho que abre a página de vendas em vez do sistema.
 *
 * Por isso o manifesto mora em public/manifest.webmanifest e não em
 * app/manifest.ts — o arquivo especial do Next injeta o <link rel="manifest">
 * em todas as páginas, sem como excluir a landing.
 */
export const PWA_METADATA: Metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PsiSetting",
  },
};
