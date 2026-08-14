import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plug, Search, Plus, Heart, Download, ExternalLink, Github, Trash2, Zap,
  Package, Loader2, Star, Sparkles, SpellCheck, ShieldCheck, ShieldX,
} from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  model: "Modelo de IA",
  infra: "Infraestrutura",
  device: "Dispositivo",
  utility: "Utilitário",
};

const CATEGORY_COLORS: Record<string, string> = {
  model: "text-[#7cf3ff] border-[rgba(124,243,255,0.25)]",
  infra: "text-[#c9b8ff] border-[rgba(201,184,255,0.25)]",
  device: "text-[#ffd479] border-[rgba(255,212,121,0.25)]",
  utility: "text-[#3fe7b0] border-[rgba(63,231,176,0.25)]",
};

export default function Marketplace() {
  const [query, setQuery] = useState("");
  const [semantic, setSemantic] = useState(false);
  const [category, setCategory] = useState("all");
  const [queryInput, setQueryInput] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  // Community-suggested dynamic categories
  const [suggestName, setSuggestName] = useState("");
  const { data: approvedCategories } = trpc.categories.listApproved.useQuery();
  const communityCategories = approvedCategories?.map(c => c.name) ?? [];
  const suggestMutation = trpc.categories.suggest.useMutation({
    onSuccess: () => {
      toast.success("Categoria sugerida! Ela aparecerá após aprovação do administrador.");
      setSuggestName("");
      utils.categories.listApproved.invalidate();
    },
    onError: (e) => toast.error(e.message || "Erro ao sugerir categoria"),
  });
  const voteCategoryMutation = trpc.categories.vote.useMutation({
    onSuccess: () => utils.categories.listApproved.invalidate(),
  });
  const allCategoryNames = [...communityCategories];
  const [detailId, setDetailId] = useState<number | null>(null);
  const { data: detail } = trpc.marketplace.details.useQuery(
    { pluginId: detailId ?? 0 },
    { enabled: detailId !== null },
  );
  // Verification badge (readable by any logged user)
  const { data: verification } = trpc.marketplace.verification.useQuery(
    { pluginId: detailId ?? 0 },
    { enabled: detailId !== null },
  );
  const { data: listVerification } = trpc.marketplace.verificationPublic.useQuery(
    { pluginId: (detailId ?? -1) >= 0 && detailId !== null ? detailId : -1 },
    { enabled: false },
  );
  const [listVerificationIds, setListVerificationIds] = useState<number[]>([]);
  const listVerificationMap: Record<number, { status: string; verified: boolean }> = {};
  const { data: me } = trpc.auth.me.useQuery();
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const { data: reviews } = trpc.marketplace.reviews.useQuery(
    { pluginId: detailId ?? 0 },
    { enabled: detailId !== null },
  );
  // Phase 11: mission templates
  const { data: templates, isLoading: templatesLoading } = trpc.templates.list.useQuery();
  const createMissionMutation = trpc.missions.create.useMutation({
    onSuccess: () => {
      toast.success("Missão criada a partir do template! Acompanhe em Minha IA.");
      utils.missions.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "Erro ao criar missão"),
  });

  // Phase 10: threaded plugin discussions
  const { data: threads, isLoading: threadsLoading } = trpc.threads.list.useQuery(
    { pluginId: detailId ?? 0 },
    { enabled: detailId !== null },
  );
  const [threadContent, setThreadContent] = useState("");
  const [threadReplyTo, setThreadReplyTo] = useState<number | null>(null);
  const createThreadMutation = trpc.threads.create.useMutation({
    onSuccess: () => {
      toast.success("Discussão publicada!");
      setThreadContent("");
      setThreadReplyTo(null);
      utils.threads.list.invalidate({ pluginId: detailId ?? 0 });
    },
    onError: (e) => toast.error(e.message || "Erro ao publicar discussão"),
  });
  const removeThreadMutation = trpc.threads.remove.useMutation({
    onSuccess: () => {
      toast.success("Discussão removida.");
      utils.threads.list.invalidate({ pluginId: detailId ?? 0 });
    },
  });
  const addReviewMutation = trpc.marketplace.addReview.useMutation({
    onSuccess: () => {
      toast.success("Avaliação registrada!");
      setReviewComment("");
      utils.marketplace.reviews.invalidate();
      utils.marketplace.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "Erro ao registrar avaliação"),
  });
  const [form, setForm] = useState({
    name: "",
    category: "utility" as "model" | "infra" | "device" | "utility",
    description: "",
    githubUrl: "",
    sourceCode: "",
    version: "1.0.0",
  });

  const utils = trpc.useUtils();
  const { data: plugins, isLoading } = trpc.marketplace.list.useQuery(
    { query: query || undefined, category: category === "all" ? undefined : category },
    { enabled: !semantic },
  );
  const { data: semanticResults, isLoading: semanticLoading } = trpc.marketplace.semanticSearch.useQuery(
    { query },
    { enabled: semantic && query.trim().length >= 2, refetchOnWindowFocus: false },
  );
  const displayPlugins = semantic ? (semanticResults || []) : (plugins || []);
  const pluginIds = displayPlugins.map(p => p.id);
  // Public verification query keyed per plugin id (enabled only when id > 0)
  const verificationQuery = trpc.marketplace.verificationPublic.useQuery(
    { pluginId: listVerificationIds[0] ?? -1 },
    { enabled: (listVerificationIds[0] ?? -1) > 0, refetchOnWindowFocus: false },
  );
  // Cycle through plugin ids to preload verification status one at a time
  useEffect(() => {
    // Start from the first plugin whenever the displayed list changes
    setListVerificationIds(prev => {
      if (prev.length === 0 && pluginIds.length > 0) return [pluginIds[0]];
      return prev;
    });
    const timer = setInterval(() => {
      setListVerificationIds(prev => {
        const next = pluginIds.filter(id => id !== (prev[0] ?? -1));
        return next.length > 0 ? [next[0]] : [];
      });
    }, 250);
    return () => clearInterval(timer);
  }, [pluginIds]);
  if (verificationQuery.data && listVerificationIds.length > 0) listVerificationMap[listVerificationIds[0]] = verificationQuery.data;
  const publishMutation = trpc.marketplace.publish.useMutation({
    onSuccess: () => {
      toast.success("Plugin publicado no marketplace!");
      setDialogOpen(false);
      setForm({ name: "", category: "utility", description: "", githubUrl: "", sourceCode: "", version: "1.0.0" });
      utils.marketplace.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "Erro ao publicar plugin"),
  });
  const installMutation = trpc.marketplace.install.useMutation({
    onSuccess: () => {
      toast.success("Plugin instalado e conectado ao seu ecossistema!");
      utils.plugins.list.invalidate();
      utils.marketplace.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "Erro ao instalar plugin"),
  });
  const upvoteMutation = trpc.marketplace.upvote.useMutation({
    onSuccess: () => {
      utils.marketplace.list.invalidate();
      utils.marketplace.details.invalidate();
    },
  });
  const removeMutation = trpc.marketplace.remove.useMutation({
    onSuccess: () => {
      toast.success("Plugin removido do marketplace.");
      setDetailId(null);
      utils.marketplace.list.invalidate();
    },
    onError: () => toast.error("Erro ao remover plugin"),
  });

  const handlePublish = () => {
    if (!form.name.trim() || !form.description.trim()) {
      toast.error("Preencha o nome e a descrição do plugin.");
      return;
    }
    publishMutation.mutate(form);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-[#e2e8f4] flex items-center gap-2">
            <Package className="h-5 w-5 text-[#c9b8ff]" />
            Marketplace de Plugins
          </h2>
          <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase">
            Compartilhe e descubra plugins da comunidade NEXUS
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#c9b8ff]/10 text-[#c9b8ff] border border-[#c9b8ff]/20 hover:bg-[#c9b8ff]/20 font-mono text-xs">
              <Plus className="h-3.5 w-3.5 mr-2" />
              PUBLICAR PLUGIN
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#05070f] border-[rgba(150,175,220,0.12)] max-w-md">
            <DialogHeader>
              <DialogTitle className="text-[#e2e8f4] font-mono text-sm">Publicar Plugin</DialogTitle>
              <DialogDescription className="text-[10px] font-mono text-[#7684a0]">
                Compartilhe seu plugin com toda a comunidade NEXUS.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-mono text-[#7684a0] tracking-wider">NOME</label>
                <Input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="ex: Sentinela de Segurança"
                  className="bg-[rgba(3,5,14,0.8)] border-[rgba(150,175,220,0.12)] text-[#e2e8f4] text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-mono text-[#7684a0] tracking-wider">CATEGORIA</label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v as any })}>
                  <SelectTrigger className="bg-[rgba(3,5,14,0.8)] border-[rgba(150,175,220,0.12)] text-[#e2e8f4] text-xs font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="model">Modelo de IA</SelectItem>
                    <SelectItem value="infra">Infraestrutura</SelectItem>
                    <SelectItem value="device">Dispositivo</SelectItem>
                    <SelectItem value="utility">Utilitário</SelectItem>
                    {allCategoryNames.length > 0 && (
                      <>
                        <div className="h-px bg-[rgba(150,175,220,0.15)] my-1" />
                        {allCategoryNames.map(name => (
                          <SelectItem key={name} value={name}>{name}</SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-mono text-[#7684a0] tracking-wider">DESCRIÇÃO</label>
                <Textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Descreva o que o plugin faz..."
                  className="bg-[rgba(3,5,14,0.8)] border-[rgba(150,175,220,0.12)] text-[#e2e8f4] text-xs font-mono min-h-24"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-mono text-[#7684a0] tracking-wider">URL DO GITHUB (opcional)</label>
                <Input
                  value={form.githubUrl}
                  onChange={e => setForm({ ...form, githubUrl: e.target.value })}
                  placeholder="https://github.com/usuario/repositorio"
                  className="bg-[rgba(3,5,14,0.8)] border-[rgba(150,175,220,0.12)] text-[#e2e8f4] text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-mono text-[#7684a0] tracking-wider">VERSÃO</label>
                <Input
                  value={form.version}
                  onChange={e => setForm({ ...form, version: e.target.value })}
                  className="bg-[rgba(3,5,14,0.8)] border-[rgba(150,175,220,0.12)] text-[#e2e8f4] text-xs font-mono"
                />
              </div>
              <Button
                onClick={handlePublish}
                disabled={publishMutation.isPending}
                className="w-full bg-[#c9b8ff]/10 text-[#c9b8ff] border border-[#c9b8ff]/20 hover:bg-[#c9b8ff]/20 font-mono text-xs"
              >
                {publishMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-2" />}
                PUBLICAR
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Phase 11: mission templates */}
      <div>
        <div className="flex items-center gap-2 mb-2.5">
          <Zap className="h-4 w-4 text-[#ffd479]" />
          <h3 className="text-sm font-semibold text-[#e2e8f4]">Templates de Missão</h3>
          <span className="text-[10px] font-mono text-[#7684a0]">· modelos prontos para adaptar com um clique</span>
        </div>
        {templatesLoading ? (
          <div className="h-24 animate-pulse nexus-card" />
        ) : !templates?.length ? (
          <p className="nexus-card p-4 text-[10px] font-mono text-[#7684a0]">Nenhum template ainda. Execute universe.seed no painel de Admin para carregar os templates padrão.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map(t => (
              <div key={t.id} className="nexus-card p-3.5 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-[#e2e8f4]">{t.title}</p>
                    <span className="text-[8px] font-mono text-[#ffd479] border border-[rgba(255,212,121,0.2)] px-1 py-0.5 rounded">
                      {t.category.toUpperCase()}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] font-mono text-[#7684a0] line-clamp-2">{t.description}</p>
                <Button
                  size="sm"
                  onClick={() => createMissionMutation.mutate({ input: t.suggestedInput })}
                  disabled={createMissionMutation.isPending}
                  className="mt-auto bg-[#ffd479]/10 text-[#ffd479] border border-[#ffd479]/20 hover:bg-[#ffd479]/20 font-mono text-[10px] self-start"
                >
                  {createMissionMutation.isPending ? (
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  ) : (
                    <Zap className="h-3 w-3 mr-1.5" />
                  )}
                  USAR TEMPLATE
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="nexus-card p-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#7684a0]" />
          <Input
            value={queryInput}
            onChange={e => setQueryInput(e.target.value)}
            onBlur={() => setQuery(queryInput)}
            onKeyDown={e => e.key === "Enter" && setQuery(queryInput)}
            placeholder={semantic ? "Busca semântica com IA..." : "Buscar plugins..."}
            className="pl-9 bg-transparent border-[rgba(150,175,220,0.12)] text-[#e2e8f4] text-xs font-mono"
          />
        </div>
        <button
          type="button"
          onClick={() => setSemantic(!semantic)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[9px] font-mono rounded border transition-colors ${
            semantic
              ? "bg-[#7cf3ff]/10 text-[#7cf3ff] border-[#7cf3ff]/40"
              : "text-[#7684a0] border-[rgba(150,175,220,0.12)] hover:border-[rgba(150,175,220,0.25)]"
          }`}
        >
          {semantic ? <Sparkles className="h-3 w-3" /> : <SpellCheck className="h-3 w-3" />}
          SEMÂNTICA
        </button>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-40 bg-transparent border-[rgba(150,175,220,0.12)] text-[#e2e8f4] text-xs font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="model">Modelos</SelectItem>
            <SelectItem value="infra">Infraestrutura</SelectItem>
            <SelectItem value="device">Dispositivos</SelectItem>
            <SelectItem value="utility">Utilitários</SelectItem>
            {allCategoryNames.map(name => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[9px] font-mono text-[#7684a0]">{displayPlugins.length} plugins</span>
      </div>

      {semantic && query.trim().length >= 2 && (
        <p className="text-[9px] font-mono text-[#7684a0]">⚡ Busca semântica IA{semanticLoading ? " — processando..." : ""}</p>
      )}

      {/* Grid */}
      {(isLoading || semanticLoading) ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="nexus-card p-4 h-48 animate-pulse" />
          ))}
        </div>
      ) : displayPlugins.length === 0 ? (
        <div className="nexus-card p-10 flex flex-col items-center gap-3">
          <Plug className="h-8 w-8 text-[#7cf3ff]/30" />
          <p className="text-sm font-mono text-[#aab4d6]">
            {semantic && query ? "Nenhum plugin semanticamente relevante encontrado. Tente outra descrição." : query || category !== "all" ? "Nenhum plugin encontrado com esses filtros." : "O marketplace está vazio."}
          </p>
          <p className="text-[10px] font-mono text-[#7684a0]">
            Seja o primeiro a publicar um plugin para a comunidade NEXUS.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {displayPlugins.map(p => (
            <div key={p.id} className="nexus-card p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-mono font-medium text-[#e2e8f4]">{p.name}</h3>
                  <p className="text-[8px] font-mono text-[#7684a0] mt-0.5">
                    v{p.version} · Autor ID {p.authorId}
                  </p>
                </div>
                <span className={`text-[8px] font-mono px-2 py-0.5 rounded border ${CATEGORY_COLORS[p.category] || "text-[#7684a0] border-[rgba(150,175,220,0.2)]"}`}>
                  {(CATEGORY_LABELS[p.category] || p.category).toUpperCase()}
                </span>
              </div>
              {listVerificationMap[p.id] !== undefined && (
                <span className={`inline-flex items-center gap-1 text-[8px] font-mono px-2 py-0.5 rounded border ${listVerificationMap[p.id].verified ? "text-[#3fe7b0] border-[#3fe7b0]/30" : "text-[#ff6b6b] border-[#ff6b6b]/30"}`}>
                  {listVerificationMap[p.id].verified ? <ShieldCheck className="h-2.5 w-2.5" /> : <ShieldX className="h-2.5 w-2.5" />}
                  {listVerificationMap[p.id].verified ? "VERIFICADO" : "NÃO VERIFICADO"}
                </span>
              )}
              <p className="text-[11px] font-mono text-[#aab4d6] line-clamp-3 flex-1">{p.description}</p>
              {p.githubUrl && (
                <a
                  href={p.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-mono text-[#7cf3ff] flex items-center gap-1.5 hover:underline"
                >
                  <Github className="h-3 w-3" />
                  Ver no GitHub
                </a>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-[rgba(150,175,220,0.06)]">
                <div className="flex items-center gap-3 text-[9px] font-mono text-[#7684a0]">
                  <span className="flex items-center gap-1">
                    <Heart className="h-3 w-3" /> {p.upvotes}
                  </span>
                  <span className="flex items-center gap-1">
                    <Download className="h-3 w-3" /> {p.downloads}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDetailId(p.id)}
                    className="h-7 text-[10px] font-mono text-[#aab4d6] hover:bg-[rgba(150,175,220,0.1)]"
                  >
                    DETALHES
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => upvoteMutation.mutate({ pluginId: p.id })}
                    className="h-7 text-[10px] font-mono text-[#c9b8ff] hover:bg-[#c9b8ff]/10"
                  >
                    <Heart className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => installMutation.mutate({ pluginId: p.id })}
                    disabled={installMutation.isPending}
                    className="h-7 text-[10px] font-mono bg-[#7cf3ff]/10 text-[#7cf3ff] border border-[#7cf3ff]/20 hover:bg-[#7cf3ff]/20"
                  >
                    {installMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                    INSTALAR
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={detailId !== null} onOpenChange={o => !o && setDetailId(null)}>
        <DialogContent className="bg-[#05070f] border-[rgba(150,175,220,0.12)] max-w-md">
          {detail ? (
            <div className="space-y-3">
              <DialogHeader>
                <DialogTitle className="text-[#e2e8f4] font-mono text-sm">{detail.name}</DialogTitle>
                <DialogDescription className="text-[9px] font-mono text-[#7684a0]">
                  v{detail.version} · {(CATEGORY_LABELS[detail.category] || detail.category).toUpperCase()} · Autor ID {detail.authorId}
                </DialogDescription>
                {verification && (
                  <div className={`inline-flex items-center gap-1.5 text-[9px] font-mono px-2 py-1 rounded border ${verification.verified ? "text-[#3fe7b0] border-[#3fe7b0]/30 bg-[#3fe7b0]/5" : "text-[#ff6b6b] border-[#ff6b6b]/30 bg-[#ff6b6b]/5"}`}>
                    {verification.verified ? <ShieldCheck className="h-3 w-3" /> : <ShieldX className="h-3 w-3" />}
                    {verification.verified ? "PLUGIN VERIFICADO" : "VERIFICAÇÃO REPROVADA"}
                    <span className="text-[8px] opacity-70">({verification.checks.filter(c => c.passed).length}/{verification.checks.length} testes)</span>
                  </div>
                )}
                {verification && verification.checks.length > 0 && (
                  <div className="space-y-0.5">
                    {verification.checks.map((c, i) => (
                      <p key={i} className={`text-[8px] font-mono ${c.passed ? "text-[#aab4d6]" : "text-[#ff6b6b]"}`}>
                        {c.passed ? "✓" : "✗"} {c.name}{c.note ? ` — ${c.note}` : ""}
                      </p>
                    ))}
                  </div>
                )}
              </DialogHeader>
              <p className="text-[11px] font-mono text-[#aab4d6] whitespace-pre-wrap">{detail.description}</p>

              {/* Rating + reviews */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-3.5 w-3.5 ${i < Math.round(reviews?.averageRating || 0) ? "text-[#ffd479] fill-[#ffd479]" : "text-[#3a4360]"}`}
                      />
                    ))}
                  </div>
                  <span className="text-[9px] font-mono text-[#7684a0]">
                    {(reviews?.averageRating || 0).toFixed(1)} · {reviews?.reviewCount || 0} avaliação(ões)
                  </span>
                </div>
                {reviews?.reviews && reviews.reviews.length > 0 && (
                  <div className="space-y-1.5 max-h-32 overflow-auto">
                    {reviews.reviews.map(r => (
                      <div key={r.id} className="bg-[rgba(3,5,14,0.8)] border border-[rgba(150,175,220,0.1)] p-2">
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-2.5 w-2.5 ${i < r.rating ? "text-[#ffd479] fill-[#ffd479]" : "text-[#3a4360]"}`}
                            />
                          ))}
                          <span className="text-[8px] font-mono text-[#7684a0] ml-1">
                            Usuário #{r.userId} · {new Date(r.createdAt).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                        {r.comment ? <p className="text-[10px] font-mono text-[#aab4d6] mt-1">{r.comment}</p> : null}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setReviewRating(i + 1)}
                        className="p-0.5"
                        aria-label={`Nota ${i + 1}`}
                      >
                        <Star
                          className={`h-4 w-4 transition-colors ${i < reviewRating ? "text-[#ffd479] fill-[#ffd479]" : "text-[#3a4360] hover:text-[#ffd479]/60"}`}
                        />
                      </button>
                    ))}
                  </div>
                  <Input
                    value={reviewComment}
                    onChange={e => setReviewComment(e.target.value)}
                    placeholder="Deixe um comentário (opcional)"
                    className="bg-[rgba(3,5,14,0.8)] border-[rgba(150,175,220,0.12)] text-[#e2e8f4] text-[10px] font-mono flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!detailId) return;
                      addReviewMutation.mutate({ pluginId: detailId, rating: reviewRating, comment: reviewComment });
                    }}
                    disabled={addReviewMutation.isPending}
                    className="h-7 text-[10px] font-mono bg-[#ffd479]/10 text-[#ffd479] border border-[#ffd479]/20 hover:bg-[#ffd479]/20"
                  >
                    {addReviewMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "AVALIAR"}
                  </Button>
                </div>
              </div>
              {/* Phase 10: threaded discussion */}
              <div className="space-y-1.5 pt-1 border-t border-[rgba(150,175,220,0.08)]">
                <p className="text-[9px] font-mono text-[#7684a0] tracking-wider pt-2">DISCUSSÃO</p>
                {threadsLoading ? (
                  <p className="text-[10px] font-mono text-[#7684a0]">Carregando discussões…</p>
                ) : !threads || threads.length === 0 ? (
                  <p className="text-[10px] font-mono text-[#5a6580]">Nenhuma discussão ainda. Seja o primeiro a comentar!</p>
                ) : (
                  <div className="space-y-1.5 max-h-44 overflow-auto">
                    {threads
                      .filter(t => t.parentId === null)
                      .map(root => {
                        const replies = threads.filter(t => t.parentId === root.id);
                        return (
                          <div key={root.id}>
                            <div className="bg-[rgba(3,5,14,0.8)] border border-[rgba(150,175,220,0.1)] p-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[8px] font-mono text-[#7684a0]">
                                  {root.authorName ?? `Usuário #${root.authorId}`} · {new Date(root.createdAt).toLocaleDateString("pt-BR")}
                                </span>
                                {me && root.authorId === me.id && (
                                  <button
                                    type="button"
                                    onClick={() => removeThreadMutation.mutate({ id: root.id })}
                                    className="text-[#ff7a8c] hover:underline text-[8px] font-mono"
                                  >
                                    remover
                                  </button>
                                )}
                              </div>
                              <p className="text-[10px] font-mono text-[#aab4d6] mt-0.5 whitespace-pre-wrap">{root.content}</p>
                              <button
                                type="button"
                                onClick={() => setThreadReplyTo(threadReplyTo === root.id ? null : root.id)}
                                className="text-[8px] font-mono text-[#7cf3ff]/80 hover:text-[#7cf3ff] mt-1"
                              >
                                {threadReplyTo === root.id ? "cancelar resposta" : "↩ responder"}
                              </button>
                            </div>
                            {replies.map(reply => (
                              <div key={reply.id} className="bg-[rgba(60,80,140,0.06)] border-l-2 border-[#7cf3ff]/30 ml-3 p-1.5 mt-1">
                                <span className="text-[8px] font-mono text-[#7684a0]">
                                  {reply.authorName ?? `Usuário #${reply.authorId}`} · {new Date(reply.createdAt).toLocaleDateString("pt-BR")}
                                </span>
                                <p className="text-[10px] font-mono text-[#aab4d6] mt-0.5 whitespace-pre-wrap">{reply.content}</p>
                                {me && reply.authorId === me.id && (
                                  <button
                                    type="button"
                                    onClick={() => removeThreadMutation.mutate({ id: reply.id })}
                                    className="text-[#ff7a8c] hover:underline text-[8px] font-mono"
                                  >
                                    remover
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                  </div>
                )}
                {me ? (
                  <div className="flex flex-col gap-1.5">
                    <Textarea
                      value={threadContent}
                      onChange={e => setThreadContent(e.target.value)}
                      placeholder={threadReplyTo ? "Escreva sua resposta…" : "Inicie uma discussão sobre este plugin…"}
                      className="bg-[rgba(3,5,14,0.8)] border-[rgba(150,175,220,0.12)] text-[#e2e8f4] text-[10px] font-mono min-h-14"
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!detailId || !threadContent.trim()) return;
                        createThreadMutation.mutate({
                          pluginId: detailId,
                          content: threadContent.trim(),
                          parentId: threadReplyTo ?? undefined,
                        });
                      }}
                      disabled={createThreadMutation.isPending || !threadContent.trim()}
                      className="h-6 self-start text-[9px] font-mono bg-[#c9b8ff]/10 text-[#c9b8ff] border border-[#c9b8ff]/20 hover:bg-[#c9b8ff]/20"
                    >
                      {createThreadMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : (threadReplyTo ? "RESPONDER" : "PUBLICAR")}
                    </Button>
                  </div>
                ) : (
                  <p className="text-[9px] font-mono text-[#5a6580]">Faça login para participar da discussão.</p>
                )}
              </div>
              {detail.sourceCode && (
                <div className="space-y-1">
                  <label className="text-[9px] font-mono text-[#7684a0] tracking-wider">CÓDIGO-FONTE</label>
                  <pre className="bg-[rgba(3,5,14,0.8)] border border-[rgba(150,175,220,0.12)] text-[#7cf3ff] text-[10px] font-mono p-3 max-h-40 overflow-auto rounded-sm">{detail.sourceCode}</pre>
                </div>
              )}
              {detail.githubUrl && (
                <a
                  href={detail.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-mono text-[#7cf3ff] flex items-center gap-1.5 hover:underline"
                >
                  <Github className="h-3 w-3" /> Ver no GitHub
                </a>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-[rgba(150,175,220,0.06)]">
                <div className="flex items-center gap-3 text-[9px] font-mono text-[#7684a0]">
                  <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {detail.upvotes}</span>
                  <span className="flex items-center gap-1"><Download className="h-3 w-3" /> {detail.downloads}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {me && detail.authorId === me.id ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeMutation.mutate({ pluginId: detail.id })}
                      className="h-7 text-[10px] font-mono text-[#ff7a8c] hover:bg-[#ff7a8c]/10"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => upvoteMutation.mutate({ pluginId: detail.id })}
                    className="h-7 text-[10px] font-mono text-[#c9b8ff] hover:bg-[#c9b8ff]/10"
                  >
                    <Heart className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => installMutation.mutate({ pluginId: detail.id })}
                    disabled={installMutation.isPending}
                    className="h-7 text-[10px] font-mono bg-[#7cf3ff]/10 text-[#7cf3ff] border border-[#7cf3ff]/20 hover:bg-[#7cf3ff]/20"
                  >
                    {installMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                    INSTALAR
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-[#7cf3ff]" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Community-suggested categories */}
      <div className="nexus-card p-4 space-y-3">
        <h3 className="text-[10px] font-mono tracking-wider text-[#7684a0]">CATEGORIAS DA COMUNIDADE</h3>
        <p className="text-[9px] font-mono text-[#7684a0]">
          Sugira novas categorias para o marketplace. Após aprovação de um administrador, elas aparecem no filtro e no formulário de publicação.
        </p>
        {communityCategories.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {approvedCategories!.map(c => (
              <button
                key={c.id}
                onClick={() => voteCategoryMutation.mutate({ categoryId: c.id })}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-mono rounded border border-[rgba(201,184,255,0.25)] bg-[rgba(201,184,255,0.06)] text-[#c9b8ff] hover:bg-[rgba(201,184,255,0.14)] transition-colors"
              >
                <Heart className="h-3 w-3" />
                {c.name}
                <span className="text-[8px] opacity-70">({c.upvotes})</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[9px] font-mono text-[#7684a0]">Nenhuma categoria da comunidade aprovada ainda.</p>
        )}
        <div className="flex items-center gap-2">
          <Input
            value={suggestName}
            onChange={e => setSuggestName(e.target.value)}
            placeholder="Sugerir nova categoria..."
            className="flex-1 bg-[rgba(3,5,14,0.8)] border-[rgba(150,175,220,0.12)] text-[#e2e8f4] text-xs font-mono max-w-xs"
          />
          <Button
            onClick={() => {
              if (!suggestName.trim()) return;
              suggestMutation.mutate({ name: suggestName.trim() });
            }}
            disabled={suggestMutation.isPending || !suggestName.trim()}
            className="bg-[#c9b8ff]/10 text-[#c9b8ff] border border-[#c9b8ff]/20 hover:bg-[#c9b8ff]/20 font-mono text-[10px]"
          >
            {suggestMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            SUGERIR
          </Button>
        </div>
      </div>
    </div>
  );
}
