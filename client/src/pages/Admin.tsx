import { trpc } from "@/lib/trpc";
import { ShieldCheck, Users, Package, Loader2, AlertTriangle, UserCheck, UserX, Ban, Trash2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

export default function Admin() {
  const { data: me, isLoading: meLoading } = trpc.auth.me.useQuery();
  const { data: stats, isLoading: statsLoading } = trpc.admin.stats.useQuery(undefined, {
    enabled: me?.role === "admin",
  });
  const { data: users, isLoading: usersLoading } = trpc.admin.listUsers.useQuery(undefined, {
    enabled: me?.role === "admin",
  });
  const { data: mpPlugins, isLoading: mpLoading } = trpc.admin.listPlugins.useQuery(undefined, {
    enabled: me?.role === "admin",
  });
  const { data: growth, isLoading: growthLoading } = trpc.admin.growth.useQuery(undefined, {
    enabled: me?.role === "admin",
  });
  const { data: pendingCategories, isLoading: catLoading } = trpc.categories.listPending.useQuery(undefined, {
    enabled: me?.role === "admin",
  });

  const utils = trpc.useUtils();
  const setRoleMutation = trpc.admin.setRole.useMutation({
    onSuccess: () => {
      toast.success("Papel do usuário atualizado.");
      utils.admin.listUsers.invalidate();
    },
    onError: e => toast.error(e.message || "Erro ao atualizar papel"),
  });
  const approveMutation = trpc.admin.approvePlugin.useMutation({
    onSuccess: () => {
      toast.success("Status do plugin atualizado.");
      utils.admin.listPlugins.invalidate();
      utils.marketplace.list.invalidate();
    },
    onError: e => toast.error(e.message || "Erro ao atualizar plugin"),
  });
  const deletePluginMutation = trpc.admin.deletePlugin.useMutation({
    onSuccess: () => {
      toast.success("Plugin removido da plataforma.");
      utils.admin.listPlugins.invalidate();
      utils.marketplace.list.invalidate();
    },
    onError: e => toast.error(e.message || "Erro ao remover plugin"),
  });
  const approveCategoryMutation = trpc.admin.approveCategory.useMutation({
    onSuccess: () => {
      toast.success("Categoria atualizada.");
      utils.categories.listPending.invalidate();
      utils.categories.listApproved.invalidate();
    },
    onError: e => toast.error(e.message || "Erro ao atualizar categoria"),
  });
  const deleteCategoryMutation = trpc.admin.deleteCategory.useMutation({
    onSuccess: () => {
      toast.success("Categoria removida.");
      utils.categories.listPending.invalidate();
    },
    onError: e => toast.error(e.message || "Erro ao remover categoria"),
  });
  const growthData = growth?.weeks.map(w => ({
    ...w,
    label: new Date(w.week).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
  })) ?? [];

  if (meLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-[#7cf3ff]" />
      </div>
    );
  }

  if (me?.role !== "admin") {
    return (
      <div className="nexus-card p-8 flex flex-col items-center gap-3 animate-fade-in">
        <AlertTriangle className="h-6 w-6 text-[#ff6b6b]" />
        <p className="text-sm font-mono text-[#aab4d6]">Acesso restrito a administradores.</p>
        <p className="text-[10px] font-mono text-[#7684a0]">
          Seu papel atual: {me?.role || "desconhecido"}. Solicite acesso ao proprietário do NEXUS.
        </p>
      </div>
    );
  }

  const pendingCount = mpPlugins?.filter(p => !p.isApproved).length || 0;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-[#e2e8f4] flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-[#3fe7b0]" />
          Painel de Administração
        </h2>
        <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase">
          Controle global do ecossistema NEXUS
        </p>
      </div>

      {/* Platform stats */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {statsLoading ? (
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="nexus-card p-4 h-20 animate-pulse" />)
        ) : (
          <>
            <div className="nexus-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-[#7cf3ff]" />
                <span className="text-[9px] font-mono text-[#7684a0] tracking-wider">USUÁRIOS</span>
              </div>
              <p className="text-2xl font-mono text-[#7cf3ff]">{stats?.users || 0}</p>
            </div>
            <div className="nexus-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-4 w-4 text-[#c9b8ff]" />
                <span className="text-[9px] font-mono text-[#7684a0] tracking-wider">MISSÕES</span>
              </div>
              <p className="text-2xl font-mono text-[#c9b8ff]">{stats?.missions || 0}</p>
            </div>
            <div className="nexus-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-4 w-4 text-[#3fe7b0]" />
                <span className="text-[9px] font-mono text-[#7684a0] tracking-wider">PLUGINS USUÁRIO</span>
              </div>
              <p className="text-2xl font-mono text-[#3fe7b0]">{stats?.plugins || 0}</p>
            </div>
            <div className="nexus-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-4 w-4 text-[#ffd479]" />
                <span className="text-[9px] font-mono text-[#7684a0] tracking-wider">MARKETPLACE</span>
              </div>
              <p className="text-2xl font-mono text-[#ffd479]">{stats?.marketplacePlugins || 0}</p>
            </div>
            <div className="nexus-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-4 w-4 text-[#a78bfa]" />
                <span className="text-[9px] font-mono text-[#7684a0] tracking-wider">MEMÓRIAS</span>
              </div>
              <p className="text-2xl font-mono text-[#a78bfa]">{stats?.memories || 0}</p>
            </div>
            <div className="nexus-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-[#ff6b6b]" />
                <span className="text-[9px] font-mono text-[#7684a0] tracking-wider">PENDENTES</span>
              </div>
              <p className="text-2xl font-mono text-[#ff6b6b]">{pendingCount}</p>
            </div>
          </>
        )}
      </div>

      {/* Plugin moderation */}
      <div className="nexus-card p-4">
        <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase mb-3">
          Moderação de Plugins do Marketplace ({(mpPlugins?.length || 0)} registrados)
        </p>
        {mpLoading ? (
          <div className="h-24 animate-pulse" />
        ) : !mpPlugins?.length ? (
          <p className="text-[10px] font-mono text-[#7684a0]">Nenhum plugin publicado ainda.</p>
        ) : (
          <div className="space-y-2">
            {mpPlugins.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-3 bg-[rgba(3,5,14,0.8)] border border-[rgba(150,175,220,0.08)] p-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-mono text-[#e2e8f4] truncate">
                    {p.name} <span className="text-[#7684a0]">· v{p.version} · autor #{p.authorId}</span>
                  </p>
                  <p className="text-[9px] font-mono text-[#7684a0] truncate">{p.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p.isApproved ? (
                    <span className="text-[9px] font-mono text-[#3fe7b0] border border-[rgba(63,231,176,0.25)] px-2 py-0.5">APROVADO</span>
                  ) : (
                    <span className="text-[9px] font-mono text-[#ffd479] border border-[rgba(255,212,121,0.25)] px-2 py-0.5">PENDENTE</span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => approveMutation.mutate({ pluginId: p.id, isApproved: !p.isApproved })}
                    className="h-7 text-[10px] font-mono text-[#7cf3ff] hover:bg-[#7cf3ff]/10"
                  >
                    {p.isApproved ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                    {p.isApproved ? "REPROVAR" : "APROVAR"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Remover "${p.name}" permanentemente?`)) {
                        deletePluginMutation.mutate({ pluginId: p.id });
                      }
                    }}
                    className="h-7 text-[10px] font-mono text-[#ff7a8c] hover:bg-[#ff7a8c]/10"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User management */}
      <div className="nexus-card p-4">
        <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase mb-3">
          Usuários da Plataforma ({(users?.length || 0)} registrados)
        </p>
        {usersLoading ? (
          <div className="h-24 animate-pulse" />
        ) : !users?.length ? (
          <p className="text-[10px] font-mono text-[#7684a0]">Nenhum usuário registrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[rgba(150,175,220,0.08)]">
                  <th className="text-[9px] font-mono text-[#7684a0] tracking-wider font-normal pb-2 pr-3">ID</th>
                  <th className="text-[9px] font-mono text-[#7684a0] tracking-wider font-normal pb-2 pr-3">NOME</th>
                  <th className="text-[9px] font-mono text-[#7684a0] tracking-wider font-normal pb-2 pr-3">EMAIL</th>
                  <th className="text-[9px] font-mono text-[#7684a0] tracking-wider font-normal pb-2 pr-3">PAPEL</th>
                  <th className="text-[9px] font-mono text-[#7684a0] tracking-wider font-normal pb-2 pr-3">ÚLTIMO ACESSO</th>
                  <th className="text-[9px] font-mono text-[#7684a0] tracking-wider font-normal pb-2">AÇÃO</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-[rgba(150,175,220,0.04)]">
                    <td className="text-[10px] font-mono text-[#aab4d6] py-2 pr-3">{u.id}</td>
                    <td className="text-[10px] font-mono text-[#e2e8f4] py-2 pr-3">{u.name || "—"}</td>
                    <td className="text-[10px] font-mono text-[#aab4d6] py-2 pr-3">{u.email || "—"}</td>
                    <td className="py-2 pr-3">
                      <span className={`text-[9px] font-mono px-2 py-0.5 border ${u.role === "admin" ? "text-[#3fe7b0] border-[rgba(63,231,176,0.25)]" : "text-[#aab4d6] border-[rgba(150,175,220,0.12)]"}`}>
                        {u.role?.toUpperCase()}
                      </span>
                    </td>
                    <td className="text-[10px] font-mono text-[#7684a0] py-2 pr-3">
                      {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleString("pt-BR") : "—"}
                    </td>
                    <td className="py-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={setRoleMutation.isPending || u.id === me.id}
                        onClick={() => setRoleMutation.mutate({ userId: u.id, role: u.role === "admin" ? "user" : "admin" })}
                        className="h-7 text-[10px] font-mono text-[#c9b8ff] hover:bg-[#c9b8ff]/10"
                        title={u.id === me.id ? "Não é possível alterar o próprio papel" : undefined}
                      >
                        <Ban className="h-3 w-3" />
                        {u.role === "admin" ? "TORNAR USUÁRIO" : "TORNAR ADMIN"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Growth dashboard */}
      <div className="nexus-card p-4">
        <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase mb-3">
          Evolução da Plataforma (últimas 8 semanas)
        </p>
        {growthLoading ? (
          <div className="h-64 animate-pulse" />
        ) : growthData.length === 0 ? (
          <p className="text-[10px] font-mono text-[#7684a0]">Sem dados de crescimento ainda.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={growthData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,175,220,0.08)" />
                <XAxis dataKey="label" tick={{ fill: "#7684a0", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={{ stroke: "rgba(150,175,220,0.12)" }} tickLine={false} />
                <YAxis tick={{ fill: "#7684a0", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={{ stroke: "rgba(150,175,220,0.12)" }} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "#0a0e1a", border: "1px solid rgba(150,175,220,0.15)", borderRadius: 4, fontSize: 11, fontFamily: "JetBrains Mono" }}
                  labelStyle={{ color: "#aab4d6" }}
                />
                <Legend wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
                <Line type="monotone" dataKey="newUsers" name="Novos usuários" stroke="#7cf3ff" strokeWidth={2} dot={{ r: 3, fill: "#7cf3ff" }} />
                <Line type="monotone" dataKey="newMissions" name="Missões executadas" stroke="#c9b8ff" strokeWidth={2} dot={{ r: 3, fill: "#c9b8ff" }} />
                <Line type="monotone" dataKey="newPlugins" name="Plugins publicados" stroke="#ffd479" strokeWidth={2} dot={{ r: 3, fill: "#ffd479" }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Category moderation */}
      <div className="nexus-card p-4">
        <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase mb-3 flex items-center gap-2">
          <Tag className="h-3 w-3" />
          Categorias Sugeridas pela Comunidade ({(pendingCategories?.length || 0)} pendentes)
        </p>
        {catLoading ? (
          <div className="h-20 animate-pulse" />
        ) : !pendingCategories?.length ? (
          <p className="text-[10px] font-mono text-[#7684a0]">Nenhuma categoria pendente de aprovação.</p>
        ) : (
          <div className="space-y-2">
            {pendingCategories.map(c => (
              <div key={c.id} className="flex items-center justify-between gap-3 bg-[rgba(3,5,14,0.8)] border border-[rgba(150,175,220,0.08)] p-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-mono text-[#e2e8f4] truncate">{c.name}</p>
                  <p className="text-[9px] font-mono text-[#7684a0]">
                    sugerida por usuário #{c.suggestedByUserId} · {c.upvotes} voto{c.upvotes !== 1 ? "s" : ""} · {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => approveCategoryMutation.mutate({ categoryId: c.id, isApproved: true })}
                    className="h-7 text-[10px] font-mono text-[#3fe7b0] hover:bg-[#3fe7b0]/10"
                  >
                    <UserCheck className="h-3 w-3" />
                    APROVAR
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteCategoryMutation.mutate({ categoryId: c.id })}
                    className="h-7 text-[10px] font-mono text-[#ff7a8c] hover:bg-[#ff7a8c]/10"
                  >
                    <Trash2 className="h-3 w-3" />
                    REJEITAR
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
