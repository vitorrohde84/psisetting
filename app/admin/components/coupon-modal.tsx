"use client";

import { useEffect, useId, useState } from "react";
import {
  X,
  Tag,
  Plus,
  Loader2,
  Clock,
  Percent,
  DollarSign,
  Crown,
  Sparkles,
  CalendarRange,
  Infinity as InfinityIcon,
  Info,
} from "lucide-react";
import { DESCONTO_FIXO_MAXIMO, validarNovoCupom, type TipoCupom } from "@/utils/cupom-admin";
import {
  PRECO_BASE,
  PRECO_MINIMO,
  aplicarDesconto,
  descreverDesconto,
  descreverPrecoComDesconto,
  ehTipoDesconto,
  formatarReais,
} from "@/utils/preco-desconto";

interface CouponModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const VALOR_PADRAO: Record<TipoCupom, string> = {
  trial_days: "30",
  percent: "20",
  fixed: "10",
  vip: "",
};

/** "2026-10-31" → "31/10/2026", sem passar por Date (que mudaria o dia no fuso). */
function dataDoInput(valor: string): string {
  const [ano, mes, dia] = valor.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function CouponModal({ isOpen, onClose, onSuccess }: CouponModalProps) {
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<TipoCupom>("trial_days");
  // Texto, não número: com Number() direto no onChange, apagar o campo virava 0
  // e digitar "5.5" no desconto em reais pulava o ponto.
  const [discountValue, setDiscountValue] = useState(VALOR_PADRAO.trial_days);
  const [paraSempre, setParaSempre] = useState(false);
  const [duracaoMeses, setDuracaoMeses] = useState("1");
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idBase = useId();
  const ids = {
    titulo: `${idBase}-titulo`,
    codigo: `${idBase}-codigo`,
    tipo: `${idBase}-tipo`,
    valor: `${idBase}-valor`,
    valorDica: `${idBase}-valor-dica`,
    duracao: `${idBase}-duracao`,
    usos: `${idBase}-usos`,
    usosDica: `${idBase}-usos-dica`,
    validade: `${idBase}-validade`,
    validadeDica: `${idBase}-validade-dica`,
  };

  // Esc fecha, como o "Cancelar". Fica antes do return abaixo: hook não pode
  // depender de o modal estar aberto; a escuta só existe enquanto ele está.
  useEffect(() => {
    if (!isOpen) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const ehDesconto = ehTipoDesconto(discountType);

  // Mesmo formato que a rota recebe. A validação roda com a MESMA função do
  // servidor: a mensagem que aparece aqui é a que o servidor daria.
  const corpo = {
    code: code.trim().toUpperCase(),
    discount_type: discountType,
    discount_value: discountType === "vip" ? 0 : Number(discountValue),
    duracao_meses: ehDesconto && !paraSempre ? Number(duracaoMeses) : null,
    para_sempre: ehDesconto && paraSempre,
    max_uses: maxUses.trim() === "" ? null : Number(maxUses),
    expires_at: expiresAt || null,
  };

  // Só valor e duração, para a simulação não depender do código já digitado
  // nem da validade.
  const simulacao = validarNovoCupom({
    code: "SIMULACAO",
    discount_type: corpo.discount_type,
    discount_value: corpo.discount_value,
    duracao_meses: corpo.duracao_meses,
    para_sempre: corpo.para_sempre,
  });

  function escolherTipo(tipo: TipoCupom) {
    setDiscountType(tipo);
    setDiscountValue(VALOR_PADRAO[tipo]);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validacao = validarNovoCupom(corpo);
    if (!validacao.ok) {
      setError(validacao.erro);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCode("");
        setDiscountType("trial_days");
        setDiscountValue(VALOR_PADRAO.trial_days);
        setParaSempre(false);
        setDuracaoMeses("1");
        setMaxUses("");
        setExpiresAt("");
        onSuccess();
        onClose();
      } else {
        setError(data.error || "Erro ao criar cupom.");
      }
    } catch {
      setError("Falha ao salvar cupom no servidor.");
    } finally {
      setSubmitting(false);
    }
  }

  const precoFinal =
    simulacao.ok && ehTipoDesconto(simulacao.valor.discount_type)
      ? aplicarDesconto(PRECO_BASE, simulacao.valor.discount_type, simulacao.valor.discount_value)
      : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-fadeIn">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={ids.titulo}
        className="relative w-full max-w-lg bg-surface rounded-2xl shadow-2xl border border-border/80 p-6 space-y-5 max-h-[95vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Tag size={18} />
            </div>
            <div>
              <h3 id={ids.titulo} className="font-serif font-bold text-text text-base">
                Criar Novo Cupom Promocional
              </h3>
              <p className="text-xs text-text-muted">
                Dias de teste, descontos em % ou valor em reais
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            title="Fechar"
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-background transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* noValidate: as mensagens vêm de validarNovoCupom, iguais às do servidor,
            em vez do balão do navegador. */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Código do Cupom */}
          <div>
            <label htmlFor={ids.codigo} className="block text-xs font-semibold text-text mb-1">
              Código do Cupom *
            </label>
            {/* autoFocus: ao abrir, o foco entra no diálogo em vez de ficar no
                botão da página por trás dele. */}
            <input
              id={ids.codigo}
              autoFocus
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Ex: PROMO20, DESCONTO10, HELLEN30"
              required
              maxLength={30}
              className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-xs font-mono font-bold text-text uppercase focus:border-primary focus:ring-1 focus:ring-primary outline-hidden tracking-wider"
            />
          </div>

          {/* Seletor de Tipo de Benefício */}
          <div>
            {/* Não é <label>: o que se escolhe aqui são botões, não um campo.
                O texto dá nome ao grupo, e cada botão diz se está marcado. */}
            <p id={ids.tipo} className="block text-xs font-semibold text-text mb-2">
              Tipo de Benefício do Cupom *
            </p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby={ids.tipo}>
              {[
                { id: "trial_days", label: "Dias de Teste", desc: "Acesso grátis extra", icon: Clock },
                { id: "percent", label: "Desconto (%)", desc: "Porcentagem OFF", icon: Percent },
                { id: "fixed", label: "Desconto Fixo (R$)", desc: "Valor em reais OFF", icon: DollarSign },
                { id: "vip", label: "Acesso VIP", desc: "Cortesia Vitalícia", icon: Crown },
              ].map((t) => {
                const Icon = t.icon;
                const isSelected = discountType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => escolherTipo(t.id as TipoCupom)}
                    className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-2xs font-bold text-primary"
                        : "border-border/80 bg-background/50 hover:bg-background text-text"
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg shrink-0 ${isSelected ? "bg-primary text-white" : "bg-border/60 text-text-muted"}`}>
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs">{t.label}</p>
                      <p className="text-[10px] text-text-muted font-normal truncate">{t.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Campo de Valor do Benefício (Dependendo do Tipo) */}
          {discountType !== "vip" && (
            <div>
              <label htmlFor={ids.valor} className="block text-xs font-semibold text-text mb-1">
                {discountType === "trial_days" && "Quantidade de Dias Grátis *"}
                {discountType === "percent" && "Porcentagem de Desconto (% OFF) *"}
                {discountType === "fixed" && "Valor do Desconto em Reais (R$ OFF) *"}
              </label>

              <div className="relative">
                <input
                  id={ids.valor}
                  aria-describedby={discountType === "fixed" ? ids.valorDica : undefined}
                  type="number"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  min={discountType === "fixed" ? 0.01 : 1}
                  max={
                    discountType === "percent" ? 100 : discountType === "fixed" ? DESCONTO_FIXO_MAXIMO : 365
                  }
                  step={discountType === "fixed" ? 0.01 : 1}
                  inputMode={discountType === "fixed" ? "decimal" : "numeric"}
                  required
                  className="w-full px-3.5 py-2.5 pr-16 rounded-xl bg-background border border-border text-xs font-bold text-text focus:border-primary outline-hidden"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-text-muted">
                  {discountType === "trial_days" && "dias"}
                  {discountType === "percent" && "% OFF"}
                  {discountType === "fixed" && "R$ OFF"}
                </span>
              </div>

              {discountType === "fixed" && (
                <p id={ids.valorDica} className="mt-1 text-[10.5px] text-text-muted">
                  Até R$ {formatarReais(DESCONTO_FIXO_MAXIMO)}, com centavos. O menor valor cobrado é R${" "}
                  {formatarReais(PRECO_MINIMO)}.
                </p>
              )}
            </div>
          )}

          {/* Duração do desconto: quantas mensalidades pagas recebem o desconto */}
          {ehDesconto && (
            <div>
              {/* Nome do grupo de opções abaixo, não de um campo: por isso <p>. */}
              <p id={ids.duracao} className="block text-xs font-semibold text-text mb-2">
                Duração do desconto *
              </p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby={ids.duracao}>
                {[
                  { sempre: false, label: "Por um número de meses", icon: CalendarRange },
                  { sempre: true, label: "Para sempre", icon: InfinityIcon },
                ].map((opcao) => {
                  const Icon = opcao.icon;
                  const selecionada = paraSempre === opcao.sempre;
                  return (
                    <button
                      key={opcao.label}
                      type="button"
                      role="radio"
                      aria-checked={selecionada}
                      onClick={() => setParaSempre(opcao.sempre)}
                      className={`p-2.5 rounded-xl border text-left flex items-center gap-2 text-xs transition-all cursor-pointer ${
                        selecionada
                          ? "border-primary bg-primary/5 shadow-2xs font-bold text-primary"
                          : "border-border/80 bg-background/50 hover:bg-background text-text"
                      }`}
                    >
                      <Icon size={14} className="shrink-0" />
                      <span>{opcao.label}</span>
                    </button>
                  );
                })}
              </div>

              {paraSempre ? (
                <p className="mt-2 text-[10.5px] text-text-muted leading-relaxed">
                  O desconto vale em toda mensalidade, sem prazo. Se precisar, dá para encerrar depois
                  pela lista de cupons, em <strong>Ver quem usa</strong>.
                </p>
              ) : (
                <div className="mt-2">
                  <div className="relative">
                    <input
                      type="number"
                      value={duracaoMeses}
                      onChange={(e) => setDuracaoMeses(e.target.value)}
                      min={1}
                      max={120}
                      step={1}
                      inputMode="numeric"
                      aria-label="Número de meses com desconto"
                      className="w-full px-3.5 py-2 pr-16 rounded-xl bg-background border border-border text-xs font-bold text-text focus:border-primary outline-hidden"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-text-muted">
                      {Number(duracaoMeses) === 1 ? "mês" : "meses"}
                    </span>
                  </div>
                  <p className="mt-1 text-[10.5px] text-text-muted">
                    1 = só na primeira mensalidade.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Preview Dinâmico de Preço */}
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-2.5 text-xs text-text leading-relaxed">
            <Sparkles size={16} className="text-primary shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="font-bold text-primary">Simulação do Impacto:</p>

              {!simulacao.ok && (
                <p className="text-amber-800 text-[11px]">{simulacao.erro}</p>
              )}

              {simulacao.ok && discountType === "trial_days" && (
                <p className="text-text-muted text-[11px]">
                  O psicólogo ganha <strong>+{simulacao.valor.discount_value} dias de teste completo</strong> sem cobrança.
                </p>
              )}

              {simulacao.ok && ehTipoDesconto(simulacao.valor.discount_type) && precoFinal !== null && (
                <>
                  <p className="text-text-muted text-[11px]">
                    Com{" "}
                    <strong>
                      {descreverDesconto(simulacao.valor.discount_type, simulacao.valor.discount_value)}
                    </strong>
                    , o psicólogo paga{" "}
                    <strong className="text-emerald-800">
                      {descreverPrecoComDesconto({
                        valorFinal: precoFinal,
                        restantes: simulacao.valor.para_sempre ? null : simulacao.valor.duracao_meses,
                        novo: true,
                      })}
                    </strong>
                    .
                    {precoFinal <= PRECO_MINIMO && (
                      <> O Mercado Pago não cobra zero: o mínimo é R$ {formatarReais(PRECO_MINIMO)}.</>
                    )}
                  </p>
                  <p className="flex items-start gap-1.5 text-[10.5px] text-text-muted">
                    <Info size={12} className="shrink-0 mt-0.5" />
                    <span>Pausar ou vencer o cupom não tira o desconto de quem já usa.</span>
                  </p>
                </>
              )}

              {discountType === "vip" && (
                <p className="text-text-muted text-[11px]">
                  A conta do psicólogo é liberada como <strong>VIP permanente / vitalício</strong>.
                </p>
              )}
            </div>
          </div>

          {/* Limite de Usos e Validade */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={ids.usos} className="block text-xs font-semibold text-text mb-1">
                Limite de Usos (opcional)
              </label>
              <input
                id={ids.usos}
                aria-describedby={ids.usosDica}
                type="number"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                min={1}
                step={1}
                inputMode="numeric"
                placeholder="Vazio = Ilimitado"
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-text focus:border-primary outline-hidden"
              />
              <p id={ids.usosDica} className="mt-1 text-[10.5px] text-text-muted">Quantas pessoas podem resgatar.</p>
            </div>

            <div>
              <label htmlFor={ids.validade} className="block text-xs font-semibold text-text mb-1">
                Data de Validade (opcional)
              </label>
              <input
                id={ids.validade}
                aria-describedby={ids.validadeDica}
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-text focus:border-primary outline-hidden"
              />
              <p id={ids.validadeDica} className="mt-1 text-[10.5px] text-text-muted">
                {expiresAt
                  ? `Vale até 23h59 de ${dataDoInput(expiresAt)}.`
                  : "Vale até 23h59 do dia escolhido."}
              </p>
            </div>
          </div>

          {/* Perto do botão: com o modal rolado até o fim, um aviso no topo
              ficaria fora da tela e o clique pareceria não fazer nada. */}
          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border/40">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-border text-text-muted hover:text-text hover:bg-background text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={submitting || !code.trim()}
              className="px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-all flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Plus size={14} />
                  <span>Criar Cupom</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
