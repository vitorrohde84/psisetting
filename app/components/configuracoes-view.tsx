"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import {
  User,
  Camera,
  Calendar,
  UserPlus,
  Copy,
  Check,
  Loader2,
  Trash2,
  Link as LinkIcon,
  Save,
  Image as ImageIcon,
  ShieldCheck,
  Phone,
  Award,
  Sparkles,
} from "lucide-react";

interface Profile {
  id: string;
  nome: string;
  email: string | null;
  crp: string | null;
  telefone: string | null;
  logo_url: string | null;
  calendar_token: string | null;
}

interface Invite {
  id: string;
  code: string;
  created_by: string;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
}

export function ConfiguracoesView() {
  const supabase = createClient();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile state
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nome, setNome] = useState("");
  const [crp, setCrp] = useState("");
  const [telefone, setTelefone] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Logo state
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Calendar state
  const [copiedCalendar, setCopiedCalendar] = useState(false);

  // Invite state
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  // Fetch profile
  const fetchProfile = useCallback(async () => {
    setLoadingProfile(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("id, nome, email, crp, telefone, logo_url, calendar_token")
      .eq("id", user.id)
      .single();

    if (data) {
      setProfile(data);
      setNome(data.nome || "");
      setCrp(data.crp || "");
      setTelefone(data.telefone || "");
      if (data.logo_url) {
        const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${data.logo_url}`;
        setLogoPreview(url);
      }
    }
    setLoadingProfile(false);
  }, []);

  // Fetch invites
  const fetchInvites = useCallback(async () => {
    setLoadingInvites(true);
    try {
      const res = await fetch("/api/invites");
      if (res.ok) {
        const data = await res.json();
        setInvites(data);
      }
    } catch (err) {
      console.error("Error fetching invites:", err);
    }
    setLoadingInvites(false);
  }, []);

  useEffect(() => {
    fetchProfile();
    fetchInvites();
  }, [fetchProfile, fetchInvites]);

  // Save profile
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    setSavingProfile(true);
    setProfileMessage(null);

    const { error } = await supabase
      .from("profiles")
      .update({
        nome: nome.trim(),
        crp: crp.trim() || null,
        telefone: telefone.trim() || null,
      })
      .eq("id", profile.id);

    if (error) {
      setProfileMessage({
        type: "error",
        text: `Erro ao salvar: ${error.message}`,
      });
    } else {
      setProfileMessage({ type: "success", text: "Perfil profissional atualizado com sucesso!" });
      router.refresh();
      setTimeout(() => setProfileMessage(null), 3500);
    }
    setSavingProfile(false);
  }

  // Upload logo
  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    const validTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setProfileMessage({
        type: "error",
        text: "Formato inválido. Use PNG, JPG ou WebP.",
      });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileMessage({
        type: "error",
        text: "Imagem muito grande. Máximo 2MB.",
      });
      return;
    }

    setUploadingLogo(true);
    setProfileMessage(null);

    const fileExt = file.name.split(".").pop();
    const filePath = `${profile.id}/logo.${fileExt}`;

    if (profile.logo_url) {
      await supabase.storage.from("logos").remove([profile.logo_url]);
    }

    const { error: uploadError } = await supabase.storage
      .from("logos")
      .upload(filePath, file, { cacheControl: "3600", upsert: true });

    if (uploadError) {
      setProfileMessage({
        type: "error",
        text: `Erro no upload: ${uploadError.message}`,
      });
      setUploadingLogo(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ logo_url: filePath })
      .eq("id", profile.id);

    if (updateError) {
      setProfileMessage({
        type: "error",
        text: `Erro ao salvar logo: ${updateError.message}`,
      });
    } else {
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${filePath}?t=${Date.now()}`;
      setLogoPreview(url);
      setProfile({ ...profile, logo_url: filePath });
      setProfileMessage({ type: "success", text: "Logo atualizado!" });
      router.refresh();
      setTimeout(() => setProfileMessage(null), 3000);
    }
    setUploadingLogo(false);
  }

  // Remove logo
  async function handleRemoveLogo() {
    if (!profile || !profile.logo_url) return;

    setUploadingLogo(true);
    setProfileMessage(null);

    await supabase.storage.from("logos").remove([profile.logo_url]);

    await supabase
      .from("profiles")
      .update({ logo_url: null })
      .eq("id", profile.id);

    setLogoPreview(null);
    setProfile({ ...profile, logo_url: null });
    setProfileMessage({ type: "success", text: "Logo removido." });
    router.refresh();
    setTimeout(() => setProfileMessage(null), 3000);
    setUploadingLogo(false);
  }

  // Copy calendar URL
  function handleCopyCalendar() {
    if (!profile?.calendar_token) return;
    const origin = window.location.origin;
    const webcalUrl = `webcal://${origin.replace(/^https?:\/\//, "")}/calendario/${profile.calendar_token}`;
    navigator.clipboard.writeText(webcalUrl);
    setCopiedCalendar(true);
    setTimeout(() => setCopiedCalendar(false), 2500);
  }

  // Generate invite
  async function handleGenerateInvite() {
    setGeneratingInvite(true);
    try {
      const res = await fetch("/api/invites", { method: "POST" });
      if (res.ok) {
        await fetchInvites();
      }
    } catch (err) {
      console.error("Error generating invite:", err);
    }
    setGeneratingInvite(false);
  }

  // Copy invite link
  function handleCopyInvite(invite: Invite) {
    const origin = window.location.origin;
    const link = `${origin}/login?convite=${invite.code}`;
    navigator.clipboard.writeText(link);
    setCopiedInviteId(invite.id);
    setTimeout(() => setCopiedInviteId(null), 2500);
  }

  if (loadingProfile) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h2 className="text-2xl font-serif font-semibold text-text">
          Configurações da Conta
        </h2>
        <p className="mt-1 text-text-muted">
          Personalize seu perfil profissional, logotipo para laudos e preferências
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
        {/* ─── Perfil Profissional ─── */}
        <div className="bg-surface rounded-2xl border border-border/60 shadow-xs">
          <div className="flex items-center justify-between p-5 pb-4 border-b border-border/40">
            <div className="flex items-center gap-2.5">
              <User size={18} className="text-primary" />
              <h3 className="text-base font-serif font-medium text-text">
                Dados Profissionais
              </h3>
            </div>
            <span className="text-xs text-text-muted flex items-center gap-1">
              <ShieldCheck size={14} className="text-success" /> Dados do Laudo
            </span>
          </div>

          <form onSubmit={handleSaveProfile} className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1.5">
                Nome Profissional Completo
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                placeholder="Ex: Dra. Ana Paula Silva"
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-text text-sm
                           focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1.5 flex items-center gap-1.5">
                  <Award size={14} /> Registro (CRP)
                </label>
                <input
                  type="text"
                  value={crp}
                  onChange={(e) => setCrp(e.target.value)}
                  placeholder="Ex: CRP 06/123456"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-text text-sm
                             focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-muted mb-1.5 flex items-center gap-1.5">
                  <Phone size={14} /> Telefone / WhatsApp
                </label>
                <input
                  type="text"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="Ex: (11) 99999-9999"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-text text-sm
                             focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-muted mb-1.5">
                E-mail da Conta
              </label>
              <input
                type="email"
                value={profile?.email || ""}
                disabled
                className="w-full px-3.5 py-2.5 rounded-xl bg-background/60 border border-border/60 text-text-muted text-sm cursor-not-allowed"
              />
            </div>

            {profileMessage && (
              <div
                className={`p-3 rounded-xl text-sm text-center ${
                  profileMessage.type === "success"
                    ? "bg-success/10 text-success border border-success/20"
                    : "bg-danger/10 text-danger border border-danger/20"
                }`}
              >
                {profileMessage.text}
              </div>
            )}

            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                         bg-primary text-white text-sm font-medium
                         hover:bg-primary-dark active:scale-[0.98] disabled:opacity-70
                         transition-all duration-200 cursor-pointer shadow-sm"
            >
              {savingProfile ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Salvar Alterações
            </button>
          </form>
        </div>

        {/* ─── Logo do Consultório ─── */}
        <div className="bg-surface rounded-2xl border border-border/60 shadow-xs">
          <div className="flex items-center gap-2.5 p-5 pb-4 border-b border-border/40">
            <ImageIcon size={18} className="text-primary" />
            <h3 className="text-base font-serif font-medium text-text">
              Logotipo do Consultório
            </h3>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-sm text-text-muted">
              Esta imagem será impressa automaticamente no cabeçalho de todos os laudos, recibos e documentos emitidos.
            </p>

            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-border bg-background flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Logo"
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <Camera size={28} className="text-text-muted/40" />
                )}
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl
                             bg-background border border-border text-text text-sm font-medium
                             hover:border-primary/30 hover:bg-primary/[0.03]
                             active:scale-[0.98] disabled:opacity-70
                             transition-all duration-200 cursor-pointer"
                >
                  {uploadingLogo ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Camera size={14} />
                  )}
                  {logoPreview ? "Alterar Logotipo" : "Enviar Logotipo"}
                </button>
                {logoPreview && (
                  <div>
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      disabled={uploadingLogo}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs text-danger
                                 hover:bg-danger/5 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 size={12} />
                      Remover Logo
                    </button>
                  </div>
                )}
              </div>
            </div>
            <p className="text-xs text-text-muted">
              Formatos aceitos: PNG, JPG ou WebP. Máximo 2MB. Recomendado: fundo transparente.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleLogoUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* ─── Calendário (iCal) ─── */}
        <div className="bg-surface rounded-2xl border border-border/60 shadow-xs">
          <div className="flex items-center gap-2.5 p-5 pb-4 border-b border-border/40">
            <Calendar size={18} className="text-primary" />
            <h3 className="text-base font-serif font-medium text-text">
              Sincronização de Agenda (iPhone / Google Calendar)
            </h3>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-sm text-text-muted leading-relaxed">
              Assine este feed para sincronizar seus atendimentos diretamente no calendário do iPhone, Mac ou Google Agenda.
            </p>
            {profile?.calendar_token ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3.5 py-2.5 rounded-xl bg-background border border-border text-xs text-text-muted truncate font-mono">
                  webcal://.../{profile.calendar_token.slice(0, 12)}…
                </div>
                <button
                  type="button"
                  onClick={handleCopyCalendar}
                  className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl
                             bg-primary text-white text-sm font-medium
                             hover:bg-primary-dark active:scale-[0.98]
                             transition-all duration-200 cursor-pointer shadow-xs"
                >
                  {copiedCalendar ? (
                    <Check size={14} />
                  ) : (
                    <Copy size={14} />
                  )}
                  {copiedCalendar ? "Copiado!" : "Copiar Link"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-danger">Token não configurado.</p>
            )}
          </div>
        </div>

        {/* ─── Convites / Equipe ─── */}
        <div className="bg-surface rounded-2xl border border-border/60 shadow-xs">
          <div className="flex items-center justify-between p-5 pb-4 border-b border-border/40">
            <div className="flex items-center gap-2.5">
              <UserPlus size={18} className="text-primary" />
              <h3 className="text-base font-serif font-medium text-text">
                Convites & Parcerias
              </h3>
            </div>
            <button
              type="button"
              onClick={handleGenerateInvite}
              disabled={generatingInvite}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl
                         bg-primary text-white text-xs font-medium
                         hover:bg-primary-dark active:scale-[0.98] disabled:opacity-70
                         transition-all duration-200 cursor-pointer shadow-xs"
            >
              {generatingInvite ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <UserPlus size={12} />
              )}
              Gerar Convite
            </button>
          </div>
          <div className="p-5">
            {loadingInvites ? (
              <div className="flex justify-center py-4">
                <Loader2 size={20} className="animate-spin text-primary" />
              </div>
            ) : invites.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-4">
                Nenhum código de convite ativo.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                {invites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-background border border-border/50"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-text font-semibold truncate">
                        {invite.code}
                      </p>
                      <p className="text-[10px] text-text-muted">
                        {invite.used_at
                          ? `Utilizado em ${new Date(invite.used_at).toLocaleDateString("pt-BR")}`
                          : "Disponível para cadastro"}
                      </p>
                    </div>
                    {!invite.used_at && (
                      <button
                        type="button"
                        onClick={() => handleCopyInvite(invite)}
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg
                                   text-xs text-primary font-medium
                                   hover:bg-primary/10 transition-colors cursor-pointer"
                      >
                        {copiedInviteId === invite.id ? (
                          <>
                            <Check size={12} />
                            Copiado!
                          </>
                        ) : (
                          <>
                            <LinkIcon size={12} />
                            Copiar Link
                          </>
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
