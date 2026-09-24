"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { 
  X, 
  Save, 
  Loader2, 
  Award, 
  Phone, 
  MapPin, 
  Building, 
  Camera, 
  Trash2,
  FileCheck,
  Sparkles
} from "lucide-react";
import { Carregando } from "@/app/components/carregando";

interface LaudoConfigModalProps {
  onClose: () => void;
  onSaved?: () => void;
}

export function LaudoConfigModal({ onClose, onSaved }: LaudoConfigModalProps) {
  const supabase = createClient();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form states
  const [userId, setUserId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [crp, setCrp] = useState("");
  const [telefone, setTelefone] = useState("");
  const [genero, setGenero] = useState<"F" | "M" | "outro">("F");
  const [cidade, setCidade] = useState("");
  const [endereco, setEndereco] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Lido só na abertura do modal. A leitura fica dentro do efeito e grava o
  // estado só depois do await; `loading` já começa true, então não há o que
  // ligar antes (um setState síncrono aqui só causaria uma renderização a mais).
  useEffect(() => {
    async function fetchProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const { data } = await supabase
        .from("profiles")
        .select("nome, nome_completo, crp, telefone, genero, cidade, endereco, logo_url")
        .eq("id", user.id)
        .single();

      if (data) {
        setNome(data.nome || "");
        setNomeCompleto(data.nome_completo || data.nome || "");
        setCrp(data.crp || "");
        setTelefone(data.telefone || "");
        setGenero((data.genero as "F" | "M" | "outro") || "F");
        setCidade(data.cidade || "");
        setEndereco(data.endereco || "");
        setLogoUrl(data.logo_url || null);

        if (data.logo_url) {
          const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${data.logo_url}`;
          setLogoPreview(url);
        }
      }
      setLoading(false);
    }
    fetchProfile();
    // `supabase` vem de createBrowserClient, que no navegador é sempre a mesma
    // instância: estar na lista não faz o perfil ser relido.
  }, [supabase]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;

    setSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from("profiles")
      .update({
        nome: nome.trim(),
        nome_completo: nomeCompleto.trim() || nome.trim(),
        crp: crp.trim() || null,
        telefone: telefone.trim() || null,
        genero: genero || "F",
        cidade: cidade.trim() || null,
        endereco: endereco.trim() || null,
      })
      .eq("id", userId);

    if (error) {
      setMessage({ type: "error", text: `Erro ao salvar: ${error.message}` });
      setSaving(false);
    } else {
      setMessage({ type: "success", text: "Configurações do laudo salvas com sucesso!" });
      setSaving(false);
      if (onSaved) onSaved();
      // A faixa "Complete seu perfil" vem do layout, que é componente de
      // servidor: sem o refresh ela seguiria pedindo nome, CRP ou cidade que
      // acabaram de ser preenchidos, até a página ser recarregada.
      router.refresh();
      setTimeout(() => {
        onClose();
      }, 1200);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    const validTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setMessage({ type: "error", text: "Formato inválido. Use PNG, JPG ou WebP." });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: "error", text: "Imagem muito grande. Máximo 2MB." });
      return;
    }

    setUploadingLogo(true);
    setMessage(null);

    const fileExt = file.name.split(".").pop();
    const filePath = `${userId}/logo.${fileExt}`;

    if (logoUrl) {
      await supabase.storage.from("logos").remove([logoUrl]);
    }

    const { error: uploadError } = await supabase.storage
      .from("logos")
      .upload(filePath, file, { cacheControl: "3600", upsert: true });

    if (uploadError) {
      setMessage({ type: "error", text: `Erro no upload: ${uploadError.message}` });
      setUploadingLogo(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ logo_url: filePath })
      .eq("id", userId);

    if (updateError) {
      setMessage({ type: "error", text: `Erro ao salvar logo: ${updateError.message}` });
    } else {
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${filePath}?t=${Date.now()}`;
      setLogoPreview(url);
      setLogoUrl(filePath);
      setMessage({ type: "success", text: "Logo do laudo atualizado!" });
      if (onSaved) onSaved();
      setTimeout(() => setMessage(null), 3000);
    }
    setUploadingLogo(false);
  }

  async function handleRemoveLogo() {
    if (!userId || !logoUrl) return;

    setUploadingLogo(true);
    setMessage(null);

    await supabase.storage.from("logos").remove([logoUrl]);
    await supabase.from("profiles").update({ logo_url: null }).eq("id", userId);

    setLogoPreview(null);
    setLogoUrl(null);
    setMessage({ type: "success", text: "Logo removido." });
    if (onSaved) onSaved();
    setTimeout(() => setMessage(null), 3000);
    setUploadingLogo(false);
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-xl bg-surface rounded-2xl shadow-2xl border border-border/80 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border/60 bg-background/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <FileCheck size={18} />
            </div>
            <div>
              <h3 className="text-base font-serif font-semibold text-text">
                Configurações do Laudo & Papel Timbrado
              </h3>
              <p className="text-xs text-text-muted">
                Personalize seu nome, cargo, CRP, endereço e contato exibidos nos documentos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-text-muted hover:text-text hover:bg-border/40 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content / Form */}
        {loading ? (
          <Carregando className="py-20" />
        ) : (
          <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto flex-1">
            {/* Tratamento / Título Profissional */}
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                Tratamento Profissional nos Documentos
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setGenero("F")}
                  className={`py-2 px-2 rounded-xl border text-xs sm:text-sm font-medium transition-all text-center cursor-pointer ${
                    genero === "F"
                      ? "bg-primary text-white border-primary shadow-xs"
                      : "bg-background border-border text-text hover:bg-surface"
                  }`}
                >
                  Psicóloga Clínica
                </button>
                <button
                  type="button"
                  onClick={() => setGenero("M")}
                  className={`py-2 px-2 rounded-xl border text-xs sm:text-sm font-medium transition-all text-center cursor-pointer ${
                    genero === "M"
                      ? "bg-primary text-white border-primary shadow-xs"
                      : "bg-background border-border text-text hover:bg-surface"
                  }`}
                >
                  Psicólogo Clínico
                </button>
                <button
                  type="button"
                  onClick={() => setGenero("outro")}
                  className={`py-2 px-2 rounded-xl border text-xs sm:text-sm font-medium transition-all text-center cursor-pointer ${
                    genero === "outro"
                      ? "bg-primary text-white border-primary shadow-xs"
                      : "bg-background border-border text-text hover:bg-surface"
                  }`}
                >
                  Psicólogo(a)
                </button>
              </div>
            </div>

            {/* Nome no Topo e Nome Completo na Assinatura */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                  Nome no Topo / Cabeçalho
                </label>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                  placeholder="Ex: Maria Silva"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-text text-sm
                             focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
                <p className="mt-1 text-[10.5px] text-text-muted">Exibido em destaque no cabeçalho</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                  Nome Completo (Para Assinatura)
                </label>
                <input
                  type="text"
                  value={nomeCompleto}
                  onChange={(e) => setNomeCompleto(e.target.value)}
                  placeholder="Ex: Maria Aparecida da Silva"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-text text-sm
                             focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
                <p className="mt-1 text-[10.5px] text-text-muted">Exibido acima do CRP na assinatura</p>
              </div>
            </div>

            {/* CRP e Telefone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Award size={13} /> Registro (CRP)
                </label>
                <input
                  type="text"
                  value={crp}
                  onChange={(e) => setCrp(e.target.value)}
                  placeholder="Ex: CRP 00/00000"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-text text-sm
                             focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Phone size={13} /> Telefone / WhatsApp do Rodapé
                </label>
                <input
                  type="text"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="Ex: (00) 00000-0000"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-text text-sm
                             focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
              </div>
            </div>

            {/* Cidade e Endereço */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <MapPin size={13} /> Cidade que Atende (Para a data)
                </label>
                <input
                  type="text"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  placeholder="Ex: Sua cidade, UF"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-text text-sm
                             focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Building size={13} /> Endereço do Rodapé
                </label>
                <input
                  type="text"
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  placeholder="Ex: Rua, número - Bairro, Cidade - UF"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-text text-sm
                             focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
              </div>
            </div>

            {/* Logo do Consultório */}
            <div className="pt-2 border-t border-border/50">
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Sparkles size={13} /> Logotipo no Cabeçalho do Laudo
              </label>
              
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl border-2 border-dashed border-border bg-background flex items-center justify-center overflow-hidden shrink-0">
                  {logoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- logo enviado pela pessoa, servido direto do Storage (com ?t= para furar o cache); não passa pelo otimizador de imagens
                    <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" />
                  ) : (
                    <Camera size={20} className="text-text-muted/40" />
                  )}
                </div>

                <div className="flex-1 space-y-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingLogo}
                      className="px-3 py-1.5 rounded-lg bg-background border border-border text-text text-xs font-medium hover:bg-surface transition-colors cursor-pointer"
                    >
                      {uploadingLogo ? "Enviando..." : logoPreview ? "Trocar Logo" : "Enviar Logo"}
                    </button>
                    {logoPreview && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        disabled={uploadingLogo}
                        className="px-2.5 py-1.5 rounded-lg text-danger hover:bg-danger/10 text-xs font-medium transition-colors cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-text-muted">PNG, JPG ou WebP (máx. 2MB)</p>
                </div>
              </div>
            </div>

            {message && (
              <div
                className={`p-2.5 rounded-xl text-xs text-center font-medium ${
                  message.type === "success"
                    ? "bg-success/10 text-success border border-success/20"
                    : "bg-danger/10 text-danger border border-danger/20"
                }`}
              >
                {message.text}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/60">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-medium text-text-muted hover:bg-background transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl
                           bg-primary text-white text-sm font-medium
                           hover:bg-primary-dark active:scale-[0.98] disabled:opacity-70
                           transition-all duration-200 cursor-pointer shadow-sm"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Salvar Configurações
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
