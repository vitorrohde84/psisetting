import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PsiSetting — Gestão Clínica para Psicólogos",
    short_name: "PsiSetting",
    description: "Software de gestão clínica, prontuários eletrônicos e agenda para psicólogos.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF6F0",
    theme_color: "#5C6753",
    icons: [
      {
        src: "/icon.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/apple-icon.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/logo.png",
        sizes: "any",
        type: "image/png",
      },
    ],
  };
}
