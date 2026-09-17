/**
 * Regras de decisão do atalho da Agenda (criar evolução e cobrança ao salvar
 * um agendamento).
 *
 * Existe como módulo separado porque os três defeitos corrigidos em 17/09/2026
 * estavam enterrados no meio de um componente de 600 linhas, onde ninguém os
 * via e nenhum teste os alcançava. Eram silenciosos: não quebravam a tela, não
 * apareciam no build, e só foram descobertos ao inspecionar o banco.
 *
 * Aqui eles ficam expostos e cobertos por teste.
 */

/**
 * Decide se o atalho da Agenda deve criar uma evolução de prontuário.
 *
 * Três "não" que custaram caro:
 *
 * 1. Sessão FUTURA não gera evolução. Com recorrência, o código antigo criava
 *    um prontuário para cada ocorrência — registro clínico de sessão que ainda
 *    não aconteceu, assinado como se tivesse acontecido.
 *
 * 2. Evolução JÁ EXISTENTE nunca é tocada. O código antigo dava `.update()`:
 *    abrir o agendamento para corrigir o horário apagava o que a psicóloga
 *    tinha escrito, sem aviso e sem histórico.
 *
 * 3. Sem observação, não há o que registrar.
 */
export function deveCriarEvolucao(params: {
  dataAgendamento: string; // YYYY-MM-DD
  hoje: string; // YYYY-MM-DD
  jaExisteEvolucao: boolean;
  temObservacao: boolean;
}): boolean {
  const { dataAgendamento, hoje, jaExisteEvolucao, temObservacao } = params;

  if (!temObservacao) return false;
  if (jaExisteEvolucao) return false;
  if (!dataAgendamento) return false;
  if (dataAgendamento > hoje) return false;

  return true;
}

/**
 * Converte o valor digitado em um número cobrável, ou null.
 *
 * Antes existia `valor: 150` fixo no código: todo agendamento criava uma
 * cobrança que ninguém tinha combinado. No banco auditado, 18 dos 25
 * lançamentos eram esse 150 inventado — o financeiro era ficção.
 *
 * Aceita vírgula como separador decimal, porque é assim que se digita em
 * português. Em branco, zero ou inválido devolve null, e nada é cobrado.
 */
export function valorDaCobranca(digitado: unknown): number | null {
  if (typeof digitado === "number") {
    return Number.isFinite(digitado) && digitado > 0 ? digitado : null;
  }

  if (typeof digitado !== "string") return null;

  const limpo = digitado.trim().replace(/\s/g, "").replace(",", ".");
  if (!limpo) return null;

  const n = Number(limpo);
  if (!Number.isFinite(n) || n <= 0) return null;

  // Duas casas: é dinheiro.
  return Math.round(n * 100) / 100;
}
