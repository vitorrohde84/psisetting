import Link from "next/link";
import { PsiSettingBrand } from "@/app/components/psi-setting-brand";
import { ArrowLeft, Shield, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termos de Uso | PsiSetting",
  description: "Termos e Condições de Uso da plataforma PsiSetting para psicólogos clínicos.",
};

export default function TermosPage() {
  return (
    <div className="min-h-screen bg-background text-text antialiased">
      {/* Header */}
      <header className="border-b border-border/80 bg-surface/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <PsiSettingBrand size="md" showSubtitle={true} subtitleText="Setting Clínico" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-text transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Voltar ao início</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-8">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20">
            <FileText size={13} />
            <span>Documento Legal e Ético</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-text tracking-tight">
            Termos de Uso do PsiSetting
          </h1>
          <p className="text-sm text-text-muted">
            Última atualização: 19 de agosto de 2026
          </p>
        </div>

        {/* Disclaimer Box */}
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm text-amber-900">
            <AlertCircle size={17} className="text-amber-700 shrink-0" />
            <span>Ferramenta de Apoio à Prática Profissional</span>
          </div>
          <p className="text-xs sm:text-sm text-amber-900/90 leading-relaxed">
            O <strong>PsiSetting</strong> é uma plataforma tecnológica de apoio à organização, gestão e elaboração documental para psicólogos clínicos. O uso do sistema não substitui o conhecimento técnico, o julgamento clínico do profissional nem as normativas emitidas pelo Conselho Federal de Psicologia (CFP).
          </p>
        </div>

        <div className="prose prose-neutral max-w-none text-sm text-text/90 space-y-6 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-serif font-bold text-text border-b border-border/60 pb-2">
              1. Aceitação dos Termos
            </h2>
            <p>
              Ao criar uma conta, acessar ou utilizar a plataforma <strong>PsiSetting</strong>, o profissional declara ser psicólogo devidamente graduado e/ou registrado em seu respectivo Conselho Regional de Psicologia (CRP), concordando integralmente com as disposições aqui estabelecidas e com nossa Política de Privacidade.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-serif font-bold text-text border-b border-border/60 pb-2">
              2. Natureza do Serviço e Ferramentas de Apoio
            </h2>
            <p>
              O PsiSetting disponibiliza recursos de prontuário eletrônico, agenda com sincronização iCal, controle financeiro de atendimentos, diário de bordo e modelos estruturados de documentos psicológicos fundamentados na <strong>Resolução CFP nº 06/2019</strong>.
            </p>
            <p>
              <strong>Parágrafo Único:</strong> Os modelos de documentos (Declaração, Atestado, Relatório, Relatório Multiprofissional, Parecer e Laudo) são sugestões de estrutura técnica e referências normativas. <strong>A revisão, redação final, adequação ao caso concreto e a emissão do documento são de responsabilidade exclusiva e indelegável do psicólogo assistente.</strong>
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-serif font-bold text-text border-b border-border/60 pb-2">
              3. Responsabilidade Ética e Sigilo Profissional
            </h2>
            <p>
              Em estrita consonância com o <em>Código de Ética Profissional do Psicólogo</em> (Resolução CFP nº 010/2005) e com a <em>Resolução CFP nº 01/2009</em> (sobre guarda e registro documental):
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
              <li>O psicólogo é o titular exclusivo da guarda técnica e do sigilo das informações e evoluções clínicas que cadastra no sistema.</li>
              <li>O profissional compromete-se a utilizar senhas fortes, não compartilhar suas credenciais de acesso e manter seus dispositivos devidamente protegidos.</li>
              <li>O sistema implementa camadas de criptografia (AES-256) e mecanismos de proteção para apoiar o dever de guarda do profissional.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-serif font-bold text-text border-b border-border/60 pb-2">
              4. Planos, Período de Testes e Assinatura
            </h2>
            <p>
              O PsiSetting disponibiliza um período de avaliação gratuita de 7 dias. Após o término do período de testes:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
              <li>Caso o profissional opte por não assinar, a conta passará para o <strong>Modo Somente Leitura</strong>, assegurando que nenhum dado anteriormente inserido seja apagado ou fique inacessível para consulta e exportação, em respeito à exigência de guarda documental de 5 anos pelo CFP.</li>
              <li>A assinatura do <strong>Plano Único Profissional</strong> (R$ 34,90/mês) não possui fidelidade ou contratos de permanência mínima, podendo ser cancelada a qualquer momento nas configurações da conta.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-serif font-bold text-text border-b border-border/60 pb-2">
              5. Disponibilidade e Suporte
            </h2>
            <p>
              Buscamos manter a plataforma disponível 24 horas por dia, 7 dias por semana, com rotinas automáticas de backup e infraestrutura em nuvem de alta disponibilidade. O suporte técnico é oferecido para dúvidas e orientações sobre as funcionalidades da ferramenta.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-serif font-bold text-text border-b border-border/60 pb-2">
              6. Contato e Dúvidas
            </h2>
            <p>
              Para esclarecimentos sobre estes Termos de Uso, entre em contato pelo e-mail oficial:{" "}
              <a href="mailto:contato@psisetting.com.br" className="text-primary font-semibold hover:underline">
                contato@psisetting.com.br
              </a>.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 py-8 bg-surface text-center text-xs text-text-muted">
        <p>© {new Date().getFullYear()} PsiSetting. Todos os direitos reservados.</p>
        <div className="flex items-center justify-center gap-4 mt-2">
          <Link href="/termos" className="hover:text-primary font-medium">Termos de Uso</Link>
          <span>·</span>
          <Link href="/privacidade" className="hover:text-primary font-medium">Política de Privacidade</Link>
        </div>
      </footer>
    </div>
  );
}
