"use client";

import { useState } from "react";
import { X, Radio, Plus, Loader2 } from "lucide-react";

interface AnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AnnouncementModal({ isOpen, onClose, onSuccess }: AnnouncementModalProps) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<"info" | "success" | "warning" | "tip">("info");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      setError("Título e mensagem são obrigatórios.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          type,
          link_url: linkUrl.trim() || null,
          link_label: linkLabel.trim() || null,
          active: true,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setTitle("");
        setMessage("");
        setLinkUrl("");
        setLinkLabel("");
        onSuccess();
        onClose();
      } else {
        setError(data.error || "Erro ao publicar comunicado.");
      }
    } catch (err) {
      setError("Falha ao salvar comunicado.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-lg bg-surface rounded-2xl shadow-2xl border border-border/80 p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Radio size={18} />
            </div>
            <div>
              <h3 className="font-serif font-bold text-text text-base">
                Publicar Comunicado no Topo do App
              </h3>
              <p className="text-xs text-text-muted">
                Aparecerá para todos os psicólogos conectados
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

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-text mb-1">
                Título do Comunicado *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: ✨ Nova Atualização de Laudos"
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-xs font-semibold text-text focus:border-primary outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Estilo do Banner
              </label>
              <select
                value={type}
                onChange={(e: any) => setType(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-xs font-semibold text-text focus:border-primary outline-hidden"
              >
                <option value="info">🔵 Informativo</option>
                <option value="success">🟢 Novidade</option>
                <option value="warning">🟡 Alerta</option>
                <option value="tip">🌾 Dica</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text mb-1">
              Mensagem *
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Digite o texto conciso que aparecerá na barra superior de todos os usuários..."
              rows={3}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-xs text-text focus:border-primary outline-hidden resize-none leading-relaxed"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Link de Destino (opcional)
              </label>
              <input
                type="text"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-xs text-text focus:border-primary outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Texto do Botão
              </label>
              <input
                type="text"
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder="Ex: Saiba Mais"
                className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-xs text-text focus:border-primary outline-hidden"
              />
            </div>
          </div>

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
              disabled={submitting || !title.trim() || !message.trim()}
              className="px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-all flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Publicando...</span>
                </>
              ) : (
                <>
                  <Radio size={14} />
                  <span>Publicar no Topo</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
