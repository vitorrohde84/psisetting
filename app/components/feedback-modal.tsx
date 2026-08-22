"use client";

import { useState } from "react";
import {
  Lightbulb,
  Bug,
  HelpCircle,
  Heart,
  X,
  Send,
  Loader2,
  CheckCircle2,
  Star,
} from "lucide-react";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type CategoryType = "sugestao" | "problema" | "duvida" | "elogio";

const CATEGORIES: {
  id: CategoryType;
  label: string;
  desc: string;
  icon: any;
  color: string;
}[] = [
  {
    id: "sugestao",
    label: "Sugestão / Ideia",
    desc: "Nova ferramenta ou melhoria",
    icon: Lightbulb,
    color: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  },
  {
    id: "problema",
    label: "Reportar Problema",
    desc: "Algo não funcionou como esperado",
    icon: Bug,
    color: "text-rose-600 bg-rose-500/10 border-rose-500/20",
  },
  {
    id: "duvida",
    label: "Dúvida de Uso",
    desc: "Ajuda com alguma funcionalidade",
    icon: HelpCircle,
    color: "text-blue-600 bg-blue-500/10 border-blue-500/20",
  },
  {
    id: "elogio",
    label: "Elogio / Opinião",
    desc: "Compartilhe sua experiência",
    icon: Heart,
    color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
  },
];

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [category, setCategory] = useState<CategoryType>("sugestao");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number>(5);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      setError("Por favor, escreva sua mensagem.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/feedbacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          subject: subject.trim(),
          message: message.trim(),
          rating,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          setMessage("");
          setSubject("");
          onClose();
        }, 2200);
      } else {
        setError(data.error || "Erro ao enviar feedback.");
      }
    } catch (err) {
      setError("Falha de conexão ao enviar feedback.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-lg bg-surface rounded-2xl shadow-2xl border border-border/80 p-6 space-y-5 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Lightbulb size={18} />
            </div>
            <div>
              <h3 className="font-serif font-bold text-text text-base">
                Sugestões & Feedbacks
              </h3>
              <p className="text-xs text-text-muted">
                Sua opinião guia o desenvolvimento do PsiSetting
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-background transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Feedback de Sucesso */}
        {success ? (
          <div className="py-8 text-center space-y-3 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 size={28} />
            </div>
            <h4 className="font-serif font-bold text-text text-base">
              Mensagem Recebida!
            </h4>
            <p className="text-xs text-text-muted max-w-xs mx-auto">
              Muito obrigado! Lemos todos os feedbacks com carinho para tornar sua rotina clínica cada vez melhor.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {error}
              </div>
            )}

            {/* Seletor de Categoria */}
            <div>
              <label className="block text-xs font-semibold text-text mb-2">
                O que você gostaria de nos dizer?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-2xs"
                          : "border-border/80 bg-background/50 hover:bg-background"
                      }`}
                    >
                      <div className={`p-1.5 rounded-lg shrink-0 ${cat.color}`}>
                        <Icon size={14} />
                      </div>
                      <div className="min-w-0">
                        <p
                          className={`text-xs font-bold ${
                            isSelected ? "text-primary" : "text-text"
                          }`}
                        >
                          {cat.label}
                        </p>
                        <p className="text-[10px] text-text-muted truncate">
                          {cat.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Avaliação em Estrelas (Para Elogio ou Geral) */}
            {category === "elogio" && (
              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Como avalia sua experiência com o PsiSetting?
                </label>
                <div className="flex items-center gap-1.5 pt-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="p-1 text-amber-400 hover:scale-110 transition-transform cursor-pointer"
                    >
                      <Star
                        size={20}
                        className={
                          star <= rating
                            ? "fill-amber-400 text-amber-400"
                            : "text-border fill-transparent"
                        }
                      />
                    </button>
                  ))}
                  <span className="text-xs text-text-muted ml-2 font-medium">
                    {rating === 5
                      ? "Excelente! 😍"
                      : rating === 4
                      ? "Muito bom! 😊"
                      : rating === 3
                      ? "Bom 👍"
                      : "Pode melhorar 🤔"}
                  </span>
                </div>
              </div>
            )}

            {/* Assunto Opcional */}
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Assunto (opcional)
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex: Sugestão para o modelo de Laudo"
                className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-text text-xs focus:border-primary focus:ring-1 focus:ring-primary outline-hidden"
              />
            </div>

            {/* Mensagem Principal */}
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Sua Mensagem *
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Conte com detalhes o que você achou, qual funcionalidade gostaria de ver ou o que podemos aprimorar..."
                rows={4}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-text text-xs focus:border-primary focus:ring-1 focus:ring-primary outline-hidden resize-none leading-relaxed"
              />
            </div>

            {/* Botões */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-border text-text-muted hover:text-text hover:bg-background text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={loading || !message.trim()}
                className="px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-all flex items-center gap-1.5 shadow-xs hover:shadow-md cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <Send size={13} />
                    <span>Enviar Mensagem</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
