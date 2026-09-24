import type { RenovacaoTela } from "../../utils/assinatura-cartao";
import type { CupomEmUsoAdmin, MeioAdmin } from "../../utils/assinatura-admin";
import { CARENCIA_CARTAO_DIAS } from "../../utils/acesso-assinatura";
import { formatarReais } from "../../utils/preco-desconto";
import { formatarData } from "./cupom-lista";

/**
 * Textos da aba Psicólogos e da gaveta de detalhes do painel admin — funções
 * puras, fora do page.tsx para poderem ser testadas (a página do App Router só
 * pode exportar o componente).
 *
 * Imports relativos, não "@/": os testes rodam no vitest sem o alias.
 */

/** Um psicólogo como GET /api/admin/users devolve. */
export interface UsuarioAdmin {
  id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  crp: string | null;
  is_vip: boolean | null;
  is_admin: boolean | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  created_at: string | null;
  /** Pela regra de acesso (as datas), não pelo status gravado. */
  calculatedStatus: "vip" | "active" | "trialing" | "expired";
  trialDaysLeft: number;
  diasParaVencer: number | null;
  acessoAte: string | null;
  cupomEmUso: CupomEmUsoAdmin | null;
  ultimoMeio: MeioAdmin | null;
  ultimoPagamentoEm: string | null;
  /** Renovação automática no cartão (ativa, sendo criada ou cancelada há pouco). */
  renovacao: RenovacaoTela | null;
  /** O período pago acabou e o acesso segue pela tolerância do cartão automático. */
  emCarencia: boolean;
  totalPatients: number;
  daysSinceCreation: number;
  isAtRisk: boolean;
}

/** Ligada ou ainda sendo criada: nos dois casos o Mercado Pago pode cobrar. */
export function renovacaoViva(r: RenovacaoTela | null | undefined): boolean {
  return r?.situacao === "ativa" || r?.situacao === "criando";
}

const BANDEIRAS: Record<string, string> = {
  visa: "Visa",
  debvisa: "Visa débito",
  master: "Mastercard",
  debmaster: "Mastercard débito",
  amex: "American Express",
  elo: "Elo",
  debelo: "Elo débito",
  hipercard: "Hipercard",
  diners: "Diners",
  cabal: "Cabal",
  debcabal: "Cabal débito",
};

/**
 * "master" → "Mastercard". O código é o payment_method_id do Mercado Pago;
 * um que não está na lista sai como veio, com a inicial maiúscula.
 */
export function nomeDaBandeira(codigo: string | null | undefined): string | null {
  const c = String(codigo ?? "").trim().toLowerCase();
  if (!c) return null;
  return BANDEIRAS[c] ?? c.charAt(0).toUpperCase() + c.slice(1);
}

/** "Visa final 1234" — ou só a parte que se sabe; null se não se sabe nada. */
export function descreverCartao(
  r: Pick<RenovacaoTela, "cartaoBandeira" | "cartaoFinal"> | null | undefined
): string | null {
  const bandeira = nomeDaBandeira(r?.cartaoBandeira);
  const final = r?.cartaoFinal ? `final ${r.cartaoFinal}` : null;
  if (bandeira && final) return `${bandeira} ${final}`;
  if (final) return `Cartão ${final}`;
  return bandeira;
}

const QUEM_CANCELOU: Record<string, string> = {
  usuario: "pela pessoa",
  admin: "pelo admin",
  mercadopago: "pelo Mercado Pago",
  sistema: "pelo sistema",
};

export function quemCancelou(por: string | null | undefined): string | null {
  return por ? QUEM_CANCELOU[por] ?? null : null;
}

export type TomRenovacao = "destaque" | "alerta" | "discreto";

/**
 * Etiqueta da lista de psicólogos. Recusada é alerta (a pessoa pode perder o
 * acesso em dias); cancelada e "criando" ficam discretas — a primeira já não
 * cobra, a segunda costuma virar "ativa" em minutos.
 */
export function etiquetaRenovacao(
  r: RenovacaoTela | null | undefined
): { texto: string; tom: TomRenovacao } | null {
  if (!r) return null;
  if (r.situacao === "ativa") {
    return r.cobrancaRecusada
      ? { texto: "Cartão automático · recusado", tom: "alerta" }
      : { texto: "Cartão automático", tom: "destaque" };
  }
  if (r.situacao === "criando") return { texto: "Automático · confirmando…", tom: "discreto" };
  return { texto: "Automático cancelado", tom: "discreto" };
}

/** Situação na gaveta de detalhes: o texto principal e, se houver, o detalhe abaixo. */
export function situacaoDaRenovacao(r: RenovacaoTela): {
  texto: string;
  detalhe: string | null;
  tom: TomRenovacao;
} {
  if (r.situacao === "ativa") {
    return r.cobrancaRecusada
      ? { texto: "Ligada · cobrança recusada", detalhe: null, tom: "alerta" }
      : { texto: "Ligada", detalhe: null, tom: "destaque" };
  }
  if (r.situacao === "criando") {
    return {
      texto: "Confirmando…",
      detalhe: "o Mercado Pago ainda não confirmou; costuma levar poucos minutos",
      tom: "discreto",
    };
  }
  const quando = r.canceladaEm ? `em ${formatarData(r.canceladaEm)}` : null;
  const detalhe = [quando, quemCancelou(r.canceladaPor)].filter(Boolean).join(" ");
  return { texto: "Cancelada", detalhe: detalhe || null, tom: "discreto" };
}

/**
 * Quando o Mercado Pago cobra. Quem ligou o automático com dias restantes
 * (teste ou pagos) tem a primeira cobrança agendada para o fim desses dias —
 * enquanto ela não chega, o rótulo diz "Primeira cobrança".
 */
export function proximaCobrancaDaRenovacao(
  r: RenovacaoTela,
  agora = new Date()
): { rotulo: string; data: string | null; semData: string } {
  if (r.situacao === "cancelada") return { rotulo: "Próxima cobrança", data: null, semData: "Nenhuma" };

  const primeira = r.primeiraCobranca ? new Date(r.primeiraCobranca) : null;
  if (primeira && !Number.isNaN(primeira.getTime()) && primeira > agora) {
    return { rotulo: "Primeira cobrança", data: r.primeiraCobranca, semData: "—" };
  }

  // "criando" sem data agendada: a primeira cobrança sai assim que o Mercado
  // Pago confirmar a assinatura.
  return {
    rotulo: "Próxima cobrança",
    data: r.proximaCobranca,
    semData: r.situacao === "criando" ? "Logo após confirmar" : "—",
  };
}

/** Dica (title) da etiqueta da lista. */
export function dicaRenovacao(r: RenovacaoTela, ultimoPagamentoEm?: string | null): string {
  let dica: string;
  if (r.situacao === "ativa" && r.cobrancaRecusada) {
    dica = `A última cobrança do cartão foi recusada. O Mercado Pago tenta de novo por até ${CARENCIA_CARTAO_DIAS} dias; enquanto isso o acesso continua.`;
  } else if (r.situacao === "ativa") {
    const proxima = proximaCobrancaDaRenovacao(r);
    const partes = ["Renovação automática ligada"];
    if (proxima.data) partes.push(`${proxima.rotulo.toLowerCase()} em ${formatarData(proxima.data)}`);
    if (r.valor !== null) partes.push(`R$ ${formatarReais(r.valor)}`);
    dica = partes.join(" · ");
  } else if (r.situacao === "criando") {
    dica = "O Mercado Pago ainda não confirmou a renovação automática. Costuma levar poucos minutos.";
  } else {
    const s = situacaoDaRenovacao(r);
    dica = `Renovação automática cancelada${s.detalhe ? ` ${s.detalhe}` : ""}.`;
  }
  return ultimoPagamentoEm ? `${dica} Último pagamento em ${formatarData(ultimoPagamentoEm)}.` : dica;
}

const ROTULO_MEIO: Record<MeioAdmin, string> = {
  pix: "PIX",
  cartao: "Cartão",
  cartao_automatico: "Cartão automático",
};

const MEIO_POR_EXTENSO: Record<MeioAdmin, string> = {
  pix: "por PIX",
  cartao: "no cartão",
  cartao_automatico: "no cartão, pela renovação automática",
};

export function rotuloDoMeio(meio: MeioAdmin): string {
  return ROTULO_MEIO[meio] ?? "Cartão";
}

export function meioPorExtenso(meio: MeioAdmin): string {
  return MEIO_POR_EXTENSO[meio] ?? "no cartão";
}

/**
 * A etiqueta do último pagamento some quando ele foi da renovação automática e
 * a etiqueta da renovação já está na linha — seriam duas dizendo "cartão
 * automático". A data do último pagamento passa para a dica da renovação.
 */
export function mostrarEtiquetaDoMeio(u: Pick<UsuarioAdmin, "ultimoMeio" | "renovacao">): boolean {
  if (!u.ultimoMeio) return false;
  return !(u.ultimoMeio === "cartao_automatico" && u.renovacao);
}

/** Dica do selo "em tolerância" (período pago acabou, cartão ainda não cobrado). */
export function dicaTolerancia(u: Pick<UsuarioAdmin, "emCarencia" | "acessoAte" | "renovacao">): string | null {
  if (!u.emCarencia) return null;
  const ate = u.acessoAte ? ` até ${formatarData(u.acessoAte)}` : "";
  return u.renovacao?.cobrancaRecusada
    ? `O período pago acabou e a cobrança do cartão foi recusada. O acesso segue${ate} enquanto o Mercado Pago tenta de novo.`
    : `O período pago acabou e a cobrança do mês ainda não foi aprovada. O acesso segue${ate} enquanto o Mercado Pago cobra o cartão.`;
}
