import Link from "next/link";
import { PsiSettingBrand } from "@/app/components/psi-setting-brand";
import { ArrowLeft, Shield, Lock, Eye, Database, CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidade e Proteção de Dados | PsiSetting",
  description: "Política de Privacidade, segurança e tratamento de dados da plataforma PsiSetting em conformidade com a LGPD e normativas do CFP.",
  // A página também responde em app.psisetting.com.br; a versão oficial é a do www.
  alternates: {
    canonical: "https://www.psisetting.com.br/privacidade",
  },
};

export default function PrivacidadePage() {
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
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
            <Shield size={13} />
            <span>Privacidade e Proteção de Dados</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-text tracking-tight">
            Política de Privacidade do PsiSetting
          </h1>
          <p className="text-sm text-text-muted">
            Última atualização: 19 de agosto de 2026 · Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 - LGPD)
          </p>
        </div>

        {/* Highlight Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
          <div className="p-4 rounded-2xl bg-surface border border-border/80 space-y-1.5 shadow-2xs">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Lock size={16} />
            </div>
            <h3 className="text-xs font-bold text-text">Criptografia AES-256</h3>
            <p className="text-[11px] text-text-muted leading-relaxed">
              Prontuários e dados clínicos confidenciais cifrados em repouso e em trânsito (SSL 256-bit).
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-surface border border-border/80 space-y-1.5 shadow-2xs">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Database size={16} />
            </div>
            <h3 className="text-xs font-bold text-text">Isolamento de Contas</h3>
            <p className="text-[11px] text-text-muted leading-relaxed">
              Estrutura multi-tenant com políticas de isolamento rigoroso por psicólogo no banco de dados.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-surface border border-border/80 space-y-1.5 shadow-2xs">
            <div className="w-8 h-8 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center">
              <Eye size={16} />
            </div>
            <h3 className="text-xs font-bold text-text">Modo Privacidade</h3>
            <p className="text-[11px] text-text-muted leading-relaxed">
              Recurso em 1 clique para ofuscar nomes e dados diagnósticos na tela durante atendimentos.
            </p>
          </div>
        </div>

        <div className="prose prose-neutral max-w-none text-sm text-text/90 space-y-6 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-serif font-bold text-text border-b border-border/60 pb-2">
              1. Papéis no Tratamento de Dados (Controlador e Operador)
            </h2>
            <p>
              Nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD):
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
              <li>
                <strong>O Psicólogo (Profissional Usuário):</strong> Atua como <em>Controlador</em> dos dados pessoais e dados pessoais sensíveis (de saúde) de seus respectivos pacientes, sendo o responsável pela base legal do tratamento e pela coleta de consentimento quando aplicável.
              </li>
              <li>
                <strong>O PsiSetting:</strong> Atua como <em>Operador</em> tecnológico, fornecendo a infraestrutura em nuvem, armazenamento seguro e ferramentas de processamento estritamente conforme as diretrizes do Controlador.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-serif font-bold text-text border-b border-border/60 pb-2">
              2. Dados Coletados e Finalidade
            </h2>
            <p>Coletamos e processamos exclusivamente os dados necessários para a operação do sistema:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
              <li><strong>Dados do Profissional:</strong> Nome completo, e-mail, CRP e dados de faturamento para gestão da assinatura.</li>
              <li><strong>Dados Clínicos e de Pacientes:</strong> Registros cadastrais, evoluções de sessões, diário de bordo e histórico de pagamentos inseridos deliberadamente pelo psicólogo para a condução do acompanhamento clínico.</li>
              <li><strong>Dados de Acesso Técnico:</strong> Logs de sessão, horário de último acesso e endereço IP para prevenção a fraudes e controle de segurança.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-serif font-bold text-text border-b border-border/60 pb-2">
              3. Medidas Técnicas de Segurança
            </h2>
            <p>
              Implementamos salvaguardas técnicas e administrativas para proteger as informações:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm">
              <li>Criptografia de ponta a ponta em trânsito com protocolo HTTPS / TLS 1.3.</li>
              <li>Criptografia de campos clínicos sensíveis com algoritmo AES-GCM de 256 bits.</li>
              <li>Políticas rigorosas de Row Level Security (RLS) no banco de dados PostgreSQL.</li>
              <li>Encerramento automático de sessão por inatividade (30 minutos) para evitar acessos indevidos em computadores do consultório.</li>
              <li>Arquivos e PDFs armazenados em buckets privados com links assinados de curta duração (10 minutos).</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-serif font-bold text-text border-b border-border/60 pb-2">
              4. Não Compartilhamento e Sigilo
            </h2>
            <p>
              O PsiSetting <strong>não comercializa, não compartilha e não utiliza dados clínicos ou cadastrais para fins de publicidade</strong>. O compartilhamento ocorre exclusivamente com prestadores de infraestrutura essencial (como processamento bancário seguro pelo Mercado Pago e hospedagem em nuvem com conformidade ISO 27001 / SOC 2).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-serif font-bold text-text border-b border-border/60 pb-2">
              5. Direitos do Titular de Dados
            </h2>
            <p>
              Em respeito ao Artigo 18 da LGPD, os titulares têm o direito de confirmar a existência de tratamento, acessar seus dados, solicitar correção de dados incompletos ou inexatos, e solicitar a eliminação de dados tratados em desconformidade.
            </p>
            <p>
              Pacientes que desejem exercer seus direitos devem contatar diretamente seu psicólogo assistente (Controlador), que possui todas as ferramentas para visualização, retificação e exportação dos dados no sistema.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-serif font-bold text-text border-b border-border/60 pb-2">
              6. Encarregado de Proteção de Dados (DPO) e Contato
            </h2>
            <p>
              Para dúvidas sobre privacidade, segurança ou exercício de direitos de proteção de dados, entre em contato através do canal oficial:{" "}
              <a href="mailto:privacidade@psisetting.com.br" className="text-primary font-semibold hover:underline">
                privacidade@psisetting.com.br
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
