import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Folder, Plus, Trash2, Edit, CheckCircle2, Pause, Play, Share2, Users, X } from "lucide-react";
import { toast } from "sonner";

export default function Projetos() {
  const { data: projects, refetch } = trpc.projects.list.useQuery();
  const { data: sharedProjects } = trpc.projects.sharedWithMe.useQuery();
  const createMutation = trpc.projects.create.useMutation({ onSuccess: () => refetch() });
  const updateMutation = trpc.projects.update.useMutation({ onSuccess: () => refetch() });
  const deleteMutation = trpc.projects.delete.useMutation({ onSuccess: () => refetch() });
  const shareMutation = trpc.projects.share.useMutation({
    onSuccess: () => {
      toast.success("Projeto compartilhado com sucesso!");
      setSharingId(null);
      setShareQuery("");
    }
  });
  const [creating, setCreating] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", description: "" });
  const [sharingId, setSharingId] = useState<number | null>(null);
  const [shareQuery, setShareQuery] = useState("");
  const { data: searchUsers } = trpc.projects.findUsers.useQuery(
    { query: shareQuery },
    { enabled: shareQuery.length >= 2 }
  );

  const handleCreate = async () => {
    if (!newProject.name.trim()) return;
    await createMutation.mutateAsync(newProject);
    setCreating(false);
    setNewProject({ name: "", description: "" });
  };

  const handleShare = async (projectId: number, targetUserId: number) => {
    await shareMutation.mutateAsync({ projectId, sharedUserId: targetUserId, permission: "edit" });
  };

  const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
    active: { color: "#3fe7b0", icon: Play, label: "ATIVO" },
    paused: { color: "#ffd479", icon: Pause, label: "PAUSADO" },
    completed: { color: "#7cf3ff", icon: CheckCircle2, label: "CONCLUÍDO" },
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-[#e2e8f4] flex items-center gap-2">
            <Folder className="h-5 w-5 text-[#9fd8ff]" />
            Projetos
          </h2>
          <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase">Gerencie projetos dentro do ecossistema cognitivo</p>
        </div>
        <button onClick={() => setCreating(!creating)} className="nexus-card px-3 py-2 text-[#9fd8ff] hover:bg-[#9fd8ff]/10 text-xs font-mono flex items-center gap-2">
          <Plus className="h-3 w-3" /> NOVO PROJETO
        </button>
      </div>

      {creating && (
        <div className="nexus-card p-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div><label className="text-[9px] font-mono text-[#7684a0] block mb-1">NOME</label><input value={newProject.name} onChange={e => setNewProject(p => ({...p, name: e.target.value}))} className="nexus-card px-3 py-2 text-xs text-[#e2e8f4] font-mono bg-transparent focus:outline-none focus:border-[#9fd8ff]/30" placeholder="Nome do projeto" /></div>
            <div><label className="text-[9px] font-mono text-[#7684a0] block mb-1">DESCRIÇÃO</label><input value={newProject.description} onChange={e => setNewProject(p => ({...p, description: e.target.value}))} className="nexus-card px-3 py-2 text-xs text-[#e2e8f4] font-mono bg-transparent focus:outline-none focus:border-[#9fd8ff]/30" placeholder="Descrição" /></div>
            <button onClick={handleCreate} className="nexus-card px-4 py-2 text-[#3fe7b0] hover:bg-[#3fe7b0]/10 text-xs font-mono">CRIAR</button>
          </div>
        </div>
      )}

      {/* Shared Projects Section */}
      {sharedProjects && sharedProjects.length > 0 && (
        <div className="space-y-2">
          <p className="text-[9px] font-mono text-[#c9b8ff] tracking-wider uppercase flex items-center gap-2">
            <Users className="h-3 w-3" /> COMPARTILHADOS COM VOCÊ
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sharedProjects.map((sp: any) => (
              <div key={sp.id} className="nexus-card p-4 border-l-2 border-[#c9b8ff]/40">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-[#e2e8f4]">{sp.name}</p>
                  <span className="nexus-chip text-[#c9b8ff] border-[#c9b8ff]/40">COMPARTILHADO</span>
                </div>
                {sp.description && <p className="text-[10px] font-mono text-[#7684a0] mb-2 line-clamp-2">{sp.description}</p>}
                <p className="text-[8px] font-mono text-[#7684a0]">Permissão: {sp.shares?.[0]?.permission || "view"}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Projects */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {projects?.map(project => {
          const cfg = statusConfig[project.status] || statusConfig.active;
          return (
            <div key={project.id} className="nexus-card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-[#e2e8f4]">{project.name}</p>
                <div className="flex items-center gap-2">
                  <span className="nexus-chip" style={{ color: cfg.color, borderColor: cfg.color + "40" }}>{cfg.label}</span>
                  <button
                    onClick={() => setSharingId(sharingId === project.id ? null : project.id)}
                    className="text-[#c9b8ff]/50 hover:text-[#c9b8ff] transition-colors"
                    title="Compartilhar"
                  >
                    <Share2 className="h-3 w-3" />
                  </button>
                  <button onClick={() => deleteMutation.mutate({ projectId: project.id })} className="text-[#ff6b6b]/50 hover:text-[#ff6b6b]"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
              {project.description && <p className="text-[10px] font-mono text-[#7684a0] mb-3 line-clamp-3">{project.description}</p>}
              <p className="text-[9px] font-mono text-[#7684a0]">Criado em {new Date(project.createdAt).toLocaleDateString()}</p>

              {/* Share panel */}
              {sharingId === project.id && (
                <div className="mt-3 pt-3 border-t border-[rgba(150,175,220,0.08)]">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-3 w-3 text-[#c9b8ff]" />
                    <span className="text-[9px] font-mono text-[#c9b8ff]">COMPARTILHAR PROJETO</span>
                  </div>
                  <input
                    type="text"
                    value={shareQuery}
                    onChange={e => setShareQuery(e.target.value)}
                    placeholder="Buscar por email ou nome..."
                    className="w-full nexus-card px-3 py-2 text-xs text-[#e2e8f4] font-mono bg-transparent focus:outline-none focus:border-[#c9b8ff]/30"
                  />
                  {searchUsers && searchUsers.length > 0 && (
                    <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                      {searchUsers.map(u => (
                        <button
                          key={u.id}
                          onClick={() => handleShare(project.id, u.id)}
                          className="w-full text-left px-3 py-2 nexus-card hover:bg-[#c9b8ff]/10 text-xs font-mono text-[#e2e8f4]"
                        >
                          <span className="text-[#c9b8ff]">{u.name || u.email}</span>
                          {u.email && u.name && <span className="text-[#7684a0] ml-2">({u.email})</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {shareQuery.length >= 2 && searchUsers && searchUsers.length === 0 && (
                    <p className="text-[8px] font-mono text-[#7684a0] mt-1">Nenhum usuário encontrado.</p>
                  )}
                  <p className="text-[8px] font-mono text-[#7684a0] mt-1">Selecione um usuário para compartilhar com permissão de edição.</p>
                </div>
              )}
            </div>
          );
        })}
        {(!projects || projects.length === 0) && <div className="nexus-card p-8 text-center"><p className="text-[10px] font-mono text-[#7684a0]">Nenhum projeto criado.</p></div>}
      </div>
    </div>
  );
}
