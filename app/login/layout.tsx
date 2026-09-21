import type { Metadata } from "next";
import { PwaRegister } from "@/app/components/pwa-register";
import { PWA_METADATA } from "@/utils/pwa";

// O login é a porta de entrada do app: é daqui que o psicólogo instala o PsiSetting.
export const metadata: Metadata = PWA_METADATA;

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <PwaRegister />
    </>
  );
}
