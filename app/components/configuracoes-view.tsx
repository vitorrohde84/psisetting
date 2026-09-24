"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { useSubscription } from "@/utils/subscription-context";
import {
  consequenciaDoCancelamento,
  dataCurta,
  descreverCartao,
  fimDoAcesso,
  renovacaoViva,
} from "@/utils/assinatura-tela";
import { formatarReais } from "@/utils/preco-desconto";
import { MercadoPagoBadge } from "./mercadopago-badge";
import { useRouter } from "next/navigation";
import {
  User,
  Camera,
  Calendar,
  Copy,
  Check,
  Loader2,
  Trash2,
  Save,
  Image as ImageIcon,
  ShieldCheck,
  Phone,
  Award,
  MapPin,
  Building,
  Database,
  Download,
  ShieldAlert,
  RefreshCw,
  KeyRound,
  CreditCard,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { Carregando } from "@/app/components/carregando";
import { generateFullSystemBackupCSV } from "@/utils/export-backup";
import { AlterarPinModal } from "./alterar-pin-modal";

interface Profile {
  id: string;
  nome: string;
  nome_completo?: string | null;
  email: string | null;
  crp: string | null;
  telefone: string | null;
  genero?: string | null;
  cidade?: string | null;
  endereco?: string | null;
  logo_url: string | null;
  calendar_token: string | null;
}

export function ConfiguracoesView() {
  const supabase = createClient();
  const router = useRouter();
  const {
    openSubscriptionModal,
    refreshSubscription,
    situacao,
    currentPeriodEnd,
    trialEndsAt,
    renovacao,
    emCarencia,
  } = useSubscription();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cancelamento da renovação automática
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);
  const [cancelandoRenovacao, setCancelandoRenovacao] = useState(false);
  const [mensagemRenovacao, setMensagemRenovacao] = useState<{ type: "success" | "error"; text: string } | null>(null);
  // Lido no ouvinte de teclado do diálogo, que não é recriado a cada render.
  const cancelandoRef = useRef(false);
  const dialogoCancelarRef = useRef<HTMLDivElement>(null);
  const manterRenovacaoRef = useRef<HTMLButtonElement>(null);
  const abrirCancelarRef = useRef<HTMLButtonElement>(null);
  const mensagemRenovacaoRef = useRef<HTMLDivElement>(null);

  const [exportingBackup, setExportingBackup] = useState(false);
  const [backupStatus, setBackupStatus] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);

  // Profile state
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nome, setNome] = useState("");
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [crp, setCrp] = useState("");
  const [telefone, setTelefone] = useState("");
  const [genero, setGenero] = useState<"F" | "M" | "outro">("F");
  const [cidade, setCidade] = useState("");
  const [endereco, setEndereco] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [erroPerfil, setErroPerfil] = useState<string | null>(null);
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

  // Fetch profile
  const fetchProfile = useCallback(async () => {
    setLoadingProfile(true);
    setErroPerfil(null);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    // Antes saía sem desligar o "carregando": a tela girava para sempre.
    if (authError || !user) {
      setErroPerfil("Não foi possível confirmar sua sessão. Recarregue a página ou entre de novo.");
      setLoadingProfile(false);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, nome, nome_completo, email, crp, telefone, genero, cidade, endereco, logo_url, calendar_token")
      .eq("id", user.id)
      .single();

    // Com o erro descartado, o formulário aparecia vazio — parecia que nome,
    // CRP e cidade tinham sumido.
    if (error || !data) {
      console.error("[configuracoes] perfil não carregado:", error?.message);
      setErroPerfil("Não foi possível carregar seus dados. Confira sua conexão e tente de novo.");
      setLoadingProfile(false);
      return;
    }

    setProfile(data);
    setNome(data.nome || "");
    setNomeCompleto(data.nome_completo || data.nome || "");
    setCrp(data.crp || "");
    setTelefone(data.telefone || "");
    setGenero((data.genero as "F" | "M" | "outro") || "F");
    setCidade(data.cidade || "");
    setEndereco(data.endereco || "");
    if (data.logo_url) {
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${data.logo_url}`;
      setLogoPreview(url);
    }
    setLoadingProfile(false);
    // `supabase` fica de fora: o cliente do navegador é o mesmo a cada render
    // (singleton do @supabase/ssr), mas o lint não sabe; com ele nas
    // dependências, o efeito abaixo buscaria o perfil a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cliente Supabase estável; incluí-lo recriaria a função a cada render
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial: os setState síncronos do início repetem o estado inicial (carregando, sem erro) e o resto vem depois do await; o "Tentar de novo" usa a mesma função
    fetchProfile();
  }, [fetchProfile]);

  // As faixas do topo levam a "/configuracoes#plano", mas a seção só existe
  // depois que o perfil carrega: na chegada, o navegador não acha o id.
  useEffect(() => {
    if (loadingProfile || window.location.hash !== "#plano") return;
    document.getElementById("plano")?.scrollIntoView({ block: "start" });
  }, [loadingProfile]);

  // Diálogo de cancelar a renovação: foco no botão que NÃO cancela (um Enter
  // distraído não desliga a cobrança), Esc fecha, Tab circula só dentro dele.
  // Ao fechar, o foco volta ao botão que o abriu.
  useEffect(() => {
    if (!confirmandoCancelamento) return;
    const abridor = abrirCancelarRef.current;
    manterRenovacaoRef.current?.focus();

    function aoTeclar(e: KeyboardEvent) {
      const dialogo = dialogoCancelarRef.current;
      if (e.key === "Escape") {
        e.preventDefault();
        // Com o pedido a caminho, fechar daria a impressão de que nada mudou.
        if (!cancelandoRef.current) setConfirmandoCancelamento(false);
        return;
      }
      if (e.key !== "Tab" || !dialogo) return;
      const botoes = Array.from(dialogo.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
      if (botoes.length === 0) {
        e.preventDefault();
        return;
      }
      const primeiro = botoes[0];
      const ultimo = botoes[botoes.length - 1];
      if (!dialogo.contains(document.activeElement) || document.activeElement === dialogo) {
        e.preventDefault();
        (e.shiftKey ? ultimo : primeiro).focus();
      } else if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      if (abridor?.isConnected) abridor.focus();
    };
  }, [confirmandoCancelamento]);

  // Depois de cancelar, o botão que abriu o diálogo some da tela (a renovação
  // deixa de estar ligada): o foco vai para a mensagem, que diz o que houve.
  // Declarado depois do efeito do diálogo para ganhar do foco devolvido lá.
  useEffect(() => {
    if (mensagemRenovacao) mensagemRenovacaoRef.current?.focus();
  }, [mensagemRenovacao]);

  async function cancelarRenovacao() {
    if (cancelandoRef.current) return;
    cancelandoRef.current = true;
    setCancelandoRenovacao(true);
    // Os botões ficam desabilitados durante o pedido; o foco fica no diálogo.
    dialogoCancelarRef.current?.focus();

    let mensagem: { type: "success" | "error"; text: string };
    try {
      const res = await fetch("/api/subscription/automatica/cancelar", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        mensagem = { type: "success", text: "Pronto: a renovação automática foi cancelada e seu cartão não será mais cobrado." };
      } else {
        // 404 (já não havia renovação), 409 (ainda em confirmação), 429 e 500
        // (pode ter cancelado no Mercado Pago) trazem a frase pronta.
        mensagem = {
          type: "error",
          text:
            typeof data?.error === "string" && data.error
              ? data.error
              : "Não foi possível cancelar agora. Tente de novo em alguns minutos.",
        };
      }
    } catch {
      mensagem = {
        type: "error",
        text: "Sem resposta do servidor. Confira sua conexão; se a renovação continuar ligada aqui, tente de novo.",
      };
    }

    cancelandoRef.current = false;
    setCancelandoRenovacao(false);
    setConfirmandoCancelamento(false);
    setMensagemRenovacao(mensagem);
    // Fura o cache de 1 minuto do status: sem isso a tela seguiria mostrando a
    // renovação ligada. Também depois de erro — a situação real pode não ser a
    // da tela (404, ou 500 depois de cancelar no Mercado Pago).
    await refreshSubscription();
  }

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
        nome_completo: nomeCompleto.trim() || nome.trim(),
        crp: crp.trim() || null,
        telefone: telefone.trim() || null,
        genero: genero || "F",
        cidade: cidade.trim() || null,
        endereco: endereco.trim() || null,
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

  const [regeneratingToken, setRegeneratingToken] = useState(false);
  const [tokenMessage, setTokenMessage] = useState<string | null>(null);

  // Copy calendar URL
  function handleCopyCalendar() {
    if (!profile?.calendar_token) return;
    const origin = window.location.origin;
    const webcalUrl = `webcal://${origin.replace(/^https?:\/\//, "")}/calendario/${profile.calendar_token}`;
    navigator.clipboard.writeText(webcalUrl);
    setCopiedCalendar(true);
    setTimeout(() => setCopiedCalendar(false), 2500);
  }

  // Regenerate/Revoke calendar token
  async function handleRegenerateCalendarToken() {
    if (
      !confirm(
        "Atenção: Ao gerar um novo link, o link anterior deixará de funcionar imediatamente no seu iPhone/Google Agenda e você precisará assinar o novo link. Deseja continuar?"
      )
    ) {
      return;
    }

    setRegeneratingToken(true);
    setTokenMessage(null);
    try {
      const res = await fetch("/api/calendar/regenerate-token", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.calendar_token) {
        setProfile((prev) => (prev ? { ...prev, calendar_token: data.calendar_token } : null));
        setTokenMessage("Novo link gerado com sucesso! O anterior foi revogado.");
        setTimeout(() => setTokenMessage(null), 5000);
      } else {
        alert(data.error || "Erro ao regenerar link.");
      }
    } catch {
      alert("Erro ao regenerar link do calendário.");
    } finally {
      setRegeneratingToken(false);
    }
  }

  // Backup Completo do Sistema (Descriptografado em CSV)
  async function handleDownloadBackup() {
    if (exportingBackup) return;
    setExportingBackup(true);
    setBackupStatus(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado.");

      const result = await generateFullSystemBackupCSV(
        supabase,
        user.id,
        nome || "psicologo"
      );

      if (result.success) {
        setBackupStatus({
          message: `Backup gerado com sucesso! Arquivo: ${result.filename}`,
          type: "success",
        });
      } else {
        setBackupStatus({
          message: `Erro ao gerar backup: ${result.error}`,
          type: "error",
        });
      }
    } catch (err: unknown) {
      // Chega aqui o Error de sessão lançado acima ou um erro do navegador:
      // lê `message` de qualquer objeto, como antes (err.message).
      const mensagem =
        typeof err === "object" && err !== null && "message" in err && typeof err.message === "string"
          ? err.message
          : "";
      setBackupStatus({
        message: mensagem || "Erro inesperado ao gerar backup.",
        type: "error",
      });
    } finally {
      setExportingBackup(false);
    }
  }

  if (loadingProfile) {
    return <Carregando className="py-24" />;
  }

  if (erroPerfil) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <p className="text-sm text-text-muted">{erroPerfil}</p>
        <button
          type="button"
          onClick={() => void fetchProfile()}
          className="px-3.5 py-1.5 rounded-xl border border-border text-xs font-semibold text-text hover:bg-background transition-colors cursor-pointer"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  // Renovação automática ligada (ou em confirmação): o Mercado Pago cobra
  // sozinho e o modal de assinatura só repetiria a situação mostrada aqui.
  const automatica = renovacaoViva(renovacao);
  const acessoAte = fimDoAcesso({ situacao, currentPeriodEnd, trialEndsAt });
  const proximaCobranca = dataCurta(renovacao?.proximaCobranca ?? renovacao?.primeiraCobranca);
  const canceladaEm = dataCurta(renovacao?.canceladaEm);

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
            {/* Tratamento / Título Profissional */}
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1.5">
                Tratamento Profissional nos Documentos
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setGenero("F")}
                  className={`py-2 px-2.5 rounded-xl border text-xs sm:text-sm font-medium transition-all text-center cursor-pointer ${
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
                  className={`py-2 px-2.5 rounded-xl border text-xs sm:text-sm font-medium transition-all text-center cursor-pointer ${
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
                  className={`py-2 px-2.5 rounded-xl border text-xs sm:text-sm font-medium transition-all text-center cursor-pointer ${
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1.5">
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
                <p className="mt-1 text-[11px] text-text-muted">Exibido em destaque no topo do documento</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-muted mb-1.5">
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
                <p className="mt-1 text-[11px] text-text-muted">Exibido na linha de assinatura acima do CRP</p>
              </div>
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
                  placeholder="Ex: CRP 00/00000"
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
                  placeholder="Ex: (00) 00000-0000"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-text text-sm
                             focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1.5 flex items-center gap-1.5">
                  <MapPin size={14} /> Cidade que Atende
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
                <label className="block text-sm font-medium text-text-muted mb-1.5 flex items-center gap-1.5">
                  <Building size={14} /> Endereço do Rodapé dos Laudos
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
              Esta imagem será impressa automaticamente no cabeçalho de todos os laudos e documentos emitidos.
            </p>

            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-border bg-background flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                {logoPreview ? (
                  // Logo enviado pela pessoa, lido direto do Storage do Supabase
                  // (com ?t= para furar o cache depois do upload): o next/image
                  // exigiria liberar o domínio e otimizaria uma miniatura.
                  // eslint-disable-next-line @next/next/no-img-element -- logo do usuário, servido pelo Storage do Supabase
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
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="flex-1 px-3.5 py-2.5 rounded-xl bg-background border border-border text-xs text-text-muted truncate font-mono">
                    webcal://.../{profile.calendar_token.slice(0, 12)}…
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyCalendar}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl
                                 bg-primary text-white text-sm font-medium
                                 hover:bg-primary-dark active:scale-[0.98]
                                 transition-all duration-200 cursor-pointer shadow-xs"
                    >
                      {copiedCalendar ? <Check size={14} /> : <Copy size={14} />}
                      {copiedCalendar ? "Copiado!" : "Copiar Link"}
                    </button>
                    <button
                      type="button"
                      onClick={handleRegenerateCalendarToken}
                      disabled={regeneratingToken}
                      title="Gerar um novo link e revogar o anterior por segurança"
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl
                                 bg-background border border-border text-text-muted hover:text-text hover:bg-surface
                                 transition-all duration-200 cursor-pointer text-xs font-medium disabled:opacity-50"
                    >
                      <RefreshCw size={14} className={regeneratingToken ? "animate-spin text-primary" : ""} />
                      <span className="hidden sm:inline">Revogar / Novo Link</span>
                    </button>
                  </div>
                </div>

                {tokenMessage && (
                  <div className="p-2.5 rounded-xl bg-success/10 border border-success/20 text-xs text-success flex items-center gap-1.5">
                    <Check size={13} />
                    <span>{tokenMessage}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-danger">Token não configurado.</p>
            )}
          </div>
        </div>

        {/* ─── Plano & Assinatura (Mercado Pago & Cupons) ─── */}
        {/* id "plano": destino das faixas do topo (cartão recusado, renovação automática). */}
        <div id="plano" className="scroll-mt-6 bg-surface rounded-2xl border border-border/60 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-4 border-b border-border/40">
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={18} className="text-primary" />
              <h3 className="text-base font-serif font-medium text-text">
                Plano & Assinatura
              </h3>
            </div>
            {/* Sem preço fixo aqui: quem tem cupom em uso paga outro valor, e o
                modal de assinatura mostra o preço certo de cada conta. */}
            <span className="text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-1 rounded-lg border border-primary/20">
              {situacao === "vip"
                ? "Acesso VIP"
                : situacao === "ativo"
                ? `Ativo até ${dataCurta(currentPeriodEnd) ?? "—"}`
                : situacao === "teste"
                ? `Teste até ${dataCurta(trialEndsAt) ?? "—"}`
                : "Acesso vencido"}
            </span>
          </div>

          <div className="p-5 space-y-4">
            <p className="text-sm text-text-muted leading-relaxed">
              O PsiSetting oferece pacientes e prontuários ilimitados, 5 modelos conforme a Resolução CFP 06/2019 e sincronização de agenda sem fidelidade ou contratos de permanência.
            </p>

            <div className="p-4 rounded-xl bg-background border border-border/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-text">Plano Único Profissional</p>
                <p className="text-xs text-text-muted">
                  Acesso ilimitado a todos os módulos clínicos, documentos e agenda.
                </p>
              </div>

              {/* No automático, "Renovar" convidaria a pagar duas vezes: a situação
                  e o cancelamento ficam no quadro logo abaixo. */}
              {!automatica && (
                <button
                  type="button"
                  onClick={openSubscriptionModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-all cursor-pointer shadow-xs shrink-0"
                >
                  <span>
                    {situacao === "ativo"
                      ? "Renovar"
                      : situacao === "vencido"
                      ? "Reativar acesso"
                      : situacao === "vip"
                      ? "Ver plano"
                      : "Assinar / Ver Opções"}
                  </span>
                </button>
              )}
            </div>

            {/* ─── Renovação automática no cartão ─── */}
            {renovacao && renovacao.situacao !== "cancelada" && (
              <div className="p-4 rounded-xl bg-background border border-border/80 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                    <CreditCard size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-text">Cartão · renovação automática</p>
                    <p className="text-xs text-text-muted">
                      {descreverCartao(renovacao.cartaoBandeira, renovacao.cartaoFinal)}
                    </p>
                  </div>
                </div>

                {renovacao.situacao === "criando" ? (
                  <p role="status" className="text-xs text-text-muted flex items-start gap-1.5">
                    <Clock size={13} className="text-primary shrink-0 mt-px" />
                    <span>Estamos confirmando sua renovação automática com o Mercado Pago.</span>
                  </p>
                ) : (
                  (proximaCobranca || renovacao.valor !== null) && (
                    <dl className="grid grid-cols-2 gap-3 text-xs">
                      {proximaCobranca && (
                        <div>
                          <dt className="text-text-muted">Próxima cobrança</dt>
                          <dd className="font-semibold text-text">{proximaCobranca}</dd>
                        </div>
                      )}
                      {renovacao.valor !== null && (
                        <div>
                          <dt className="text-text-muted">Valor</dt>
                          <dd className="font-semibold text-text">R$ {formatarReais(renovacao.valor)}</dd>
                        </div>
                      )}
                    </dl>
                  )
                )}

                {renovacao.cobrancaRecusada ? (
                  <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-950 flex items-start gap-2">
                    <AlertTriangle size={14} className="text-amber-700 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      <strong>Não conseguimos cobrar seu cartão.</strong> O Mercado Pago tenta de novo nos próximos dias
                      {acessoAte ? `; seu acesso continua até ${acessoAte}.` : "."} Se preferir pagar por PIX, cancele a
                      renovação automática.
                    </p>
                  </div>
                ) : (
                  // Período pago acabou e a cobrança do mês ainda não entrou: sem
                  // esta linha, "Ativo até" mostraria a data da tolerância sem
                  // explicar de onde ela vem.
                  emCarencia &&
                  renovacao.situacao === "ativa" && (
                    <p className="text-xs text-text-muted leading-relaxed">
                      A cobrança deste mês ainda não foi confirmada pelo Mercado Pago.
                      {acessoAte ? ` Seu acesso continua até ${acessoAte}.` : ""}
                    </p>
                  )
                )}

                {/* "criando" não tem o que cancelar ainda: o servidor responde 409. */}
                {renovacao.situacao === "ativa" && (
                  <button
                    ref={abrirCancelarRef}
                    type="button"
                    onClick={() => {
                      setMensagemRenovacao(null);
                      setConfirmandoCancelamento(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-danger/30 text-xs font-semibold text-danger
                               hover:bg-danger/5 transition-colors cursor-pointer
                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/30"
                  >
                    Cancelar renovação automática
                  </button>
                )}
              </div>
            )}

            {renovacao?.situacao === "cancelada" && (
              <div className="p-3.5 rounded-xl bg-background border border-border/80 text-xs text-text-muted flex items-start gap-2.5">
                <CreditCard size={15} className="shrink-0 mt-px" />
                <p className="leading-relaxed">
                  Renovação automática cancelada
                  {canceladaEm ? ` em ${canceladaEm}` : ""}.
                  {acessoAte ? ` Seu acesso vai até ${acessoAte}.` : ""}
                </p>
              </div>
            )}

            {mensagemRenovacao && (
              <div
                ref={mensagemRenovacaoRef}
                tabIndex={-1}
                role={mensagemRenovacao.type === "error" ? "alert" : "status"}
                className={`p-3 rounded-xl text-xs flex items-start gap-2 border focus:outline-none ${
                  mensagemRenovacao.type === "success"
                    ? "bg-success/10 text-success border-success/20"
                    : "bg-danger/10 text-danger border-danger/20"
                }`}
              >
                {mensagemRenovacao.type === "success" ? (
                  <Check size={14} className="shrink-0 mt-px" />
                ) : (
                  <ShieldAlert size={14} className="shrink-0 mt-px" />
                )}
                <span>{mensagemRenovacao.text}</span>
              </div>
            )}

            <MercadoPagoBadge variant="card" />

            <div className="pt-2 flex items-center justify-center gap-3 text-xs text-text-muted">
              <a href="/termos" target="_blank" rel="noopener noreferrer" className="hover:text-primary underline">
                Termos de Uso
              </a>
              <span>·</span>
              <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="hover:text-primary underline">
                Política de Privacidade
              </a>
            </div>
          </div>
        </div>

        {/* ─── Segurança & PIN do Diário de Bordo ─── */}
        <div className="bg-surface rounded-2xl border border-border/60 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-4 border-b border-border/40">
            <div className="flex items-center gap-2.5">
              <KeyRound size={18} className="text-primary" />
              <h3 className="text-base font-serif font-medium text-text">
                PIN do Diário de Bordo
              </h3>
            </div>
            <span className="text-xs font-semibold text-text-muted flex items-center gap-1">
              <ShieldCheck size={14} className="text-success" /> 6 Dígitos
            </span>
          </div>

          <div className="p-5 space-y-4">
            <p className="text-sm text-text-muted leading-relaxed">
              O Diário de Bordo é protegido por um PIN exclusivo de 6 dígitos numéricos para garantir que suas anotações mais íntimas fiquem em sigilo absoluto, sem depender de senhas externas ou do Google.
            </p>

            <div className="p-4 rounded-xl bg-background border border-border/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-text">PIN do Diário de Bordo</p>
                <p className="text-xs text-text-muted">
                  Bloqueio rápido de tela para o Diário. Defina ou altere a qualquer momento.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowPinModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-all cursor-pointer shadow-xs shrink-0"
              >
                <KeyRound size={14} />
                <span>Configurar / Alterar PIN</span>
              </button>
            </div>
          </div>
        </div>

        {/* ─── Backup & Exportação Completa de Dados (Portabilidade LGPD & CFP) ─── */}
        <div className="lg:col-span-2 bg-surface rounded-2xl border border-border/60 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-4 border-b border-border/40">
            <div className="flex items-center gap-2.5">
              <Database size={18} className="text-primary" />
              <h3 className="text-base font-serif font-medium text-text">
                Backup & Exportação Completa dos Dados
              </h3>
            </div>
            <span className="text-xs font-semibold text-text-muted flex items-center gap-1">
              <ShieldCheck size={14} className="text-success" /> Resolução CFP nº 01/2009 & LGPD
            </span>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="max-w-2xl space-y-1">
                <p className="text-sm font-semibold text-text">
                  Baixar todos os registros do consultório em planilha (.CSV)
                </p>
                <p className="text-xs text-text-muted leading-relaxed">
                  Gere um arquivo estruturado contendo todos os seus <strong>pacientes, evoluções de prontuário, notas do diário de bordo, histórico de agendamentos, lançamentos financeiros e documentos emitidos</strong>. Todos os dados são descriptografados na memória do seu navegador com a sua chave pessoal para você guardar em seu computador ou pendrive seguro.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDownloadBackup}
                disabled={exportingBackup}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl
                           bg-primary text-white text-sm font-medium
                           hover:bg-primary-dark active:scale-[0.98]
                           transition-all duration-200 cursor-pointer shrink-0 shadow-xs disabled:opacity-50"
              >
                {exportingBackup ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Decodificando e gerando backup...</span>
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    <span>Baixar Backup Completo (.CSV)</span>
                  </>
                )}
              </button>
            </div>

            {backupStatus && (
              <div
                className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
                  backupStatus.type === "success"
                    ? "bg-success/10 text-success border-success/20"
                    : "bg-danger/10 text-danger border-danger/20"
                }`}
              >
                {backupStatus.type === "success" ? <Check size={14} /> : <ShieldAlert size={14} />}
                <span>{backupStatus.message}</span>
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-950 flex items-start gap-2.5">
              <ShieldAlert size={15} className="text-amber-700 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Atenção ao Sigilo Profissional:</strong> O arquivo .CSV gerado contém prontuários e informações de saúde em texto legível. Armazene-o em dispositivo protegido por senha, em conformidade com o Código de Ética Profissional do Psicólogo.
              </p>
            </div>
          </div>
        </div>
      </div>

      <AlterarPinModal
        isOpen={showPinModal}
        onClose={() => setShowPinModal(false)}
      />

      {/* Confirmação: no Mercado Pago, cancelar não tem volta (para voltar, assina de novo). */}
      {confirmandoCancelamento && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-text/20 backdrop-blur-sm"
            onClick={() => !cancelandoRenovacao && setConfirmandoCancelamento(false)}
          />
          <div
            ref={dialogoCancelarRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancelar-renovacao-titulo"
            aria-describedby="cancelar-renovacao-texto"
            aria-busy={cancelandoRenovacao}
            tabIndex={-1}
            className="relative w-full max-w-md bg-surface rounded-2xl shadow-xl border border-border/60 p-6 focus:outline-none"
          >
            <h3 id="cancelar-renovacao-titulo" className="text-lg font-serif font-medium text-text mb-2">
              Cancelar a renovação automática?
            </h3>
            <p id="cancelar-renovacao-texto" className="text-sm text-text-muted leading-relaxed mb-6">
              {consequenciaDoCancelamento({ emCarencia, acessoAte })}
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
              <button
                ref={manterRenovacaoRef}
                type="button"
                onClick={() => setConfirmandoCancelamento(false)}
                disabled={cancelandoRenovacao}
                className="px-4 py-2 rounded-xl text-sm font-medium text-text-muted hover:bg-background transition-colors cursor-pointer disabled:opacity-50
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                Manter renovação
              </button>
              <button
                type="button"
                onClick={cancelarRenovacao}
                disabled={cancelandoRenovacao}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-danger text-white text-sm font-medium
                           hover:bg-danger/90 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
              >
                {cancelandoRenovacao && <Loader2 size={16} className="animate-spin" />}
                {cancelandoRenovacao ? "Cancelando..." : "Sim, cancelar renovação"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
