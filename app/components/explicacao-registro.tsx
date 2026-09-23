import { BookOpen, FileText, ChevronDown } from "lucide-react";

/**
 * "O que é?" — explicação curta, dentro do sistema, do prontuário e do Diário
 * de Bordo.
 *
 * Pedido da psicóloga que valida o produto: nem todo psicólogo tem
 * familiaridade com os dois registros, e confundi-los é justamente o risco — o
 * Diário de Bordo não é parte do prontuário do paciente. Fica aqui, e não no
 * site, porque é na hora de usar que a dúvida aparece (e o site precisa ser
 * leve).
 *
 * <details> nativo: abre e fecha sem JavaScript, é acessível por teclado e
 * leitor de tela, e fechado não ocupa espaço de quem já conhece.
 */
export function ExplicacaoRegistro({ tipo }: { tipo: "prontuario" | "diario" }) {
  const ehProntuario = tipo === "prontuario";
  const Icone = ehProntuario ? FileText : BookOpen;

  return (
    <details className="group rounded-2xl border border-border/80 bg-surface/70 px-4 py-3 text-sm text-text no-print">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-text-muted hover:text-text [&::-webkit-details-marker]:hidden">
        <Icone size={16} className="shrink-0 text-primary" />
        <span>{ehProntuario ? "O que é o prontuário psicológico?" : "O que é o Diário de Bordo?"}</span>
        <ChevronDown size={15} className="ml-auto shrink-0 transition-transform group-open:rotate-180" />
      </summary>

      <div className="mt-3 space-y-3 border-t border-border/60 pt-3 leading-relaxed text-text-muted">
        {ehProntuario ? (
          <>
            <p>
              É o registro documental do acompanhamento de uma pessoa atendida pelo psicólogo. Ele reúne as
              informações necessárias para registrar e dar continuidade ao trabalho profissional, preservando o sigilo.
            </p>
            <div>
              <p className="mb-1.5 font-medium text-text">O que pode constar, por exemplo:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>identificação do usuário;</li>
                <li>avaliação da demanda e definição dos objetivos;</li>
                <li>registro do trabalho realizado e sua evolução;</li>
                <li>procedimentos técnico-científicos utilizados;</li>
                <li>encaminhamentos ou encerramento, quando houver;</li>
                <li>documentos produzidos pelo psicólogo relacionados ao atendimento.</li>
              </ul>
            </div>
            <p>Não é necessário escrever uma transcrição de tudo o que o paciente falou.</p>
          </>
        ) : (
          <>
            <p>
              O Diário de Bordo foi pensado como um espaço de uso exclusivo do psicólogo, separado do prontuário. A
              ideia é que ele possa ser usado para anotações de trabalho, impressões e elaboração clínica que fazem
              parte do processo do próprio profissional, sem se confundir com o registro documental do paciente.
            </p>
            <p>
              Por isso, ele fica separado do prontuário e tem acesso restrito ao psicólogo, com os mesmos cuidados de
              sigilo e segurança. O que está registrado no Diário de Bordo não é apresentado ao paciente como se fosse
              parte do prontuário. É um recurso para auxiliar o profissional na organização e elaboração do seu
              trabalho clínico.
            </p>
          </>
        )}
      </div>
    </details>
  );
}
